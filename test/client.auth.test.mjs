import { describe, test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import fs from 'fs';
import {
  API, AUTH, LOCAL_CONFIG, PASSWORD_CONFIG, flushSet, makeClient, mockServers, readTokens, rejection, settle,
  tempStorage, tokenFile, writeTokens,
} from './helpers.mjs';

const AUTHORIZE = `${AUTH}/authorize`;
const SIGNIN = `${AUTH}/auth`;
const LOGIN = `${API}/premise/dsiot/login`;
const TOKEN = `${API}/premise/dsiot/token`;
const SET = `${API}/cleaner/set_control_info`;
const CODE_CONFIG = { ...LOCAL_CONFIG, code: 'CAPTURED', clientId: 'cid', uuid: 'CAPTURED-UUID', clientSecret: 'S', terminalId: 'T', port: '30050' };

afterEach(() => mock.timers.reset());

/** Starts a client and waits for its startup login to finish. */
async function start(config, { storage = tempStorage(), routes = {}, now = 1_000_000 } = {}) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now });
  const server = mockServers(routes);
  const { client, log } = makeClient(config, storage);
  await settle();
  return { client, log, server, storage };
}

describe('email/password login (Daikin Smart App flow)', () => {
  test('1. starts a login session with the app\'s client ID, redirect URI and an S256 PKCE challenge', async () => {
    const { server } = await start(PASSWORD_CONFIG);
    const { params } = server.last(AUTHORIZE);
    assert.equal(params.response_type, 'code');
    assert.equal(params.client_id, 'i66rposkjbceagakohlncsnus');
    assert.equal(params.redirect_uri, 'daikinsmartapp://callback');
    assert.equal(params.code_challenge_method, 'S256');
    assert.equal(params.display, 'daikinsmartapp');
    assert.match(params.code_challenge, /^[A-Za-z0-9_-]{43}$/);
    assert.match(params.state, /^[A-Za-z0-9_-]{43}$/);
    assert.match(params.client_device_id, /^DEVICE_ID_[0-9A-F]{16}$/);
    assert.match(params.uuid, /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/);
  });

  test('2. sends the email, password, the login session state and the same app UUID', async () => {
    const { server } = await start(PASSWORD_CONFIG);
    const { body } = server.last(SIGNIN);
    assert.deepEqual(body, {
      username: 'user@example.com', password: 'secret-password', state: 'serverstate123', uuid: server.last(AUTHORIZE).params.uuid,
    });
  });

  test('3. exchanges the code with the client secret and a code verifier that matches the challenge', async () => {
    const { server } = await start(PASSWORD_CONFIG);
    const { body } = server.last(LOGIN);
    const authorize = server.last(AUTHORIZE).params;
    assert.equal(body.grant_type, 'authorization_code');
    assert.equal(body.code, 'CODE123');
    assert.equal(body.client_id, 'i66rposkjbceagakohlncsnus');
    assert.equal(body.client_secret, 'app-secret');
    assert.equal(body.uuid, authorize.uuid);
    assert.equal(body.redirect_uri, 'daikinsmartapp://callback');
    assert.equal(crypto.createHash('sha256').update(body.code_verifier).digest('base64url'), authorize.code_challenge);
  });

  test('uses a new PKCE verifier and state for every login', async () => {
    const { server } = await start(PASSWORD_CONFIG, { routes: { [TOKEN]: () => [400, { error: 'invalid_grant' }] } });
    mock.timers.tick(60 * 60 * 1000);
    await settle();
    const logins = server.requests.filter((r) => r.key === AUTHORIZE);
    assert.equal(logins.length, 2);
    assert.notEqual(logins[0].params.code_challenge, logins[1].params.code_challenge);
    assert.notEqual(logins[0].params.state, logins[1].params.state);
  });

  test('saves the tokens and logs that it is logged in', async () => {
    const { storage, log } = await start(PASSWORD_CONFIG);
    const saved = readTokens(storage);
    assert.equal(saved.accessToken, 'ACCESS1');
    assert.equal(saved.refreshToken, 'REFRESH1');
    assert.equal(saved.expiresAt, 1_000_000 + 3_600_000);
    assert.ok(log.has('info', 'Logged in to the Daikin API'));
  });

  test('uses the new access token for changes', async () => {
    const { client, server } = await start(PASSWORD_CONFIG);
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    assert.equal(server.last(SET).headers.Authorization, 'Bearer ACCESS1');
  });

  test('never writes the password or code to the token file or the log', async () => {
    const { storage, log } = await start(PASSWORD_CONFIG);
    const file = fs.readFileSync(tokenFile(storage), 'utf8');
    assert.ok(!file.includes('secret-password'));
    assert.ok(!file.includes('CODE123'));
    assert.ok(!log.all().includes('secret-password'));
  });

  test('keeps the same app UUID and device ID across restarts', async () => {
    const first = await start(PASSWORD_CONFIG);
    const ids = first.server.last(AUTHORIZE).params;
    const storage = first.storage;
    const saved = readTokens(storage);
    writeTokens(storage, { uuid: saved.uuid, clientDeviceId: saved.clientDeviceId });
    mock.timers.reset();
    const second = await start(PASSWORD_CONFIG, { storage });
    const again = second.server.last(AUTHORIZE).params;
    assert.equal(again.uuid, ids.uuid);
    assert.equal(again.client_device_id, ids.client_device_id);
  });

  test('uses the client ID and app UUID from the config when set', async () => {
    const { server } = await start({ ...PASSWORD_CONFIG, clientId: 'my-client', uuid: 'MY-UUID' });
    assert.equal(server.last(AUTHORIZE).params.client_id, 'my-client');
    assert.equal(server.last(AUTHORIZE).params.uuid, 'MY-UUID');
    assert.equal(server.last(SIGNIN).body.uuid, 'MY-UUID');
    assert.equal(server.last(LOGIN).body.client_id, 'my-client');
  });

  test('wrong email or password (HTTP 401): stops, logs why, and does not retry until restart', async () => {
    const { client, server, log } = await start(PASSWORD_CONFIG, { routes: { [SIGNIN]: () => [401, { error: 'unauthorized' }] } });
    assert.ok(log.has('error', 'Unable to log in to the Daikin account'));
    assert.ok(log.has('error', 'Check the email and password'));
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    mock.timers.tick(10 * 60 * 1000);
    await settle();
    assert.equal(server.count(SIGNIN), 1);
    assert.equal(server.count(LOGIN), 0);
  });

  test('a sign-in response with no code (HTTP 200) is treated as a wrong email or password', async () => {
    const { client, server, log } = await start(PASSWORD_CONFIG, { routes: { [SIGNIN]: () => [200, {}] } });
    assert.ok(log.has('error', 'did not return an authorization code'));
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    assert.equal(server.count(SIGNIN), 1);
  });

  test('a callback whose state does not match is rejected', async () => {
    const { server, log } = await start(PASSWORD_CONFIG, {
      routes: { [SIGNIN]: () => [200, {}, { location: 'daikinsmartapp://callback?code=EVIL&state=someone-else' }] },
    });
    assert.equal(server.count(LOGIN), 0);
    assert.ok(log.has('error', 'did not return an authorization code'));
  });

  test('a login session with no state is reported, and retried later', async () => {
    const { server, log } = await start(PASSWORD_CONFIG, {
      routes: { [AUTHORIZE]: () => [302, {}, { location: 'https://prod-deneb-ui.daikinsmartdb.jp/#/login' }] },
    });
    assert.ok(log.has('error', 'did not start a login session'));
    assert.equal(server.count(SIGNIN), 0);
    mock.timers.tick(5 * 60 * 1000);
    await settle();
    assert.equal(server.count(AUTHORIZE), 2);
  });

  test('a login redirect with no location header is reported as no login session', async () => {
    const { server, log } = await start(PASSWORD_CONFIG, { routes: { [AUTHORIZE]: () => [302, {}, {}] } });
    assert.ok(log.has('error', 'did not start a login session'));
    assert.equal(server.count(SIGNIN), 0);
  });

  test('the login server being down is retried after 5 minutes, not treated as a wrong password', async () => {
    let down = true;
    const { server } = await start(PASSWORD_CONFIG, { routes: { [SIGNIN]: () => (down ? [503, 'unavailable'] : [200, {}, {}]) } });
    assert.equal(server.count(SIGNIN), 1);
    down = false;
    mock.timers.tick(5 * 60 * 1000);
    await settle();
    assert.equal(server.count(SIGNIN), 2);
  });

  test('a network error during login is retried after 5 minutes', async () => {
    const { server } = await start(PASSWORD_CONFIG, { routes: { [AUTHORIZE]: () => {
      throw new Error('getaddrinfo ENOTFOUND');
    } } });
    mock.timers.tick(5 * 60 * 1000);
    await settle();
    assert.equal(server.count(AUTHORIZE), 2);
  });

  test('a rejected code exchange points at the client secret and stops retrying', async () => {
    const { client, server, log } = await start(PASSWORD_CONFIG, { routes: { [LOGIN]: () => [401, { rsc: 4001, error: 'invalid_grant' }] } });
    assert.ok(log.has('error', 'Check the Client Secret'));
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    assert.equal(server.count(AUTHORIZE), 1);
  });

  test('a code exchange that fails with a server error can be retried', async () => {
    const { client, server } = await start(PASSWORD_CONFIG, { routes: { [LOGIN]: () => [500, 'error'] } });
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    assert.equal(server.count(AUTHORIZE), 2);
  });

  test('a 429 while signing in pauses, then signs in again instead of treating it as a wrong password', async () => {
    let limited = true;
    const { client, server, log } = await start(PASSWORD_CONFIG, {
      routes: { [SIGNIN]: () => (limited ? [429, 'slow down'] : [200, {}, { location: `daikinsmartapp://callback?code=C&state=${stateOf(server)}` }]) },
    });
    assert.ok(log.has('warn', 'rate limit'));
    assert.ok(!log.has('error', 'Not retrying'));
    limited = false;
    mock.timers.tick(5 * 60 * 1000 + 1);
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    assert.equal(server.count(SIGNIN), 2);
    assert.equal(server.count(SET), 1);
  });

  test('email and password are preferred over a captured code when both are set', async () => {
    const { server, storage } = await start({ ...PASSWORD_CONFIG, code: 'CAPTURED' });
    assert.equal(server.count(AUTHORIZE), 1);
    assert.equal(server.last(LOGIN).body.code, 'CODE123');
    assert.notEqual(readTokens(storage).code, 'CAPTURED');
  });

  test('logs in only once when several changes need a login at the same time', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    const server = mockServers();
    const { client } = makeClient(PASSWORD_CONFIG);
    await flushSet(mock, Promise.all([client.setControlInfo({ pow: '0' }), client.setControlInfo({ airvol: '1' })]));
    assert.equal(server.count(AUTHORIZE), 1);
  });
});

