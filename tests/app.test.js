import request from 'supertest';
import app from '../src/app.js';

describe('Health check', () => {
  it('returns 200 OK and status ok', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
