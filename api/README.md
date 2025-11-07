# Jobzippy Cloud Run API (`api/`)

Secure OAuth token exchange service for the Jobzippy Chrome extension. Handles Google OAuth code/refresh token exchanges with the client secret so the extension can remain a public PKCE client.

## ✨ Responsibilities

- Exchange authorization codes for access + refresh tokens
- Refresh access tokens on behalf of the extension
- Restrict access to trusted origins via CORS
- Provide `/healthz` endpoint for uptime checks

## 🚀 Quick Start

```
# Install dependencies (from repo root)
npm install

# Start dev server with live reload
npm run dev --workspace=api

# Run unit tests (Vitest + Supertest)
npm run test --workspace=api

# Build production bundle (outputs to api/dist)
npm run build --workspace=api

# Start compiled server
npm run start --workspace=api
```

Service listens on `PORT` (defaults to `8080`).

## 🔧 Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GOOGLE_OAUTH_CLIENT_ID` | ✅ | Web application client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | ✅ | Client secret (kept server-side only) |
| `ALLOWED_ORIGINS` | ✅ | Comma-separated list of allowed origins (e.g. `chrome-extension://abc123`) |
| `PORT` | ❌ | HTTP port (default `8080`) |
| `GOOGLE_OAUTH_TOKEN_ENDPOINT` | ❌ | Override Google token endpoint (default `https://oauth2.googleapis.com/token`) |

## 📦 API Contract

### `POST /oauth/google/exchange`

Request body:

```json
{
  "code": "AUTH_CODE",
  "code_verifier": "PKCE_VERIFIER",
  "redirect_uri": "https://<EXT_ID>.chromiumapp.org/"
}
```

Response:

```json
{
  "access_token": "...",
  "expires_in": 3600,
  "refresh_token": "...",
  "token_type": "Bearer"
}
```

### `POST /oauth/google/refresh`

Request body:

```json
{ "refresh_token": "REFRESH_TOKEN" }
```

### `GET /healthz`

Returns `{ "status": "ok" }` when the service is healthy.

## 🧪 Testing

- Unit/integration tests live in `src/**/*.test.ts`
- `supertest` is used to exercise routes without starting the listener
- Run via `npm run test --workspace=api`

## ☁️ Deployment (Cloud Run)

The service ships with a production-ready Dockerfile (`api/Dockerfile`).

```
# Build container locally
docker build -t jobzippy-api -f api/Dockerfile .

# Run locally
docker run --rm -p 8787:8080 \
  -e GOOGLE_OAUTH_CLIENT_ID=... \
  -e GOOGLE_OAUTH_CLIENT_SECRET=... \
  -e ALLOWED_ORIGINS="chrome-extension://<EXT_ID>" \
  jobzippy-api
```

Cloud Run deployment options:

1. **GitHub Actions** – see `.github/workflows/cloud-run-api.yml` (deploys on `main`)
2. **Manual** – `gcloud run deploy jobzippy-api --source . --region=<region>`

> **Required GitHub secrets (per environment)**
> - `GCP_PROJECT_ID`
> - `CLOUD_RUN_REGION`
> - `CLOUD_RUN_SERVICE_STAGING` / `CLOUD_RUN_SERVICE_PROD`
> - `GCP_SERVICE_ACCOUNT_KEY` (JSON key with Cloud Run + Cloud Build perms)
> - `GOOGLE_OAUTH_CLIENT_ID`
> - `GOOGLE_OAUTH_CLIENT_SECRET`
> - `ALLOWED_ORIGINS`

## 📚 Related Docs

- [OAuth Setup Guide](../OAUTH_SETUP.md)
- [Testing Guide](../TESTING.md)
- [Backlog Story JZ-005A](../BACKLOG.md)
