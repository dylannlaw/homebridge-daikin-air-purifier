/**
 * A sensor value as a number. Daikin devices report "-" (or nothing) for a reading they don't have at the moment;
 * HomeKit rejects that as NaN, so the last good value is kept instead.
 */
export class Reading {
  constructor(private last = 0) {}

  from(value: unknown): number {
    const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    if (Number.isFinite(number)) {
      this.last = number;
    }
    return this.last;
  }
}
