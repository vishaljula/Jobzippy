import app from './app.js';
import { config } from './config.js';
import { initializeFirebaseAdmin } from './services/firebase-admin.js';

// Initialize Firebase Admin on startup
initializeFirebaseAdmin();
console.log('[API] Firebase Admin initialized');

const port = config.server.port;

app.listen(port, () => {
  console.log(`[API] Server listening on port ${port}`);
});

