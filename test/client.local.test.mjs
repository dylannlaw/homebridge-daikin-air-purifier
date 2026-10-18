import { describe, test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  API, HOST, LOCAL_CONFIG, PASSWORD_CONFIG, hap, makeClient, mockServers, rejection, settle, tempStorage, writeTokens,
} from './helpers.mjs';

const UNIT = `${HOST}/cleaner/get_unit_info`;

afterEach(() => mock.timers.reset());

describe('reading status from the purifier', () => {
  test('parses the purifier\'s key=value response into control, sensor and unit status', async () => {
    mockServers();
    const { client } = makeClient();
    const info = await client.getUnitInfo();
    assert.deepEqual(info.airPurifier, { pow: '1', mode: '0', airvol: '3', humd: '2' });
    assert.deepEqual(info.sensorInfo, { htemp: '26.0', hhum: '64', pm25: '2', dust: '1', odor: '3' });
    assert.deepEqual(info.unitStatus, { filter: '0', strmr_cln: '1', water_supply: '1', unit_err: '0000' });
  });

  test('accepts a response that is already an object', async () => {
    mockServers({ [UNIT]: () => [200, { ctrl_info: { pow: '0' }, sensor_info: { htemp: '20.5' } }] });
    const { client } = makeClient();
    const info = await client.getUnitInfo();
    assert.equal(info.airPurifier.pow, '0');
    assert.equal(info.sensorInfo.htemp, '20.5');
  });

  test('keeps default values for fields the purifier leaves out', async () => {
    mockServers({ [UNIT]: () => [200, 'ret=OK,ctrl_info=pow%3d1'] });
    const { client } = makeClient();
    const info = await client.getUnitInfo();
    assert.equal(info.airPurifier.pow, '1');
    assert.equal(info.airPurifier.mode, '0');
    assert.equal(info.sensorInfo.htemp, '0.0');
    assert.equal(info.unitStatus.unit_err, '0000');
  });

  test('serves reads from the cache until cacheDuration has passed', async () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const server = mockServers();
    const { client } = makeClient({ ...LOCAL_CONFIG, cacheDuration: 60 });
    await client.getUnitInfo();
    await client.getUnitInfo();
    mock.timers.tick(59_000);
    await client.getUnitInfo();
    assert.equal(server.count(UNIT), 1);
    mock.timers.tick(2_000);
    await client.getUnitInfo();
    assert.equal(server.count(UNIT), 2);
  });

  test('uses a minimum cache duration of 15 seconds', async () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const server = mockServers();
    const { client } = makeClient({ ...LOCAL_CONFIG, cacheDuration: 1 });
    await client.getUnitInfo();
    mock.timers.tick(14_000);
    await client.getUnitInfo();
    assert.equal(server.count(UNIT), 1);
    mock.timers.tick(2_000);
    await client.getUnitInfo();
    assert.equal(server.count(UNIT), 2);
  });

  test('accepts cacheDuration written as a string', async () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const server = mockServers();
    const { client } = makeClient({ ...LOCAL_CONFIG, cacheDuration: '30' });
    await client.getUnitInfo();
    mock.timers.tick(29_000);
    await client.getUnitInfo();
    assert.equal(server.count(UNIT), 1);
    mock.timers.tick(2_000);
    await client.getUnitInfo();
    assert.equal(server.count(UNIT), 2);
  });

  test('defaults to a 60 second cache when cacheDuration is missing', async () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const server = mockServers();
    const { client } = makeClient({ name: 'Test', host: HOST });
    await client.getUnitInfo();
    mock.timers.tick(59_000);
    await client.getUnitInfo();
    assert.equal(server.count(UNIT), 1);
  });

  test('shares one request between reads that arrive at the same time', async () => {
    const server = mockServers();
    const { client } = makeClient();
    const results = await Promise.all(Array.from({ length: 20 }, () => client.getUnitInfo()));
    assert.equal(server.count(UNIT), 1);
    assert.ok(results.every((r) => r.sensorInfo.htemp === '26.0'));
  });

  test('force reads from the purifier even when the cache is fresh', async () => {
    const server = mockServers();
    const { client } = makeClient();
    await client.getUnitInfo();
    await client.getUnitInfo(true);
    assert.equal(server.count(UNIT), 2);
  });

  test('returns the last known values and logs an error when the purifier is unreachable', async () => {
    let fail = false;
    mockServers({ [UNIT]: () => {
      if (fail) {
        throw new Error('connect ECONNREFUSED');
      }
      return [200, 'ret=OK,sensor_info=htemp%3d22.0'];
    } });
    const { client, log } = makeClient();
    await client.getUnitInfo();
    fail = true;
    const info = await client.getUnitInfo(true);
    assert.equal(info.sensorInfo.htemp, '22.0');
    assert.ok(log.has('error', '/cleaner/get_unit_info'));
  });

  test('does not retry an unreachable purifier on every read until the cache expires', async () => {
    mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    const server = mockServers({ [UNIT]: () => [500, 'error'] });
    const { client } = makeClient();
    await client.getUnitInfo();
    await client.getUnitInfo();
    await client.getUnitInfo();
    assert.equal(server.count(UNIT), 1);
  });

  test('never calls the Daikin cloud in local-only mode', async () => {
    const server = mockServers();
    const { client } = makeClient();
    await client.getUnitInfo(true);
    await settle();
    assert.ok(server.requests.every((r) => r.key.startsWith(HOST)));
  });
});

