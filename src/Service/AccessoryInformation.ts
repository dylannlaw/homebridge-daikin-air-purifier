import type { API, HAP, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import { serviceFor } from './serviceFor.js';

class AccessoryInformation {
  private information: Service;
  private model: string;
  private serial: string;
  private name: string;

  constructor(hap: HAP, log: Logging, config: PlatformConfig, api: API, accessory?: PlatformAccessory) {
    this.information = serviceFor(accessory, hap.Service.AccessoryInformation);
    this.name = config.name || 'Daikin';
    this.model = config.model || 'Unknown';
    this.serial = config.serial || '123-456-789';

    this.information.setCharacteristic(api.hap.Characteristic.Manufacturer, this.name);
    this.information.setCharacteristic(api.hap.Characteristic.Model, this.model);
    this.information.setCharacteristic(api.hap.Characteristic.SerialNumber, this.serial);
    log.info(`Initialize ${this.name} Accessory Information`);
  }

  getService() {
    return this.information;
  }

}

export default AccessoryInformation;
