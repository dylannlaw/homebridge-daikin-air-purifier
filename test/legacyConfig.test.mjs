import { describe, test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';
import { hap, tempStorage } from './helpers.mjs';

const { legacyConfigMessage, warnAboutLegacyConfig } = await import('../dist/legacyConfig.js');
const { default: plugin } = await import('../dist/index.js');

const OLD_BLOCK = { accessory: 'DaikinAirPurifier', name: 'DaikinAirPurifier', host: '192.0.2.1', password: 'fake-password' };
const NEW_BLOCK = { platform: 'DaikinAirPurifier', name: 'DaikinAirPurifier', host: '192.0.2.1' };

function writeConfig(config) {
  const path = join(tempStorage(), 'config.json');
  writeFileSync(path, typeof config === 'string' ? config : JSON.stringify(config));
  return path;
}

describe('legacyConfigMessage', () => {
  test('explains how to move the purifier from accessories to platforms', () => {
    const message = legacyConfigMessage({ accessories: [OLD_BLOCK], platforms: [{ platform: 'config' }] });
    assert.match(message, /move the whole block from "accessories" into "platforms"/);
    assert.match(message, /rename "accessory" to "platform"/);
    assert.match(message, /#configure-it/);
  });

  test('says to delete the leftover block when the platform block is already there', () => {
    const message = legacyConfigMessage({ accessories: [OLD_BLOCK], platforms: [NEW_BLOCK] });
    assert.match(message, /Delete the old block from "accessories"/);
    assert.doesNotMatch(message, /move the whole block/);
  });

  test('never includes settings from the block', () => {
    const message = legacyConfigMessage({ accessories: [OLD_BLOCK] });
    assert.doesNotMatch(message, /fake-password|192\.0\.2\.1/);
  });

  test('is null for a config in the platform format, or without the purifier', () => {
    assert.equal(legacyConfigMessage({ accessories: [], platforms: [NEW_BLOCK] }), null);
    assert.equal(legacyConfigMessage({ accessories: [{ accessory: 'Other' }, null, 'x'] }), null);
    assert.equal(legacyConfigMessage({ accessories: 'not a list' }), null);
    assert.equal(legacyConfigMessage({}), null);
    assert.equal(legacyConfigMessage(null), null);
  });
});

describe('warnAboutLegacyConfig', () => {
  test('logs once for a config.json with the old block', () => {
    const log = mock.fn();
    warnAboutLegacyConfig(writeConfig({ accessories: [OLD_BLOCK] }), log);
    assert.equal(log.mock.callCount(), 1);
    assert.match(log.mock.calls[0].arguments[0], /"accessories"/);
  });

  test('logs nothing for a config.json in the platform format', () => {
    const log = mock.fn();
    warnAboutLegacyConfig(writeConfig({ platforms: [NEW_BLOCK] }), log);
    assert.equal(log.mock.callCount(), 0);
  });

  test('ignores a missing path, a missing file and invalid JSON', () => {
    const log = mock.fn();
    warnAboutLegacyConfig(undefined, log);
    warnAboutLegacyConfig(join(tempStorage(), 'missing.json'), log);
    warnAboutLegacyConfig(writeConfig('{ not json'), log);
    assert.equal(log.mock.callCount(), 0);
  });
});

describe('plugin startup', () => {
  /** Loads the plugin as Homebridge does, and creates the platform if config.json has a block for it. */
  function start(config) {
    const warnings = mock.method(globalThis.console, 'warn', () => {});
    const log = { warn: mock.fn() };
    try {
      const configPath = writeConfig(config);
      const api = Object.assign(new EventEmitter(), {
        hap,
        user: { storagePath: () => tempStorage(), configPath: () => configPath },
        registerPlatform: mock.fn(),
      });
      plugin(api);
      const [, Platform] = api.registerPlatform.mock.calls[0].arguments;
      for (const block of config.platforms ?? []) {
        new Platform(log, block, api);
      }
      const messages = (calls) => calls.map((call) => call.arguments[0]);
      return { console: messages(warnings.mock.calls), log: messages(log.warn.mock.calls) };
    } finally {
      warnings.mock.restore();
    }
  }

  test('with only the old block, warns on the console with the plugin\'s prefix', () => {
    const result = start({ accessories: [OLD_BLOCK] });
    assert.equal(result.console.length, 1);
    assert.match(result.console[0], /^\[DaikinAirPurifier\] .*move the whole block/);
  });

  test('with the platform block too, warns once through the Homebridge logger', () => {
    const result = start({ accessories: [OLD_BLOCK], platforms: [NEW_BLOCK] });
    assert.deepEqual(result.console, []);
    assert.equal(result.log.length, 1);
    assert.match(result.log[0], /^Your config\.json .*Delete the old block/);
  });

  test('warns about nothing for a config in the platform format', () => {
    assert.deepEqual(start({ platforms: [NEW_BLOCK] }), { console: [], log: [] });
  });
});
