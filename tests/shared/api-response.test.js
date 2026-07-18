import { ApiResponse } from '../../src/shared/utils/api-response.js';

describe('ApiResponse', () => {
  it('creates a success response with data and message', () => {
    const response = ApiResponse.success({ value: 1 }, 'Successful');

    expect(response).toEqual({
      success: true,
      message: 'Successful',
      data: { value: 1 },
      meta: {},
    });
  });

  it('creates an error response with message, errors, and status code', () => {
    const response = ApiResponse.error('Failed', [{ field: 'name' }], 400, { requestId: 'abc' });

    expect(response).toEqual({
      success: false,
      message: 'Failed',
      errors: [{ field: 'name' }],
      statusCode: 400,
      meta: { requestId: 'abc' },
    });
  });
});
