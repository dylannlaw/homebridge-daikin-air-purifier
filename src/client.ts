import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { AccessoryConfig, Characteristic, CharacteristicSetHandler, HAP, Logging } from 'homebridge';
import { DustLevel, FanSpeed, HumidityLevel, Mode, OdorLevel, PM2Level, PowerStatus } from './constant.js';
import type { AirPurifier, ControlInfo, LoginResponse, RefreshToken, SensorInfo, UnitStatus } from './types.js';

const API_BASE = 'https://api.daikinsmartdb.jp';
// The Daikin Smart App's login server and the public OAuth client it uses.
const AUTH_BASE = 'https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2';
const DEFAULT_CLIENT_ID = 'i66rposkjbceagakohlncsnus';
const REDIRECT_URI = 'daikinsmartapp://callback';
// Wait this long after the last change before sending, so dragging a slider sends one request instead of dozens.
const SET_DEBOUNCE_MS = 1000;
// Refresh the token this long before it expires.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_LIFETIME_S = 60 * 60;
// After a 429, make no cloud calls for this long.
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;

type UnitInfo = { airPurifier: AirPurifier; sensorInfo: SensorInfo; unitStatus: UnitStatus };

type StoredTokens = {
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  // Which authorization code these tokens came from, so a new code in the config forces a new login.
  code?: string;
  // The config refreshToken these tokens came from, so changing it in the config takes effect.
  configRefreshToken?: string;
  // Install identifiers sent at login, generated once and kept so every login looks like the same app install.
  uuid?: string;
  clientDeviceId?: string;
};

class Client {
  // False in local-only mode: no cloud settings are configured, so the purifier can be read but not controlled.
  readonly controlEnabled: boolean;

  private config: AccessoryConfig;
  private log: Logging;
  private hap: HAP;
  private cacheDuration: number;
  private tokenFile: string;

  private unitInfo: UnitInfo;
  private unitInfoFetchedAt = 0;
  private unitInfoRequest: Promise<UnitInfo> | null = null;

  private tokens: StoredTokens = {};
  private tokenTimer: NodeJS.Timeout | null = null;
  private authRequest: Promise<boolean> | null = null;
  private rateLimitedUntil = 0;

  private pendingControl: ControlInfo = {};
  private pendingWaiters: { resolve: () => void; reject: (error: Error) => void }[] = [];
  private setTimer: NodeJS.Timeout | null = null;
  // State before the queued changes were applied locally, restored if sending them fails.
  private stateBeforeSet: AirPurifier | null = null;
  private authFailureLogged = false;
  // Set when the email or password is rejected, so the login isn't retried (and the account locked) until restart.
  private passwordLoginFailed = false;

  constructor(log: Logging, config: AccessoryConfig, storagePath: string, hap: HAP) {
    this.config = config;
    this.log = log;
    this.hap = hap;
    this.cacheDuration = Math.max(Number(config.cacheDuration) || 60, 15) * 1000;
    this.tokenFile = path.join(storagePath, `daikin-air-purifier-${(config.name || 'default').replace(/[^\w-]/g, '_')}.json`);

    this.unitInfo = {
      airPurifier: { pow: PowerStatus.Off, mode: Mode.AutoFan, airvol: FanSpeed.Off, humd: HumidityLevel.Off },
      sensorInfo: {
        htemp: '0.0',
        hhum: HumidityLevel.Off,
        pm25: PM2Level.Excellent,
        dust: DustLevel.Excellent,
        odor: OdorLevel.Excellent,
      },
      unitStatus: { filter: '0', strmr_cln: '0', water_supply: '0', unit_err: '0000' },
    };

    this.loadTokens();
    this.controlEnabled = Boolean(
      config.terminalId && config.port &&
      (this.hasPasswordLogin() || config.code || config.refreshToken || this.tokens.refreshToken),
    );

    if (this.controlEnabled) {
      this.ensureAuthenticated();
    } else {
      this.log.info(
        'Running in local-only mode: sensors and status are read from the purifier, but it cannot be controlled from HomeKit. ' +
        'To enable control, add your Daikin account email and password, the Client Secret, Terminal ID and Port.',
      );
    }
  }

