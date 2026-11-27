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
    assert.match(message, /^\[DaikinAirPurifier\] /);
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

describe('plugin initializer', () => {
  test('checks the config.json Homebridge uses when the plugin is loaded', () => {
    const errors = mock.method(globalThis.console, 'error', () => {});
    try {
      const configPath = writeConfig({ accessories: [OLD_BLOCK] });
      const api = Object.assign(new EventEmitter(), {
        hap,
        user: { storagePath: () => tempStorage(), configPath: () => configPath },
        registerPlatform: mock.fn(),
      });
      plugin(api);
      assert.equal(api.registerPlatform.mock.callCount(), 1);
      assert.equal(errors.mock.callCount(), 1);
      assert.match(errors.mock.calls[0].arguments[0], /^\[DaikinAirPurifier\] .*"accessories"/);
    } finally {
      errors.mock.restore();
    }
  });
});
