import { AirQualitySensor as BaseAirQualitySensor } from 'hap-nodejs/dist/lib/definitions/ServiceDefinitions';
import { AccessoryConfig, API, HAP, Logging } from 'homebridge';
import Client from '../client';
import { PowerStatus } from '../constant';

class AirQualitySensor extends BaseAirQualitySensor {
  private airQualitySensor: BaseAirQualitySensor;
  private client: Client;
  private api: API;

  constructor(client: Client, hap: HAP, log: Logging, config: AccessoryConfig, api: API) {
    super();
    this.airQualitySensor = new hap.Service.AirQualitySensor();
    this.client = client;
    this.api = api;

    this.airQualitySensor.getCharacteristic(api.hap.Characteristic.StatusActive)
      .onGet(this.getStatusActive.bind(this));

    this.airQualitySensor.getCharacteristic(api.hap.Characteristic.AirQuality)
      .onGet(this.getAirQuality.bind(this));

    this.airQualitySensor.getCharacteristic(api.hap.Characteristic.PM2_5Density)
      .onGet(this.getPm2_5Density.bind(this));

    this.airQualitySensor.getCharacteristic(api.hap.Characteristic.SulphurDioxideDensity)
      .onGet(this.getSulphurDioxideDensity.bind(this));

    this.airQualitySensor.getCharacteristic(api.hap.Characteristic.VOCDensity)
      .onGet(this.getVOCDensity.bind(this));

    log.info('Initialize AirQualitySensor');
  }

  async getStatusActive() {
    const { airPurifier } = await this.client.getUnitInfo();
    return airPurifier.pow === PowerStatus.On;
  }

  async getAirQuality() {
    const { sensorInfo } = await this.client.getUnitInfo();
    const pm25 = Number(sensorInfo.pm25);
    const dust = Number(sensorInfo.dust);
    const odor = Number(sensorInfo.odor);
    let airQuality = this.api.hap.Characteristic.AirQuality.UNKNOWN;

    if (pm25 >= 0 || dust >= 0 || odor >= 0) {
      airQuality = this.api.hap.Characteristic.AirQuality.EXCELLENT;
    }
    if (pm25 > 1 || dust > 1 || odor > 1) {
      airQuality = this.api.hap.Characteristic.AirQuality.GOOD;
    }
    if (pm25 > 2 || dust > 2 || odor > 2) {
      airQuality = this.api.hap.Characteristic.AirQuality.FAIR;
    }
    if (pm25 > 3 || dust > 3 || odor > 3) {
      airQuality = this.api.hap.Characteristic.AirQuality.INFERIOR;
    }
    if (pm25 > 4 || dust > 4 || odor > 4) {
      airQuality = this.api.hap.Characteristic.AirQuality.POOR;
    }
    return airQuality;
  }

  async getPm2_5Density() {
    const { sensorInfo } = await this.client.getUnitInfo();
    return Number(sensorInfo.pm25);
  }

  async getSulphurDioxideDensity() {
    const { sensorInfo } = await this.client.getUnitInfo();
    return Number(sensorInfo.odor);
  }

  async getVOCDensity() {
    const { sensorInfo } = await this.client.getUnitInfo();
    return Number(sensorInfo.dust);
  }

  getService() {
    return this.airQualitySensor;
  }

  async identify() {
    const statusActive = await this.getStatusActive();
    const airQuality = await this.getAirQuality();
    const pm2_5Density = await this.getPm2_5Density();
    const sulphurDioxideDensity = await this.getSulphurDioxideDensity();
    const vocDensity = await this.getVOCDensity();

    this.airQualitySensor.getCharacteristic(this.api.hap.Characteristic.StatusActive).updateValue(statusActive);
    this.airQualitySensor.getCharacteristic(this.api.hap.Characteristic.AirQuality).updateValue(airQuality);
    this.airQualitySensor.getCharacteristic(this.api.hap.Characteristic.PM2_5Density).updateValue(pm2_5Density);
    this.airQualitySensor.getCharacteristic(this.api.hap.Characteristic.SulphurDioxideDensity).updateValue(sulphurDioxideDensity);
    this.airQualitySensor.getCharacteristic(this.api.hap.Characteristic.VOCDensity).updateValue(vocDensity);
  }

}

export default AirQualitySensor;