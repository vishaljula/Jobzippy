# Google OAuth Setup Guide

This guide will help you set up Google OAuth 2.0 for Jobzippy.

---

## Prerequisites

- Google Account
- Chrome extension loaded in developer mode

---

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **"Select a project"** → **"New Project"**
3. Name: `Jobzippy` (or your preferred name)
4. Click **"Create"**

---

## Step 2: Enable Required APIs

1. In your project, go to **"APIs & Services"** → **"Library"**
2. Search and enable these APIs:
   - ✅ **Google Drive API**
   - ✅ **Google Sheets API**
   - ✅ **Gmail API** (optional, for email sync)

---

## Step 3: Configure OAuth Consent Screen

1. Go to **"APIs & Services"** → **"OAuth consent screen"**
2. Select **"External"** (or Internal if you have Google Workspace)
3. Click **"Create"**

### Fill in the required fields:

**App information:**
- App name: `Jobzippy`
- User support email: Your email
- App logo: Upload your logo (optional)

**App domain (optional but recommended):**
- Application home page: Your website URL
- Privacy policy: Your privacy policy URL
- Terms of service: Your TOS URL

**Developer contact information:**
- Email addresses: Your email

4. Click **"Save and Continue"**

### Add Scopes:

Click **"Add or Remove Scopes"** and add:

**Required:**
- `.../auth/userinfo.email`
- `.../auth/userinfo.profile`
- `openid`
- `.../auth/drive.file`
- `.../auth/spreadsheets`

**Optional (for email sync):**
- `.../auth/gmail.readonly`

5. Click **"Update"** → **"Save and Continue"**

### Add Test Users (for development):

- Add your Google email as a test user
- Click **"Save and Continue"**

---

## Step 4: Create OAuth 2.0 Client ID

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. Application type: **"Chrome Extension"** or **"Web application"**

### For Chrome Extension:

**Important:** You need your extension ID first!

#### Get Your Extension ID:

1. Go to `chrome://extensions/`
2. Find Jobzippy
3. Copy the **ID** (e.g., `abcdefghijklmnopqrstuvwxyz123456`)

#### Configure OAuth Client:

- Application type: **Chrome Extension**
- Name: `Jobzippy Chrome Extension`
- Item ID: Paste your extension ID

**OR** if using Web application type:

- Application type: **Web application**
- Name: `Jobzippy Chrome Extension`
- Authorized redirect URIs:
  ```
  https://<YOUR_EXTENSION_ID>.chromiumapp.org/
  ```

4. Click **"Create"**
5. Copy the **Client ID** (e.g., `123456789-abc.apps.googleusercontent.com`)

---

## Step 5: Configure Extension

Update the OAuth client ID in the code:

### Option A: Using Environment Variables (Recommended)

Create a `.env` file in the project root:

```env
VITE_GOOGLE_CLIENT_ID=YOUR_CLIENT_ID_HERE.apps.googleusercontent.com
```

### Option B: Hardcode (for testing only)

Edit `src/lib/config.ts`:

```typescript
export const GOOGLE_OAUTH_CONFIG = {
  clientId: 'YOUR_CLIENT_ID_HERE.apps.googleusercontent.com',
  // ...
```

---

## Step 6: Rebuild and Test

1. **Rebuild the extension:**
   ```bash
   npm run build
   ```

2. **Reload extension** in Chrome:
   - Go to `chrome://extensions/`
   - Click refresh icon on Jobzippy

3. **Test OAuth flow:**
   - Open Jobzippy side panel
   - Click **"Sign in with Google"**
   - You should see Google's consent screen
   - Authorize the requested permissions
   - You should be redirected back and see your profile

---

## Troubleshooting

### Error: "redirect_uri_mismatch"

**Problem:** The redirect URI doesn't match what's configured in Google Cloud Console.

**Fix:**
1. Check your extension ID matches the one in OAuth client configuration
2. Redirect URI format must be: `https://<extension-id>.chromiumapp.org/`
3. Update the OAuth client in Google Cloud Console

### Error: "access_denied"

**Problem:** User canceled the flow or doesn't have permission.

**Fix:**
- Try again
- Make sure test user is added in OAuth consent screen (for development)

### Error: "invalid_client"

**Problem:** Client ID is incorrect or doesn't match the extension.

**Fix:**
- Double-check the client ID in `src/lib/config.ts` or `.env`
- Make sure you're using the correct OAuth client

### Extension ID Changes

**Problem:** Extension ID changes when you upload to Chrome Web Store.

**Fix:**
- During development, ID is stable (tied to local folder)
- When publishing, get the new ID from Chrome Web Store
- Update OAuth client redirect URI with new ID
- Rebuild extension with updated redirect URI

---

## Required Scopes Explained

| Scope | Purpose |
|-------|---------|
| `openid email profile` | Identify user and get basic info |
| `drive.file` | Create and access files **we create** (your Jobzippy Sheet) |
| `spreadsheets` | Read and write **your** Jobzippy Sheet |
| `gmail.readonly` (optional) | Read **metadata only** from chosen label |

**Privacy:** We follow the principle of least privilege. We only request access to files we create, not all your Drive files.

---

## For Production

Before publishing to Chrome Web Store:

1. **Submit for OAuth Verification**
   - Google requires verification for sensitive scopes
   - Process takes 4-6 weeks
   - Required documents: Privacy policy, TOS, demo video

2. **Update Redirect URI**
   - Get extension ID from Chrome Web Store
   - Update OAuth client redirect URI
   - Rebuild extension with new client ID

3. **Move to Production**
   - Remove test users restriction
   - OAuth consent screen goes live
   - All users can sign in

---

## Security Notes

- ✅ PKCE prevents authorization code interception
- ✅ State parameter prevents CSRF attacks
- ✅ Tokens stored in chrome.storage.local (encrypted by Chrome)
- ✅ Refresh tokens allow offline access
- ✅ Tokens can be revoked by user in Google Account settings

---

**Need Help?**

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Chrome Extension OAuth](https://developer.chrome.com/docs/extensions/mv3/tut_oauth/)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)