  private hasPasswordLogin() {
    return Boolean(this.config.username && this.config.password && this.config.clientSecret);
  }

  /**
   * Registers a set handler when control is available. In local-only mode the characteristic is made read-only instead,
   * so HomeKit shows the value without offering a control that can't work.
   */
  bindSet(characteristic: Characteristic, handler?: CharacteristicSetHandler) {
    if (this.controlEnabled) {
      if (handler) {
        characteristic.onSet(handler);
      }
    } else {
      characteristic.setProps({ perms: [this.hap.Perms.PAIRED_READ, this.hap.Perms.NOTIFY] });
    }
  }

  /**
   * Returns the cached unit info, fetching it from the device only when the cache is stale.
   * Calls that arrive while a fetch is running share it, so HomeKit asking for 20 values at once makes one request.
   */
  async getUnitInfo(force = false): Promise<UnitInfo> {
    if (!force && Date.now() - this.unitInfoFetchedAt < this.cacheDuration) {
      return this.unitInfo;
    }
    if (!this.unitInfoRequest) {
      this.unitInfoRequest = this.fetchUnitInfo().finally(() => {
        this.unitInfoRequest = null;
      });
    }
    return this.unitInfoRequest;
  }

  private async fetchUnitInfo(): Promise<UnitInfo> {
    const url = `http://${this.config.host}/cleaner/get_unit_info`;
    try {
      this.log.debug(`[GET] ${url}`);
      const result = await axios.get<string | Record<string, unknown>>(url, { timeout: 10000 });
      const info = typeof result.data === 'string' ? this.parseUnitInfo(result.data) : result.data;

      this.unitInfo = {
        airPurifier: { ...this.unitInfo.airPurifier, ...info?.ctrl_info },
        sensorInfo: { ...this.unitInfo.sensorInfo, ...info?.sensor_info },
        unitStatus: { ...this.unitInfo.unitStatus, ...info?.unit_status },
      };
    } catch (error) {
      this.log.error(`[GET] ${url}`, (error as AxiosError)?.message);
    }
    // Set this on failure too, so an unreachable device isn't retried on every characteristic read.
    this.unitInfoFetchedAt = Date.now();
    return this.unitInfo;
  }

  /**
   * Queues a control change. Changes made within SET_DEBOUNCE_MS of each other are merged and sent as one request,
   * always together with the current values of the other settings.
   */
  setControlInfo(info: ControlInfo): Promise<void> {
    if (!this.controlEnabled) {
      return Promise.reject(new this.hap.HapStatusError(this.hap.HAPStatus.READ_ONLY_CHARACTERISTIC));
    }
    if (!this.stateBeforeSet) {
      this.stateBeforeSet = { ...this.unitInfo.airPurifier };
    }
    Object.keys(info).forEach((key) => {
      if (info[key] !== undefined) {
        this.pendingControl[key] = info[key];
      }
    });
    // Update local state right away so HomeKit shows the new value.
    this.unitInfo.airPurifier = { ...this.unitInfo.airPurifier, ...this.pendingControl };

    if (this.setTimer) {
      clearTimeout(this.setTimer);
    }
    this.setTimer = setTimeout(this.flushControlInfo.bind(this), SET_DEBOUNCE_MS);

    return new Promise((resolve, reject) => {
      this.pendingWaiters.push({ resolve, reject });
    });
  }

  private async flushControlInfo() {
    this.setTimer = null;
    const waiters = this.pendingWaiters;
    this.pendingWaiters = [];
    const control = { ...this.unitInfo.airPurifier, ...this.pendingControl };
    const stateBeforeSet = this.stateBeforeSet;
    this.pendingControl = {};
    this.stateBeforeSet = null;

    try {
      await this.sendControlInfo(control);
      this.unitInfo.airPurifier = { ...this.unitInfo.airPurifier, ...control };
      // Read back the real state at the next poll, not immediately.
      this.unitInfoFetchedAt = Date.now();
      waiters.forEach(({ resolve }) => resolve());
    } catch (error) {
      this.log.error(`[GET] ${API_BASE}/cleaner/set_control_info`, (error as Error).message);
      // The change didn't happen: put back the previous state so HomeKit doesn't show it, and reload it on the next read.
      if (stateBeforeSet) {
        this.unitInfo.airPurifier = stateBeforeSet;
      }
      this.unitInfoFetchedAt = 0;
      const hapError = new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      waiters.forEach(({ reject }) => reject(hapError));
    }
  }

