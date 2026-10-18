import type { AccessoryConfig, API, HAP, Logging, Service } from 'homebridge';
import Client from '../client.js';
import { PowerStatus } from '../constant.js';

class HumiditySensor {
  private humiditySensor: Service;
  private client: Client;
  private api: API;

  constructor(client: Client, hap: HAP, log: Logging, config: AccessoryConfig, api: API) {
    this.humiditySensor = new hap.Service.HumiditySensor();
    this.client = client;
    this.api = api;

    this.humiditySensor.getCharacteristic(api.hap.Characteristic.CurrentRelativeHumidity)
      .onGet(this.getCurrentRelativeHumidity.bind(this));

    this.humiditySensor.getCharacteristic(api.hap.Characteristic.StatusActive)
      .onGet(this.getStatusActive.bind(this));

    log.info('Initialize HumiditySensor');
  }

  async getCurrentRelativeHumidity () {
    const { sensorInfo } = await this.client.getUnitInfo();
    return Number(sensorInfo.hhum);
  }

  async getStatusActive() {
    const { airPurifier } = await this.client.getUnitInfo();
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