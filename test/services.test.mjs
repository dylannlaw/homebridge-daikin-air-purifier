import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { LOCAL_CONFIG, hap, makeClient, makeLog, mockServers } from './helpers.mjs';

const { default: AirPurifier } = await import('../dist/Service/AirPurifier.js');
const { default: Humidifier } = await import('../dist/Service/Humidifier.js');
const { default: AirQualitySensor } = await import('../dist/Service/AirQualitySensor.js');
const { default: HumiditySensor } = await import('../dist/Service/HumiditySensor.js');
const { default: TemperatureSensor } = await import('../dist/Service/TemperatureSensor.js');
const { default: AccessoryInformation } = await import('../dist/Service/AccessoryInformation.js');

const C = hap.Characteristic;
const api = { hap };

/** A stand-in for the client that serves fixed status and records control changes. */
function fakeClient({ airPurifier = {}, sensorInfo = {}, unitStatus = {} } = {}) {
  const state = {
    airPurifier: { pow: '1', mode: '0', airvol: '3', humd: '2', ...airPurifier },
    sensorInfo: { htemp: '26.0', hhum: '64', pm25: '1', dust: '1', odor: '1', ...sensorInfo },
    unitStatus: { filter: '0', strmr_cln: '0', water_supply: '1', unit_err: '0000', ...unitStatus },
  };
  return {
    state,
    controlEnabled: true,
    getUnitInfo: mock.fn(async () => state),
    setControlInfo: mock.fn(async () => {}),
    bindSet(characteristic, handler) {
      if (handler) {
        characteristic.onSet(handler);
      }
    },
  };
}

const lastSet = (client) => client.setControlInfo.mock.calls.at(-1).arguments[0];
const make = (Service, status) => {
  const client = fakeClient(status);
  return { client, service: new Service(client, hap, makeLog(), LOCAL_CONFIG, api) };
};

describe('Air Purifier tile', () => {
  test('Active follows the power', async () => {
    assert.equal(await make(AirPurifier, { airPurifier: { pow: '1' } }).service.getActive(), C.Active.ACTIVE);
    assert.equal(await make(AirPurifier, { airPurifier: { pow: '0' } }).service.getActive(), C.Active.INACTIVE);
  });

  test('turning on selects Smart mode with automatic fan and humidity', async () => {
    const { client, service } = make(AirPurifier);
    await service.setActive(C.Active.ACTIVE);
    assert.deepEqual(lastSet(client), { pow: '1', mode: '1', airvol: '0', humd: '4' });
  });

  test('turning off only changes the power', async () => {
    const { client, service } = make(AirPurifier);
    await service.setActive(C.Active.INACTIVE);
    assert.deepEqual(lastSet(client), { pow: '0' });
  });

  for (const [status, expected] of [
    [{ pow: '0', mode: '1' }, 'INACTIVE'],
    [{ pow: '1', mode: '0' }, 'IDLE'],
    [{ pow: '1', mode: '1' }, 'PURIFYING_AIR'],
    [{ pow: '1', mode: '3' }, 'PURIFYING_AIR'],
  ]) {
    test(`current state is ${expected} for ${JSON.stringify(status)}`, async () => {
      const { service } = make(AirPurifier, { airPurifier: status });
      assert.equal(await service.getCurrentAirPurifierState(), C.CurrentAirPurifierState[expected]);
    });
  }

  for (const [status, expected] of [
    [{ mode: '1', airvol: '3', humd: '2' }, 'AUTO'],
    [{ mode: '0', airvol: '5', humd: '2' }, 'AUTO'],
    [{ mode: '0', airvol: '3', humd: '4' }, 'AUTO'],
    [{ mode: '0', airvol: '3', humd: '2' }, 'MANUAL'],
  ]) {
    test(`target state is ${expected} for ${JSON.stringify(status)}`, async () => {
      const { service } = make(AirPurifier, { airPurifier: status });
      assert.equal(await service.getTargetAirPurifierState(), C.TargetAirPurifierState[expected]);
    });
  }

  for (const [airvol, speed] of [['1', 15], ['2', 35], ['3', 60], ['5', 98], ['0', 100], ['9', 0]]) {
    test(`fan speed setting ${airvol} shows as ${speed}%`, async () => {
      const { service } = make(AirPurifier, { airPurifier: { airvol } });
      assert.equal(await service.getRotationSpeed(), speed);
    });
  }

  for (const [speed, airvol] of [[100, '5'], [98, '5'], [97, '3'], [60, '3'], [59, '2'], [35, '2'], [34, '1'], [15, '1'], [14, '0'], [0, '0']]) {
    test(`moving the fan slider to ${speed}% sets fan speed ${airvol} in manual mode, keeping power and humidity`, async () => {
      const { client, service } = make(AirPurifier, { airPurifier: { pow: '1', humd: '3' } });
      await service.setRotationSpeed(speed);
      assert.deepEqual(lastSet(client), { mode: '0', humd: '3', pow: '1', airvol });
    });
  }

  test('identify pushes all current values to HomeKit', async () => {
    const { service } = make(AirPurifier, { airPurifier: { pow: '1', mode: '1', airvol: '2' } });
    await service.identify();
    const s = service.getService();
    assert.equal(s.getCharacteristic(C.Active).value, C.Active.ACTIVE);
    assert.equal(s.getCharacteristic(C.CurrentAirPurifierState).value, C.CurrentAirPurifierState.PURIFYING_AIR);
    assert.equal(s.getCharacteristic(C.TargetAirPurifierState).value, C.TargetAirPurifierState.AUTO);
    assert.equal(s.getCharacteristic(C.RotationSpeed).value, 35);
  });

  test('HomeKit reads and writes are wired to the handlers', async () => {
    const { client, service } = make(AirPurifier, { airPurifier: { pow: '0' } });
    const active = service.getService().getCharacteristic(C.Active);
    assert.equal(await active.handleGetRequest(), C.Active.INACTIVE);
    await active.handleSetRequest(C.Active.ACTIVE);
    assert.equal(lastSet(client).pow, '1');
    await service.getService().getCharacteristic(C.RotationSpeed).handleSetRequest(60);
    assert.equal(lastSet(client).airvol, '3');
  });
});