  private async sendControlInfo(control: AirPurifier, retried = false): Promise<void> {
    this.checkRateLimit();
    if (!(await this.ensureAuthenticated())) {
      throw new Error('Not authenticated with the Daikin API. Check the authorization settings in the plugin config.');
    }

    try {
      this.log.debug(`[GET] ${API_BASE}/cleaner/set_control_info`, control);
      const response = await axios.get<string>(`${API_BASE}/cleaner/set_control_info`, {
        timeout: 10000,
        headers: { Authorization: `Bearer ${this.tokens.accessToken}` },
        params: {
          pow: control.pow,
          mode: control.mode,
          airvol: control.airvol,
          humd: control.humd,
          id: 'ID',
          spw: 'SPW',
          terminalid: this.config.terminalId,
          port: this.config.port,
        },
      });
      if (response.data !== 'ret=OK') {
        throw new Error(`Unable to set control info: ${response.data}`);
      }
    } catch (error) {
      const status = (error as AxiosError).response?.status;
      this.handleRateLimit(status);
      if ((status === 401 || status === 403) && !retried) {
        // The access token expired early or was revoked: refresh once, then retry.
        this.tokens.accessToken = undefined;
        this.tokens.expiresAt = 0;
        return this.sendControlInfo(control, true);
      }
      throw error;
    }
  }

  /**
   * Makes sure there is a valid access token, refreshing or logging in only when needed.
   * Calls that arrive at the same time share one request.
   */
  private ensureAuthenticated(): Promise<boolean> {
    if (this.tokens.accessToken && (this.tokens.expiresAt ?? 0) - Date.now() > TOKEN_REFRESH_MARGIN_MS) {
      return Promise.resolve(true);
    }
    if (!this.authRequest) {
      this.authRequest = this.authenticate().finally(() => {
        this.authRequest = null;
      });
    }
    return this.authRequest;
  }

  private async authenticate(): Promise<boolean> {
    if (Date.now() < this.rateLimitedUntil) {
      return false;
    }
    if (this.tokens.refreshToken && (await this.refreshAccessToken())) {
      return true;
    }
    // With the account email and password the plugin can always log in again, so expired tokens fix themselves.
    if (this.hasPasswordLogin() && !this.passwordLoginFailed) {
      return this.loginWithPassword();
    }
    // An authorization code works only once, so log in with it only if these tokens didn't come from it.
    if (this.config.code && this.config.code !== this.tokens.code) {
      return this.login(this.config.code);
    }
    if (!this.authFailureLogged) {
      this.authFailureLogged = true;
      this.log.error(
        'No valid Daikin API token, so the purifier cannot be controlled. Sensors and status keep working. ' +
        'To restore control, check the Daikin account email, password and Client Secret in the plugin config, then restart Homebridge.',
      );
    }
    return false;
  }

