import type { API, HAP, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import Client from '../client.js';
import { serviceFor } from './serviceFor.js';
import { Reading } from './reading.js';
import { PowerStatus } from '../constant.js';

class AirQualitySensor {
  private airQualitySensor: Service;
  private client: Client;
  private api: API;
  private pm25 = new Reading();
  private odor = new Reading();
  private dust = new Reading();

  constructor(client: Client, hap: HAP, log: Logging, config: PlatformConfig, api: API, accessory?: PlatformAccessory) {
    this.airQualitySensor = serviceFor(accessory, hap.Service.AirQualitySensor);
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
    const { airPurifier } = this.client.getCachedUnitInfo();
    return airPurifier.pow === PowerStatus.On;
  }

  async getAirQuality() {
    const { sensorInfo } = this.client.getCachedUnitInfo();
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
    const { sensorInfo } = this.client.getCachedUnitInfo();
    return this.pm25.from(sensorInfo.pm25);
  }

  async getSulphurDioxideDensity() {
    const { sensorInfo } = this.client.getCachedUnitInfo();
    return this.odor.from(sensorInfo.odor);
  }

  async getVOCDensity() {
    const { sensorInfo } = this.client.getCachedUnitInfo();
    return this.dust.from(sensorInfo.dust);
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