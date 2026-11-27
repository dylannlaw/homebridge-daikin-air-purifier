import type { API, HAP, Logging, PlatformAccessory, PlatformConfig, Service } from 'homebridge';
import Client from '../client.js';
import { serviceFor } from './serviceFor.js';
import { FanSpeed, Mode, PowerStatus } from '../constant.js';
import type { ModeSwitchName } from '../types.js';

const MODES: Record<ModeSwitchName, { mode: Mode; label: string }> = {
  eco: { mode: Mode.Econo, label: 'Eco' },
  pollen: { mode: Mode.Pollen, label: 'Pollen' },
  circulator: { mode: Mode.Circulator, label: 'Circulator' },
};

const DEFAULT_MODES = Object.keys(MODES) as ModeSwitchName[];

/** The modes to show, from the `modeSwitches` setting: all of them when it's missing, unknown names left out. */
export function enabledModes(setting: unknown, log?: Logging): ModeSwitchName[] {
  if (setting === undefined || setting === null) {
    return DEFAULT_MODES;
  }
  if (!Array.isArray(setting)) {
    log?.warn('modeSwitches should be a list such as ["eco", "pollen", "circulator"]. Showing all mode switches.');
    return DEFAULT_MODES;
  }
  return DEFAULT_MODES.filter((name) => setting.includes(name));
}

/**
 * One HomeKit switch per Daikin mode (Eco, Pollen, Circulator), acting as a single choice: only the switch for the
 * current mode is on. HomeKit has no dropdown for an air purifier, so this is how these modes are offered.
 */
class ModeSwitch {
  private switches: { name: ModeSwitchName; mode: Mode; service: Service }[] = [];
  private client: Client;
  private api: API;

  constructor(
    client: Client, hap: HAP, log: Logging, config: PlatformConfig, api: API, purifier?: Service, accessory?: PlatformAccessory,
  ) {
    this.client = client;
    this.api = api;

    const enabled = enabledModes(config.modeSwitches, log);

    // Switches for modes no longer in `modeSwitches` are still on the accessory restored from the cache: remove them.
    for (const name of DEFAULT_MODES.filter((mode) => !enabled.includes(mode))) {
      const stale = accessory?.getServiceById(hap.Service.Switch, `mode-${name}`);
      if (stale) {
        purifier?.removeLinkedService(stale);
        accessory!.removeService(stale);
      }
    }

    for (const name of enabled) {
      const { mode, label } = MODES[name];
      const service = serviceFor(accessory, hap.Service.Switch, label, `mode-${name}`);
      if (!service.testCharacteristic(hap.Characteristic.ConfiguredName)) {
        service.addOptionalCharacteristic(hap.Characteristic.ConfiguredName);
      }
      service.setCharacteristic(hap.Characteristic.ConfiguredName, label);

      client.bindSet(
        service.getCharacteristic(hap.Characteristic.On).onGet(() => this.isOn(mode)),
        (value) => this.setOn(name, Boolean(value)),
      );

      purifier?.addLinkedService(service);
      this.switches.push({ name, mode, service });
    }

    if (this.switches.length) {
      log.info(`Initialize mode switches: ${this.switches.map(({ name }) => MODES[name].label).join(', ')}`);
    }
  }

  async isOn(mode: Mode) {
    const { airPurifier } = this.client.getCachedUnitInfo();
    return airPurifier.pow === PowerStatus.On && airPurifier.mode === mode;
  }

  async setOn(name: ModeSwitchName, on: boolean) {
    const { mode } = MODES[name];
    const { airPurifier } = this.client.getCachedUnitInfo();

    if (on) {
      await this.client.setControlInfo({ pow: PowerStatus.On, mode, airvol: FanSpeed.Off, humd: airPurifier.humd });
      for (const other of this.switches) {
        if (other.name !== name) {
          other.service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(false);
        }
      }
      return;
    }

    // Turning off a mode the purifier isn't in changes nothing, so it needs no API call.
    if (airPurifier.mode !== mode) {
      return;
    }
    // Back to Auto (Daikin's Smart mode).
    await this.client.setControlInfo({ pow: airPurifier.pow, mode: Mode.Smart, airvol: FanSpeed.Off, humd: airPurifier.humd });
  }

  getServices(): Service[] {
    return this.switches.map(({ service }) => service);
  }

  async identify() {
    for (const { mode, service } of this.switches) {
      service.getCharacteristic(this.api.hap.Characteristic.On).updateValue(await this.isOn(mode));
    }
  }

}

export default ModeSwitch;
