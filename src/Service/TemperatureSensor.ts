import type { API, HAP, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import Client from '../client.js';
import { serviceFor } from './serviceFor.js';
import { Reading } from './reading.js';
import { PowerStatus } from '../constant.js';

class TemperatureSensor {
  private temperatureSensor: Service;
  private client: Client;
  private api: API;
  private temperature = new Reading();

  constructor(client: Client, hap: HAP, log: Logging, config: PlatformConfig, api: API, accessory?: PlatformAccessory) {
    this.temperatureSensor = serviceFor(accessory, hap.Service.TemperatureSensor);
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
    return this.temperature.from(sensorInfo.htemp);
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