// Reading status: from the Daikin cloud when a login is configured, with the purifier's local IP as the fallback.
import { describe, test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  CLOUD_UNIT, DEVICE_ID, DEVICE_PASSWORD, LOCAL_CONFIG, LOCAL_UNIT, LOGIN, PASSWORD_CONFIG, SIGNIN_KEY, TOKEN, USERINFO,
  makeClient, mockServers, settle, tempStorage, writeTokens,
} from './helpers.mjs';

afterEach(() => mock.timers.reset());

const NO_HOST = (() => {
  const config = { ...PASSWORD_CONFIG };
  delete config.host;
  return config;
})();
const NO_TERMINAL = (() => {
  const config = { ...PASSWORD_CONFIG };
  delete config.terminalId;
  return config;
})();

/** Starts a client, waits for its startup login, and optionally saves a valid token first. */
async function start(config, { routes = {}, saved = null } = {}) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const server = mockServers(routes);
  const storage = tempStorage();
  if (saved) {
    writeTokens(storage, { accessToken: 'SAVED', refreshToken: 'R', expiresAt: 1_000_000 + 3_600_000, ...saved });
  }
  const { client, log } = makeClient(config, storage);
  await settle();
  return { client, log, server, storage };
}

describe('status from the Daikin cloud', () => {
  test('is read from GET /cleaner/get_unit_info with id, spw and port, and the bare access token', async () => {
    const { client, server } = await start(PASSWORD_CONFIG);
    const info = await client.getUnitInfo();
    const req = server.last(CLOUD_UNIT);
    assert.equal(req.method, 'get');
    assert.equal(req.authorization, 'ACCESS1');
    assert.deepEqual(req.params, { id: DEVICE_ID, spw: DEVICE_PASSWORD, port: '30050' });
    assert.deepEqual(info.airPurifier, { pow: '1', mode: '1', airvol: '2', humd: '1' });
    assert.deepEqual(info.sensorInfo, { htemp: '22.5', hhum: '55', pm25: '1', dust: '2', odor: '1' });
  });

  test('does not call the local IP when the cloud read works', async () => {
    const { client, server } = await start(PASSWORD_CONFIG);
    await client.getUnitInfo();
    assert.equal(server.count(LOCAL_UNIT), 0);
  });

  test('works without a local IP', async () => {
    const { client, server, log } = await start(NO_HOST);
    assert.equal(client.cloudEnabled, true);
    assert.equal(client.controlEnabled, true);
    const info = await client.getUnitInfo();
    assert.equal(info.sensorInfo.htemp, '22.5');
    assert.equal(server.count(LOCAL_UNIT), 0);
    assert.ok(!log.lines.some((l) => l.level === 'error'));
  });

  test('without a local IP or a port, sends the usual port 30050', async () => {
    const config = { ...NO_HOST };
    delete config.port;
    const { client, server } = await start(config);
    await client.getUnitInfo();
    assert.equal(server.last(CLOUD_UNIT).params.port, '30050');
  });

  test('needs no Terminal ID: status is read from the cloud, but control stays off', async () => {
    const { client, server, log } = await start(NO_TERMINAL);
    assert.equal(client.cloudEnabled, true);
    assert.equal(client.controlEnabled, false);
    assert.ok(log.has('info', 'read-only mode: status is read from the Daikin cloud'));
    assert.ok(log.has('warn', 'missing: terminalId.'));
    await client.getUnitInfo();
    assert.equal(server.count(CLOUD_UNIT), 1);
    assert.equal(server.last(CLOUD_UNIT).params.terminalid, undefined);
  });

  test('is cached for cacheDuration, so HomeKit reads make one request', async () => {
    const { client, server } = await start(PASSWORD_CONFIG);
    await Promise.all([client.getUnitInfo(), client.getUnitInfo(), client.getUnitInfo()]);
    await client.getUnitInfo();
    assert.equal(server.count(CLOUD_UNIT), 1);
    mock.timers.tick(60_000);
    await client.getUnitInfo();
    assert.equal(server.count(CLOUD_UNIT), 2);
  });

  test('a 401 renews the login, fetches the device credentials again and retries once', async () => {
    let calls = 0;
    const { client, server } = await start(PASSWORD_CONFIG, {
      saved: { deviceId: 'STALE', devicePassword: 'STALE' },
      routes: { [CLOUD_UNIT]: () => (++calls === 1 ? [401, 'unauthorized'] : [200, 'ret=OK,sensor_info=htemp%3D19.0']) },
    });
    const info = await client.getUnitInfo();
    assert.equal(server.count(TOKEN), 1);
    assert.equal(server.count(USERINFO), 1);
    assert.equal(server.last(CLOUD_UNIT).authorization, 'ACCESS2');
    assert.equal(info.sensorInfo.htemp, '19.0');
  });
});

