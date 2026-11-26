// Checks the plugin's HTTP calls against the reverse-engineered OpenAPI reference in docs/reference/.
// Tests marked `todo` are places where the plugin does not yet do what the spec describes. They run and report,
// but don't fail the suite; when the client is changed to match the spec they pass, and the `todo` should be removed.
// See docs/research/2026-11-26-openapi-conformance.md for the gap analysis.
import { describe, test, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import { parse } from 'yaml';
import {
  HOST, PASSWORD_CONFIG, flushSet, makeClient, mockServers, settle, tempStorage, writeTokens,
} from './helpers.mjs';

const spec = parse(fs.readFileSync(new URL('../docs/reference/daikin-smart-api.openapi.yaml', import.meta.url), 'utf8'));

afterEach(() => mock.timers.reset());

function resolveRef(node) {
  if (!node || typeof node !== 'object' || !node.$ref) {
    return node;
  }
  assert.match(node.$ref, /^#\//, `only local $refs are supported: ${node.$ref}`);
  const target = node.$ref.slice(2).split('/').reduce((obj, part) => obj?.[part], spec);
  assert.ok(target, `$ref ${node.$ref} does not resolve`);
  return resolveRef(target);
}

/** The spec's operation, with its parameters resolved and the "host/path" key the mock servers use. */
function operation(path, method) {
  const op = spec.paths[path]?.[method];
  assert.ok(op, `${method.toUpperCase()} ${path} is not in the spec`);
  const server = new URL((op.servers ?? spec.servers)[0].url);
  const params = (op.parameters ?? []).map(resolveRef);
  return {
    ...op,
    key: server.host + path,
    query: params.filter((p) => p.in === 'query'),
    requestSchema: resolveRef(Object.values(op.requestBody?.content ?? {})[0]?.schema),
    requestType: Object.keys(op.requestBody?.content ?? {})[0],
    textExample: op.responses?.['200'] && resolveRef(op.responses['200']).content?.['text/plain']?.example,
  };
}

/** Every "host/path" in the spec, for spotting calls the spec doesn't describe. */
function specKeys() {
  return Object.entries(spec.paths).flatMap(([path, methods]) =>
    Object.keys(methods).map((method) => ({ method, key: operation(path, method).key })));
}

function assertMatchesSchema(value, schema, name) {
  switch (schema.type) {
    case 'integer':
      assert.match(String(value), /^-?\d+$/, `${name} should be an integer, got ${value}`);
      break;
    case 'string':
      assert.equal(typeof value, 'string', `${name} should be a string`);
      break;
  }
  if (schema.enum) {
    assert.ok(schema.enum.includes(value), `${name} should be one of ${schema.enum.join(', ')}, got ${value}`);
  }
}

const SIGNIN = operation('/dsioti/oauth2/auth', 'post');
const TOKEN = operation('/dsioti/oauth2/token', 'post');
const USERINFO = operation('/dsioti/oauth2/userinfo', 'get');
const SET = operation('/cleaner/set_control_info', 'get');
const UNIT = operation('/cleaner/get_unit_info', 'get');

const TOKEN_RESPONSE = { token_type: 'Bearer', id_token: 'FAKE_ID', access_token: 'FAKE_ACCESS', refresh_token: 'FAKE_REFRESH', expires_in: 3600 };
const USERINFO_RESPONSE = { rsc: 2000, uid: 'FAKE_UID', l_user_id: 'FAKE_L_USER_ID', l_password: 'FAKE_L_PASSWORD' };
// Routes for the spec's endpoints the plugin doesn't call yet, so `todo` tests can show what it would need.
const SPEC_ONLY_ROUTES = {
  [TOKEN.key]: () => [200, TOKEN_RESPONSE],
  [USERINFO.key]: () => [200, USERINFO_RESPONSE],
};

/** A client that has logged in with email and password, with the purifier's status read. */
async function loggedIn(routes = {}) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const server = mockServers({ ...SPEC_ONLY_ROUTES, ...routes });
  const { client, log } = makeClient(PASSWORD_CONFIG, tempStorage());
  await settle();
  await client.getUnitInfo();
  return { client, log, server };
}

/** A client with a valid saved token, ready to send a change. */
async function ready(routes = {}) {
  mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
  const server = mockServers({ ...SPEC_ONLY_ROUTES, ...routes });
  const storage = tempStorage();
  writeTokens(storage, { accessToken: 'FAKE_VALID', refreshToken: 'FAKE_R', expiresAt: 1_000_000 + 3_600_000 });
  const { client, log } = makeClient(PASSWORD_CONFIG, storage);
  await client.getUnitInfo();
  return { client, log, server };
}

describe('the OpenAPI reference', () => {
  test('parses, and every $ref in it resolves', () => {
    assert.equal(spec.openapi, '3.0.3');
    const walk = (node) => {
      if (node && typeof node === 'object') {
        if (node.$ref) {
          resolveRef(node);
        }
        Object.values(node).forEach(walk);
      }
    };
    walk(spec);
  });

  test('contains no real credentials: examples are placeholders', () => {
    const text = fs.readFileSync(new URL('../docs/reference/daikin-smart-api.openapi.yaml', import.meta.url), 'utf8');
    // JWTs, long hex/base64 strings, and email addresses would point at captured account data.
    assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{10,}/);
    assert.doesNotMatch(text, /[A-Za-z0-9+_-]{32,}/);
    assert.doesNotMatch(text, /[\w.+-]+@[\w-]+\.[\w.]+/);
    for (const field of ['mac', 'id', 'pw', 'ssid']) {
      assert.match(operation('/common/basic_info', 'get').textExample, new RegExp(`(^|,)${field}=<[a-z_]+>(,|$)`), `${field} should be a <placeholder>`);
    }
  });
});

