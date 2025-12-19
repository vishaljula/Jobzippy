# Google Sheets Backup System

## Overview

Jobzippy now has a **Google Sheets backup system** that automatically backs up your profile and job application data. This protects against data loss if you clear browser data or switch devices.

## Architecture

### Data Flow

```
┌─────────────────┐
│  IndexedDB      │ ← Runtime source of truth (fast)
│  - Profile      │
│  - Jobs         │
└────────┬────────┘
         │
         │ Sync on save
         ▼
┌─────────────────┐
│ Google Sheets   │ ← Persistent backup (survives data loss)
│  - Profile tab  │
│  - Jobs tab     │
│  - Metadata tab │
└─────────────────┘
```

### Startup Flow

```
1. Extension loads
   ↓
2. Check IndexedDB for profile
   ├─ Found? → Load dashboard
   └─ Empty? → Check Google Sheets backup
       ├─ Found? → Restore to IndexedDB → Load dashboard
       └─ Empty? → Show onboarding chat
```

## Google Sheets Structure

**One spreadsheet with 3 tabs:**

### Tab 1: "Vault"
Stores **encrypted** user onboarding data (secure backup)

| Store | IV | Ciphertext | Last Updated |
|-------|----|-----------|--------------|
| profile | uZeaWulk4X7e9SgW | BMRDEoPGjqJCO5n814I3e9QNEDcp4m3n... | 2025-12-01T21:00:00Z |
| compliance | xDmXqNZSOfhwbNjl | NZh9vU/XWLN32TgmaezGyuW0iBxXrHPf... | 2025-12-01T21:00:00Z |
| history | 5KXgiZEP42d2SCUz | mjnnlSyrfEzu/xqSjeKzkEJDHyuSv3DI... | 2025-12-01T21:00:00Z |
| policies | M4mF7LGH3kp/eLsm | GFP4jhUzWvEAWdxN/wmQfet7lQ0rSzq5... | 2025-12-01T21:00:00Z |
| _salt | | HobMjxz2wz5TP3Mk | 2025-12-01T21:00:00Z |

### Tab 2: "Jobs"
All job application records

| ID | Platform | Job ID | Title | Company | Location | Status | Attempts | Created At | Updated At | ... |
|----|----------|--------|-------|---------|----------|--------|----------|------------|------------|-----|
| linkedin::123456 | linkedin | 123456 | Senior Engineer | TechCorp | SF, CA | completed | 2 | 2025-12-01... | ... | ... |

### Tab 3: "Metadata"
System metadata

| Key | Value | Last Updated |
|-----|-------|--------------|
| onboarding_status | {"status":"completed",...} | 2025-12-01T21:00:00Z |
| user_id | 106634177654431483199 | 2025-12-01T21:00:00Z |
| backup_sheet_id | 1a2b3c4d5e... | 2025-12-01T21:00:00Z |
| user_info | {"email":"user@example.com","name":"John Doe",...} | 2025-12-01T21:00:00Z |
| last_backup | 2025-12-01T21:00:00Z | 2025-12-01T21:00:00Z |

## Implementation Files

### Core Files

1. **`ui/src/lib/sheets-backup.ts`**
   - `backupToSheets()` - Full backup to Google Sheets
   - `restoreFromSheets()` - Full restore from Google Sheets
   - `hasBackup()` - Check if backup exists

2. **`ui/src/lib/startup-restore.ts`**
   - `checkStartupState()` - Check IndexedDB state
   - `attemptRestore()` - Try to restore from backup
   - `runStartupFlow()` - Main startup logic

3. **`ui/src/lib/data-export.ts`**
   - `exportAllData()` - Export all data to logs (debugging)

### Type Updates

- Added `backupSheetId` to `ExtensionStorage` interface

## Usage

### Backup (Manual)

```typescript
import { backupToSheets } from '@/lib/sheets-backup';

// After user completes onboarding or applies to jobs
await backupToSheets(accessToken, profileVault);
```

### Restore (Automatic on startup)

```typescript
import { runStartupFlow } from '@/lib/startup-restore';

// In App.tsx or main entry point
const route = await runStartupFlow(accessToken);
// Returns 'dashboard' or 'onboarding'
```

### Check Backup Status

```typescript
import { hasBackup } from '@/lib/sheets-backup';

const exists = await hasBackup(accessToken);
```

## Sync Strategy

### When to Backup

1. **After onboarding completes** - Save profile data
2. **After each job application** - Update jobs list
3. **On settings change** - Update profile preferences
4. **Manual backup button** - User-triggered

### When to Restore

1. **On extension startup** - If IndexedDB is empty
2. **Manual restore button** - User-triggered
3. **After reinstall** - Automatic recovery

## Security

- **All vault data in Sheets is ENCRYPTED** (AES-256-GCM)
- **No password stored anywhere** - password is derived from Google user ID
- **Salt is backed up** - needed for key derivation
- **Encryption is client-side only** - no backend keys
- **OAuth tokens** are NOT backed up (security risk)
- **Onboarding chat history** is NOT backed up (too large, not critical)
- **Daily limits** are NOT backed up (resets daily)
- **Tutorial/UI state** is NOT backed up (not critical)
- **Resume file** is NOT backed up yet (TODO)

### Encryption Details

```
User Password
    ↓
PBKDF2 (250,000 iterations + salt)
    ↓
AES-256-GCM Key
    ↓
Encrypts: profile, compliance, history, policies
```

**Key Points:**
- Password is NEVER stored (only in user's memory)
- Salt is random 16-byte value stored in IndexedDB + Sheets
- Encrypted blobs are backed up AS-IS (no decryption needed)
- User must enter password again after restore to decrypt

## Future Enhancements

### Phase 2 (Post-MVP)
- [ ] Auto-sync every N minutes
- [ ] Conflict resolution (local vs remote changes)
- [ ] Backup history (multiple versions)
- [ ] Export to CSV/JSON
- [ ] Import from other job trackers

### Phase 3 (Advanced)
- [ ] Firestore real-time sync (multi-device)
- [ ] Encrypted cloud backup (E2E encryption)
- [ ] Backup to Google Drive (file-based)

## Testing

### Manual Test Flow

1. **Complete onboarding** (enter password) → Check Google Sheets created
2. **Apply to 3 jobs** → Check jobs appear in Sheets
3. **Clear IndexedDB** → Reload extension → Verify restore
4. **Enter password** → Verify vault decrypts successfully
5. **Check dashboard** → Verify jobs + profile loaded

### Console Commands

```javascript
// Export all data to logs
await exportJobzippyData()

// Check startup state
const state = await checkStartupState()
console.log(state)

// Manual backup (no password needed!)
await backupToSheets(accessToken)

// Manual restore (writes encrypted data to IndexedDB)
const data = await restoreFromSheets(accessToken, sheetId)
// User still needs to enter password to decrypt
```

## Troubleshooting

### "No backup found"
- Check if `backupSheetId` exists in chrome.storage
- Verify Google Sheets API permissions
- Check OAuth token is valid

### "Restore failed"
- Check network connection
- Verify sheet ID is correct
- Check sheet has correct tab names

### "Data mismatch after restore"
- Check timestamp in Metadata tab
- Verify no manual edits to sheet structure
- Re-run backup to sync latest data

## Notes

- **IndexedDB is always the source of truth** during runtime
- **Google Sheets is the backup** for disaster recovery
- **Sync is one-way** (IndexedDB → Sheets) for MVP
- **No automatic sync** - manual triggers only for MVP