  /**
   * Logs in with the Daikin account email and password the same way the Daikin Smart App does: an OAuth
   * authorization-code login with PKCE on the Daikin login server, then the code is exchanged for tokens.
   */
  private async loginWithPassword(): Promise<boolean> {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const clientState = crypto.randomBytes(32).toString('base64url');
    const uuid = this.getInstallUuid();

    try {
      // 1. Start a login session. The server redirects to its login page, carrying the session state.
      this.log.debug(`[GET] ${AUTH_BASE}/authorize`);
      const authorize = await axios.get(`${AUTH_BASE}/authorize`, {
        timeout: 10000,
        maxRedirects: 0,
        validateStatus: (status) => status === 302,
        params: {
          response_type: 'code',
          client_id: this.getClientId(),
          redirect_uri: REDIRECT_URI,
          state: clientState,
          client_device_id: this.getClientDeviceId(),
          code_challenge: codeChallenge,
          code_challenge_method: 'S256',
          display: 'daikinsmartapp',
          lang: 'en',
          uuid,
        },
      });
      const serverState = this.getQueryParam(String(authorize.headers['location'] ?? ''), 'state');
      if (!serverState) {
        throw new Error('The Daikin login server did not start a login session.');
      }

      // 2. Send the email and password. On success the response's location header is the app callback with the code.
      this.log.debug(`[POST] ${AUTH_BASE}/auth`);
      const auth = await axios.post(`${AUTH_BASE}/auth`, {
        username: this.config.username,
        password: this.config.password,
        state: serverState,
        uuid,
      }, { timeout: 10000 });
      const callback = String(auth.headers['location'] ?? '');
      const code = this.getQueryParam(callback, 'code');
      if (!code || this.getQueryParam(callback, 'state') !== clientState) {
        this.passwordLoginFailed = true;
        throw new Error('The Daikin login server did not return an authorization code. Check the email and password.');
      }

      // 3. Exchange the code for tokens.
      return await this.login(code, codeVerifier);
    } catch (error) {
      const status = (error as AxiosError).response?.status;
      this.handleRateLimit(status);
      if (status && status >= 400 && status < 500 && status !== 429) {
        // Most likely a wrong email or password.
        this.passwordLoginFailed = true;
      }
      this.log.error('Unable to log in to the Daikin account:', (error as Error).message);
      if (this.passwordLoginFailed) {
        this.log.error(
          'Not retrying, so the account is not locked. Check the email and password in the plugin config, then restart Homebridge.',
        );
      } else {
        // Network problem or server error: try again later.
        this.scheduleTokenRefresh(RATE_LIMIT_BACKOFF_MS);
      }
      return false;
    }
  }

  private getQueryParam(url: string, name: string): string | null {
    // The query can be inside a fragment (https://host/#/login?state=...) or on a custom scheme (daikinsmartapp://callback?code=...).
    const index = url.lastIndexOf('?');
    return index === -1 ? null : new URLSearchParams(url.slice(index + 1)).get(name);
  }

  private getClientId(): string {
    return this.config.clientId || DEFAULT_CLIENT_ID;
  }

  private getInstallUuid(): string {
    if (this.config.uuid) {
      return this.config.uuid;
    }
    if (!this.tokens.uuid) {
      this.tokens.uuid = crypto.randomUUID().toUpperCase();
      this.writeTokenFile();
    }
    return this.tokens.uuid;
  }

