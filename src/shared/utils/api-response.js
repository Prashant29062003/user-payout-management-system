export class ApiResponse {
  static success(data = null, message = 'OK', meta = {}) {
    return {
      success: true,
      message,
      data,
      meta,
    };
  }

  static error(message = 'Error', errors = null, statusCode = 500, meta = {}) {
    return {
      success: false,
      message,
      errors,
      statusCode,
      meta,
    };
  }
}