describe('falling back to the local IP', () => {
  for (const [what, route] of [
    ['fails', () => [500, 'error']],
    ['is not ret=OK', () => [200, 'ret=PARAM NG']],
    ['cannot be parsed', () => [200, 'ret=OK,ctrl_info="broken']],
    ['is unreachable', () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }],
  ]) {
    test(`when the cloud read ${what}, status is read from the purifier instead`, async () => {
      const { client, server, log } = await start(PASSWORD_CONFIG, { routes: { [CLOUD_UNIT]: route } });
      const info = await client.getUnitInfo();
      assert.equal(server.count(LOCAL_UNIT), 1);
      assert.equal(info.sensorInfo.htemp, '26.0');
      assert.ok(log.has('warn', 'Unable to read status from the Daikin cloud'));
      assert.ok(log.has('warn', 'Reading it from the purifier\'s local IP instead.'));
    });
  }

  test('logs the fallback once, not on every refresh, and says when the cloud works again', async () => {
    let down = true;
    const { client, log } = await start(PASSWORD_CONFIG, {
      routes: { [CLOUD_UNIT]: () => (down ? [500, 'error'] : [200, 'ret=OK,sensor_info=htemp%3D21.0']) },
    });
    await client.getUnitInfo(true);
    await client.getUnitInfo(true);
    await client.getUnitInfo(true);
    assert.equal(log.lines.filter((l) => l.text.includes('Unable to read status from the Daikin cloud')).length, 1);
    down = false;
    const info = await client.getUnitInfo(true);
    assert.equal(info.sensorInfo.htemp, '21.0');
    assert.ok(log.has('info', 'Reading status from the Daikin cloud again.'));
  });

  test('tries the cloud again on the next refresh after a fallback', async () => {
    const { client, server } = await start(PASSWORD_CONFIG, { routes: { [CLOUD_UNIT]: () => [500, 'error'] } });
    await client.getUnitInfo(true);
    await client.getUnitInfo(true);
    assert.equal(server.count(CLOUD_UNIT), 2);
    assert.equal(server.count(LOCAL_UNIT), 2);
  });

  test('without a local IP, a failed cloud read keeps the last values and says there is no fallback', async () => {
    let down = false;
    const { client, log } = await start(NO_HOST, { routes: { [CLOUD_UNIT]: () => (down ? [500, 'error'] : [200, 'ret=OK,sensor_info=htemp%3D20.0']) } });
    await client.getUnitInfo(true);
    down = true;
    const info = await client.getUnitInfo(true);
    assert.equal(info.sensorInfo.htemp, '20.0');
    assert.ok(log.has('warn', 'Unable to read status from the Daikin cloud'));
    assert.ok(!log.has('warn', 'local IP instead'));
  });

  test('when the login is rejected, status comes from the local IP, without retrying the login', async () => {
    const { client, server } = await start(PASSWORD_CONFIG, { routes: { [SIGNIN_KEY]: () => [401, 'unauthorized'] } });
    await client.getUnitInfo(true);
    await client.getUnitInfo(true);
    assert.equal(server.count(SIGNIN_KEY), 1);
    assert.equal(server.count(CLOUD_UNIT), 0);
    assert.equal(server.count(LOCAL_UNIT), 2);
  });

  test('when the login server is down, refreshes don\'t retry the login before its 5 minute backoff', async () => {
    let down = true;
    const { client, server } = await start(PASSWORD_CONFIG, {
      routes: { [SIGNIN_KEY]: () => (down ? [503, 'unavailable'] : [200, {}, { location: 'daikinsmartapp://callback?code=X&state=wrong' }]) },
    });
    assert.equal(server.count(SIGNIN_KEY), 1);
    await client.getUnitInfo(true);
    mock.timers.tick(60_000);
    await client.getUnitInfo(true);
    assert.equal(server.count(SIGNIN_KEY), 1);
    assert.equal(server.count(LOCAL_UNIT), 2);
    down = false;
    mock.timers.tick(4 * 60_000);
    await settle();
    assert.equal(server.count(SIGNIN_KEY), 2);
  });

  test('during a rate-limit pause, status comes from the local IP without a cloud request', async () => {
    let limited = true;
    const { client, server, log } = await start(PASSWORD_CONFIG, {
      routes: { [CLOUD_UNIT]: () => (limited ? [429, 'slow down'] : [200, 'ret=OK']) },
    });
    await client.getUnitInfo(true);
    assert.ok(log.has('warn', 'rate limit'));
    limited = false;
    await client.getUnitInfo(true);
    assert.equal(server.count(CLOUD_UNIT), 1);
    assert.equal(server.count(LOCAL_UNIT), 2);
    mock.timers.tick(5 * 60_000);
    await client.getUnitInfo(true);
    assert.equal(server.count(CLOUD_UNIT), 2);
  });
});

