import app from './app.js';
import { config } from './config.js';
import { initializeFirebaseAdmin } from './services/firebase-admin.js';

// Initialize Firebase Admin only if configured
if (config.firebase.projectId) {
  initializeFirebaseAdmin();
  console.log('[API] Firebase Admin initialized');
} else {
  console.log('[API] Firebase Admin skipped (no config)');
}

const port = config.server.port;

app.listen(port, () => {
  console.log(`[API] Server listening on port ${port}`);
});