describe('POST /dsioti/oauth2/auth (sign in)', () => {
  test('is sent as a POST to the spec\'s OAuth server and path', async () => {
    const { server } = await loggedIn();
    const req = server.last(SIGNIN.key);
    assert.ok(req, `no request to ${SIGNIN.key}`);
    assert.equal(req.method, 'post');
  });

  test('sends a JSON body with every required field, as strings, and nothing the spec doesn\'t list', async () => {
    const { server } = await loggedIn();
    const { body } = server.last(SIGNIN.key);
    assert.equal(SIGNIN.requestType, 'application/json');
    for (const field of SIGNIN.requestSchema.required) {
      assert.ok(field in body, `missing required field ${field}`);
    }
    for (const [field, value] of Object.entries(body)) {
      const schema = SIGNIN.requestSchema.properties[field];
      assert.ok(schema, `field ${field} is not in the spec`);
      assertMatchesSchema(value, schema, field);
    }
  });

  test('takes the authorization code from the location header in the spec\'s callback format', async () => {
    // The spec: `daikinsmartapp://callback?code=<code>&state=<state>`.
    const format = resolveRef(SIGNIN.responses['200']).headers.location.description;
    assert.match(format, /daikinsmartapp:\/\/callback\?code=<code>&state=<state>/);
    let state;
    const { server } = await loggedIn({
      [SIGNIN.key]: () => [200, {}, { location: `daikinsmartapp://callback?code=FAKE_SPEC_CODE&state=${state}` }],
      // Capture the client's state from the login session start so the callback echoes it, as the server does.
      'prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/authorize': ({ params }) => {
        state = params.state;
        return [302, {}, { location: 'https://prod-deneb-ui.daikinsmartdb.jp/#/login?state=fakeserverstate' }];
      },
    });
    const exchanges = server.requests.filter((r) => r.body?.code === 'FAKE_SPEC_CODE');
    assert.equal(exchanges.length, 1, 'the code from the location header should be exchanged for tokens');
  });
});

describe('POST /dsioti/oauth2/token (code exchange)', () => {
  test('the plugin accepts the spec\'s TokenResponse shape', async () => {
    // Fed through the endpoint the plugin uses today, to check the response fields line up.
    const { client, server } = await loggedIn({ 'api.daikinsmartdb.jp/premise/dsiot/login': () => [200, TOKEN_RESPONSE] });
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    assert.match(server.last(SET.key).headers.Authorization, /FAKE_ACCESS$/);
  });

  test('exchanges the code at the spec\'s token endpoint, form-encoded, with every required field', {
    todo: 'the plugin posts JSON to https://api.daikinsmartdb.jp/premise/dsiot/login instead',
  }, async () => {
    const { server } = await loggedIn();
    const req = server.last(TOKEN.key);
    assert.ok(req, `no request to ${TOKEN.key}`);
    assert.equal(req.method, 'post');
    assert.match(String(req.headers['Content-Type']), /application\/x-www-form-urlencoded/);
    for (const field of TOKEN.requestSchema.required) {
      assert.ok(req.body[field], `missing required field ${field}`);
      assertMatchesSchema(req.body[field], TOKEN.requestSchema.properties[field], field);
    }
    assert.equal(req.body.code, 'CODE123');
    assert.equal(req.body.client_secret, PASSWORD_CONFIG.clientSecret);
  });
});

