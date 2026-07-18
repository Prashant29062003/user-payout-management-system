export function ensureString(value, name) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} must be a non-empty string.`);
  }
  return value;
}

export function ensureUrl(value, name) {
  const stringValue = ensureString(value, name);
  try {
    return new URL(stringValue).toString();
  } catch (error) {
    throw new Error(`${name} must be a valid URL.`);
  }
}

export { ApiResponse } from './api-response.js';
