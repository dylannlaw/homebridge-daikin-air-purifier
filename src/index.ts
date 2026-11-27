import type {
  API,
  DynamicPlatformPlugin,
  Logging,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';

import AccessoryInformation from './Service/AccessoryInformation.js';
import AirPurifier from './Service/AirPurifier.js';
import Humidifier from './Service/Humidifier.js';
import AirQualitySensor from './Service/AirQualitySensor.js';
import HumiditySensor from './Service/HumiditySensor.js';
import TemperatureSensor from './Service/TemperatureSensor.js';
import ModeSwitch from './Service/ModeSwitch.js';
import Client from './client.js';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js';

export default (api: API) => {
  api.registerPlatform(PLATFORM_NAME, DaikinAirPurifierPlatform);
};

/**
 * Whether there is anything to read the purifier from: its local IP, or a way to log in to the Daikin cloud.
 * Without one the plugin doesn't start.
 */
export function isConfigured(config: PlatformConfig): boolean {
  const passwordLogin = config.username && config.password && config.clientSecret;
  const codeLogin = config.code && config.clientSecret;
  return Boolean(config.host || passwordLogin || codeLogin || config.refreshToken);
}

/** A dynamic platform with one accessory: the purifier. */
class DaikinAirPurifierPlatform implements DynamicPlatformPlugin {

  private readonly log: Logging;
  private readonly config: PlatformConfig;
  private readonly api: API;
  private readonly cached: PlatformAccessory[] = [];
  purifier: DaikinAirPurifier | null = null;

  constructor(log: Logging, config: PlatformConfig, api: API) {
    this.log = log;
    this.config = config ?? {};
    this.api = api;

    api.on('didFinishLaunching', () => this.start());
    api.on('shutdown', () => this.purifier?.stop());
  }

  /** Called by Homebridge for each accessory restored from its cache, before didFinishLaunching. */
  configureAccessory(accessory: PlatformAccessory): void {
    this.cached.push(accessory);
  }

  private start(): void {
    if (!isConfigured(this.config)) {
      this.log.warn(
        'Not configured, so not starting: set the purifier\'s local IP (host), or your Daikin account email, password ' +
        'and Client Secret, in the plugin settings.',
      );
      this.unregister(this.cached);
      return;
    }

    const name = this.config.name || 'Daikin Air Purifier';
    const uuid = this.api.hap.uuid.generate(`${PLATFORM_NAME}:${name}`);
    let accessory = this.cached.find((cached) => cached.UUID === uuid);
    const isNew = !accessory;
    if (!accessory) {
      accessory = new this.api.platformAccessory(name, uuid);
    }

    this.purifier = new DaikinAirPurifier(this.log, this.config, this.api, accessory);

    if (isNew) {
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } else {
      this.api.updatePlatformAccessories([accessory]);
    }
    // An accessory from an earlier name is no longer used: remove it so it doesn't stay in the Home app as "No Response".
    this.unregister(this.cached.filter((cached) => cached.UUID !== uuid));
  }

  private unregister(accessories: PlatformAccessory[]): void {
    if (accessories.length) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories);
    }
  }

}

/** The purifier's services on its accessory, refreshed from one status request per poll. */
class DaikinAirPurifier {

  private readonly log: Logging;
  private client: Client;
  private timer: NodeJS.Timeout | null = null;
  private pollInterval: number;
  private stopped = false;

  private accessoryInformation: AccessoryInformation;
  private airPurifier: AirPurifier;
  private humidifier: Humidifier;
  private airQualitySensor: AirQualitySensor;
  private humiditySensor: HumiditySensor;
  private temperatureSensor: TemperatureSensor;
  private modeSwitch: ModeSwitch;

  constructor(log: Logging, config: PlatformConfig, api: API, accessory: PlatformAccessory) {
    const hap = api.hap;
    this.log = log;
    this.client = new Client(log, config, api.user.storagePath(), hap);
    // cacheDuration, with the minimums the client applies for local and cloud reads.
    this.pollInterval = this.client.cacheDuration;
    this.accessoryInformation = new AccessoryInformation(hap, log, config, api, accessory);
    this.airPurifier = new AirPurifier(this.client, hap, log, config, api, accessory);
    this.humidifier = new Humidifier(this.client, hap, log, config, api, accessory);
    this.airQualitySensor = new AirQualitySensor(this.client, hap, log, config, api, accessory);
    this.humiditySensor = new HumiditySensor(this.client, hap, log, config, api, accessory);
    this.temperatureSensor = new TemperatureSensor(this.client, hap, log, config, api, accessory);
    this.modeSwitch = new ModeSwitch(this.client, hap, log, config, api, this.airPurifier.getService(), accessory);

    log.info('Daikin Air Purifier is initialized.');
    this.refresh();
  }

  async refresh(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = null;

    try {
      // One request per poll, to the Daikin cloud or the purifier. The identify() calls below read the cached result.
      await this.client.getUnitInfo(true);
      await this.airPurifier.identify();
      await this.humidifier.identify();
      await this.airQualitySensor.identify();
      await this.humiditySensor.identify();
      await this.temperatureSensor.identify();
      await this.modeSwitch.identify();
    } catch (error) {
      this.log.error('Unable to refresh Daikin Air Purifier state:', (error as Error).message);
    }

    if (!this.stopped) {
      this.timer = setTimeout(this.refresh.bind(this), this.pollInterval);
    }
  }

  /** Stops polling, when Homebridge shuts down. */
  stop(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = null;
  }

}
