import { readFileSync } from 'node:fs';

import { PLATFORM_NAME } from './settings.js';

const hasBlock = (blocks: unknown, key: string) => Array.isArray(blocks) && blocks.some(
  (block) => typeof block === 'object' && block !== null && (block as Record<string, unknown>)[key] === PLATFORM_NAME,
);

/**
 * The message for a config.json that still has the purifier under "accessories", the format before version 2.1.0.
 * Homebridge then only says that no plugin was found for the accessory, which doesn't say what to change.
 * Returns null when there is nothing to warn about.
 */
export function legacyConfigMessage(config: unknown): string | null {
  const { accessories, platforms } = (config ?? {}) as { accessories?: unknown; platforms?: unknown };

  if (!hasBlock(accessories, 'accessory')) {
    return null;
  }
  const hasPlatform = hasBlock(platforms, 'platform');

  const steps = hasPlatform
    ? `Your config.json has a "platform": "${PLATFORM_NAME}" block and also an old "accessory": "${PLATFORM_NAME}" ` +
      'block under "accessories", from before version 2.1.0. Delete the old block from "accessories", then restart ' +
      'Homebridge.'
    : `Your config.json has the purifier under "accessories" ("accessory": "${PLATFORM_NAME}"), the format from ` +
      'before version 2.1.0, so the plugin is not started. Since 2.1.0 it is a platform: in the Homebridge UI, open ' +
      'the JSON Config editor, move the whole block from "accessories" into "platforms", rename "accessory" to ' +
      '"platform", keep every other setting, save and restart Homebridge. The Home app then sees the purifier as a ' +
      'new accessory, so put it back in its room and redo its scenes and automations.';
  return `${steps} ` +
    'See https://github.com/dylannlaw/homebridge-daikin-air-purifier#configure-it';
}

/**
 * Logs how to migrate, if config.json at configPath has an old accessory block. Never throws.
 *
 * Homebridge only gives a plugin a logger when it creates the platform, from a "platforms" block. So the platform passes
 * its log.warn here, and the plugin initializer calls this without one: it then logs only when there is no such block,
 * to the console, with the plugin's own prefix (Logger is only a type export of homebridge).
 */
export function warnAboutLegacyConfig(configPath: string | undefined, warn?: (message: string) => void): void {
  if (!configPath) {
    return;
  }
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'));
    const message = legacyConfigMessage(config);
    if (!message) {
      return;
    }
    if (warn) {
      warn(message);
    } else if (!hasBlock(config.platforms, 'platform')) {
      // eslint-disable-next-line no-console
      console.warn(`[${PLATFORM_NAME}] ${message}`);
    }
  } catch {
    // Missing or invalid config.json: Homebridge itself reports it.
  }
}