describe('GET /dsioti/oauth2/userinfo (device credentials)', () => {
  test('is called with the access token in the query string after logging in', {
    todo: 'the plugin never calls userinfo',
  }, async () => {
    const { server } = await loggedIn();
    const req = server.last(USERINFO.key);
    assert.ok(req, `no request to ${USERINFO.key}`);
    for (const param of USERINFO.query.filter((p) => p.required)) {
      assert.ok(req.params[param.name], `missing query parameter ${param.name}`);
    }
  });
});

describe('GET /cleaner/set_control_info (control)', () => {
  test('is sent as a GET to the spec\'s device API server and path', async () => {
    const { client, server } = await ready();
    await flushSet(mock, client.setControlInfo({ pow: '1' }));
    const req = server.last(SET.key);
    assert.ok(req, `no request to ${SET.key}`);
    assert.equal(req.method, 'get');
  });

  test('sends every required query parameter, with the spec\'s types, and nothing the spec doesn\'t list', async () => {
    const { client, server } = await ready();
    await flushSet(mock, client.setControlInfo({ pow: '1', airvol: '5' }));
    const { params } = server.last(SET.key);
    for (const param of SET.query.filter((p) => p.required)) {
      assert.ok(params[param.name] !== undefined && params[param.name] !== '', `missing query parameter ${param.name}`);
      assertMatchesSchema(params[param.name], param.schema, param.name);
    }
    const known = new Set(SET.query.map((p) => p.name));
    for (const name of Object.keys(params)) {
      assert.ok(known.has(name), `query parameter ${name} is not in the spec`);
    }
  });

  test('sends the access token in the spec\'s authorization header', async () => {
    // The spec's rawTokenAuth is the bare token, but notes the Bearer prefix may have been masked in the capture,
    // so either form matches the spec as written. Which one the server needs is unverified.
    const scheme = spec.components.securitySchemes[Object.keys(SET.security[0])[0]];
    assert.equal(scheme.in, 'header');
    const { client, server } = await ready();
    await flushSet(mock, client.setControlInfo({ pow: '1' }));
    const value = server.last(SET.key).headers.get(scheme.name);
    assert.match(value, /^(Bearer )?FAKE_VALID$/);
  });

  test('treats the spec\'s RetOk body as success', async () => {
    const okBody = resolveRef(SET.responses['200']).content['text/plain'].schema.example;
    assert.equal(okBody, 'ret=OK');
    const { client } = await ready({ [SET.key]: () => [200, okBody] });
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
  });

  test('treats any other body as a failure', async () => {
    const { client } = await ready({ [SET.key]: () => [200, 'ret=PARAM NG'] });
    await assert.rejects(flushSet(mock, client.setControlInfo({ pow: '0' })));
  });

  test('sends `id` and `spw` from userinfo\'s l_user_id and l_password', {
    todo: 'the plugin sends the literal placeholders id=ID and spw=SPW',
  }, async () => {
    const { client, server } = await loggedIn();
    await flushSet(mock, client.setControlInfo({ pow: '1' }));
    const { params } = server.last(SET.key);
    assert.equal(params.id, USERINFO_RESPONSE.l_user_id);
    assert.equal(params.spw, USERINFO_RESPONSE.l_password);
  });
});

