import {
  AccessoryConfig,
  AccessoryPlugin,
  API,
  HAP,
  Logging,
  Service,
} from 'homebridge';

import AccessoryInformation from './Service/AccessoryInformation';
import AirPurifier from './Service/AirPurifier';
import Humidifier from './Service/Humidifier';
import AirQualitySensor from './Service/AirQualitySensor';
import HumiditySensor from './Service/HumiditySensor';
import TemperatureSensor from './Service/TemperatureSensor';
import Client from './client';

let hap: HAP;

export = (api: API) => {
  hap = api.hap;
  api.registerAccessory('DaikinAirPurifier', DaikinAirPurifier);
};

class DaikinAirPurifier implements AccessoryPlugin {

  private readonly log: Logging;
  private client: Client;
  private timer: NodeJS.Timeout | null;

  private accessoryInformation: AccessoryInformation;
  private airPurifier: AirPurifier;
  private humidifier: Humidifier;
  private airQualitySensor: AirQualitySensor;
  private humiditySensor: HumiditySensor;
  private temperatureSensor: TemperatureSensor;

  constructor(log: Logging, config: AccessoryConfig, api: API) {
    this.log = log;
    this.client = new Client(log, config);
    this.accessoryInformation = new AccessoryInformation(hap, log, config, api);
    this.airPurifier = new AirPurifier(this.client, hap, log, config, api);
    this.humidifier = new Humidifier(this.client, hap, log, config, api);
    this.airQualitySensor = new AirQualitySensor(this.client, hap, log, config, api);
    this.humiditySensor = new HumiditySensor(this.client, hap, log, config, api);
    this.temperatureSensor = new TemperatureSensor(this.client, hap, log, config, api);

    log.info('Switch finished initializing!');
    this.timer = setTimeout(this.refresh.bind(this), 15000);
    this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = null;

    await this.airPurifier.identify();
    await this.humidifier.identify();
    await this.airQualitySensor.identify();
    await this.humiditySensor.identify();
    await this.temperatureSensor.identify();

    this.timer = setTimeout(this.refresh.bind(this), 15000);
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