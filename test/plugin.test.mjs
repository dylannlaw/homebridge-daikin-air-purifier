import { describe, test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { HOST, LOCAL_CONFIG, hap, makeLog, mockServers, settle, tempStorage } from './helpers.mjs';

const { default: plugin } = await import('../dist/index.js');
const C = hap.Characteristic;
const UNIT = `${HOST}/cleaner/get_unit_info`;

afterEach(() => mock.timers.reset());

function register() {
  const storage = tempStorage();
  const api = { hap, user: { storagePath: () => storage }, registerAccessory: mock.fn() };
  plugin(api);
  return { api, Accessory: api.registerAccessory.mock.calls[0].arguments[1] };
}

async function startAccessory(config = LOCAL_CONFIG) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const server = mockServers();
  const { api, Accessory } = register();
  const log = makeLog();
  const accessory = new Accessory(log, { ...config }, api);
  await settle();
  return { accessory, server, log };
}

describe('plugin', () => {
  test('registers the DaikinAirPurifier accessory', () => {
    const { api } = register();
    assert.equal(api.registerAccessory.mock.callCount(), 1);
    assert.equal(api.registerAccessory.mock.calls[0].arguments[0], 'DaikinAirPurifier');
    assert.equal(typeof api.registerAccessory.mock.calls[0].arguments[1], 'function');
  });

  test('provides the information, purifier, humidifier and three sensor services', async () => {
    const { accessory } = await startAccessory();
    const types = accessory.getServices().map((s) => s.UUID);
    assert.deepEqual(types, [
      hap.Service.AccessoryInformation.UUID, hap.Service.AirPurifier.UUID, hap.Service.HumidifierDehumidifier.UUID,
      hap.Service.AirQualitySensor.UUID, hap.Service.HumiditySensor.UUID, hap.Service.TemperatureSensor.UUID,
    ]);
  });

  test('reads the purifier once at startup and shows the values in HomeKit', async () => {
    const { accessory, server, log } = await startAccessory();
    assert.equal(server.count(UNIT), 1);
    const temperature = accessory.getServices()[5].getCharacteristic(C.CurrentTemperature).value;
    assert.equal(temperature, 26);
    assert.ok(log.has('info', 'Daikin Air Purifier is initialized'));
  });

  test('polls the purifier once per cacheDuration, with one request per poll', async () => {
    const { server } = await startAccessory({ ...LOCAL_CONFIG, cacheDuration: 30 });
    mock.timers.tick(29_999);
    await settle();
    assert.equal(server.count(UNIT), 1);
    mock.timers.tick(1);
    await settle();
    assert.equal(server.count(UNIT), 2);
    mock.timers.tick(30_000);
    await settle();
    assert.equal(server.count(UNIT), 3);
  });

  test('polls no more often than every 15 seconds', async () => {
    const { server } = await startAccessory({ ...LOCAL_CONFIG, cacheDuration: 5 });
    mock.timers.tick(14_999);
    await settle();
    assert.equal(server.count(UNIT), 1);
    mock.timers.tick(1);
    await settle();
    assert.equal(server.count(UNIT), 2);
  });

  test('polls every 60 seconds when cacheDuration is missing', async () => {
    const { server } = await startAccessory({ name: 'Test', host: HOST });
    mock.timers.tick(59_999);
    await settle();
    assert.equal(server.count(UNIT), 1);
    mock.timers.tick(1);
    await settle();
    assert.equal(server.count(UNIT), 2);
  });

  test('an error while updating HomeKit is logged and polling continues', async () => {
    const { accessory, server, log } = await startAccessory({ ...LOCAL_CONFIG, cacheDuration: 30 });
    accessory.airPurifier.identify = async () => {
      throw new Error('boom');
    };
    mock.timers.tick(30_000);
    await settle();
    assert.ok(log.has('error', 'Unable to refresh Daikin Air Purifier state: boom'));
    mock.timers.tick(30_000);
    await settle();
    assert.equal(server.count(UNIT), 3);
  });

  test('a manual refresh replaces the pending poll instead of adding another', async () => {
    const { accessory, server } = await startAccessory({ ...LOCAL_CONFIG, cacheDuration: 30 });
    mock.timers.tick(10_000);
    await accessory.refresh();
    await settle();
    assert.equal(server.count(UNIT), 2);
    mock.timers.tick(20_000);
    await settle();
    assert.equal(server.count(UNIT), 2);
    mock.timers.tick(10_000);
    await settle();
    assert.equal(server.count(UNIT), 3);
  });
});
