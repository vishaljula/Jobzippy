export interface ApplicationRowInput {
  app_id: string;
  date_applied: string;
  platform: string;
  job_title: string;
  company: string;
  location?: string;
  job_url?: string;
  status: string;
  email_thread_id?: string;
  email_from?: string;
  email_subject?: string;
  last_email_at?: string;
  notes?: string;
  salary?: string | number;
  match_score?: number;
  visa_sponsor_flag?: 'YES' | 'NO' | 'UNKNOWN';
}

export async function createSheet(): Promise<{ sheetId: string; url: string }> {
  const sheetId = 'sheet_dev_stub';
  try {
    await chrome.storage.local.set({ sheetId });
  } catch {
    // ignore storage errors in stub
  }
  // eslint-disable-next-line no-console
  console.warn('[sheets] createSheet() stubbed; returning fake id');
  return { sheetId, url: `https://docs.google.com/spreadsheets/d/${sheetId}` };
}

export async function appendApplicationRow(_input: ApplicationRowInput): Promise<void> {
  // eslint-disable-next-line no-console
  console.warn('[sheets] appendApplicationRow() stubbed; no-op');
}

export async function updateApplicationStatus(
  _input:
    | {
        app_id: string;
        status?: string;
        email_thread_id?: string;
        email_from?: string;
        email_subject?: string;
        last_email_at?: string;
      }
    | Array<{
        app_id: string;
        status?: string;
        email_thread_id?: string;
        email_from?: string;
        email_subject?: string;
        last_email_at?: string;
      }>
): Promise<void> {
  // eslint-disable-next-line no-console
  console.warn('[sheets] updateApplicationStatus() stubbed; no-op');
}
