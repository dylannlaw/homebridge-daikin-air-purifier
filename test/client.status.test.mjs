// Reading status: from the purifier's local IP when it's set, with the Daikin cloud as the fallback; else from the cloud.
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

describe('status from the local IP first', () => {
  test('with a local IP and a Daikin login, reads the purifier and makes no cloud status request', async () => {
    const { client, server } = await start(PASSWORD_CONFIG);
    const info = await client.getUnitInfo();
    assert.equal(server.count(LOCAL_UNIT), 1);
    assert.equal(server.count(CLOUD_UNIT), 0);
    assert.equal(info.sensorInfo.htemp, '26.0');
  });

  test('keeps reading locally on every refresh while the purifier answers', async () => {
    const { client, server } = await start(PASSWORD_CONFIG);
    for (let i = 0; i < 3; i++) {
      await client.getUnitInfo(true);
    }
    assert.equal(server.count(LOCAL_UNIT), 3);
    assert.equal(server.count(CLOUD_UNIT), 0);
  });

  test('says in the read-only message that status is read from the purifier', async () => {
    const config = { ...PASSWORD_CONFIG };
    delete config.terminalId;
    const { log } = await start(config);
    assert.ok(log.has('info', 'read-only mode: status is read from the purifier'));
  });
});

describe('status from the Daikin cloud, without a local IP', () => {
  test('is read from GET /cleaner/get_unit_info with id, spw and port, and the bare access token', async () => {
    const { client, server } = await start(NO_HOST);
    const info = await client.getUnitInfo();
    const req = server.last(CLOUD_UNIT);
    assert.equal(req.method, 'get');
    assert.equal(req.authorization, 'ACCESS1');
    assert.deepEqual(req.params, { id: DEVICE_ID, spw: DEVICE_PASSWORD, port: '30050' });
    assert.deepEqual(info.airPurifier, { pow: '1', mode: '1', airvol: '2', humd: '1' });
    assert.deepEqual(info.sensorInfo, { htemp: '22.5', hhum: '55', pm25: '1', dust: '2', odor: '1' });
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
    const config = { ...NO_TERMINAL };
    delete config.host;
    const { client, server, log } = await start(config);
    assert.equal(client.cloudEnabled, true);
    assert.equal(client.controlEnabled, false);
    assert.ok(log.has('info', 'read-only mode: status is read from the Daikin cloud'));
    assert.ok(log.has('warn', 'missing: terminalId.'));
    await client.getUnitInfo();
    assert.equal(server.count(CLOUD_UNIT), 1);
    assert.equal(server.last(CLOUD_UNIT).params.terminalid, undefined);
  });

  test('is cached for cacheDuration, so HomeKit reads make one request', async () => {
    const { client, server } = await start(NO_HOST);
    await Promise.all([client.getUnitInfo(), client.getUnitInfo(), client.getUnitInfo()]);
    await client.getUnitInfo();
    assert.equal(server.count(CLOUD_UNIT), 1);
    mock.timers.tick(60_000);
    await client.getUnitInfo();
    assert.equal(server.count(CLOUD_UNIT), 2);
  });

  test('a 401 renews the login, fetches the device credentials again and retries once', async () => {
    let calls = 0;
    const { client, server } = await start(NO_HOST, {
      saved: { deviceId: 'STALE', devicePassword: 'STALE' },
      routes: { [CLOUD_UNIT]: () => (++calls === 1 ? [401, 'unauthorized'] : [200, 'ret=OK,sensor_info=htemp%3D19.0']) },
    });
    const info = await client.getUnitInfo();
    assert.equal(server.count(TOKEN), 1);
    assert.equal(server.count(USERINFO), 1);
    assert.equal(server.last(CLOUD_UNIT).authorization, 'ACCESS2');
    assert.equal(info.sensorInfo.htemp, '19.0');
  });

  test('a failed cloud read keeps the last values and logs it once per outage', async () => {
    let down = false;
    const { client, log } = await start(NO_HOST, { routes: { [CLOUD_UNIT]: () => (down ? [500, 'error'] : [200, 'ret=OK,sensor_info=htemp%3D20.0']) } });
    await client.getUnitInfo(true);
    down = true;
    await client.getUnitInfo(true);
    const info = await client.getUnitInfo(true);
    assert.equal(info.sensorInfo.htemp, '20.0');
    assert.equal(log.lines.filter((l) => l.text.includes('Unable to read status from the Daikin cloud')).length, 1);
    down = false;
    await client.getUnitInfo(true);
    assert.ok(log.has('info', 'Reading status from the Daikin cloud again.'));
  });

  for (const [what, route] of [
    ['is not ret=OK', () => [200, 'ret=PARAM NG']],
    ['cannot be parsed', () => [200, 'ret=OK,ctrl_info="broken']],
    ['is unreachable', () => {
      throw new Error('getaddrinfo ENOTFOUND');
    }],
  ]) {
    test(`when the cloud read ${what}, the last values are kept and it is logged`, async () => {
      const { client, log } = await start(NO_HOST, { routes: { [CLOUD_UNIT]: route } });
      const info = await client.getUnitInfo();
      assert.equal(info.sensorInfo.htemp, '0.0');
      assert.ok(log.has('warn', 'Unable to read status from the Daikin cloud'));
    });
  }

  test('when the login is rejected, refreshes make no cloud request and don\'t retry the login', async () => {
    const { client, server } = await start(NO_HOST, { routes: { [SIGNIN_KEY]: () => [401, 'unauthorized'] } });
    await client.getUnitInfo(true);
    await client.getUnitInfo(true);
    assert.equal(server.count(SIGNIN_KEY), 1);
    assert.equal(server.count(CLOUD_UNIT), 0);
  });

  test('when the login server is down, refreshes don\'t retry the login before its 5 minute backoff', async () => {
    let down = true;
    const { client, server } = await start(NO_HOST, {
      routes: { [SIGNIN_KEY]: () => (down ? [503, 'unavailable'] : [200, {}, { location: 'daikinsmartapp://callback?code=X&state=wrong' }]) },
    });
    assert.equal(server.count(SIGNIN_KEY), 1);
    await client.getUnitInfo(true);
    mock.timers.tick(60_000);
    await client.getUnitInfo(true);
    assert.equal(server.count(SIGNIN_KEY), 1);
    down = false;
    mock.timers.tick(4 * 60_000);
    await settle();
    assert.equal(server.count(SIGNIN_KEY), 2);
  });

  test('during a rate-limit pause, refreshes make no cloud request', async () => {
    let limited = true;
    const { client, server, log } = await start(NO_HOST, {
      routes: { [CLOUD_UNIT]: () => (limited ? [429, 'slow down'] : [200, 'ret=OK']) },
    });
    await client.getUnitInfo(true);
    assert.ok(log.has('warn', 'rate limit'));
    limited = false;
    await client.getUnitInfo(true);
    assert.equal(server.count(CLOUD_UNIT), 1);
    mock.timers.tick(5 * 60_000);
    await client.getUnitInfo(true);
    assert.equal(server.count(CLOUD_UNIT), 2);
  });
});

