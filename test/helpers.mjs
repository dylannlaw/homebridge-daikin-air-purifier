// Shared helpers: a mock of the purifier and the Daikin servers, plus factories for the plugin's objects.
// Tests run against the compiled plugin in dist/, so run `npm run build` first (`npm test` does).
import axios, { AxiosError } from 'axios';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
export const hap = require('@homebridge/hap-nodejs');

export const HOST = '192.168.1.156';
export const AUTH = 'prod-dsioti.daikinsmartdb.jp/dsioti/oauth2';
export const API = 'api.daikinsmartdb.jp';

export const UNIT_INFO = 'ret=OK,ctrl_info=pow%3d1%2cmode%3d0%2cairvol%3d3%2chumd%3d2,' +
  'sensor_info=htemp%3d26.0%2chhum%3d64%2cpm25%3d2%2cdust%3d1%2codor%3d3,' +
  'unit_status=filter%3d0%2cstrmr_cln%3d1%2cwater_supply%3d1%2cunit_err%3d0000';

export const PASSWORD_CONFIG = Object.freeze({
  name: 'Test', host: HOST, cacheDuration: 60,
  username: 'user@example.com', password: 'secret-password', clientSecret: 'app-secret', terminalId: 'T123', port: '30050',
});

export const LOCAL_CONFIG = Object.freeze({ name: 'Test', host: HOST, cacheDuration: 60 });

/**
 * Routes every axios request to `routes`, keyed by "host/path" (e.g. `${API}/cleaner/set_control_info`).
 * A route returns [status, data, headers] or throws to simulate a network error. Unrouted requests get 404.
 * Default routes behave like the real servers on a successful login, shaped like a capture of the Daikin Smart App.
 */
export function mockServers(overrides = {}) {
  const requests = [];
  let clientState = null;
  const routes = {
    [`${HOST}/cleaner/get_unit_info`]: () => [200, UNIT_INFO],
    [`${AUTH}/authorize`]: ({ params }) => {
      clientState = params.state;
      return [302, {}, { location: `https://prod-deneb-ui.daikinsmartdb.jp/#/login?state=serverstate123&display=daikinsmartapp&uuid=${params.uuid}&lang=en` }];
    },
    [`${AUTH}/auth`]: () => [200, {}, { location: `daikinsmartapp://callback?code=CODE123&state=${clientState}` }],
    [`${API}/premise/dsiot/login`]: () => [200, { rsc: 2000, access_token: 'ACCESS1', refresh_token: 'REFRESH1', expires_in: 3600 }],
    [`${API}/premise/dsiot/token`]: () => [200, { rsc: 2000, access_token: 'ACCESS2', refresh_token: 'REFRESH2', expires_in: 3600 }],
    [`${API}/cleaner/set_control_info`]: () => [200, 'ret=OK'],
    ...overrides,
  };

  axios.defaults.adapter = async (config) => {
    const url = new URL(config.url);
    const key = url.host + url.pathname;
    const body = typeof config.data === 'string' ? JSON.parse(config.data) : config.data;
    const request = { method: config.method, key, params: config.params ?? {}, body, headers: config.headers };
    requests.push(request);
    const route = routes[key];
    let result;
    try {
      result = route ? await route(request) : [404, 'not found'];
    } catch (error) {
      throw new AxiosError(error.message, 'ECONNREFUSED', config, {});
    }
    const [status, data, headers = {}] = result;
    const response = { data, status, statusText: String(status), headers, config, request: {} };
    const valid = config.validateStatus ? config.validateStatus(status) : status >= 200 && status < 300;
    if (!valid) {
      throw new AxiosError(`Request failed with status code ${status}`, 'ERR_BAD_RESPONSE', config, {}, response);
    }
    return response;
  };

  return {
    requests,
    routes,
    count: (key) => requests.filter((r) => r.key === key).length,
    last: (key) => requests.filter((r) => r.key === key).at(-1),
  };
}

export function makeLog() {
  const lines = [];
  const add = (level) => (...args) => lines.push({ level, text: args.map(String).join(' ') });
  const log = Object.assign(add('info'), {
    info: add('info'), warn: add('warn'), error: add('error'), debug: add('debug'), success: add('info'), log: add('info'),
  });
  log.lines = lines;
  log.has = (level, fragment) => lines.some((l) => l.level === level && l.text.includes(fragment));
  log.all = () => lines.map((l) => l.text).join('\n');
  return log;
}

export function tempStorage() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'daikin-test-'));
}

export function tokenFile(storage, name = 'Test') {
  return path.join(storage, `daikin-air-purifier-${name}.json`);
}

export function readTokens(storage, name = 'Test') {
  return JSON.parse(fs.readFileSync(tokenFile(storage, name), 'utf8'));
}

export function writeTokens(storage, tokens, name = 'Test') {
  fs.writeFileSync(tokenFile(storage, name), JSON.stringify(tokens));
}

const { default: Client } = await import('../dist/client.js');
export { Client };

export function makeClient(config = LOCAL_CONFIG, storage = tempStorage()) {
  const log = makeLog();
  const client = new Client(log, { ...config }, storage, hap);
  return { client, log, storage };
}

/** Lets pending promise callbacks (mocked HTTP responses, awaited handlers) run. */
export async function settle(rounds = 20) {
  for (let i = 0; i < rounds; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

/** Runs a control change through the 1 second debounce using mocked timers. */
export async function flushSet(mock, promise) {
  // Attach a handler now, so a change that fails while the timers run isn't reported as an unhandled rejection.
  const outcome = promise.then((value) => ({ value }), (error) => ({ error }));
  await settle();
  mock.timers.tick(1000);
  await settle();
  const { value, error } = await outcome;
  if (error) {
    throw error;
  }
  return value;
}

export async function rejection(promise) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('expected the promise to reject');
}
