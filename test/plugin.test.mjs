import { describe, test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { CLOUD_UNIT, HOST, LOCAL_CONFIG, PASSWORD_CONFIG, hap, makeLog, mockServers, settle, tempStorage } from './helpers.mjs';

const { default: plugin, isConfigured } = await import('../dist/index.js');
const C = hap.Characteristic;
const UNIT = `${HOST}/cleaner/get_unit_info`;
const PLUGIN = '@dylannlaw/homebridge-daikin-air-purifier';

afterEach(() => mock.timers.reset());

/**
 * Stands in for Homebridge's PlatformAccessory. HAP's Accessory has the same service methods, and throws when a
 * service with the same type and subtype is added twice, so a duplicate fails the test.
 */
class FakePlatformAccessory extends hap.Accessory {}

/** A fake of the Homebridge API a dynamic platform uses, recording what it registers. */
function fakeApi() {
  const storage = tempStorage();
  const api = Object.assign(new EventEmitter(), {
    hap,
    user: { storagePath: () => storage },
    platformAccessory: FakePlatformAccessory,
    registerPlatform: mock.fn(),
    registerPlatformAccessories: mock.fn(),
    updatePlatformAccessories: mock.fn(),
    unregisterPlatformAccessories: mock.fn(),
  });
  plugin(api);
  return { api, Platform: api.registerPlatform.mock.calls[0].arguments[1] };
}

/** Starts the platform as Homebridge does: construct, restore cached accessories, then didFinishLaunching. */
async function startPlatform(config = LOCAL_CONFIG, cached = []) {
  // A test can start the platform twice, as two Homebridge launches; the second start drops the first one's timers.
  mock.timers.reset();
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const server = mockServers();
  const { api, Platform } = fakeApi();
  const log = makeLog();
  const platform = new Platform(log, { platform: 'DaikinAirPurifier', ...config }, api);
  for (const accessory of cached) {
    platform.configureAccessory(accessory);
  }
  api.emit('didFinishLaunching');
  await settle();
  const registered = api.registerPlatformAccessories.mock.calls[0]?.arguments[2][0];
  const updated = api.updatePlatformAccessories.mock.calls[0]?.arguments[0][0];
  const accessory = registered ?? updated;
  return { api, platform, accessory, server, log, services: accessory?.services ?? [] };
}

const switches = (accessory) => accessory.services.filter((s) => s.UUID === hap.Service.Switch.UUID);

describe('plugin', () => {
  test('registers the DaikinAirPurifier platform', () => {
    const { api } = fakeApi();
    assert.equal(api.registerPlatform.mock.callCount(), 1);
    assert.equal(api.registerPlatform.mock.calls[0].arguments[0], 'DaikinAirPurifier');
    assert.equal(typeof api.registerPlatform.mock.calls[0].arguments[1], 'function');
  });

  test('registers one new accessory with the information, purifier, humidifier, three sensor and three switch services', async () => {
    const { api, services } = await startPlatform();
    assert.equal(api.registerPlatformAccessories.mock.callCount(), 1);
    const [pluginName, platformName, accessories] = api.registerPlatformAccessories.mock.calls[0].arguments;
    assert.equal(pluginName, PLUGIN);
    assert.equal(platformName, 'DaikinAirPurifier');
    assert.equal(accessories.length, 1);
    assert.deepEqual(services.map((s) => s.UUID), [
      hap.Service.AccessoryInformation.UUID, hap.Service.AirPurifier.UUID, hap.Service.HumidifierDehumidifier.UUID,
      hap.Service.AirQualitySensor.UUID, hap.Service.HumiditySensor.UUID, hap.Service.TemperatureSensor.UUID,
      hap.Service.Switch.UUID, hap.Service.Switch.UUID, hap.Service.Switch.UUID,
    ]);
  });

  test('gives the accessory a UUID that stays the same across restarts', async () => {
    const first = await startPlatform();
    const second = await startPlatform();
    assert.equal(first.accessory.UUID, second.accessory.UUID);
    assert.equal(first.accessory.UUID, hap.uuid.generate('DaikinAirPurifier:Test'));
  });

  test('reuses the cached accessory without adding its services again', async () => {
    const { accessory: cached } = await startPlatform();
    const count = cached.services.length;
    const { api, accessory } = await startPlatform(LOCAL_CONFIG, [cached]);
    assert.equal(api.registerPlatformAccessories.mock.callCount(), 0);
    assert.equal(api.updatePlatformAccessories.mock.callCount(), 1);
    assert.equal(accessory, cached);
    assert.equal(accessory.services.length, count);
    assert.equal(api.unregisterPlatformAccessories.mock.callCount(), 0);
  });

  test('removes mode switches from the cached accessory when they are turned off', async () => {
    const { accessory: cached } = await startPlatform();
    assert.equal(switches(cached).length, 3);
    const { accessory } = await startPlatform({ ...LOCAL_CONFIG, modeSwitches: ['eco'] }, [cached]);
    assert.deepEqual(switches(accessory).map((s) => s.subtype), ['mode-eco']);
    const purifier = accessory.getService(hap.Service.AirPurifier);
    assert.deepEqual(purifier.linkedServices.map((s) => s.subtype), ['mode-eco']);
  });

  test('unregisters a cached accessory it no longer uses, such as one from an earlier name', async () => {
    const { accessory: old } = await startPlatform({ ...LOCAL_CONFIG, name: 'Old name' });
    const { api, accessory } = await startPlatform(LOCAL_CONFIG, [old]);
    assert.notEqual(accessory, old);
    assert.equal(api.unregisterPlatformAccessories.mock.callCount(), 1);
    assert.deepEqual(api.unregisterPlatformAccessories.mock.calls[0].arguments[2], [old]);
  });

  test('does not start when neither a local IP nor a Daikin login is set', async () => {
    const { accessory: cached } = await startPlatform();
    const { api, server, log, accessory } = await startPlatform({ name: 'Test' }, [cached]);
    assert.equal(accessory, undefined);
    assert.equal(api.registerPlatformAccessories.mock.callCount(), 0);
    assert.equal(server.requests.length, 0);
    assert.ok(log.has('warn', 'Not configured, so not starting'));
    // The accessory from when it was configured is removed, so no "No Response" tile is left in the Home app.
    assert.deepEqual(api.unregisterPlatformAccessories.mock.calls[0].arguments[2], [cached]);
    mock.timers.tick(600_000);
    await settle();
    assert.equal(server.requests.length, 0);
  });

  test('does not start when Homebridge passes no config at all', async () => {
    mock.timers.reset();
    const { api, Platform } = fakeApi();
    const log = makeLog();
    new Platform(log, undefined, api);
    api.emit('didFinishLaunching');
    await settle();
    assert.equal(api.registerPlatformAccessories.mock.callCount(), 0);
    assert.ok(log.has('warn', 'Not configured, so not starting'));
  });

  test('names the accessory "Daikin Air Purifier" when no name is set', async () => {
    const config = { ...LOCAL_CONFIG };
    delete config.name;
    const { accessory } = await startPlatform(config);
    assert.equal(accessory.displayName, 'Daikin Air Purifier');
    assert.equal(accessory.UUID, hap.uuid.generate('DaikinAirPurifier:Daikin Air Purifier'));
  });

  test('isConfigured accepts a local IP or any way to log in to the Daikin cloud', () => {
    assert.equal(isConfigured({}), false);
    assert.equal(isConfigured({ username: 'u', password: 'p' }), false);
    assert.equal(isConfigured({ host: HOST }), true);
    assert.equal(isConfigured({ username: 'u', password: 'p', clientSecret: 's' }), true);
    assert.equal(isConfigured({ code: 'c', clientSecret: 's' }), true);
    assert.equal(isConfigured({ refreshToken: 'r' }), true);
  });

  test('stops polling when Homebridge shuts down', async () => {
    const { api, server } = await startPlatform({ ...LOCAL_CONFIG, cacheDuration: 30 });
    assert.equal(server.count(UNIT), 1);
    api.emit('shutdown');
    mock.timers.tick(120_000);
    await settle();
    assert.equal(server.count(UNIT), 1);
  });

  test('leaves out the mode switches when modeSwitches is empty', async () => {
    const { accessory } = await startPlatform({ ...LOCAL_CONFIG, modeSwitches: [] });
    assert.equal(switches(accessory).length, 0);
  });

  test('shows the polled mode on the switches after startup', async () => {
    const { accessory } = await startPlatform();
    assert.ok(switches(accessory).every((s) => typeof s.getCharacteristic(C.On).value === 'boolean'));
  });

  test('reads the purifier once at startup and shows the values in HomeKit', async () => {
    const { accessory, server, log } = await startPlatform();
    assert.equal(server.count(UNIT), 1);
    const temperature = accessory.getService(hap.Service.TemperatureSensor).getCharacteristic(C.CurrentTemperature).value;
    assert.equal(temperature, 26);
    assert.ok(log.has('info', 'Daikin Air Purifier is initialized'));
  });

  test('polls the purifier once per cacheDuration, with one request per poll', async () => {
    const { server } = await startPlatform({ ...LOCAL_CONFIG, cacheDuration: 30 });
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
    const { server } = await startPlatform({ ...LOCAL_CONFIG, cacheDuration: 5 });
    mock.timers.tick(14_999);
    await settle();
    assert.equal(server.count(UNIT), 1);
    mock.timers.tick(1);
    await settle();
    assert.equal(server.count(UNIT), 2);
  });

  test('polls every 60 seconds when cacheDuration is missing', async () => {
    const { server } = await startPlatform({ name: 'Test', host: HOST });
    mock.timers.tick(59_999);
    await settle();
    assert.equal(server.count(UNIT), 1);
    mock.timers.tick(1);
    await settle();
    assert.equal(server.count(UNIT), 2);
  });

  test('polls the Daikin cloud no more often than every 60 seconds', async () => {
    const config = { ...PASSWORD_CONFIG, cacheDuration: 15 };
    delete config.host;
    const { server } = await startPlatform(config);
    const before = server.count(CLOUD_UNIT);
    mock.timers.tick(59_999);
    await settle();
    assert.equal(server.count(CLOUD_UNIT), before);
    mock.timers.tick(1);
    await settle();
    assert.equal(server.count(CLOUD_UNIT), before + 1);
  });

  test('an error while updating HomeKit is logged and polling continues', async () => {
    const { platform, server, log } = await startPlatform({ ...LOCAL_CONFIG, cacheDuration: 30 });
    platform.purifier.airPurifier.identify = async () => {
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
    const { platform, server } = await startPlatform({ ...LOCAL_CONFIG, cacheDuration: 30 });
    mock.timers.tick(10_000);
    await platform.purifier.refresh();
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
