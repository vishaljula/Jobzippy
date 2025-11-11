import request from 'supertest';
import app from '../app.js';

process.env.GOOGLE_OAUTH_CLIENT_ID = 'test-client';
process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'test-secret';

describe('POST /intake/parse', () => {
  it('returns structured payload using heuristic fallback', async () => {
    const response = await request(app)
      .post('/intake/parse')
      .send({
        resumeText: 'Jane Doe\njane@example.com\n555-000-1111\nSkills: TypeScript, React',
        resumeMetadata: {
          fileName: 'resume.pdf',
          fileType: 'application/pdf',
          fileSize: 12345,
        },
        conversation: [],
        knownFields: {
          profile: {
            identity: {
              first_name: 'Jane',
            },
          },
        },
        missingFields: ['profile.identity.last_name'],
      })
      .expect(200);

    expect(response.body).toHaveProperty('profile.identity.first_name');
    expect(response.body.profile.identity.first_name).not.toBe('');
    expect(response.body).toHaveProperty('history.employment');
    expect(response.body).toHaveProperty('previewSections');
  });

  it('validates request body', async () => {
    const response = await request(app).post('/intake/parse').send({
      resumeText: '',
      resumeMetadata: {
        fileName: 'resume.pdf',
        fileType: 'application/pdf',
        fileSize: 0,
      },
    });

    expect(response.status).toBe(400);
  });
});