describe('keeping the login alive', () => {
  test('a still-valid saved access token is used without logging in', async () => {
    const storage = tempStorage();
    writeTokens(storage, { accessToken: 'SAVED', refreshToken: 'R', expiresAt: 1_000_000 + 3_600_000 });
    const { client, server } = await start(PASSWORD_CONFIG, { storage });
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    assert.equal(server.count(AUTHORIZE), 0);
    assert.equal(server.count(TOKEN), 0);
    assert.equal(server.last(SET).headers.Authorization, 'Bearer SAVED');
  });

  test('a saved token that expires within 5 minutes is renewed with the refresh token', async () => {
    const storage = tempStorage();
    writeTokens(storage, { accessToken: 'OLD', refreshToken: 'R', expiresAt: 1_000_000 + 4 * 60 * 1000 });
    const { server } = await start(PASSWORD_CONFIG, { storage });
    assert.equal(server.count(TOKEN), 1);
    assert.deepEqual(server.last(TOKEN).body, { grant_type: 'refresh_token', refresh_token: 'R' });
    assert.equal(server.count(AUTHORIZE), 0);
  });

  test('renewing saves the new access and refresh tokens', async () => {
    const storage = tempStorage();
    writeTokens(storage, { refreshToken: 'R' });
    await start(PASSWORD_CONFIG, { storage });
    const saved = readTokens(storage);
    assert.equal(saved.accessToken, 'ACCESS2');
    assert.equal(saved.refreshToken, 'REFRESH2');
  });

  test('keeps the old refresh token when the renewal response has none', async () => {
    const storage = tempStorage();
    writeTokens(storage, { refreshToken: 'KEEP' });
    await start(PASSWORD_CONFIG, { storage, routes: { [TOKEN]: () => [200, { access_token: 'A', expires_in: 3600 }] } });
    assert.equal(readTokens(storage).refreshToken, 'KEEP');
  });

  test('assumes a 1 hour lifetime when the response has no expires_in', async () => {
    const storage = tempStorage();
    writeTokens(storage, { refreshToken: 'R' });
    await start(PASSWORD_CONFIG, { storage, routes: { [TOKEN]: () => [200, { access_token: 'A', refresh_token: 'B' }] } });
    assert.equal(readTokens(storage).expiresAt, 1_000_000 + 3_600_000);
  });

  test('renews the token by itself 5 minutes before it expires', async () => {
    const { server } = await start(PASSWORD_CONFIG);
    assert.equal(server.count(TOKEN), 0);
    mock.timers.tick(55 * 60 * 1000 - 1);
    await settle();
    assert.equal(server.count(TOKEN), 0);
    mock.timers.tick(1);
    await settle();
    assert.equal(server.count(TOKEN), 1);
    mock.timers.tick(55 * 60 * 1000);
    await settle();
    assert.equal(server.count(TOKEN), 2);
  });

  test('renewing early (after a 401) replaces the scheduled renewal instead of adding a second one', async () => {
    let calls = 0;
    const { client, server } = await start(PASSWORD_CONFIG, {
      routes: { [SET]: () => (++calls === 1 ? [401, 'unauthorized'] : [200, 'ret=OK']) },
    });
    mock.timers.tick(30 * 60 * 1000);
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    assert.equal(server.count(TOKEN), 1);
    // The startup login's renewal (due 55 minutes in) was replaced by one 55 minutes after the early renewal.
    mock.timers.tick(30 * 60 * 1000);
    await settle();
    assert.equal(server.count(TOKEN), 1);
    mock.timers.tick(25 * 60 * 1000);
    await settle();
    assert.equal(server.count(TOKEN), 2);
  });

  test('a scheduled renewal during a rate-limit pause is skipped without any request', async () => {
    const { client, server } = await start(PASSWORD_CONFIG, {
      routes: {
        [LOGIN]: () => [200, { access_token: 'A', refresh_token: 'R', expires_in: 6 * 60 }],
        [SET]: () => [429, 'slow down'],
      },
    });
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    const before = server.requests.length;
    mock.timers.tick(60 * 1000);
    await settle();
    assert.equal(server.requests.length, before);
  });

  test('a rejected refresh token is dropped and the plugin logs in again with the email and password', async () => {
    const storage = tempStorage();
    writeTokens(storage, { refreshToken: 'EXPIRED' });
    const { server } = await start(PASSWORD_CONFIG, { storage, routes: { [TOKEN]: () => [400, { error: 'invalid_grant' }] } });
    assert.equal(server.count(TOKEN), 1);
    assert.equal(server.count(AUTHORIZE), 1);
    assert.equal(readTokens(storage).refreshToken, 'REFRESH1');
  });

  test('a renewal that fails with a network error keeps the refresh token and tries again in 5 minutes', async () => {
    const storage = tempStorage();
    writeTokens(storage, { refreshToken: 'KEEP' });
    let down = true;
    const { server } = await start(LOCAL_CONFIG_WITH({ refreshToken: undefined }), {
      storage, routes: { [TOKEN]: () => (down ? [502, 'bad gateway'] : [200, { access_token: 'A', refresh_token: 'B', expires_in: 3600 }]) },
    });
    assert.equal(readTokens(storage).refreshToken, 'KEEP');
    down = false;
    mock.timers.tick(5 * 60 * 1000);
    await settle();
    assert.equal(server.count(TOKEN), 2);
    assert.equal(readTokens(storage).refreshToken, 'B');
  });

  test('a 429 while renewing pauses cloud requests and keeps the refresh token', async () => {
    const storage = tempStorage();
    writeTokens(storage, { refreshToken: 'KEEP' });
    const { client, server, log } = await start(LOCAL_CONFIG_WITH({}), { storage, routes: { [TOKEN]: () => [429, 'slow down'] } });
    assert.ok(log.has('warn', 'rate limit'));
    assert.equal(readTokens(storage).refreshToken, 'KEEP');
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    assert.equal(server.count(TOKEN), 1);
  });

  test('with no way left to log in, logs one clear error however many changes are tried', async () => {
    const storage = tempStorage();
    writeTokens(storage, { refreshToken: 'EXPIRED' });
    const { client, log } = await start(LOCAL_CONFIG_WITH({}), { storage, routes: { [TOKEN]: () => [401, 'no'] } });
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    await rejection(flushSet(mock, client.setControlInfo({ pow: '1' })));
    const errors = log.lines.filter((l) => l.text.includes('No valid Daikin API token'));
    assert.equal(errors.length, 1);
    assert.ok(errors[0].text.includes('Sensors and status keep working'));
  });
});