describe('choosing local-only mode or control', () => {
  test('is local-only with just the host, and says so in the log', () => {
    mockServers();
    const { client, log } = makeClient(LOCAL_CONFIG);
    assert.equal(client.controlEnabled, false);
    assert.ok(log.has('info', 'local-only mode'));
  });

  test('enables control with email, password, client secret, terminal ID and port', () => {
    mockServers();
    const { client } = makeClient(PASSWORD_CONFIG);
    assert.equal(client.controlEnabled, true);
  });

  for (const missing of ['username', 'password', 'clientSecret', 'terminalId', 'port']) {
    test(`is local-only when ${missing} is missing from the email/password settings`, () => {
      mockServers();
      const config = { ...PASSWORD_CONFIG };
      delete config[missing];
      const { client } = makeClient(config);
      assert.equal(client.controlEnabled, false);
    });
  }

  test('enables control with a captured authorization code', () => {
    mockServers();
    const { client } = makeClient({ ...LOCAL_CONFIG, code: 'C', clientSecret: 'S', terminalId: 'T', port: '30050' });
    assert.equal(client.controlEnabled, true);
  });

  test('enables control with a captured refresh token', () => {
    mockServers();
    const { client } = makeClient({ ...LOCAL_CONFIG, refreshToken: 'R', terminalId: 'T', port: '30050' });
    assert.equal(client.controlEnabled, true);
  });

  test('enables control with a refresh token saved from an earlier login', () => {
    mockServers();
    const storage = tempStorage();
    writeTokens(storage, { refreshToken: 'SAVED' });
    const { client } = makeClient({ ...LOCAL_CONFIG, terminalId: 'T', port: '30050' }, storage);
    assert.equal(client.controlEnabled, true);
  });

  test('logs in at startup when control is enabled', async () => {
    const server = mockServers();
    makeClient(PASSWORD_CONFIG);
    await settle();
    assert.equal(server.count(`${API}/premise/dsiot/login`), 1);
  });
});

describe('making HomeKit controls read-only or writable', () => {
  const characteristic = () => new hap.Characteristic.Active();

  test('local-only: controls become read-only and get no set handler', () => {
    mockServers();
    const { client } = makeClient(LOCAL_CONFIG);
    const c = characteristic();
    const handler = mock.fn();
    client.bindSet(c, handler);
    assert.deepEqual(c.props.perms, [hap.Perms.PAIRED_READ, hap.Perms.NOTIFY]);
    assert.equal(c.setHandler, undefined);
  });

  test('control: the set handler is registered and the control stays writable', () => {
    mockServers();
    const { client } = makeClient(PASSWORD_CONFIG);
    const c = characteristic();
    const handler = mock.fn();
    client.bindSet(c, handler);
    assert.ok(c.props.perms.includes(hap.Perms.PAIRED_WRITE));
    assert.equal(c.setHandler, handler);
  });

  test('control: a characteristic with no handler is left unchanged', () => {
    mockServers();
    const { client } = makeClient(PASSWORD_CONFIG);
    const c = characteristic();
    const before = [...c.props.perms];
    client.bindSet(c);
    assert.deepEqual(c.props.perms, before);
    assert.equal(c.setHandler, undefined);
  });

  test('local-only: changing a setting is rejected as read-only without any request', async () => {
    const server = mockServers();
    const { client } = makeClient(LOCAL_CONFIG);
    const error = await rejection(client.setControlInfo({ pow: '0' }));
    assert.ok(error instanceof hap.HapStatusError);
    assert.equal(error.hapStatus, hap.HAPStatus.READ_ONLY_CHARACTERISTIC);
    assert.equal(server.requests.length, 0);
  });
});
