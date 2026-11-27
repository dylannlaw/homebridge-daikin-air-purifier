import type { PlatformAccessory, Service, WithUUID } from 'homebridge';

type ServiceType = WithUUID<typeof Service>;

/**
 * The accessory's service of this type (and subtype), added when it doesn't have one yet. An accessory restored from
 * the Homebridge cache already has its services, so they're reused instead of added twice. Without an accessory (unit
 * tests) a standalone service is created.
 */
export function serviceFor(accessory: PlatformAccessory | undefined, type: ServiceType, name?: string, subtype?: string): Service {
  const existing = subtype ? accessory?.getServiceById(type, subtype) : accessory?.getService(type);
  if (existing) {
    return existing;
  }
  // The HAP service classes (hap.Service.AirPurifier, ...) take an optional display name and subtype.
  const service = new (type as unknown as new (name?: string, subtype?: string) => Service)(name, subtype);
  return accessory ? accessory.addService(service) : service;
}
