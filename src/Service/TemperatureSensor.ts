import type { AccessoryConfig, API, HAP, Logging, Service } from 'homebridge';
import Client from '../client.js';
import { PowerStatus } from '../constant.js';

class TemperatureSensor {
  private temperatureSensor: Service;
  private client: Client;
  private api: API;

  constructor(client: Client, hap: HAP, log: Logging, config: AccessoryConfig, api: API) {
    this.temperatureSensor = new hap.Service.TemperatureSensor();
    this.client = client;
    this.api = api;

    this.temperatureSensor.getCharacteristic(api.hap.Characteristic.CurrentTemperature)
      .onGet(this.getCurrentTemperature.bind(this));

    this.temperatureSensor.getCharacteristic(api.hap.Characteristic.StatusActive)
      .onGet(this.getStatusActive.bind(this));

    log.info('Initialize TemperatureSensor');
  }

  async getCurrentTemperature () {
    const { sensorInfo } = this.client.getCachedUnitInfo();
    return Number(sensorInfo.htemp);
  }

  async getStatusActive() {
    const { airPurifier } = this.client.getCachedUnitInfo();
    return airPurifier.pow === PowerStatus.On;
  }

  getService() {
    return this.temperatureSensor;
  }

  async identify() {
    const currentTemperature = await this.getCurrentTemperature();
    const statusActive = await this.getStatusActive();

    this.temperatureSensor.getCharacteristic(this.api.hap.Characteristic.CurrentTemperature).updateValue(currentTemperature);
    this.temperatureSensor.getCharacteristic(this.api.hap.Characteristic.StatusActive).updateValue(statusActive);
  }

}

export default TemperatureSensor;