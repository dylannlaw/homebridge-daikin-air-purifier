import { describe, test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  API, HOST, PASSWORD_CONFIG, hap, flushSet, makeClient, mockServers, rejection, settle, tempStorage, writeTokens,
} from './helpers.mjs';

const SET = `${API}/cleaner/set_control_info`;
const UNIT = `${HOST}/cleaner/get_unit_info`;
const TOKEN = `${API}/premise/dsiot/token`;
const LOGIN = `${API}/premise/dsiot/login`;

afterEach(() => mock.timers.reset());

/** A client with control enabled, a valid access token, and the purifier's status already read. */
async function readyClient(overrides = {}) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const server = mockServers(overrides);
  const storage = tempStorage();
  writeTokens(storage, { accessToken: 'VALID', refreshToken: 'R', expiresAt: 1_000_000 + 3_600_000 });
  const { client, log } = makeClient(PASSWORD_CONFIG, storage);
  await client.getUnitInfo();
  return { client, log, server };
}

describe('changing settings', () => {
  test('sends one request with every setting, the terminal ID and port, and the access token', async () => {
    const { client, server } = await readyClient();
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    const req = server.last(SET);
    assert.equal(server.count(SET), 1);
    assert.equal(req.headers.Authorization, 'Bearer VALID');
    assert.deepEqual(
      { pow: req.params.pow, mode: req.params.mode, airvol: req.params.airvol, humd: req.params.humd },
      { pow: '0', mode: '0', airvol: '3', humd: '2' },
    );
    assert.equal(req.params.terminalid, 'T123');
    assert.equal(req.params.port, '30050');
    assert.equal(req.params.id, 'ID');
    assert.equal(req.params.spw, 'SPW');
  });

  test('waits for 1 second of quiet before sending', async () => {
    const { client, server } = await readyClient();
    const done = client.setControlInfo({ airvol: '1' });
    await settle();
    mock.timers.tick(999);
    await settle();
    assert.equal(server.count(SET), 0);
    mock.timers.tick(1);
    await settle();
    await done;
    assert.equal(server.count(SET), 1);
  });

  test('merges changes made within 1 second into one request, later values winning', async () => {
    const { client, server } = await readyClient();
    const changes = [
      client.setControlInfo({ airvol: '1' }),
      client.setControlInfo({ airvol: '2' }),
      client.setControlInfo({ humd: '0' }),
      client.setControlInfo({ airvol: '5' }),
    ];
    await flushSet(mock, Promise.all(changes));
    assert.equal(server.count(SET), 1);
    assert.equal(server.last(SET).params.airvol, '5');
    assert.equal(server.last(SET).params.humd, '0');
  });

  test('each pause starts a new 1 second window', async () => {
    const { client, server } = await readyClient();
    const first = client.setControlInfo({ airvol: '1' });
    await settle();
    mock.timers.tick(800);
    const second = client.setControlInfo({ airvol: '2' });
    await settle();
    mock.timers.tick(800);
    await settle();
    assert.equal(server.count(SET), 0);
    mock.timers.tick(200);
    await settle();
    await Promise.all([first, second]);
    assert.equal(server.count(SET), 1);
  });

  test('ignores undefined values in a change', async () => {
    const { client, server } = await readyClient();
    await flushSet(mock, client.setControlInfo({ pow: undefined, airvol: '1' }));
    assert.equal(server.last(SET).params.pow, '1');
    assert.equal(server.last(SET).params.airvol, '1');
  });

  test('shows the new value in HomeKit right away, before the request is sent', async () => {
    const { client } = await readyClient();
    const done = client.setControlInfo({ pow: '0' });
    assert.equal((await client.getUnitInfo()).airPurifier.pow, '0');
    await flushSet(mock, done);
  });

  test('keeps the new value after a successful change, without reading the purifier again straight away', async () => {
    const { client, server } = await readyClient();
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    const reads = server.count(UNIT);
    assert.equal((await client.getUnitInfo()).airPurifier.pow, '0');
    assert.equal(server.count(UNIT), reads);
  });

  test('a change made while a request is still in flight is sent in its own request, on top of the first', async () => {
    let release;
    const { client, server } = await readyClient({
      [SET]: () => (server.count(SET) === 1 ? new Promise((resolve) => {
        release = () => resolve([200, 'ret=OK']);
      }) : [200, 'ret=OK']),
    });
    const first = client.setControlInfo({ pow: '0' });
    await settle();
    mock.timers.tick(1000);
    await settle();
    assert.equal(server.count(SET), 1);
    const second = client.setControlInfo({ airvol: '5' });
    release();
    await flushSet(mock, Promise.all([first, second]));
    assert.equal(server.count(SET), 2);
    assert.equal(server.last(SET).params.pow, '0');
    assert.equal(server.last(SET).params.airvol, '5');
  });

  test('a later batch starts from the result of the previous one', async () => {
    const { client, server } = await readyClient();
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    await flushSet(mock, client.setControlInfo({ airvol: '5' }));
    assert.equal(server.last(SET).params.pow, '0');
    assert.equal(server.last(SET).params.airvol, '5');
  });
});

