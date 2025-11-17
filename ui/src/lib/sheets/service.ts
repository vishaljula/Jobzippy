/**
 * Google Sheets Wrapper
 * - createSheet(): creates sheet with headers, bold + frozen header row; persists sheet_id
 * - appendApplicationRow(): idempotent append by app_id with retry/backoff; optional offline queue
 * - updateApplicationStatus(): batch update status/email fields by app_id
 * - getRowIndexByAppId(): find row index by app_id (1-based, including header row)
 */

import { getValidAccessToken, getUserInfo } from '@/lib/oauth/google-auth';
import type { JobApplication, ApplicationStatus } from '@/lib/types';
import { setStorage, getStorage } from '@/lib/storage';
import { FirestoreRepository } from '@/lib/firebase/userRepository';
import { getAuth } from 'firebase/auth';
import { getFirebaseApp } from '@/lib/firebase/client';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

// Columns A→P (16 columns) — see MVP spec §7 and BACKLOG JZ-011
export const SHEET_HEADERS: readonly string[] = [
  'app_id',
  'date_applied',
  'platform',
  'job_title',
  'company',
  'location',
  'job_url',
  'status',
  'email_thread_id',
  'email_from',
  'email_subject',
  'last_email_at',
  'notes',
  'salary',
  'match_score',
  'visa_sponsor_flag',
] as const;

type AppendQueueItem = {
  kind: 'append';
  sheetId: string;
  row: string[]; // ordered values A..P
  appId: string;
};

const STORAGE_QUEUE_KEY = 'sheetsAppendQueue' as const;

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  retries = 3
): Promise<Response> {
  let attempt = 0;
  let delayMs = 500;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const res = await fetch(input, init);
      if (res.ok) return res;
      if (![429, 500, 502, 503, 504].includes(res.status) || attempt >= retries) {
        return res;
      }
    } catch {
      if (attempt >= retries) {
        throw new Error('Network error and retries exhausted');
      }
    }
    await new Promise((r) => setTimeout(r, delayMs));
    delayMs = Math.min(5000, delayMs * 2);
    attempt++;
  }
}

function ensureRowOrderFromApplication(app: JobApplication): string[] {
  return [
    app.app_id ?? '',
    app.date_applied ?? '',
    app.platform ?? '',
    app.job_title ?? '',
    app.company ?? '',
    app.location ?? '',
    app.job_url ?? '',
    app.status ?? '',
    app.email_thread_id ?? '',
    app.email_from ?? '',
    app.email_subject ?? '',
    app.last_email_at ?? '',
    app.notes ?? '',
    app.salary ?? '',
    typeof app.match_score === 'number' ? String(app.match_score) : '',
    app.visa_sponsor_flag ?? '',
  ];
}

async function persistSheetId(sheetId: string): Promise<void> {
  // Save to chrome.storage
  await setStorage('sheetId', sheetId);
  // Save to Firestore user document
  const auth = getAuth(getFirebaseApp());
  if (auth.currentUser?.uid) {
    const repo = new FirestoreRepository();
    await repo.updateSheetId(auth.currentUser.uid, sheetId);
  }
}

export async function createSheet(): Promise<{ sheetId: string; url: string }> {
  const accessToken = await getValidAccessToken();
  const user = await getUserInfo();
  const titleName =
    user?.given_name && user?.family_name
      ? `${user.given_name} ${user.family_name}`
      : user?.name || 'User';
  const title = `Jobzippy – Applications (${titleName})`;

  // 1) Create spreadsheet
  const createResponse = await fetchWithRetry(`${SHEETS_API}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { title },
      sheets: [{ properties: { title: 'Applications' } }],
    }),
  });
  if (!createResponse.ok) {
    const text = await createResponse.text();
    throw new Error(`Failed to create spreadsheet: ${text}`);
  }
  const createJson = await createResponse.json();
  const spreadsheetId: string = createJson.spreadsheetId;
  const sheetId: number = createJson.sheets?.[0]?.properties?.sheetId;

  // 2) Write header row
  const headerResponse = await fetchWithRetry(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}/values/A1:P1?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: 'A1:P1',
        majorDimension: 'ROWS',
        values: [SHEET_HEADERS],
      }),
    }
  );
  if (!headerResponse.ok) {
    const text = await headerResponse.text();
    throw new Error(`Failed to set headers: ${text}`);
  }

  // 3) Format: bold header + freeze row
  const batchRequests: unknown[] = [
    {
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: SHEET_HEADERS.length,
        },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: 'userEnteredFormat.textFormat.bold',
      },
    },
    {
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 1 },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },
  ];
  const formatResponse = await fetchWithRetry(
    `${SHEETS_API}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requests: batchRequests }),
    }
  );
  if (!formatResponse.ok) {
    const text = await formatResponse.text();
    throw new Error(`Failed to format header: ${text}`);
  }

  await persistSheetId(spreadsheetId);
  const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
  return { sheetId: spreadsheetId, url };
}

