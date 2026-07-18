import { AppError } from './AppError.js';

export class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, { errors });
    this.statusCode = 400;
    this.errors = errors;
  }
}