describe('falling back to the Daikin cloud', () => {
  const localDown = () => {
    throw new Error('connect EHOSTUNREACH');
  };

  for (const [what, route] of [
    ['is unreachable', localDown],
    ['fails', () => [500, 'error']],
  ]) {
    test(`when the local IP ${what}, status is read from the cloud instead`, async () => {
      const { client, server, log } = await start(PASSWORD_CONFIG, { routes: { [LOCAL_UNIT]: route } });
      const info = await client.getUnitInfo();
      assert.equal(server.count(LOCAL_UNIT), 1);
      assert.equal(server.count(CLOUD_UNIT), 1);
      assert.equal(info.sensorInfo.htemp, '22.5');
      assert.ok(log.has('warn', 'Unable to read status from the purifier\'s local IP'));
      assert.ok(log.has('warn', 'Reading it from the Daikin cloud instead.'));
    });
  }

  test('tries the local IP first on every refresh, and asks the cloud at most once a minute', async () => {
    const { client, server } = await start({ ...PASSWORD_CONFIG, cacheDuration: 15 }, { routes: { [LOCAL_UNIT]: localDown } });
    await client.getUnitInfo(true);
    for (let i = 0; i < 3; i++) {
      mock.timers.tick(15_000);
      await client.getUnitInfo(true);
    }
    assert.equal(server.count(LOCAL_UNIT), 4);
    assert.equal(server.count(CLOUD_UNIT), 1);
    mock.timers.tick(15_000);
    await client.getUnitInfo(true);
    assert.equal(server.count(LOCAL_UNIT), 5);
    assert.equal(server.count(CLOUD_UNIT), 2);
  });

  test('logs the fallback once, not on every refresh, and says when the local IP works again', async () => {
    let down = true;
    const { client, server, log } = await start(PASSWORD_CONFIG, {
      routes: { [LOCAL_UNIT]: () => (down ? localDown() : [200, 'ret=OK,sensor_info=htemp%3d24.0']) },
    });
    await client.getUnitInfo(true);
    mock.timers.tick(60_000);
    await client.getUnitInfo(true);
    assert.equal(log.lines.filter((l) => l.text.includes('local IP')).length, 1);
    assert.ok(!log.lines.some((l) => l.level === 'error'));
    down = false;
    const info = await client.getUnitInfo(true);
    assert.equal(info.sensorInfo.htemp, '24.0');
    assert.ok(log.has('info', 'Reading status from the purifier\'s local IP again.'));
    assert.equal(server.count(CLOUD_UNIT), 2);
  });

  test('when both fail, the last values are kept', async () => {
    const { client } = await start(PASSWORD_CONFIG, { routes: { [LOCAL_UNIT]: localDown, [CLOUD_UNIT]: () => [500, 'error'] } });
    const info = await client.getUnitInfo();
    assert.equal(info.sensorInfo.htemp, '0.0');
  });

  test('without a Daikin login there is no fallback, and the local failure is an error', async () => {
    const { client, server, log } = await start(LOCAL_CONFIG, { routes: { [LOCAL_UNIT]: localDown } });
    await client.getUnitInfo();
    assert.equal(server.count(CLOUD_UNIT), 0);
    assert.ok(log.has('error', '/cleaner/get_unit_info'));
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

  test('is at least 15 seconds when status is read from the local IP, even with a Daikin login', () => {
    mockServers();
    const { client, log } = cacheDuration({ ...PASSWORD_CONFIG, cacheDuration: 5 });
    assert.equal(client.cacheDuration, 15_000);
    assert.ok(log.has('warn', 'below the minimum of 15s;'));
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
    const { client, log } = cacheDuration({ ...NO_HOST, cacheDuration: 20 });
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