/** The state the plugin sent to /authorize most recently, which the real server echoes back in the callback. */
function stateOf(server) {
  return server.last(AUTHORIZE).params.state;
}

/** Config with control settings but no email/password, so only saved or captured tokens can log in. */
function LOCAL_CONFIG_WITH(extra) {
  return { ...LOCAL_CONFIG, terminalId: 'T', port: '30050', ...extra };
}

describe('captured code and refresh token (advanced settings)', () => {
  test('a captured code is exchanged with the captured client ID, UUID and secret, without PKCE', async () => {
    const { server, storage } = await start(CODE_CONFIG);
    const { body } = server.last(LOGIN);
    assert.deepEqual(body, { grant_type: 'authorization_code', code: 'CAPTURED', client_id: 'cid', uuid: 'CAPTURED-UUID', client_secret: 'S' });
    assert.equal(server.count(AUTHORIZE), 0);
    assert.equal(readTokens(storage).code, 'CAPTURED');
  });

  test('a code that already logged in is not sent again after a restart', async () => {
    const first = await start(CODE_CONFIG);
    const saved = readTokens(first.storage);
    writeTokens(first.storage, { ...saved, accessToken: undefined, expiresAt: 0 });
    mock.timers.reset();
    const second = await start(CODE_CONFIG, { storage: first.storage });
    assert.equal(second.server.count(LOGIN), 0);
    assert.equal(second.server.count(TOKEN), 1);
  });

  test('a rejected code is remembered, explained in the log, and not sent again', async () => {
    const { client, server, storage, log } = await start(CODE_CONFIG, { routes: { [LOGIN]: () => [401, { error: 'invalid_grant' }] } });
    assert.ok(log.has('error', 'codes work only once'));
    assert.equal(readTokens(storage).code, 'CAPTURED');
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    assert.equal(server.count(LOGIN), 1);
  });

  test('a rejected code is not retried after a restart either', async () => {
    const first = await start(CODE_CONFIG, { routes: { [LOGIN]: () => [401, { error: 'invalid_grant' }] } });
    mock.timers.reset();
    const second = await start(CODE_CONFIG, { storage: first.storage });
    assert.equal(second.server.count(LOGIN), 0);
  });

  test('a new code in the config is used after a restart', async () => {
    const first = await start(CODE_CONFIG, { routes: { [LOGIN]: () => [401, { error: 'invalid_grant' }] } });
    mock.timers.reset();
    const second = await start({ ...CODE_CONFIG, code: 'NEW' }, { storage: first.storage });
    assert.equal(second.server.last(LOGIN).body.code, 'NEW');
  });

  test('a captured code that fails with a server error is not marked as used', async () => {
    const { storage } = await start(CODE_CONFIG, { routes: { [LOGIN]: () => [500, 'error'] } });
    assert.ok(!fs.existsSync(tokenFile(storage)) || readTokens(storage).code !== 'CAPTURED');
  });

  test('a captured refresh token in the config is used to log in', async () => {
    const { server } = await start(LOCAL_CONFIG_WITH({ refreshToken: 'CONFIG-R' }));
    assert.equal(server.last(TOKEN).body.refresh_token, 'CONFIG-R');
  });

  test('a changed refresh token in the config replaces the saved tokens', async () => {
    const storage = tempStorage();
    writeTokens(storage, { accessToken: 'OLD', refreshToken: 'OLD-R', expiresAt: 1_000_000 + 3_600_000, configRefreshToken: 'FIRST', uuid: 'U1' });
    const { server } = await start(LOCAL_CONFIG_WITH({ refreshToken: 'SECOND' }), { storage });
    assert.equal(server.last(TOKEN).body.refresh_token, 'SECOND');
    assert.equal(readTokens(storage).uuid, 'U1');
  });

  test('the same refresh token in the config does not replace newer saved tokens', async () => {
    const storage = tempStorage();
    writeTokens(storage, { accessToken: 'NEWER', refreshToken: 'ROTATED', expiresAt: 1_000_000 + 3_600_000, configRefreshToken: 'SAME' });
    const { server } = await start(LOCAL_CONFIG_WITH({ refreshToken: 'SAME' }), { storage });
    assert.equal(server.count(TOKEN), 0);
  });
});

