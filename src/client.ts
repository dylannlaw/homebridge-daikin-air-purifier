import axios, { AxiosError } from 'axios';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { AccessoryConfig, Characteristic, CharacteristicSetHandler, HAP, Logging } from 'homebridge';
import { DustLevel, FanSpeed, HumidityLevel, Mode, OdorLevel, PM2Level, PowerStatus } from './constant.js';
import type { AirPurifier, ControlInfo, SensorInfo, TokenResponse, UnitInfoResponse, UnitStatus, UserInfo } from './types.js';

// Endpoints follow docs/reference/daikin-smart-api.openapi.yaml.
const API_BASE = 'https://api.daikinsmartdb.jp';
const SET_CONTROL_URL = `${API_BASE}/cleaner/set_control_info`;
const UNIT_INFO_URL = `${API_BASE}/cleaner/get_unit_info`;
// The Daikin Smart App's login server and the public OAuth client it uses.
const AUTH_BASE = 'https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2';
const TOKEN_URL = `${AUTH_BASE}/token`;
const USERINFO_URL = `${AUTH_BASE}/userinfo`;
const DEFAULT_CLIENT_ID = 'i66rposkjbceagakohlncsnus';
const REDIRECT_URI = 'daikinsmartapp://callback';
// Wait this long after the last change before sending, so dragging a slider sends one request instead of dozens.
const SET_DEBOUNCE_MS = 1000;
// Refresh the token this long before it expires.
const TOKEN_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const DEFAULT_TOKEN_LIFETIME_S = 60 * 60;
// After a 429, make no cloud calls for this long.
const RATE_LIMIT_BACKOFF_MS = 5 * 60 * 1000;
// cacheDuration: how often status is refreshed. The cloud has a higher minimum, because each refresh is one Daikin API request.
const DEFAULT_CACHE_DURATION_S = 60;
const MIN_LOCAL_CACHE_DURATION_S = 15;
const MIN_CLOUD_CACHE_DURATION_S = 60;
// The spec's example port, used when it isn't configured and there's no local IP to read it from.
const DEFAULT_PORT = '30050';
// Settings that only matter for control. If any is set while control is off, the log says which ones are missing.
const CONTROL_SETTINGS = ['username', 'password', 'clientSecret', 'terminalId', 'port', 'code', 'refreshToken'];

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
  // The device credentials from userinfo (l_user_id, l_password), sent as `id` and `spw` on device calls. Secret.
  deviceId?: string;
  devicePassword?: string;
};

class Client {
  // True when a Daikin login is configured: status can be read from the Daikin cloud (the fallback when `host` is set).
  readonly cloudEnabled: boolean;
  // True when the cloud login and the Terminal ID are configured, so the purifier can be controlled.
  readonly controlEnabled: boolean;
  // cacheDuration in milliseconds: how long a read is cached, and how often status is refreshed.
  readonly cacheDuration: number;

  private config: AccessoryConfig;
  private log: Logging;
  private hap: HAP;
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
  // The port read from the purifier's /common/basic_info when `port` isn't in the config.
  private devicePort: string | null = null;
  // After a login fails for a reason worth retrying (network, server error), don't try again before this time.
  private authRetryAt = 0;
  // Whether the last cloud status read failed, so it's logged once per outage, not on every refresh.
  private cloudStatusFailing = false;
  // Whether the last local status read failed, so it's logged once per outage, not on every refresh.
  private localStatusFailing = false;
  // When the cloud was last asked for status as the fallback for a failed local read, to limit it to the cloud minimum.
  private cloudFallbackAt = 0;

  constructor(log: Logging, config: AccessoryConfig, storagePath: string, hap: HAP) {
    this.config = config;
    this.log = log;
    this.hap = hap;
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
    const missing = this.missingControlSettings();
    this.cloudEnabled = !missing.some((key) => key !== 'terminalId');
    this.controlEnabled = missing.length === 0;
    this.cacheDuration = this.getCacheDuration();

    if (this.cloudEnabled) {
      this.ensureAuthenticated();
    }
    if (!this.cloudEnabled && !config.host) {
      this.log.error(
        'Nothing to read the purifier from: set its local IP (host), or your Daikin account email, password and Client Secret.',
      );
    }
    if (!this.controlEnabled) {
      this.log.info(
        `Running in read-only mode: status is read from ${config.host ? 'the purifier' : 'the Daikin cloud'}, ` +
        'but it cannot be controlled from HomeKit. ' +
        'To enable control, add your Daikin account email and password, the Client Secret and the Terminal ID.',
      );
      if (CONTROL_SETTINGS.some((key) => config[key])) {
        // Some control settings are filled in, so the user is trying to set up control: say exactly what's left.
        this.log.warn(`Control is off because these settings are missing: ${missing.join(', ')}.`);
      }
    }
  }