describe('Humidifier tile', () => {
  for (const [status, expected] of [
    [{ pow: '1', humd: '2' }, 'ACTIVE'],
    [{ pow: '1', humd: '0' }, 'INACTIVE'],
    [{ pow: '0', humd: '2' }, 'INACTIVE'],
  ]) {
    test(`Active is ${expected} for ${JSON.stringify(status)}`, async () => {
      const { service } = make(Humidifier, { airPurifier: status });
      assert.equal(await service.getActive(), C.Active[expected]);
    });
  }

  test('turning humidifying on sets standard humidity, keeping mode, fan and power', async () => {
    const { client, service } = make(Humidifier, { airPurifier: { pow: '1', mode: '3', airvol: '2', humd: '0' } });
    await service.setActive(C.Active.ACTIVE);
    assert.deepEqual(lastSet(client), { mode: '3', airvol: '2', pow: '1', humd: '2' });
  });

  test('turning humidifying off sets humidity off', async () => {
    const { client, service } = make(Humidifier);
    await service.setActive(C.Active.INACTIVE);
    assert.equal(lastSet(client).humd, '0');
  });

  for (const [status, expected] of [
    [{ pow: '0', humd: '2' }, 'INACTIVE'],
    [{ pow: '1', humd: '0' }, 'IDLE'],
    [{ pow: '1', humd: '2' }, 'HUMIDIFYING'],
  ]) {
    test(`current state is ${expected} for ${JSON.stringify(status)}`, async () => {
      const { service } = make(Humidifier, { airPurifier: status });
      assert.equal(await service.getCurrentHumidifierDehumidifierState(), C.CurrentHumidifierDehumidifierState[expected]);
    });
  }

  test('target state is auto only in Smart mode with automatic fan and humidity', async () => {
    const auto = make(Humidifier, { airPurifier: { pow: '1', mode: '1', airvol: '0', humd: '4' } }).service;
    assert.equal(await auto.getTargetHumidifierDehumidifierState(), C.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER);
    for (const change of [{ pow: '0' }, { mode: '0' }, { airvol: '3' }, { humd: '2' }]) {
      const service = make(Humidifier, { airPurifier: { pow: '1', mode: '1', airvol: '0', humd: '4', ...change } }).service;
      assert.equal(await service.getTargetHumidifierDehumidifierState(), C.TargetHumidifierDehumidifierState.HUMIDIFIER);
    }
  });

  test('choosing auto selects Smart mode with automatic fan and humidity', async () => {
    const { client, service } = make(Humidifier);
    await service.setTargetHumidifierDehumidifierState(C.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER);
    assert.deepEqual(lastSet(client), { pow: '1', mode: '1', airvol: '0', humd: '4' });
  });

  for (const target of ['HUMIDIFIER', 'DEHUMIDIFIER']) {
    test(`choosing ${target} turns on standard humidity, keeping mode and fan`, async () => {
      const { client, service } = make(Humidifier, { airPurifier: { pow: '0', mode: '2', airvol: '1' } });
      await service.setTargetHumidifierDehumidifierState(C.TargetHumidifierDehumidifierState[target]);
      assert.deepEqual(lastSet(client), { mode: '2', airvol: '1', pow: '1', humd: '2' });
    });
  }

  test('an unknown target state changes nothing', async () => {
    const { client, service } = make(Humidifier);
    await service.setTargetHumidifierDehumidifierState(7);
    assert.equal(client.setControlInfo.mock.callCount(), 0);
  });

  test('water level is reported as a number', async () => {
    const { service } = make(Humidifier, { unitStatus: { water_supply: '1' } });
    assert.equal(await service.getWaterLevel(), 1);
  });

  for (const [level, humd] of [[100, '4'], [98, '4'], [97, '3'], [60, '3'], [59, '2'], [35, '2'], [34, '1'], [15, '1'], [14, '0'], [0, '0']]) {
    test(`moving the water level slider to ${level} sets humidity ${humd}`, async () => {
      const { client, service } = make(Humidifier);
      await service.setWaterLevel(level);
      assert.deepEqual(lastSet(client), { humd });
    });
  }

  test('identify pushes all current values to HomeKit', async () => {
    const { service } = make(Humidifier, { airPurifier: { pow: '1', humd: '2' }, unitStatus: { water_supply: '1' } });
    await service.identify();
    const s = service.getService();
    assert.equal(s.getCharacteristic(C.Active).value, C.Active.ACTIVE);
    assert.equal(s.getCharacteristic(C.CurrentHumidifierDehumidifierState).value, C.CurrentHumidifierDehumidifierState.HUMIDIFYING);
    assert.equal(s.getCharacteristic(C.TargetHumidifierDehumidifierState).value, C.TargetHumidifierDehumidifierState.HUMIDIFIER);
    assert.equal(s.getCharacteristic(C.WaterLevel).value, 1);
  });
});

