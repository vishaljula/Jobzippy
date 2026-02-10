// === CLEAR EVERYTHING FOR FRESH TEST RUN ===
// Run this in the browser console where the extension is loaded

// 1. Clear orchestration state
chrome.storage.local.remove('orchestrationState');

// 2. Clear debug log
chrome.storage.local.remove('orchestrationDebugLog');

// 3. Clear job stores
const dbRequest = indexedDB.open('JobzippyJobs', 1);
dbRequest.onsuccess = () => {
    const db = dbRequest.result;
    Array.from(db.objectStoreNames).forEach(store => {
        db.transaction([store], 'readwrite').objectStore(store).clear();
    });
    console.log('🧹 IndexedDB cleared!');
};

// 4. Clear log files via server endpoint
(async () => {
    try {
        const response = await fetch('http://localhost:3001/clear-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                files: [
                    'agent-logs.txt',
                    'public/mocks/mock-submissions.log'
                ]
            })
        });

        if (response.ok) {
            const result = await response.json();
            console.log('✅ Log files cleared:', result.cleared);
        } else {
            console.warn('⚠️ Failed to clear log files:', await response.text());
        }
    } catch (error) {
        console.error('❌ Error clearing log files:', error);
        console.log('💡 Make sure log-server is running (npm run log-server)');
    }

    console.log('🧹 All cleared! NOW REFRESH THE EXTENSION before testing.');
})();
