import { HumidifierDehumidifier as BaseHumidifier } from 'hap-nodejs/dist/lib/definitions/ServiceDefinitions';
import { AccessoryConfig, API, HAP, Logging } from 'homebridge';
import Client from '../client';
import { FanSpeed, HumidityLevel, Mode, PowerStatus } from '../constant';

class Humidifier extends BaseHumidifier {
  private humidifier: BaseHumidifier;
  private client: Client;
  private api: API;

  constructor(client: Client, hap: HAP, log: Logging, config: AccessoryConfig, api: API) {
    super();
    this.humidifier = new hap.Service.HumidifierDehumidifier();
    this.client = client;
    this.api = api;

    this.humidifier.getCharacteristic(api.hap.Characteristic.Active)
      .onGet(this.getActive.bind(this))
      .onSet(this.setActive.bind(this));

    this.humidifier.getCharacteristic(api.hap.Characteristic.CurrentHumidifierDehumidifierState)
      .onGet(this.getCurrentHumidifierDehumidifierState.bind(this));

    this.humidifier.getCharacteristic(api.hap.Characteristic.TargetHumidifierDehumidifierState)
      .onGet(this.getTargetHumidifierDehumidifierState.bind(this))
      .onSet(this.setTargetHumidifierDehumidifierState.bind(this));

    this.humidifier.getCharacteristic(api.hap.Characteristic.WaterLevel)
      .onGet(this.getWaterLevel.bind(this))
      .onSet(this.setWaterLevel.bind(this));

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
      pow: airPurifier.pow,
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
        pow: airPurifier.pow,
        humd: HumidityLevel.Standard,
      });
    }
  }

  async getWaterLevel() {
    const { unitStatus } = await this.client.getUnitInfo();
    return unitStatus.water_supply;
  }

  async setWaterLevel(level) {
    let speed = HumidityLevel.Off;
    if (level >= 98) {
      speed = HumidityLevel.VeryHigh;
    } else if (level >= 60) {
      speed = HumidityLevel.High;
    } else if (level >= 35) {
      speed = HumidityLevel.Standard;
    } else if (level >= 15) {
      speed = HumidityLevel.Low;
    }
    await this.client.setControlInfo({ humd: speed });
  }

  getService() {
    return this.humidifier;
  }

  async identify() {
    const active = await this.getActive();
    const waterLevel = await this.getWaterLevel();
    const currentState = await this.getCurrentHumidifierDehumidifierState();
    const targetState = await this.getTargetHumidifierDehumidifierState();

    this.humidifier.getCharacteristic(this.api.hap.Characteristic.Active).updateValue(active);
    this.humidifier.getCharacteristic(this.api.hap.Characteristic.CurrentHumidifierDehumidifierState).updateValue(currentState);
    this.humidifier.getCharacteristic(this.api.hap.Characteristic.TargetHumidifierDehumidifierState).updateValue(targetState);
    this.humidifier.getCharacteristic(this.api.hap.Characteristic.WaterLevel).updateValue(waterLevel);
  }

}

export default Humidifier;