export async function getRowIndexByAppId(sheetId: string, appId: string): Promise<number | null> {
  const accessToken = await getValidAccessToken();
  const res = await fetchWithRetry(
    `${SHEETS_API}/${encodeURIComponent(sheetId)}/values/A:A?majorDimension=COLUMNS`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to read app ids: ${text}`);
  }
  const json = await res.json();
  const columns: string[][] = json.values || [];
  const colA = columns[0] || [];
  // colA[0] is header 'app_id'; actual data begins at row 2 (index 1)
  for (let i = 1; i < colA.length; i++) {
    if (colA[i] === appId) {
      return i + 1; // convert 0-based index to 1-based row number
    }
  }
  return null;
}

async function enqueueAppend(item: AppendQueueItem): Promise<void> {
  const current = (await getStorage(STORAGE_QUEUE_KEY as never)) as AppendQueueItem[] | undefined;
  const next = Array.isArray(current) ? [...current, item] : [item];
  await setStorage(STORAGE_QUEUE_KEY as never, next as never);
}

export async function flushAppendQueue(): Promise<void> {
  const queued = (await getStorage(STORAGE_QUEUE_KEY as never)) as AppendQueueItem[] | undefined;
  if (!queued || queued.length === 0) return;
  const remaining: AppendQueueItem[] = [];
  for (const item of queued) {
    try {
      await performAppend(item.sheetId, item.row, item.appId);
    } catch {
      remaining.push(item);
    }
  }
  await setStorage(STORAGE_QUEUE_KEY as never, remaining as never);
}

async function performAppend(sheetId: string, row: string[], appId: string): Promise<void> {
  const accessToken = await getValidAccessToken();
  // Idempotency: check if app_id exists
  const existingRowIndex = await getRowIndexByAppId(sheetId, appId);
  if (existingRowIndex) return; // already present; no-op

  const appendRes = await fetchWithRetry(
    `${SHEETS_API}/${encodeURIComponent(
      sheetId
    )}/values/A1:P1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: 'A1:P1',
        majorDimension: 'ROWS',
        values: [row],
      }),
    }
  );
  if (!appendRes.ok) {
    const text = await appendRes.text();
    throw new Error(`Failed to append row: ${text}`);
  }
}

export async function appendApplicationRow(app: JobApplication, opts?: { allowQueue?: boolean }) {
  const sheetId = (await getStorage('sheetId')) as string | undefined;
  if (!sheetId) {
    throw new Error('No sheet configured. Create your Job Log Sheet first.');
  }
  const row = ensureRowOrderFromApplication(app);
  try {
    await performAppend(sheetId, row, app.app_id);
  } catch (error) {
    const allowQueue = opts?.allowQueue ?? true;
    const offlineLikely = typeof navigator !== 'undefined' && !navigator.onLine;
    if (allowQueue || offlineLikely) {
      await enqueueAppend({ kind: 'append', sheetId, row, appId: app.app_id });
      return;
    }
    throw error;
  }
}

type StatusUpdate = {
  app_id: string;
  status: ApplicationStatus;
  email_thread_id?: string;
  email_from?: string;
  email_subject?: string;
  last_email_at?: string;
};

export async function updateApplicationStatus(updates: StatusUpdate[]): Promise<void> {
  if (updates.length === 0) return;
  const sheetId = (await getStorage('sheetId')) as string | undefined;
  if (!sheetId) throw new Error('No sheet configured. Create your Job Log Sheet first.');

  const accessToken = await getValidAccessToken();
  // Read all app_ids once
  const res = await fetchWithRetry(
    `${SHEETS_API}/${encodeURIComponent(sheetId)}/values/A:A?majorDimension=COLUMNS`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to read app ids for update: ${text}`);
  }
  const json = await res.json();
  const colA: string[] = (json.values?.[0] as string[]) || [];
  // Build data updates
  type ValueRange = { range: string; majorDimension: 'ROWS'; values: string[][] };
  const data: ValueRange[] = [];

  for (const u of updates) {
    const index = colA.findIndex((v) => v === u.app_id);
    if (index <= 0) continue; // 0 is header; <0 not found
    const rowNumber = index + 1;
    // Columns H..L (8..12) for status and email fields
    const valuesRow: string[] = [
      u.status ?? '',
      u.email_thread_id ?? '',
      u.email_from ?? '',
      u.email_subject ?? '',
      u.last_email_at ?? '',
    ];
    data.push({
      range: `H${rowNumber}:L${rowNumber}`,
      majorDimension: 'ROWS',
      values: [valuesRow],
    });
  }

  if (data.length === 0) return;

  const updateRes = await fetchWithRetry(
    `${SHEETS_API}/${encodeURIComponent(sheetId)}/values:batchUpdate`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data,
      }),
    }
  );
  if (!updateRes.ok) {
    const text = await updateRes.text();
    throw new Error(`Failed to update application status: ${text}`);
  }
}