describe('the token file', () => {
  test('is readable only by the Homebridge user', async () => {
    const { storage } = await start(PASSWORD_CONFIG);
    assert.equal(fs.statSync(tokenFile(storage)).mode & 0o777, 0o600);
  });

  test('is named after the accessory, with unsafe characters replaced', async () => {
    const { storage } = await start({ ...PASSWORD_CONFIG, name: 'Living Room/Purifier' });
    assert.ok(fs.existsSync(tokenFile(storage, 'Living_Room_Purifier')));
  });

  test('is called "default" when the accessory has no name', async () => {
    const config = { ...PASSWORD_CONFIG };
    delete config.name;
    const { storage } = await start(config);
    assert.ok(fs.existsSync(tokenFile(storage, 'default')));
  });

  test('a damaged token file is reported and the plugin logs in again', async () => {
    const storage = tempStorage();
    fs.writeFileSync(tokenFile(storage), '{ not json');
    const { server, log } = await start(PASSWORD_CONFIG, { storage });
    assert.ok(log.has('warn', 'Unable to read'));
    assert.equal(server.count(AUTHORIZE), 1);
  });

  test('a token file that cannot be written is reported without breaking the login', async () => {
    const storage = tempStorage();
    fs.mkdirSync(tokenFile(storage));
    const { client, server, log } = await start(PASSWORD_CONFIG, { storage });
    assert.ok(log.has('warn', 'Unable to write'));
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    assert.equal(server.last(SET).headers.Authorization, 'Bearer ACCESS1');
  });
});
