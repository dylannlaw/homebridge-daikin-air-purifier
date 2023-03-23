import axios from 'axios';
import { AccessoryConfig, Logging } from 'homebridge';
import NodeCache from 'node-cache';
import { DustLevel, FanSpeed, HumidityLevel, Mode, OdorLevel, PM2Level, PowerStatus } from './constant';
import { AirPurifier, ControlInfo, LoginResponse, RefreshToken, SensorInfo, UnitStatus } from './types';

class Client {
  private config: AccessoryConfig;
  private log: Logging;
  private cache: NodeCache;
  private timer: NodeJS.Timeout | null;
  private accessToken: string | undefined;
  private refreshToken: string | undefined;

  private airPurifier: AirPurifier;
  private sensorInfo: SensorInfo;
  private unitStatus: UnitStatus;

  constructor(log: Logging, config: AccessoryConfig) {
    this.cache = new NodeCache({ stdTTL: config.cacheDuration || 60 });
    this.config = config;
    this.log = log;
    this.airPurifier = { pow: PowerStatus.Off, mode: Mode.AutoFan, airvol: FanSpeed.Off, humd: HumidityLevel.Off };
    this.sensorInfo = {
      htemp: '0.0',
      hhum: HumidityLevel.Off,
      pm25: PM2Level.Excellent,
      dust: DustLevel.Excellent,
      odor: OdorLevel.Excellent,
    };
    this.unitStatus = { filter: '0', strmr_cln: '0', water_supply: '0', unit_err: '0000' };

    this.login();
    this.timer = setTimeout(this.refreshAccessToken.bind(this), 30 * 1000 * 60);
  }

  async getUnitInfo(): Promise<{ airPurifier: AirPurifier; sensorInfo: SensorInfo; unitStatus: UnitStatus }> {
    try {
      let result: { data: string | Record<string, unknown> } | undefined = this.cache.get('unit_info');

      if (! result) {
        this.log.debug(`[GET] http://${this.config.host}/cleaner/get_unit_info`, new Date());
        result = await axios.get<string>(`http://${this.config.host}/cleaner/get_unit_info`);
      }

      let info;
      if ((typeof result?.data) === 'string') {
        info = this.parseUnitInfo(result?.data as string);
        this.cache.set('unit_info', { data: info });
      } else {
        info = result.data;
      }

      return {
        airPurifier: info?.ctrl_info,
        sensorInfo: info?.sensor_info,
        unitStatus: info?.unit_status,
      };

    } catch (error) {
      this.log.error(error as string);

      return {
        airPurifier: this.airPurifier,
        sensorInfo: this.sensorInfo,
        unitStatus: this.unitStatus,
      };
    }
  }

  async setControlInfo (info: ControlInfo) {
    try {
      if (this.accessToken) {
        this.log.debug('[GET] https://api.daikinsmartdb.jp/cleaner/set_control_info', new Date());
        const response = await axios.get('https://api.daikinsmartdb.jp/cleaner/set_control_info', {
          headers: {
            Authorization: `Bearer ${ this.accessToken }`,
          },
          params: {
            ...info,
            id: 'ID',
            spw: 'SPW',
            terminalid: this.config.terminalId,
            port: this.config.port,
          }});
        if (response.data !== 'ret=OK') {
          throw new Error(`Unable to set control info: ${ response.data }`);
        }

        Object.keys(info).forEach((key) => {
          if(info[key]) {
            this.airPurifier[key] = info[key];
          }
        });
        this.cache.set('unit_info', { data: this.airPurifier });
      } else {
        throw new Error('Missing accessToken');
      }
    } catch (error) {
      this.log.error(error as string);
    }
  }

  async refreshAccessToken() {
    if (this.refreshToken || this.config.refreshToken) {
      if (this.timer) {
        clearTimeout(this.timer);
      }
      this.timer = null;
      this.log.debug('[POST] https://api.daikinsmartdb.jp/premise/dsiot/token', new Date());
      const result = await axios.post<RefreshToken>('https://api.daikinsmartdb.jp/premise/dsiot/token', {
        grant_type: 'refresh_token',
        refresh_token: this.refreshToken ?? this.config.refreshToken,
      });
      this.accessToken = result.data.access_token;
      this.refreshToken = result.data.refresh_token;
      this.timer = setTimeout(this.refreshAccessToken.bind(this), 30 * 1000 * 60);
    }
  }

  async login() {
    try {
      this.log.debug('[POST] https://api.daikinsmartdb.jp/premise/dsiot/login', new Date());
      const result = await axios.post<LoginResponse>('https://api.daikinsmartdb.jp/premise/dsiot/login', {
        grant_type: 'authorization_code',
        'code': this.config.code,
        'client_id': this.config.clientId,
        'uuid': this.config.uuid,
        'client_secret': this.config.clientSecret,
      });
      this.accessToken = result.data.access_token;
      this.refreshToken = result.data.refresh_token;
    } catch (error) {
      this.log.error(error as string);
    }
  }

  parseResponse(text: string) {
    return JSON.parse('{"' + text.replace(/(=)/g, '":"').replace(/(,)/g, '","') + '"}');
  }

  parseUnitInfo(text: string) {
    const obj = this.parseResponse(text);
    for (const key in obj) {
      if (key === 'ret') {
        continue;
      }
      obj[key] = this.parseResponse(unescape(obj[key]));
    }
    return obj;
  }
}

export default Client;