  /**
   * `cacheDuration` in seconds: at least 15 seconds when status is read from the local IP, or 60 when it comes from the
   * Daikin cloud, so polling alone can't get the account rate-limited.
   */
  private getCacheDuration(): number {
    const fromCloud = !this.config.host;
    const minimum = fromCloud ? MIN_CLOUD_CACHE_DURATION_S : MIN_LOCAL_CACHE_DURATION_S;
    const requested = Number(this.config.cacheDuration) || DEFAULT_CACHE_DURATION_S;
    if (requested < minimum) {
      this.log.warn(
        `Cache duration ${requested}s is below the minimum of ${minimum}s${fromCloud ? ' for the Daikin cloud' : ''}; ` +
        `using ${minimum}s. Refreshing too often can get the Daikin account rate-limited.`,
      );
    }
    return Math.max(requested, minimum) * 1000;
  }

  /**
   * The settings still needed before set_control_info can be called, by name (never by value). Every call needs:
   * an access token (email, password and Client Secret, or a captured code with the Client Secret, or a refresh token),
   * from which userinfo gives `id` and `spw`; and `terminalid`. `port` is read from the purifier when not set.
   */
  private missingControlSettings(): string[] {
    const missing: string[] = [];
    const hasToken = this.config.refreshToken || this.tokens.refreshToken;
    const hasCode = this.config.code && this.config.clientSecret;
    if (!this.hasPasswordLogin() && !hasCode && !hasToken) {
      missing.push(...['username', 'password', 'clientSecret'].filter((key) => !this.config[key]));
    }
    if (!this.config.terminalId) {
      missing.push('terminalId');
    }
    return missing;
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

  /**
   * For HomeKit read handlers: returns the last known status at once and never waits on the network. A slow Daikin
   * cloud (each attempt can take up to 10 seconds) would otherwise make every read handler
   * slow and Homebridge warn that the plugin slows it down. The poll keeps the cache fresh. Only when it is more
   * than two poll intervals old (a failed change clears it, so the real state is read back) does this start a refresh
   * in the background, shared with any already running; the margin keeps it from adding requests next to the poll.
   */
  getCachedUnitInfo(): UnitInfo {
    if (Date.now() - this.unitInfoFetchedAt >= 2 * this.cacheDuration) {
      this.getUnitInfo().catch((error) => this.log.debug('Background status refresh failed:', (error as Error).message));
    }
    return this.unitInfo;
  }

  /**
   * Reads status from the purifier's local IP when `host` is set, since it answers in well under a second, and from
   * the Daikin cloud when it isn't. When the local read fails and a Daikin login is configured, the cloud is read
   * instead, at most once per cloud minimum so a local outage can't poll the cloud on every refresh.
   */
  private async fetchUnitInfo(): Promise<UnitInfo> {
    let info: UnitInfoResponse | null = null;
    if (this.config.host) {
      info = await this.fetchLocalUnitInfo();
      if (!info && this.cloudEnabled && Date.now() - this.cloudFallbackAt >= MIN_CLOUD_CACHE_DURATION_S * 1000) {
        this.cloudFallbackAt = Date.now();
        info = await this.fetchCloudUnitInfo();
      }
    } else if (this.cloudEnabled) {
      info = await this.fetchCloudUnitInfo();
    }
    if (info) {
      this.unitInfo = {
        airPurifier: { ...this.unitInfo.airPurifier, ...info.ctrl_info },
        sensorInfo: { ...this.unitInfo.sensorInfo, ...info.sensor_info },
        unitStatus: { ...this.unitInfo.unitStatus, ...info.unit_status },
      };
    }
    // Set this on failure too, so an unreachable device isn't retried on every characteristic read.
    this.unitInfoFetchedAt = Date.now();
    return this.unitInfo;
  }

  private async fetchCloudUnitInfo(): Promise<UnitInfoResponse | null> {
    try {
      const text = await this.cloudDeviceGet(UNIT_INFO_URL, {});
      const info = this.parseUnitInfo(text);
      if (info.ret !== 'OK') {
        throw new Error(`Unable to get unit info: ${text}`);
      }
      if (this.cloudStatusFailing) {
        this.log.info('Reading status from the Daikin cloud again.');
      }
      this.cloudStatusFailing = false;
      return info;
    } catch (error) {
      if (!this.cloudStatusFailing) {
        this.log.warn(`Unable to read status from the Daikin cloud: ${(error as Error).message}.`);
      } else {
        this.log.debug(`[GET] ${UNIT_INFO_URL}`, (error as Error).message);
      }
      this.cloudStatusFailing = true;
      return null;
    }
  }

  private async fetchLocalUnitInfo(): Promise<UnitInfoResponse | null> {
    const url = `http://${this.config.host}/cleaner/get_unit_info`;
    try {
      this.log.debug(`[GET] ${url}`);
      const result = await axios.get<string | UnitInfoResponse>(url, { timeout: 10000 });
      const info = typeof result.data === 'string' ? this.parseUnitInfo(result.data) : (result.data ?? {});
      if (this.localStatusFailing) {
        this.log.info('Reading status from the purifier\'s local IP again.');
      }
      this.localStatusFailing = false;
      return info;
    } catch (error) {
      const message = (error as AxiosError)?.message;
      if (this.localStatusFailing) {
        this.log.debug(`[GET] ${url}`, message);
      } else if (this.cloudEnabled) {
        this.log.warn(`Unable to read status from the purifier's local IP (${this.config.host}): ${message}. ` +
          'Reading it from the Daikin cloud instead.');
      } else {
        this.log.error(`[GET] ${url}`, message);
      }
      this.localStatusFailing = true;
      return null;
    }
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
      this.log.error(`[GET] ${SET_CONTROL_URL}`, (error as Error).message);
      // The change didn't happen: put back the previous state so HomeKit doesn't show it, and reload it on the next read.
      if (stateBeforeSet) {
        this.unitInfo.airPurifier = stateBeforeSet;
      }
      this.unitInfoFetchedAt = 0;
      const hapError = new this.hap.HapStatusError(this.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
      waiters.forEach(({ reject }) => reject(hapError));
    }
  }

  private async sendControlInfo(control: AirPurifier): Promise<void> {
    this.log.debug(`[GET] ${SET_CONTROL_URL}`, control);
    const response = await this.cloudDeviceGet(SET_CONTROL_URL, {
      terminalid: this.config.terminalId,
      pow: control.pow,
      mode: control.mode,
      airvol: control.airvol,
      humd: control.humd,
    });
    if (response !== 'ret=OK') {
      throw new Error(`Unable to set control info: ${response}`);
    }
  }

  /**
   * A GET to a Daikin cloud device endpoint (/cleaner/*), with what every one of them needs: the access token
   * (bare, the spec's rawTokenAuth), `id` and `spw` from userinfo, and `port`. A 401/403 renews the login once.
   */
  private async cloudDeviceGet(url: string, params: Record<string, unknown>, retried = false): Promise<string> {
    this.checkRateLimit();
    if (!(await this.ensureAuthenticated())) {
      throw new Error('Not authenticated with the Daikin API. Check the authorization settings in the plugin config.');
    }
    const port = await this.ensurePort();

    try {
      const { id, spw } = await this.ensureDeviceCredentials();
      const response = await axios.get<string>(url, {
        timeout: 10000,
        headers: { authorization: this.tokens.accessToken },
        params: { id, spw, port, ...params },
      });
      return String(response.data);
    } catch (error) {
      const status = (error as AxiosError).response?.status;
      this.handleRateLimit(status);
      if ((status === 401 || status === 403) && !retried) {
        // The access token expired early or was revoked, or the device credentials changed: renew both once, then retry.
        this.tokens.accessToken = undefined;
        this.tokens.expiresAt = 0;
        this.tokens.deviceId = undefined;
        this.tokens.devicePassword = undefined;
        return this.cloudDeviceGet(url, params, true);
      }
      throw error;
    }
  }

  /**
   * Returns the device credentials (`id` and `spw` on device calls), fetching them from userinfo only when they
   * aren't saved yet. They belong to the account, so they're kept across token renewals and restarts.
   */
  private async ensureDeviceCredentials(): Promise<{ id: string; spw: string }> {
    if (!this.tokens.deviceId || !this.tokens.devicePassword) {
      // The access token goes in the query string; don't log it.
      this.log.debug(`[GET] ${USERINFO_URL}`);
      const { data } = await axios.get<UserInfo>(USERINFO_URL, {
        timeout: 10000,
        params: { access_token: this.tokens.accessToken },
      });
      if (!data?.l_user_id || !data?.l_password) {
        throw new Error('The Daikin login server did not return the device credentials (l_user_id, l_password).');
      }
      this.tokens.deviceId = data.l_user_id;
      this.tokens.devicePassword = data.l_password;
      this.writeTokenFile();
    }
    return { id: this.tokens.deviceId, spw: this.tokens.devicePassword };
  }

  /**
   * Returns the `port` for device calls: the configured one, or else the `port=` the purifier reports at its local
   * /common/basic_info (no cloud call). Read once, then kept until restart.
   */
  private async ensurePort(): Promise<string> {
    if (this.config.port) {
      return String(this.config.port);
    }
    if (!this.config.host) {
      return DEFAULT_PORT;
    }
    if (!this.devicePort) {
      const url = `http://${this.config.host}/common/basic_info`;
      // The response includes the purifier's own credentials (id, pw), so it is never logged.
      this.log.debug(`[GET] ${url}`);
      const { data } = await axios.get<string>(url, { timeout: 10000 });
      let port: string | undefined;
      try {
        port = typeof data === 'string' ? this.parseResponse(data).port : undefined;
      } catch {
        port = undefined;
      }
      if (!port || !/^\d+$/.test(port)) {
        throw new Error('The purifier did not report its port at /common/basic_info. Set Port in the plugin config (usually 30050).');
      }
      this.devicePort = port;
    }
    return this.devicePort;
  }

  /**
   * Posts a form-encoded request to the OAuth token endpoint, for both the code exchange and renewals.
   */
  private postToken(fields: Record<string, string | undefined>) {
    const body = new URLSearchParams();
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== undefined) {
        body.append(key, value);
      }
    });
    return axios.post<TokenResponse>(TOKEN_URL, body.toString(), {
      timeout: 10000,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
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
    // Status refreshes call this too, so a failing login waits out its backoff instead of retrying on every refresh.
    if (Date.now() < this.rateLimitedUntil || Date.now() < this.authRetryAt) {
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
        this.retryAuthLater();
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
      // The spec notes a refresh_token grant on the token endpoint is likely but wasn't captured.
      this.log.debug(`[POST] ${TOKEN_URL} (refresh_token)`);
      const result = await this.postToken({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refreshToken,
        client_id: this.getClientId(),
        client_secret: this.config.clientSecret,
      });
      this.saveTokens(result.data, this.tokens.code, true);
      return true;
    } catch (error) {
      const status = (error as AxiosError).response?.status;
      this.handleRateLimit(status);
      this.log.error(`[POST] ${TOKEN_URL} (refresh_token)`, (error as AxiosError)?.message);
      if (status === 400 || status === 401) {
        // The refresh token was rejected, so stop using it.
        this.tokens.refreshToken = undefined;
        this.writeTokenFile();
      } else {
        // Network problem or server error: keep the refresh token and try again later.
        this.retryAuthLater();
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
      this.log.debug(`[POST] ${TOKEN_URL} (authorization_code)`);
      const result = await this.postToken({
        grant_type: 'authorization_code',
        code,
        redirect_uri: REDIRECT_URI,
        client_id: this.getClientId(),
        client_secret: this.config.clientSecret,
        // A code captured from the app comes without its verifier.
        code_verifier: codeVerifier,
      });
      // A new login may be for another account, so fetch the device credentials again.
      this.saveTokens(result.data, codeVerifier ? this.tokens.code : code, false);
      this.log.info('Logged in to the Daikin API. Tokens are saved and renewed automatically.');
      return true;
    } catch (error) {
      const status = (error as AxiosError).response?.status;
      this.handleRateLimit(status);
      this.log.error(`[POST] ${TOKEN_URL} (authorization_code)`, (error as AxiosError)?.message);
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

  private saveTokens(data: TokenResponse, code: string | undefined, keepDeviceCredentials: boolean) {
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
      ...(keepDeviceCredentials ? { deviceId: this.tokens.deviceId, devicePassword: this.tokens.devicePassword } : {}),
    };
    this.writeTokenFile();
    this.scheduleTokenRefresh(lifetime - TOKEN_REFRESH_MARGIN_MS);
  }

  /** Tries the login again in 5 minutes, and not before. */
  private retryAuthLater() {
    this.authRetryAt = Date.now() + RATE_LIMIT_BACKOFF_MS;
    this.scheduleTokenRefresh(RATE_LIMIT_BACKOFF_MS);
  }

  private scheduleTokenRefresh(delay: number) {
    if (this.tokenTimer) {
      clearTimeout(this.tokenTimer);
    }
    this.tokenTimer = setTimeout(() => {
      this.tokenTimer = null;
      this.ensureAuthenticated();
    }, Math.max(delay, 60 * 1000));
    // Don't keep the process alive just for a renewal, so Homebridge (and the tests) can exit without waiting up to an hour.
    this.tokenTimer.unref?.();
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
