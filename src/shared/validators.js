import { ValidationError } from './errors/index.js';

export function requireString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

export function requireOptionalString(value, name) {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${name} must be a non-empty string when provided`);
  }

  return value.trim();
}

export function requirePositiveNumber(value, name) {
  const number = Number(value);
  if (Number.isNaN(number) || number <= 0) {
    throw new ValidationError(`${name} must be a positive number`);
  }
  return number;
}

export function requireEnumValue(value, validValues, name) {
  if (!validValues.includes(value)) {
    throw new ValidationError(`${name} must be one of: ${validValues.join(', ')}`);
  }
  return value;
}
