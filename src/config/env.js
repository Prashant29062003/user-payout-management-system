import { ensureString } from '../shared/utils/index.js';

const requiredEnvironmentVariables = ['DATABASE_URL'];

const missing = requiredEnvironmentVariables.filter(
  (name) => !process.env[name] || !process.env[name].trim(),
);

if (missing.length > 0) {
  throw new Error(
    `Missing required environment variables: ${missing.join(', ')}`,
  );
}

export const env = {
  DATABASE_URL: ensureString(process.env.DATABASE_URL, 'DATABASE_URL'),
  PORT: Number(process.env.PORT ?? 3000),
  PAYMENT_PROVIDER_URL: process.env.PAYMENT_PROVIDER_URL ?? null,
  PAYMENT_PROVIDER_API_KEY: process.env.PAYMENT_PROVIDER_API_KEY ?? null,
};
