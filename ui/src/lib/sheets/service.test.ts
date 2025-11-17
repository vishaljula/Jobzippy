import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { MockInstance } from 'vitest';
// Intentionally avoid static import of './service' here so that mocks below take effect first.

vi.mock('@/lib/oauth/google-auth', () => ({
  getValidAccessToken: vi.fn(async () => 'test-token'),
  getUserInfo: vi.fn(async () => ({
    sub: 'sub123',
    email: 'user@example.com',
    email_verified: true,
    name: 'John Doe',
    given_name: 'John',
    family_name: 'Doe',
    picture: '',
  })),
}));

vi.mock('@/lib/firebase/client', () => ({
  getFirebaseApp: vi.fn(() => ({})),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: { uid: 'uid123' } })),
}));

vi.mock('@/lib/firebase/userRepository', () => {
  return {
    FirestoreRepository: vi.fn().mockImplementation(() => ({
      updateSheetId: vi.fn(async () => {}),
    })),
  };
});

vi.mock('@/lib/storage', async (orig) => {
  const actual = await (orig as any)();
  return {
    ...actual,
    getStorage: vi.fn(async () => undefined),
    setStorage: vi.fn(async () => {}),
  };
});

const originalFetch = global.fetch;

type FetchMock = MockInstance<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>;
type StorageMock = MockInstance<() => Promise<string | undefined>>;

function getFetchMock(): FetchMock {
  if (!global.fetch) {
    throw new Error('Fetch not mocked');
  }
  return global.fetch as unknown as FetchMock;
}

describe('sheets/service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a sheet with headers and formatting, persisting sheet_id', async () => {
    const { createSheet } = await import('./service');
    const fetchMock = getFetchMock();
    // 1) create spreadsheet
    fetchMock.mockResolvedValueOnce!(
      new Response(
        JSON.stringify({
          spreadsheetId: 'sheet-abc',
          sheets: [{ properties: { sheetId: 0 } }],
        }),
        { status: 200 }
      )
    );
    // 2) put headers
    fetchMock.mockResolvedValueOnce!(new Response('{}', { status: 200 }));
    // 3) batchUpdate formatting
    fetchMock.mockResolvedValueOnce!(new Response('{}', { status: 200 }));

    const { sheetId, url } = await createSheet();
    expect(sheetId).toBe('sheet-abc');
    expect(url).toContain('sheet-abc');

    // Assert calls
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect((fetchMock.mock?.calls?.[0]?.[0] as string) ?? '').toMatch(
      'https://sheets.googleapis.com/v4/spreadsheets'
    );
    expect((fetchMock.mock?.calls?.[1]?.[0] as string) ?? '').toMatch('/values/A1:P1');
    expect((fetchMock.mock?.calls?.[2]?.[0] as string) ?? '').toMatch(':batchUpdate');
  });

  it('appendApplicationRow is idempotent when app_id exists', async () => {
    const { appendApplicationRow } = await import('./service');
    const { getStorage } = await import('@/lib/storage');
    const storageMock = getStorage as unknown as StorageMock;
    storageMock.mockResolvedValueOnce!('sheet-abc'); // sheetId

    const fetchMock = getFetchMock();
    // GET col A with existing app_id
    fetchMock.mockResolvedValueOnce!(
      new Response(JSON.stringify({ values: [['app_id', 'existing-app']] }), { status: 200 })
    );

    await appendApplicationRow({
      app_id: 'existing-app',
      date_applied: new Date().toISOString(),
      platform: 'LinkedIn',
      job_title: 'SE',
      company: 'Acme',
      location: 'Remote',
      job_url: 'https://example.com',
      status: 'applied',
      visa_sponsor_flag: 'UNKNOWN',
    });

    // Only 1 call (values get), no append call
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((fetchMock.mock?.calls?.[0]?.[0] as string) ?? '').toMatch('/values/A:A');
  });

  it('appendApplicationRow appends when app_id not present', async () => {
    const { appendApplicationRow } = await import('./service');
    const { getStorage } = await import('@/lib/storage');
    const storageMock = getStorage as unknown as StorageMock;
    storageMock.mockResolvedValueOnce!('sheet-abc'); // sheetId

    const fetchMock = getFetchMock();
    // GET col A only header
    fetchMock.mockResolvedValueOnce!(
      new Response(JSON.stringify({ values: [['app_id']] }), { status: 200 })
    );
    // append call
    fetchMock.mockResolvedValueOnce!(new Response('{}', { status: 200 }));

    await appendApplicationRow({
      app_id: 'new-app',
      date_applied: new Date().toISOString(),
      platform: 'LinkedIn',
      job_title: 'SE',
      company: 'Acme',
      location: 'Remote',
      job_url: 'https://example.com',
      status: 'applied',
      visa_sponsor_flag: 'UNKNOWN',
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock?.calls?.[1]?.[0] as string) ?? '').toMatch('/values/A1:P1:append');
  });

  it('updateApplicationStatus updates matching rows in batch', async () => {
    const { updateApplicationStatus } = await import('./service');
    const { getStorage } = await import('@/lib/storage');
    const storageMock = getStorage as unknown as StorageMock;
    storageMock.mockResolvedValueOnce!('sheet-abc'); // sheetId

    const fetchMock = getFetchMock();
    // GET col A with header + one app
    fetchMock.mockResolvedValueOnce!(
      new Response(JSON.stringify({ values: [['app_id', 'app-123']] }), { status: 200 })
    );
    // batchUpdate values
    const batchSpy = vi.fn((_input: RequestInfo | URL, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.valueInputOption).toBe('RAW');
      expect(Array.isArray(body.data)).toBe(true);
      expect(body.data[0].range).toBe('H2:L2');
      expect(body.data[0].values[0][0]).toBe('replied');
      return Promise.resolve(new Response('{}', { status: 200 }));
    });
    fetchMock.mockImplementationOnce(batchSpy as any);

    await updateApplicationStatus([
      {
        app_id: 'app-123',
        status: 'replied',
        email_subject: 'Re: SE',
        email_from: 'recruiter@acme.com',
        last_email_at: new Date().toISOString(),
      },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries transient errors on append', async () => {
    const { appendApplicationRow } = await import('./service');
    const { getStorage } = await import('@/lib/storage');
    const storageMock = getStorage as unknown as StorageMock;
    storageMock.mockResolvedValueOnce!('sheet-abc'); // sheetId

    const fetchMock = getFetchMock();
    // GET col A only header
    fetchMock.mockResolvedValueOnce!(
      new Response(JSON.stringify({ values: [['app_id']] }), { status: 200 })
    );
    // append returns 429, then 200
    fetchMock.mockResolvedValueOnce!(new Response('rate limited', { status: 429 }));
    fetchMock.mockResolvedValueOnce!(new Response('{}', { status: 200 }));

    await expect(
      appendApplicationRow({
        app_id: 'retry-app',
        date_applied: new Date().toISOString(),
        platform: 'LinkedIn',
        job_title: 'SE',
        company: 'Acme',
        location: 'Remote',
        job_url: 'https://example.com',
        status: 'applied',
        visa_sponsor_flag: 'UNKNOWN',
      })
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
