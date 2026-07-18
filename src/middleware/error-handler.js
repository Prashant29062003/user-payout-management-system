import { ApiResponse } from '../shared/utils/api-response.js';

export function errorHandler(err, _req, res, _next) {
  const statusCode = err?.statusCode || 500;
  const errors = err?.errors ?? err?.meta?.errors ?? null;
  const message = err?.message || 'Internal Server Error';

  res.status(statusCode).json(ApiResponse.error(message, errors, statusCode));
}
