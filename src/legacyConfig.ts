import { readFileSync } from 'node:fs';

import { PLATFORM_NAME } from './settings.js';

/**
 * The message for a config.json that still has the purifier under "accessories", the format before version 2.1.0.
 * Homebridge then only says that no plugin was found for the accessory, which doesn't say what to change.
 * Returns null when there is nothing to warn about.
 */
export function legacyConfigMessage(config: unknown): string | null {
  const { accessories, platforms } = (config ?? {}) as { accessories?: unknown; platforms?: unknown };
  const isOurs = (block: unknown, key: string) =>
    typeof block === 'object' && block !== null && (block as Record<string, unknown>)[key] === PLATFORM_NAME;

  if (!Array.isArray(accessories) || !accessories.some((block) => isOurs(block, 'accessory'))) {
    return null;
  }
  const hasPlatform = Array.isArray(platforms) && platforms.some((block) => isOurs(block, 'platform'));

  const steps = hasPlatform
    ? `Your config.json has a "platform": "${PLATFORM_NAME}" block and also an old "accessory": "${PLATFORM_NAME}" ` +
      'block under "accessories", from before version 2.1.0. Delete the old block from "accessories", then restart ' +
      'Homebridge.'
    : `Your config.json has the purifier under "accessories" ("accessory": "${PLATFORM_NAME}"), the format from ` +
      'before version 2.1.0, so the plugin is not started. Since 2.1.0 it is a platform: in the Homebridge UI, open ' +
      'the JSON Config editor, move the whole block from "accessories" into "platforms", rename "accessory" to ' +
      '"platform", keep every other setting, save and restart Homebridge. The Home app then sees the purifier as a ' +
      'new accessory, so put it back in its room and redo its scenes and automations.';
  return `[${PLATFORM_NAME}] ${steps} ` +
    'See https://github.com/dylannlaw/homebridge-daikin-air-purifier#configure-it';
}

/**
 * Reads Homebridge's config.json and logs how to move the purifier to "platforms" if it is still under
 * "accessories". Runs when the plugin is loaded, because with only the old block Homebridge never starts the platform.
 * Never throws: a config that can't be read is Homebridge's to report.
 */
export function warnAboutLegacyConfig(
  configPath: string | undefined,
  // The plugin initializer gets no Homebridge logger, and Logger is only a type export, so this goes to the console.
  // eslint-disable-next-line no-console
  log: (message: string) => void = console.error,
): void {
  if (!configPath) {
    return;
  }
  try {
    const message = legacyConfigMessage(JSON.parse(readFileSync(configPath, 'utf8')));
    if (message) {
      log(message);
    }
  } catch {
    // Missing or invalid config.json: Homebridge itself reports it.
  }
}
