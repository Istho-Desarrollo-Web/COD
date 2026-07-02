const request = require('supertest');
const { app } = require('../../server');

describe('GET /health', () => {
  it('responds with success and environment info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.environment).toBe('test');
    expect(['connected', 'error']).toContain(res.body.database);
  });
});