describe('when a change fails', () => {
  test('a response other than ret=OK fails the change in HomeKit and puts the old value back', async () => {
    const { client, log } = await readyClient({ [SET]: () => [200, 'ret=PARAM NG'] });
    const done = client.setControlInfo({ pow: '0' });
    const error = await rejection(flushSet(mock, done));
    assert.ok(error instanceof hap.HapStatusError);
    assert.equal(error.hapStatus, hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    assert.ok(log.has('error', 'ret=PARAM NG'));
  });

  test('after a failure the old value is restored and the purifier is read again on the next read', async () => {
    const { client, server } = await readyClient({ [SET]: () => [500, 'error'] });
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    const reads = server.count(UNIT);
    const info = await client.getUnitInfo();
    assert.equal(info.airPurifier.pow, '1');
    assert.equal(server.count(UNIT), reads + 1);
  });

  test('every change in a failed batch is rejected', async () => {
    const { client } = await readyClient({ [SET]: () => [500, 'error'] });
    const a = client.setControlInfo({ airvol: '1' });
    const b = client.setControlInfo({ humd: '0' });
    const results = await flushSet(mock, Promise.allSettled([a, b]));
    assert.deepEqual(results.map((r) => r.status), ['rejected', 'rejected']);
  });

  test('a network error fails the change', async () => {
    const { client } = await readyClient({ [SET]: () => {
      throw new Error('socket hang up');
    } });
    const error = await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    assert.ok(error instanceof hap.HapStatusError);
  });

  test('a 401 renews the token and retries once', async () => {
    let calls = 0;
    const { client, server } = await readyClient({ [SET]: () => (++calls === 1 ? [401, 'unauthorized'] : [200, 'ret=OK']) });
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    assert.equal(server.count(SET), 2);
    assert.equal(server.count(TOKEN), 1);
    assert.equal(server.last(SET).headers.Authorization, 'Bearer ACCESS2');
  });

  test('a 403 is treated like a 401', async () => {
    let calls = 0;
    const { client, server } = await readyClient({ [SET]: () => (++calls === 1 ? [403, 'forbidden'] : [200, 'ret=OK']) });
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    assert.equal(server.count(SET), 2);
  });

  test('a second 401 after renewing fails the change instead of looping', async () => {
    const { client, server } = await readyClient({ [SET]: () => [401, 'unauthorized'] });
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    assert.equal(server.count(SET), 2);
  });

  test('a change fails without a request when no login is possible', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    const server = mockServers({ [`${API}/premise/dsiot/login`]: () => [401, { error: 'invalid_grant' }] });
    const { client } = makeClient({ ...PASSWORD_CONFIG, clientSecret: 'wrong' });
    await settle();
    const error = await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    assert.ok(error instanceof hap.HapStatusError);
    assert.equal(server.count(SET), 0);
  });
});

describe('Daikin API rate limit (HTTP 429)', () => {
  test('a 429 on a change pauses cloud requests for 5 minutes and says so in the log', async () => {
    const { client, server, log } = await readyClient({ [SET]: () => [429, 'too many requests'] });
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    assert.ok(log.has('warn', 'rate limit'));
    const error = await rejection(flushSet(mock, client.setControlInfo({ pow: '1' })));
    assert.ok(error instanceof hap.HapStatusError);
    assert.equal(server.count(SET), 1);
  });

  test('cloud requests resume after the 5 minute pause', async () => {
    let limited = true;
    const { client, server } = await readyClient({ [SET]: () => (limited ? [429, 'slow down'] : [200, 'ret=OK']) });
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    limited = false;
    mock.timers.tick(5 * 60 * 1000 + 1);
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    assert.equal(server.count(SET), 2);
  });

  test('reading status keeps working during the pause', async () => {
    const { client, server } = await readyClient({ [SET]: () => [429, 'slow down'] });
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    const info = await client.getUnitInfo(true);
    assert.equal(info.sensorInfo.htemp, '26.0');
    assert.ok(server.count(UNIT) >= 2);
  });

  test('a 429 while logging in pauses logins too', async () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    const server = mockServers({ [LOGIN]: () => [429, 'slow down'] });
    const { client, log } = makeClient(PASSWORD_CONFIG);
    await settle();
    assert.ok(log.has('warn', 'rate limit'));
    await rejection(flushSet(mock, client.setControlInfo({ pow: '0' })));
    assert.equal(server.count(LOGIN), 1);
  });
});
