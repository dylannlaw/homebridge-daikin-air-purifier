import { TemperatureSensor as BaseTemperatureSensor } from 'hap-nodejs/dist/lib/definitions/ServiceDefinitions';
import { AccessoryConfig, API, HAP, Logging } from 'homebridge';
import Client from '../client';
import { PowerStatus } from '../constant';

class TemperatureSensor extends BaseTemperatureSensor {
  private temperatureSensor: BaseTemperatureSensor;
  private client: Client;
  private api: API;

  constructor(client: Client, hap: HAP, log: Logging, config: AccessoryConfig, api: API) {
    super();
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
    const { sensorInfo } = await this.client.getUnitInfo();
    return sensorInfo.htemp;
  }

  async getStatusActive() {
    const { airPurifier } = await this.client.getUnitInfo();
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