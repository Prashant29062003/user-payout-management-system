export class AppError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = this.constructor.name;
    this.meta = meta;
    this.statusCode = 500;
    Error.captureStackTrace?.(this, this.constructor);
  }
}
