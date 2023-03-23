import { DustLevel, FanSpeed, HumidityLevel, Mode, OdorLevel, PM2Level, PowerStatus } from './constant';

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

export type RefreshToken = {
  access_token: string;
  expires_in: number;
  id_token: string;
  refresh_token: string;
  rsc: number;
  token_type: string;
};

export type ControlInfo = {
  pow?: PowerStatus;
  mode?: Mode;
  airvol?: FanSpeed;
  humd?: HumidityLevel;
};

export type LoginResponse = {
  rsc: number;
  uid: string;
  access_token: string;
  id_token: string;
  expires_in: number;
  refresh_token: string;
};
