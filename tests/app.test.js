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
