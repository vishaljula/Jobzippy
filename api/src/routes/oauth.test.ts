import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockedFetch = vi.fn();

vi.mock('undici', () => ({
  fetch: mockedFetch,
}));

const validBody = {
  code: 'auth-code',
  code_verifier: 'a'.repeat(64),
  redirect_uri: 'https://mkidfifhgcfgdleoeoilmfkopaknjmbg.chromiumapp.org/',
};

describe('POST /oauth/google/exchange', () => {
  let app: (typeof import('../app.js'))['default'];

  beforeEach(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-client-secret';
    process.env.ALLOWED_ORIGINS = '';
    mockedFetch.mockReset();
    vi.resetModules();
  });

  afterEach(() => {
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_SECRET;
    delete process.env.ALLOWED_ORIGINS;
  });

  it('returns tokens when Google exchange succeeds', async () => {
    const module = await import('../app.js');
    app = module.default;
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'access',
        refresh_token: 'refresh',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });

    const response = await request(app).post('/oauth/google/exchange').send(validBody);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      access_token: 'access',
      refresh_token: 'refresh',
      token_type: 'Bearer',
      expires_in: 3600,
    });
    expect(mockedFetch).toHaveBeenCalledTimes(1);
    const requestBody = mockedFetch.mock.calls[0][1]?.body as string;
    expect(requestBody).toContain('client_id=test-client-id');
    expect(requestBody).toContain('client_secret=test-client-secret');
    expect(requestBody).toContain(`redirect_uri=${encodeURIComponent(validBody.redirect_uri)}`);
    expect(requestBody).toContain(`code_verifier=${validBody.code_verifier}`);
  });

  it('returns 400 when payload is invalid', async () => {
    const module = await import('../app.js');
    app = module.default;
    const response = await request(app)
      .post('/oauth/google/exchange')
      .send({ code: '', code_verifier: 'short', redirect_uri: 'https://example.com/' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_request');
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('forwards Google OAuth errors', async () => {
    const module = await import('../app.js');
    app = module.default;
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: 'invalid_grant',
        error_description: 'Bad code',
      }),
    });

    const response = await request(app).post('/oauth/google/exchange').send(validBody);

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      error: 'oauth_error',
      message: 'invalid_grant: Bad code',
    });
  });

  it('refreshes access tokens using the backend', async () => {
    const module = await import('../app.js');
    app = module.default;
    mockedFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        access_token: 'new-access',
        token_type: 'Bearer',
        expires_in: 3600,
      }),
    });

    const response = await request(app)
      .post('/oauth/google/refresh')
      .send({ refresh_token: 'refresh-token-value' });

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      access_token: 'new-access',
      token_type: 'Bearer',
    });
    const requestBody = mockedFetch.mock.calls[0][1]?.body as string;
    expect(requestBody).toContain('grant_type=refresh_token');
    expect(requestBody).toContain('refresh_token=refresh-token-value');
  });

  it('validates refresh payload', async () => {
    const module = await import('../app.js');
    app = module.default;
    const response = await request(app)
      .post('/oauth/google/refresh')
      .send({ refresh_token: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('invalid_request');
    expect(mockedFetch).not.toHaveBeenCalled();
  });
});