describe('Air Quality Sensor tile', () => {
  for (const [levels, expected] of [
    [{ pm25: '1', dust: '1', odor: '1' }, 'EXCELLENT'],
    [{ pm25: '0', dust: '0', odor: '0' }, 'EXCELLENT'],
    [{ pm25: '2', dust: '1', odor: '1' }, 'GOOD'],
    [{ pm25: '1', dust: '3', odor: '1' }, 'FAIR'],
    [{ pm25: '1', dust: '1', odor: '4' }, 'INFERIOR'],
    [{ pm25: '5', dust: '1', odor: '1' }, 'POOR'],
    [{ pm25: '6', dust: '6', odor: '6' }, 'POOR'],
    [{ pm25: '-', dust: '-', odor: '-' }, 'UNKNOWN'],
  ]) {
    test(`air quality is ${expected} for ${JSON.stringify(levels)} (the worst reading wins)`, async () => {
      const { service } = make(AirQualitySensor, { sensorInfo: levels });
      assert.equal(await service.getAirQuality(), C.AirQuality[expected]);
    });
  }

  test('reports PM2.5, odour (as SO2) and dust (as VOC) levels as numbers', async () => {
    const { service } = make(AirQualitySensor, { sensorInfo: { pm25: '2', odor: '3', dust: '4' } });
    assert.equal(await service.getPm2_5Density(), 2);
    assert.equal(await service.getSulphurDioxideDensity(), 3);
    assert.equal(await service.getVOCDensity(), 4);
  });

  test('is active only while the purifier is on', async () => {
    assert.equal(await make(AirQualitySensor, { airPurifier: { pow: '1' } }).service.getStatusActive(), true);
    assert.equal(await make(AirQualitySensor, { airPurifier: { pow: '0' } }).service.getStatusActive(), false);
  });

  test('identify pushes all current values to HomeKit', async () => {
    const { service } = make(AirQualitySensor, { sensorInfo: { pm25: '2', dust: '1', odor: '1' } });
    await service.identify();
    const s = service.getService();
    assert.equal(s.getCharacteristic(C.AirQuality).value, C.AirQuality.GOOD);
    assert.equal(s.getCharacteristic(C.PM2_5Density).value, 2);
    assert.equal(s.getCharacteristic(C.StatusActive).value, true);
  });
});

