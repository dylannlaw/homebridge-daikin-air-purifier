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

/*
 * IMPORTANT NOTICE
 *
 * One thing you need to take care of is, that you never ever ever import anything directly from the "homebridge" module (or the "hap-nodejs" module).
 * The above import block may seem like, that we do exactly that, but actually those imports are only used for types and interfaces
 * and will disappear once the code is compiled to Javascript.
 * In fact you can check that by running `npm run build` and opening the compiled Javascript file in the `dist` folder.
 * You will notice that the file does not contain a `... = require("homebridge");` statement anywhere in the code.
 *
 * The contents of the above import statement MUST ONLY be used for type annotation or accessing things like CONST ENUMS,
 * which is a special case as they get replaced by the actual value and do not remain as a reference in the compiled code.
 * Meaning normal enums are bad, const enums can be used.
 *
 * You MUST NOT import anything else which remains as a reference in the code, as this will result in
 * a `... = require("homebridge");` to be compiled into the final Javascript code.
 * This typically leads to unexpected behavior at runtime, as in many cases it won't be able to find the module
 * or will import another instance of homebridge causing collisions.
 *
 * To mitigate this the {@link API | Homebridge API} exposes the whole suite of HAP-NodeJS inside the `hap` property
 * of the api object, which can be acquired for example in the initializer function. This reference can be stored
 * like this for example and used to access all exported variables and classes from HAP-NodeJS.
 */
let hap: HAP;

/*
 * Initializer function called when the plugin is loaded.
 */
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

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
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

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
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