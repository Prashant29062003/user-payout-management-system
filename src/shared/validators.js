import { z } from 'zod';
import { ValidationError } from './errors/index.js';
import { PaymentStatus } from './constants/index.js';

const nonEmptyString = z.string().trim().min(1);

function formatZodErrors(error) {
  return error.errors.map((issue) => ({
    path: issue.path.map((segment) => String(segment)).join('.') || '(root)',
    message: issue.message,
  }));
}

export function parseSchema(schema, data) {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid request data', formatZodErrors(error));
    }

    throw error;
  }
}

export const accountIdParamsSchema = z.object({
  accountId: nonEmptyString,
});

export const saleIdParamsSchema = z.object({
  saleId: nonEmptyString,
});

export const advancePayoutBodySchema = z.object({
  saleId: nonEmptyString,
});

export const reconcileSaleBodySchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export const createWithdrawalBodySchema = z.object({
  accountId: nonEmptyString,
  userId: nonEmptyString,
  amount: z.preprocess((value) => {
    if (typeof value === 'string' && value.trim() !== '') {
      return Number(value);
    }
    return value;
  }, z.number().positive()),
  currency: nonEmptyString,
  idempotencyKey: nonEmptyString.optional().nullable(),
});

export const paymentProviderWebhookSchema = z.object({
  paymentAttemptId: nonEmptyString,
  status: z.enum([
    PaymentStatus.SUCCESS,
    PaymentStatus.FAILED,
    PaymentStatus.CANCELLED,
    PaymentStatus.REJECTED,
  ]),
  failureReason: z.string().trim().optional().nullable(),
});
