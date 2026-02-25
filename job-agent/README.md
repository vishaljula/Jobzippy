# job-agent

Autonomous job application agent. Finds 2 LinkedIn Easy Apply jobs and applies fully autonomously using Claude + Stagehand.

## Setup

### 1. Install dependencies
```bash
cd job-agent
npm install
npx playwright install chromium
```

### 2. Create `.env`
```bash
cp .env.example .env
# Add your ANTHROPIC_API_KEY
```

### 3. Get your profile data — run this in extension DevTools console

Open the Jobzippy extension sidepanel → right-click → Inspect → Console tab → paste:

```javascript
(async function extractVault() {
  const DB_NAME = 'JobzippyVault';
  const STORES = ['profile', 'compliance', 'history', 'policies'];

  const b64ToBytes = (b64) => {
    const bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  };

  const openDb = () => new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  const dbGet = (db, store, key) => new Promise((res, rej) => {
    const r = db.transaction(store, 'readonly').objectStore(store).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

  const deriveKey = async (password, saltBytes) => {
    const base = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes.buffer, iterations: 250000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
  };

  const decrypt = async (key, { iv, ciphertext }) => {
    const ivBuf = b64ToBytes(iv), ctBuf = b64ToBytes(ciphertext);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBuf.buffer }, key, ctBuf.buffer
    );
    return JSON.parse(new TextDecoder().decode(plain));
  };

  // ── Auto-derive vault password (mirrors deriveVaultPassword() in utils.ts) ──
  // No manual password needed — derived from your Google user ID + extension ID
  const storage = await new Promise(res => chrome.storage.local.get(['user_info'], res));
  const user = storage.user_info;
  if (!user) { console.error('Not logged in — open the extension and log in first.'); return; }

  const userId = user.sub || user.id || user.email;
  const extensionId = chrome.runtime.id;
  const password = `vault-${extensionId}-${userId}`;
  console.log(`🔑 Vault password derived for user: ${user.email} (${extensionId})`);

  console.log('🔓 Decrypting vault...');
  const db = await openDb();
  const saltB64 = await dbGet(db, 'meta', 'vault_salt');
  if (!saltB64) { console.error('No vault salt found — is the vault initialized?'); return; }

  const key = await deriveKey(password, b64ToBytes(saltB64));
  const result = {};
  for (const store of STORES) {
    try {
      const payload = await dbGet(db, store, 'singleton');
      result[store] = payload ? await decrypt(key, payload) : null;
    } catch(e) { console.error(`Failed to decrypt ${store}:`, e); result[store] = null; }
  }

  const agentProfile = {
    identity:    result.profile?.identity    || {},
    work_auth:   result.profile?.work_auth   || {},
    preferences: result.profile?.preferences || {},
    employment:  result.history?.employment  || [],
    education:   result.history?.education   || [],
    compliance:  result.compliance           || {},
  };

  console.log('\n=== COPY INTO job-agent/profile.json ===');
  console.log(JSON.stringify(agentProfile, null, 2));
  console.log('=== END ===');

  try {
    await navigator.clipboard.writeText(JSON.stringify(agentProfile, null, 2));
    console.log('✅ Copied to clipboard!');
  } catch { console.log('(copy manually from above)'); }
})();
```


Save the output as `job-agent/profile.json`.

### 4. Place your resume
```
job-agent/resume.pdf
```

### 5. Run
```bash
npm start
```

A Chrome window will open. If not logged into LinkedIn, the script pauses and waits for you to log in manually, then resumes autonomously.

## Architecture

```
Orchestrator (job-agent.ts)
  └── Finder (finder.ts)        — Stagehand extract() → top 2 Easy Apply jobs
  └── Applicator (applicator.ts) × 2 jobs
        ├── Layer 1: Claude Sonnet — reads a11y snapshot + profile → fill plan
        └── Layer 2: Stagehand act() — visually locates elements → types/clicks
```

No CSS selectors. No heuristics. No field classifiers.

## Output

- `results.json` — applied/skipped/error status per job
- `screenshots/*.png` — proof of submission for each job