describe('GET /cleaner/get_unit_info (status)', () => {
  test('is read from the purifier on the local network at the spec\'s path', async () => {
    // The spec lists the cloud server; the purifier answers the same path locally without credentials, which is
    // what the plugin uses so that status needs no login.
    const server = mockServers();
    const { client } = makeClient();
    await client.getUnitInfo();
    assert.equal(server.count(`${HOST}/cleaner/get_unit_info`), 1);
  });

  test('parses the spec\'s example into every field the spec lists for the groups the plugin uses', async () => {
    mockServers({ [`${HOST}/cleaner/get_unit_info`]: () => [200, UNIT.textExample] });
    const { client } = makeClient();
    const info = await client.getUnitInfo();
    assert.deepEqual(info.airPurifier, { pow: '1', mode: '0', airvol: '0', humd: '0' });
    assert.deepEqual(info.sensorInfo, { htemp: '22.0', hhum: '60', pm25: '0', dust: '0', odor: '0' });
    assert.deepEqual(info.unitStatus, { filter: '0', strmr_cln: '1', water_supply: '0', unit_err: '0000' });

    // The description lists the fields of each group, e.g. "- ctrl_info: pow, mode, airvol, humd".
    const groups = Object.fromEntries([...UNIT.responses['200'].description.matchAll(/- (\w+): ([\w, ]+)/g)]
      .map(([, group, fields]) => [group, fields.split(',').map((f) => f.trim())]));
    assert.deepEqual(Object.keys(info.airPurifier).sort(), [...groups.ctrl_info].sort());
    assert.deepEqual(Object.keys(info.sensorInfo).sort(), [...groups.sensor_info].sort());
    assert.deepEqual(Object.keys(info.unitStatus).sort(), [...groups.unit_status].sort());
  });

  test('decodes every URL-encoded group, including dev_setting, which the plugin doesn\'t use yet', () => {
    const { client } = makeClient();
    const parsed = client.parseUnitInfo(UNIT.textExample);
    assert.equal(parsed.ret, 'OK');
    assert.deepEqual(parsed.dev_setting, {
      led_dsp: '1', d_sns: '0', c_lock: '0', streamer: '0', act_ion: '1', buzzer: '1', turbo: '-', eco_moni: '1',
    });
  });
});

describe('text responses of the other device endpoints', () => {
  // The plugin doesn't call these, but they share the `ret=OK,key=value` format its parser handles.
  for (const path of ['/common/basic_info', '/cleaner/get_linkage_info', '/common/get_datetime', '/cleaner/get_model_info']) {
    test(`parses the ${path} example into the same key=value pairs`, () => {
      const example = operation(path, 'get').textExample;
      const { client } = makeClient();
      const parsed = client.parseResponse(example);
      assert.equal(parsed.ret, 'OK');
      assert.equal(Object.entries(parsed).map(([k, v]) => `${k}=${v}`).join(','), example);
    });
  }
});

describe('every cloud call the plugin makes', () => {
  // Calls the spec doesn't describe, and why. Keep this in step with docs/research/2026-11-26-openapi-conformance.md.
  const NOT_IN_SPEC = {
    'get prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/authorize': 'starts the PKCE login session; the capture starts one step later',
    'post api.daikinsmartdb.jp/premise/dsiot/login': 'older code exchange; the spec uses POST /dsioti/oauth2/token',
    'post api.daikinsmartdb.jp/premise/dsiot/token': 'older token refresh; the spec has no refresh call',
  };

  async function cloudCalls() {
    const { client, server } = await loggedIn();
    await flushSet(mock, client.setControlInfo({ pow: '0' }));
    // Let the token get within 5 minutes of expiry, so the next change renews it.
    mock.timers.tick(56 * 60 * 1000);
    await settle();
    return new Set(server.requests.filter((r) => !r.key.startsWith(HOST)).map((r) => `${r.method} ${r.key}`));
  }

  test('is in the spec, or in the known list of calls the spec doesn\'t describe', async () => {
    const inSpec = new Set(specKeys().map(({ method, key }) => `${method} ${key}`));
    const calls = await cloudCalls();
    const offSpec = [...calls].filter((call) => !inSpec.has(call)).sort();
    assert.deepEqual(offSpec, Object.keys(NOT_IN_SPEC).sort());
  });

  test('is in the spec', { todo: 'see the known list above' }, async () => {
    const inSpec = new Set(specKeys().map(({ method, key }) => `${method} ${key}`));
    const offSpec = [...(await cloudCalls())].filter((call) => !inSpec.has(call) && !call.endsWith('/oauth2/authorize'));
    assert.deepEqual(offSpec, []);
  });
});
