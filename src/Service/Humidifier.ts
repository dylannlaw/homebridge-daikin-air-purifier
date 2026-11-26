import type { AccessoryConfig, API, HAP, Logging, Service } from 'homebridge';
import Client from '../client.js';
import { FanSpeed, HumidityLevel, Mode, PowerStatus } from '../constant.js';

class Humidifier {
  private humidifier: Service;
  private client: Client;
  private api: API;

  constructor(client: Client, hap: HAP, log: Logging, config: AccessoryConfig, api: API) {
    this.humidifier = new hap.Service.HumidifierDehumidifier();
    this.client = client;
    this.api = api;

    client.bindSet(
      this.humidifier.getCharacteristic(api.hap.Characteristic.Active).onGet(this.getActive.bind(this)),
      this.setActive.bind(this),
    );

    this.humidifier.getCharacteristic(api.hap.Characteristic.CurrentHumidifierDehumidifierState)
      .onGet(this.getCurrentHumidifierDehumidifierState.bind(this));

    client.bindSet(
      this.humidifier.getCharacteristic(api.hap.Characteristic.TargetHumidifierDehumidifierState)
        .onGet(this.getTargetHumidifierDehumidifierState.bind(this)),
      this.setTargetHumidifierDehumidifierState.bind(this),
    );

    // Read-only in HomeKit: the tank level. Strength is set with RotationSpeed below.
    this.humidifier.getCharacteristic(api.hap.Characteristic.WaterLevel).onGet(this.getWaterLevel.bind(this));

    client.bindSet(
      this.humidifier.getCharacteristic(api.hap.Characteristic.RotationSpeed).onGet(this.getRotationSpeed.bind(this)),
      this.setRotationSpeed.bind(this),
    );

    log.info('Initialize Humidifier');
  }

  async getActive() {
    const { airPurifier } = await this.client.getUnitInfo();
    if (airPurifier.pow === PowerStatus.On && airPurifier.humd !== HumidityLevel.Off) {
      return this.api.hap.Characteristic.Active.ACTIVE;
    } else {
      return this.api.hap.Characteristic.Active.INACTIVE;
    }
  }

  async setActive(active) {
    const { airPurifier } = await this.client.getUnitInfo();
    await this.client.setControlInfo({
      mode: airPurifier.mode,
      airvol: airPurifier.airvol,
      // Humidifying needs the purifier on; turning humidifying off leaves the power as it is.
      pow: active === this.api.hap.Characteristic.Active.ACTIVE ? PowerStatus.On : airPurifier.pow,
      humd: active === this.api.hap.Characteristic.Active.ACTIVE ? HumidityLevel.Standard : HumidityLevel.Off,
    });
  }

  async getCurrentHumidifierDehumidifierState() {
    const { airPurifier } = await this.client.getUnitInfo();

    if (airPurifier.pow === PowerStatus.Off) {
      return this.api.hap.Characteristic.CurrentHumidifierDehumidifierState.INACTIVE;
    }
    if (airPurifier.humd === HumidityLevel.Off) {
      return this.api.hap.Characteristic.CurrentHumidifierDehumidifierState.IDLE;
    }
    return this.api.hap.Characteristic.CurrentHumidifierDehumidifierState.HUMIDIFYING;
  }

  async getTargetHumidifierDehumidifierState() {
    const { airPurifier } = await this.client.getUnitInfo();
    if (
      airPurifier.pow === PowerStatus.On &&
      airPurifier.mode === Mode.Smart &&
      airPurifier.airvol === FanSpeed.Off &&
      airPurifier.humd === HumidityLevel.VeryHigh
    ) {
      return this.api.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER;
    }
    return this.api.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER;
  }

  async setTargetHumidifierDehumidifierState(state) {
    const { airPurifier } = await this.client.getUnitInfo();
    if (state === this.api.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER_OR_DEHUMIDIFIER) {
      await this.client.setControlInfo({
        pow: PowerStatus.On,
        mode: Mode.Smart,
        airvol: FanSpeed.Off,
        humd: HumidityLevel.VeryHigh,
      });
    } else if (state === this.api.hap.Characteristic.TargetHumidifierDehumidifierState.HUMIDIFIER ||
        state === this.api.hap.Characteristic.TargetHumidifierDehumidifierState.DEHUMIDIFIER
    ) {
      await this.client.setControlInfo({
        mode: airPurifier.mode,
        airvol: airPurifier.airvol,
        pow: PowerStatus.On,
        humd: HumidityLevel.Standard,
      });
    }
  }

  async getWaterLevel() {
    const { unitStatus } = await this.client.getUnitInfo();
    return Number(unitStatus.water_supply);
  }

  /** Humidifying strength as a slider: Low 33%, Standard 66%, High 100%. VeryHigh (Smart mode) also shows 100%. */
  async getRotationSpeed() {
    const { airPurifier } = await this.client.getUnitInfo();
    switch (airPurifier.humd) {
      case HumidityLevel.Low:
        return 33;
      case HumidityLevel.Standard:
        return 66;
      case HumidityLevel.High:
      case HumidityLevel.VeryHigh:
        return 100;
      default:
        return 0;
    }
  }

  /** 0% turns humidifying off; 1–33% is Low, 34–66% Standard, 67–100% High. */
  async setRotationSpeed(value) {
    const { airPurifier } = await this.client.getUnitInfo();
    const level = Number(value);
    let humd = HumidityLevel.High;
    if (level <= 0) {
      humd = HumidityLevel.Off;
    } else if (level <= 33) {
      humd = HumidityLevel.Low;
    } else if (level <= 66) {
      humd = HumidityLevel.Standard;
    }
    await this.client.setControlInfo({
      mode: airPurifier.mode,
      airvol: airPurifier.airvol,
      pow: humd === HumidityLevel.Off ? airPurifier.pow : PowerStatus.On,
      humd,
    });
  }

  getService() {
    return this.humidifier;
  }

  async identify() {
    const active = await this.getActive();
    const waterLevel = await this.getWaterLevel();
    const strength = await this.getRotationSpeed();
    const currentState = await this.getCurrentHumidifierDehumidifierState();
    const targetState = await this.getTargetHumidifierDehumidifierState();

    this.humidifier.getCharacteristic(this.api.hap.Characteristic.Active).updateValue(active);
    this.humidifier.getCharacteristic(this.api.hap.Characteristic.CurrentHumidifierDehumidifierState).updateValue(currentState);
    this.humidifier.getCharacteristic(this.api.hap.Characteristic.TargetHumidifierDehumidifierState).updateValue(targetState);
    this.humidifier.getCharacteristic(this.api.hap.Characteristic.WaterLevel).updateValue(waterLevel);
    this.humidifier.getCharacteristic(this.api.hap.Characteristic.RotationSpeed).updateValue(strength);
  }

}

export default Humidifier;