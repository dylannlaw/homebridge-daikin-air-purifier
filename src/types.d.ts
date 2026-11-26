import { DustLevel, FanSpeed, HumidityLevel, Mode, OdorLevel, PM2Level, PowerStatus } from './constant.js';

export type AirPurifier = {
  pow: PowerStatus;
  mode: Mode;
  airvol: FanSpeed;
  humd: HumidityLevel;
};

export type SensorInfo = {
  htemp: string;
  hhum: HumidityLevel;
  pm25: PM2Level;
  dust: DustLevel;
  odor: OdorLevel;
};

export type UnitStatus = {
  filter: string;
  strmr_cln: string;
  water_supply: string;
  unit_err: string;
};

export type ControlInfo = {
  pow?: PowerStatus;
  mode?: Mode;
  airvol?: FanSpeed;
  humd?: HumidityLevel;
};

// The shapes below follow docs/reference/daikin-smart-api.openapi.yaml.

/** POST /dsioti/oauth2/token */
export type TokenResponse = {
  token_type?: string;
  id_token?: string;
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
};

/** GET /dsioti/oauth2/userinfo. `l_user_id` and `l_password` are the `id` and `spw` of device calls. */
export type UserInfo = {
  rsc?: number;
  uid?: string;
  l_user_id?: string;
  l_password?: string;
};

/** GET /cleaner/get_unit_info, when already decoded into its groups. */
export type UnitInfoResponse = {
  ctrl_info?: Partial<AirPurifier>;
  sensor_info?: Partial<SensorInfo>;
  unit_status?: Partial<UnitStatus>;
};

/** A Daikin mode that can have its own switch in HomeKit (the `modeSwitches` setting). */
export type ModeSwitchName = 'eco' | 'pollen' | 'circulator';