describe('Humidity and Temperature Sensor tiles', () => {
  test('humidity is reported as a number', async () => {
    const { service } = make(HumiditySensor, { sensorInfo: { hhum: '64' } });
    assert.equal(await service.getCurrentRelativeHumidity(), 64);
  });

  test('temperature is reported as a number', async () => {
    const { service } = make(TemperatureSensor, { sensorInfo: { htemp: '26.5' } });
    assert.equal(await service.getCurrentTemperature(), 26.5);
  });

  for (const Service of [HumiditySensor, TemperatureSensor]) {
    test(`${Service.name} is active only while the purifier is on`, async () => {
      assert.equal(await make(Service, { airPurifier: { pow: '1' } }).service.getStatusActive(), true);
      assert.equal(await make(Service, { airPurifier: { pow: '0' } }).service.getStatusActive(), false);
    });
  }

  test('identify pushes values to HomeKit', async () => {
    const humidity = make(HumiditySensor, { sensorInfo: { hhum: '55' } }).service;
    await humidity.identify();
    assert.equal(humidity.getService().getCharacteristic(C.CurrentRelativeHumidity).value, 55);
    const temperature = make(TemperatureSensor, { sensorInfo: { htemp: '21.5' } }).service;
    await temperature.identify();
    assert.equal(temperature.getService().getCharacteristic(C.CurrentTemperature).value, 21.5);
  });
});

describe('Accessory information', () => {
  test('uses the name, model and serial from the config', () => {
    const info = new AccessoryInformation(hap, makeLog(), { name: 'Bedroom', model: 'MCK70W', serial: 'ABC' }, api).getService();
    assert.equal(info.getCharacteristic(C.Manufacturer).value, 'Bedroom');
    assert.equal(info.getCharacteristic(C.Model).value, 'MCK70W');
    assert.equal(info.getCharacteristic(C.SerialNumber).value, 'ABC');
  });

  test('falls back to defaults when they are missing', () => {
    const info = new AccessoryInformation(hap, makeLog(), {}, api).getService();
    assert.equal(info.getCharacteristic(C.Manufacturer).value, 'Daikin');
    assert.equal(info.getCharacteristic(C.Model).value, 'Unknown');
    assert.equal(info.getCharacteristic(C.SerialNumber).value, '123-456-789');
  });
});

describe('local-only mode in the tiles', () => {
  test('every control is read-only and has no set handler', () => {
    mockServers();
    const { client } = makeClient(LOCAL_CONFIG);
    const purifier = new AirPurifier(client, hap, makeLog(), LOCAL_CONFIG, api).getService();
    const humidifier = new Humidifier(client, hap, makeLog(), LOCAL_CONFIG, api).getService();
    const controls = [
      purifier.getCharacteristic(C.Active), purifier.getCharacteristic(C.TargetAirPurifierState), purifier.getCharacteristic(C.RotationSpeed),
      humidifier.getCharacteristic(C.Active), humidifier.getCharacteristic(C.TargetHumidifierDehumidifierState),
      humidifier.getCharacteristic(C.WaterLevel),
    ];
    for (const c of controls) {
      assert.deepEqual(c.props.perms, [hap.Perms.PAIRED_READ, hap.Perms.NOTIFY], c.displayName);
      assert.equal(c.setHandler, undefined, c.displayName);
    }
  });
});
