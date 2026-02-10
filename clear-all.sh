#!/bin/bash
# Clear all test data for fresh run
# Usage: ./clear-all.sh

echo "🧹 Clearing all test data..."
echo ""

# Clear log files
cd ui
node clear-logs.js

echo ""
echo "📋 Next steps:"
echo "1. Run this in your browser console:"
echo ""
echo "chrome.storage.local.remove('orchestrationState');"
echo "chrome.storage.local.remove('orchestrationDebugLog');"
echo "const dbRequest = indexedDB.open('JobzippyJobs', 1);"
echo "dbRequest.onsuccess = () => {"
echo "  const db = dbRequest.result;"
echo "  Array.from(db.objectStoreNames).forEach(store => {"
echo "    db.transaction([store], 'readwrite').objectStore(store).clear();"
echo "  });"
echo "  console.log('🧹 All cleared! NOW REFRESH THE EXTENSION.');"
echo "};"
echo ""
