import request from 'supertest';
import app from '../src/app.js';

describe('Health check', () => {
  it('returns 200 OK and standard ApiResponse format', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'Service is healthy',
      data: { status: 'ok' },
      meta: {},
    });
  });
});

describe('Not found handler', () => {
  it('returns 404 JSON when route does not exist', async () => {
    const response = await request(app).get('/api/v1/non-existent-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      success: false,
      message: 'Not Found',
      errors: null,
      statusCode: 404,
      meta: {},
    });
  });
});
