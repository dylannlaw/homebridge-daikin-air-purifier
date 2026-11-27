import type { API, HAP, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import Client from '../client.js';
import { serviceFor } from './serviceFor.js';
import { Reading } from './reading.js';
import { PowerStatus } from '../constant.js';

class HumiditySensor {
  private humiditySensor: Service;
  private client: Client;
  private api: API;
  private humidity = new Reading();

  constructor(client: Client, hap: HAP, log: Logging, config: PlatformConfig, api: API, accessory?: PlatformAccessory) {
    this.humiditySensor = serviceFor(accessory, hap.Service.HumiditySensor);
    this.client = client;
    this.api = api;

    this.humiditySensor.getCharacteristic(api.hap.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getCurrentRelativeHumidity.bind(this));

    this.humiditySensor.getCharacteristic(api.hap.Characteristic.StatusActive)
      .onGet(this.getStatusActive.bind(this));

    log.info('Initialize HumiditySensor');
  }

  async getCurrentRelativeHumidity () {
    const { sensorInfo } = this.client.getCachedUnitInfo();
    return this.humidity.from(sensorInfo.hhum);
  }

  async getStatusActive() {
    const { airPurifier } = this.client.getCachedUnitInfo();
    return airPurifier.pow === PowerStatus.On;
  }

  getService() {
    return this.humiditySensor;
  }

  async identify() {
    const currentRelativeHumidity = await this.getCurrentRelativeHumidity();
    const statusActive = await this.getStatusActive();

    this.humiditySensor.getCharacteristic(this.api.hap.Characteristic.CurrentRelativeHumidity).updateValue(currentRelativeHumidity);
    this.humiditySensor.getCharacteristic(this.api.hap.Characteristic.StatusActive).updateValue(statusActive);
  }

}

export default HumiditySensor;