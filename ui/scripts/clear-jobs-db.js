/**
 * Console script to clear the jobs IndexedDB
 * 
 * Run this in the browser console (sidepanel DevTools or background worker console)
 * 
 * Usage:
 * 1. Open sidepanel DevTools (right-click sidepanel → Inspect)
 * 2. Paste this entire script into the console
 * 3. Press Enter
 */

(async function clearJobsDB() {
  try {
    const dbName = 'JobzippyJobs';
    const storeName = 'jobs';
    
    console.log(`[ClearJobsDB] Opening database: ${dbName}...`);
    
    // Open the database
    const request = indexedDB.open(dbName, 1);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);
      
      console.log(`[ClearJobsDB] Clearing store: ${storeName}...`);
      
      const clearRequest = store.clear();
      
      clearRequest.onsuccess = () => {
        console.log(`[ClearJobsDB] ✓ Successfully cleared all jobs from IndexedDB`);
        db.close();
      };
      
      clearRequest.onerror = (err) => {
        console.error(`[ClearJobsDB] ✗ Error clearing store:`, err);
        db.close();
      };
    };
    
    request.onerror = (err) => {
      console.error(`[ClearJobsDB] ✗ Error opening database:`, err);
    };
    
    request.onupgradeneeded = (event) => {
      // Database doesn't exist yet, nothing to clear
      console.log(`[ClearJobsDB] Database doesn't exist yet, nothing to clear`);
      event.target.result.close();
    };
    
  } catch (error) {
    console.error(`[ClearJobsDB] ✗ Error:`, error);
  }
})();

