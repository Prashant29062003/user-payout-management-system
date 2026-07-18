import { ApiResponse } from '../shared/utils/api-response.js';

export function notFoundHandler(_req, res) {
  res.status(404).json(ApiResponse.error('Not Found', null, 404));
}
