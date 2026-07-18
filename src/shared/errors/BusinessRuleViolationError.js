import { AppError } from './AppError.js';

export class BusinessRuleViolationError extends AppError {
  constructor(message = 'Business rule violation') {
    super(message);
    this.statusCode = 422;
  }
}