  private getClientDeviceId(): string {
    if (!this.tokens.clientDeviceId) {
      this.tokens.clientDeviceId = `DEVICE_ID_${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
      this.writeTokenFile();
    }
    return this.tokens.clientDeviceId;
  }

  private async refreshAccessToken(): Promise<boolean> {
    try {
      this.log.debug(`[POST] ${API_BASE}/premise/dsiot/token`);
      const result = await axios.post<RefreshToken>(`${API_BASE}/premise/dsiot/token`, {
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refreshToken,
      }, { timeout: 10000 });
      this.saveTokens(result.data, this.tokens.code);
      return true;
    } catch (error) {
      const status = (error as AxiosError).response?.status;
      this.handleRateLimit(status);
      this.log.error(`[POST] ${API_BASE}/premise/dsiot/token`, (error as AxiosError)?.message);
      if (status === 400 || status === 401) {
        // The refresh token was rejected, so stop using it.
        this.tokens.refreshToken = undefined;
        this.writeTokenFile();
      } else {
        // Network problem or server error: keep the refresh token and try again later.
        this.scheduleTokenRefresh(RATE_LIMIT_BACKOFF_MS);
      }
      return false;
    }
  }

  /**
   * Exchanges an authorization code for tokens. The code comes from the email/password login (with its PKCE
   * code verifier), or from the config when it was captured from the Daikin Smart App.
   */
  private async login(code: string, codeVerifier?: string): Promise<boolean> {
    try {
      this.log.debug(`[POST] ${API_BASE}/premise/dsiot/login`);
      const result = await axios.post<LoginResponse>(`${API_BASE}/premise/dsiot/login`, {
        grant_type: 'authorization_code',
        code,
        client_id: this.getClientId(),
        uuid: this.getInstallUuid(),
        client_secret: this.config.clientSecret,
        ...(codeVerifier ? { code_verifier: codeVerifier, redirect_uri: REDIRECT_URI } : {}),
      }, { timeout: 10000 });
      this.saveTokens(result.data, codeVerifier ? this.tokens.code : code);
      this.log.info('Logged in to the Daikin API. Tokens are saved and renewed automatically.');
      return true;
    } catch (error) {
      const status = (error as AxiosError).response?.status;
      this.handleRateLimit(status);
      this.log.error(`[POST] ${API_BASE}/premise/dsiot/login`, (error as AxiosError)?.message);
      if (!codeVerifier && status && status >= 400 && status < 500 && status !== 429) {
        // This code has been used or has expired. Record it so it isn't sent again on every request.
        this.tokens.code = code;
        this.writeTokenFile();
        this.log.error('The authorization code was rejected (codes work only once). Capture a new one from the Daikin Smart App.');
      }
      if (codeVerifier && (status === 400 || status === 401)) {
        // The login worked but the exchange was refused, most likely because the Client Secret is wrong.
        this.passwordLoginFailed = true;
        this.log.error('The Daikin API refused the login. Check the Client Secret in the plugin config, then restart Homebridge.');
      }
      return false;
    }
  }

  private saveTokens(data: RefreshToken | LoginResponse, code: string | undefined) {
    const lifetime = (data.expires_in || DEFAULT_TOKEN_LIFETIME_S) * 1000;
    this.authFailureLogged = false;
    this.tokens = {
      uuid: this.tokens.uuid,
      clientDeviceId: this.tokens.clientDeviceId,
      accessToken: data.access_token,
      // Some token responses leave out the refresh token, so keep the current one.
      refreshToken: data.refresh_token || this.tokens.refreshToken,
      expiresAt: Date.now() + lifetime,
      code,
    };
    this.writeTokenFile();
    this.scheduleTokenRefresh(lifetime - TOKEN_REFRESH_MARGIN_MS);
  }

  private scheduleTokenRefresh(delay: number) {
    if (this.tokenTimer) {
      clearTimeout(this.tokenTimer);
    }
    this.tokenTimer = setTimeout(() => {
      this.tokenTimer = null;
      this.ensureAuthenticated();
    }, Math.max(delay, 60 * 1000));
  }

  private loadTokens() {
    try {
      if (fs.existsSync(this.tokenFile)) {
        this.tokens = JSON.parse(fs.readFileSync(this.tokenFile, 'utf8'));
        this.log.debug(`Loaded Daikin API tokens from ${this.tokenFile}`);
      }
    } catch (error) {
      this.log.warn(`Unable to read ${this.tokenFile}:`, (error as Error).message);
    }
    // A refresh token set in the config wins when it differs from the last one it set.
    if (this.config.refreshToken && this.config.refreshToken !== this.tokens.configRefreshToken) {
      this.tokens = {
        uuid: this.tokens.uuid,
        clientDeviceId: this.tokens.clientDeviceId,
        refreshToken: this.config.refreshToken,
        configRefreshToken: this.config.refreshToken,
        code: this.tokens.code,
      };
    }
  }

  private writeTokenFile() {
    try {
      fs.writeFileSync(
        this.tokenFile,
        JSON.stringify({ ...this.tokens, configRefreshToken: this.config.refreshToken }, null, 2),
        { mode: 0o600 },
      );
    } catch (error) {
      this.log.warn(`Unable to write ${this.tokenFile}:`, (error as Error).message);
    }
  }

  private handleRateLimit(status: number | undefined) {
    if (status === 429) {
      this.rateLimitedUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      this.log.warn(`The Daikin API rate limit was hit. Pausing cloud requests for ${RATE_LIMIT_BACKOFF_MS / 60000} minutes.`);
    }
  }

  private checkRateLimit() {
    if (Date.now() < this.rateLimitedUntil) {
      throw new Error('Paused because the Daikin API rate limit was hit. Try again in a few minutes.');
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
