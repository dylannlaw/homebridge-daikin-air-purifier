import type {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  HAP,
  Logging,
  Service,
} from 'homebridge';

import AccessoryInformation from './Service/AccessoryInformation.js';
import AirPurifier from './Service/AirPurifier.js';
import Humidifier from './Service/Humidifier.js';
import AirQualitySensor from './Service/AirQualitySensor.js';
import HumiditySensor from './Service/HumiditySensor.js';
import TemperatureSensor from './Service/TemperatureSensor.js';
import Client from './client.js';

let hap: HAP;

export default (api: API) => {
  hap = api.hap;
  api.registerAccessory('DaikinAirPurifier', DaikinAirPurifier);
};

class DaikinAirPurifier implements AccessoryPlugin {

  private readonly log: Logging;
  private client: Client;
  private timer: NodeJS.Timeout | null = null;
  private pollInterval: number;

  private accessoryInformation: AccessoryInformation;
  private airPurifier: AirPurifier;
  private humidifier: Humidifier;
  private airQualitySensor: AirQualitySensor;
  private humiditySensor: HumiditySensor;
  private temperatureSensor: TemperatureSensor;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.client = new Client(log, config, api.user.storagePath(), api.hap);
    this.pollInterval = Math.max(Number(config.cacheDuration) || 60, 15) * 1000;
    this.accessoryInformation = new AccessoryInformation(hap, log, config, api);
    this.airPurifier = new AirPurifier(this.client, hap, log, config, api);
    this.humidifier = new Humidifier(this.client, hap, log, config, api);
    this.airQualitySensor = new AirQualitySensor(this.client, hap, log, config, api);
    this.humiditySensor = new HumiditySensor(this.client, hap, log, config, api);
    this.temperatureSensor = new TemperatureSensor(this.client, hap, log, config, api);

    log.info('Daikin Air Purifier is initialized.');
    this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = null;

    try {
      // One request to the device per poll. The identify() calls below read the cached result.
      await this.client.getUnitInfo(true);
      await this.airPurifier.identify();
      await this.humidifier.identify();
      await this.airQualitySensor.identify();
      await this.humiditySensor.identify();
      await this.temperatureSensor.identify();
    } catch (error) {
      this.log.error('Unable to refresh Daikin Air Purifier state:', (error as Error).message);
    }

    this.timer = setTimeout(this.refresh.bind(this), this.pollInterval);
  }

  getServices(): Service[] {
    return [
      this.accessoryInformation.getService(),
      this.airPurifier.getService(),
      this.humidifier.getService(),
      this.airQualitySensor.getService(),
      this.humiditySensor.getService(),
      this.temperatureSensor.getService(),
    ];
  }

}