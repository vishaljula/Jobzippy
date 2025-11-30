/**
 * Debug script to inspect IndexedDB job records
 * Run this in the browser console after the agent completes
 */

async function debugJobDatabase() {
    console.log('========== JOBZIPPY DATABASE DEBUG ==========');

    // Open IndexedDB
    const dbName = 'JobzippyDB';
    const storeName = 'jobs';

    const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open(dbName);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    // Get all jobs
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const allJobs = await new Promise((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });

    console.log(`\nTotal jobs in database: ${allJobs.length}\n`);

    // Group by status
    const byStatus = {};
    allJobs.forEach(job => {
        if (!byStatus[job.status]) {
            byStatus[job.status] = [];
        }
        byStatus[job.status].push(job);
    });

    // Print summary
    console.log('Jobs by status:');
    Object.keys(byStatus).forEach(status => {
        console.log(`  ${status}: ${byStatus[status].length}`);
    });

    // Print detailed job list
    console.log('\n========== JOB DETAILS ==========\n');
    allJobs.forEach((job, index) => {
        console.log(`Job ${index + 1}:`);
        console.log(`  Database ID: ${job.id}`);
        console.log(`  Platform: ${job.platform}`);
        console.log(`  Job ID: ${job.jobId}`);
        console.log(`  Title: ${job.title}`);
        console.log(`  Company: ${job.company}`);
        console.log(`  Status: ${job.status}`);
        console.log(`  URL: ${job.url || 'N/A'}`);
        console.log(`  Apply Type: ${job.applyType || 'unknown'}`);
        console.log(`  Created: ${new Date(job.createdAt).toISOString()}`);
        console.log('');
    });

    // Print just the IDs for easy verification
    console.log('========== JOB IDS ONLY ==========\n');
    allJobs.forEach((job, index) => {
        console.log(`${index + 1}. ${job.id} (jobId: ${job.jobId}, status: ${job.status})`);
    });

    console.log('\n========== END DEBUG ==========');

    return allJobs;
}

// Run the debug function
debugJobDatabase().catch(console.error);