describe('what to read status from', () => {
  test('with only a local IP, reads it locally and never calls the cloud', async () => {
    const { client, server } = await start(LOCAL_CONFIG);
    await client.getUnitInfo();
    assert.equal(server.count(LOCAL_UNIT), 1);
    assert.equal(server.requests.filter((r) => !r.key.startsWith(LOCAL_UNIT.split('/')[0])).length, 0);
  });

  test('with neither a local IP nor a Daikin login, logs that there is nothing to read', async () => {
    const { client, log } = await start({ name: 'Test' });
    assert.ok(log.has('error', 'Nothing to read the purifier from'));
    const info = await client.getUnitInfo();
    assert.equal(info.sensorInfo.htemp, '0.0');
  });

  test('a captured refresh token is enough for cloud status', async () => {
    const { client, server } = await start({ name: 'Test', refreshToken: 'CAPTURED' });
    assert.equal(client.cloudEnabled, true);
    await client.getUnitInfo();
    assert.equal(server.count(CLOUD_UNIT), 1);
    assert.equal(server.count(LOGIN), 0);
  });
});

describe('cache duration', () => {
  const cacheDuration = (config) => makeClient(config, tempStorage());

  test('defaults to 60 seconds', () => {
    mockServers();
    assert.equal(cacheDuration(LOCAL_CONFIG).client.cacheDuration, 60_000);
  });

  test('uses cacheDuration, in seconds', () => {
    mockServers();
    assert.equal(cacheDuration({ ...LOCAL_CONFIG, cacheDuration: 120 }).client.cacheDuration, 120_000);
  });

  test('is at least 15 seconds for the local IP, with a warning about rate limits', () => {
    mockServers();
    const { client, log } = cacheDuration({ ...LOCAL_CONFIG, cacheDuration: 5 });
    assert.equal(client.cacheDuration, 15_000);
    assert.ok(log.has('warn', 'below the minimum of 15s'));
    assert.ok(log.has('warn', 'rate-limited'));
  });

  test('is at least 60 seconds when status comes from the Daikin cloud, with a warning about rate limits', () => {
    mockServers();
    const { client, log } = cacheDuration({ ...PASSWORD_CONFIG, cacheDuration: 20 });
    assert.equal(client.cacheDuration, 60_000);
    assert.ok(log.has('warn', 'below the minimum of 60s for the Daikin cloud'));
    assert.ok(log.has('warn', 'rate-limited'));
  });

  test('does not warn at or above the minimum', () => {
    mockServers();
    const { log } = cacheDuration({ ...PASSWORD_CONFIG, cacheDuration: 300 });
    assert.ok(!log.has('warn', 'below the minimum'));
  });
});
