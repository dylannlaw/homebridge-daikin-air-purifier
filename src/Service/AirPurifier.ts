import { AirPurifier as BaseAirPurifier } from 'hap-nodejs/dist/lib/definitions/ServiceDefinitions';
import { AccessoryConfig, API, HAP, Logging } from 'homebridge';
import Client from '../client';
import { FanSpeed, HumidityLevel, Mode, PowerStatus } from '../constant';

class AirPurifier extends BaseAirPurifier {
  private airPurifier: BaseAirPurifier;
  private client: Client;
  private api: API;

  constructor(client: Client, hap: HAP, log: Logging, config: AccessoryConfig, api: API) {
    super();
    this.airPurifier = new hap.Service.AirPurifier();
    this.client = client;
    this.api = api;

    this.airPurifier.getCharacteristic(api.hap.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    this.airPurifier.getCharacteristic(api.hap.Characteristic.CurrentAirPurifierState)
      .onGet(this.getCurrentAirPurifierState.bind(this));

    this.airPurifier.getCharacteristic(api.hap.Characteristic.TargetAirPurifierState)
      .onGet(this.getTargetAirPurifierState.bind(this));

    this.airPurifier.getCharacteristic(api.hap.Characteristic.RotationSpeed)
      .onGet(this.getRotationSpeed.bind(this))
      .onSet(this.setRotationSpeed.bind(this));

    log.info('Initialize Air Purifier');
  }

  async getActive() {
    const { airPurifier } = await this.client.getUnitInfo();
    if (airPurifier.pow === PowerStatus.On) {
      return this.api.hap.Characteristic.Active.ACTIVE;
    } else {
      return this.api.hap.Characteristic.Active.INACTIVE;
    }
  }

  async setActive(active) {
    await this.client.setControlInfo({ pow: active });
  }

  async getCurrentAirPurifierState() {
    const { airPurifier } = await this.client.getUnitInfo();

    if (airPurifier?.pow === PowerStatus.Off) {
      return this.api.hap.Characteristic.CurrentAirPurifierState.INACTIVE;
    }
    if (airPurifier?.mode === Mode.AutoFan) {
      return this.api.hap.Characteristic.CurrentAirPurifierState.IDLE;
    }
    return this.api.hap.Characteristic.CurrentAirPurifierState.PURIFYING_AIR;
  }

  async getTargetAirPurifierState() {
    const { airPurifier } = await this.client.getUnitInfo();
    const { mode, airvol, humd } = airPurifier;
    if (mode === Mode.Smart || airvol === FanSpeed.Turbo || humd === HumidityLevel.VeryHigh) {
      return this.api.hap.Characteristic.TargetAirPurifierState.AUTO;
    }
    return this.api.hap.Characteristic.TargetAirPurifierState.MANUAL;
  }

  async getRotationSpeed() {
    const { airPurifier } = await this.client.getUnitInfo();
    switch (airPurifier?.airvol) {
      case FanSpeed.Quiet:
        return 15;
      case FanSpeed.Low:
        return 35;
      case FanSpeed.Standard:
        return 60;
      case FanSpeed.Turbo:
        return 98;
      case FanSpeed.Off:
        return 100;
      default:
        return 0;
    }
  }

  async setRotationSpeed(rotation) {
    const { airPurifier } = await this.client.getUnitInfo();
    let speed = FanSpeed.Off;
    if (rotation >= 98) {
      speed = FanSpeed.Turbo;
    } else if (rotation >= 60) {
      speed = FanSpeed.Standard;
    } else if (rotation >= 35) {
      speed = FanSpeed.Low;
    } else if (rotation >= 15) {
      speed = FanSpeed.Quiet;
    }
    await this.client.setControlInfo({
      mode: airPurifier.mode,
      humd: airPurifier.humd,
      pow: airPurifier.pow,
      airvol: speed,
    });
  }

  getService() {
    return this.airPurifier;
  }

  async identify() {
    const active = await this.getActive();
    const speed = await this.getRotationSpeed();
    const currentState = await this.getCurrentAirPurifierState();
    const targetState = await this.getTargetAirPurifierState();

    this.airPurifier.getCharacteristic(this.api.hap.Characteristic.Active).updateValue(active);
    this.airPurifier.getCharacteristic(this.api.hap.Characteristic.CurrentAirPurifierState).updateValue(currentState);
    this.airPurifier.getCharacteristic(this.api.hap.Characteristic.TargetAirPurifierState).updateValue(targetState);
    this.airPurifier.getCharacteristic(this.api.hap.Characteristic.RotationSpeed).updateValue(speed);
  }

}

export default AirPurifier;