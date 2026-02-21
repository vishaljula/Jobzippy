// Run this in the browser console (F12) on any page with the extension loaded
// It will download the resume from the vault so you can inspect it

(async () => {
    try {
        console.log('Requesting resume from vault...');
        const response = await chrome.runtime.sendMessage({ type: 'GET_RESUME' });

        if (response?.status === 'success' && response?.resume?.data) {
            console.log('Resume received from vault:', {
                size: response.resume.size,
                fileName: response.resume.fileName || 'resume.pdf'
            });

            // Convert base64 to blob
            const binary = atob(response.resume.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            const blob = new Blob([bytes], { type: 'application/pdf' });

            // Create download link
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'vault-resume.pdf';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            console.log('✅ Resume downloaded as vault-resume.pdf');
            console.log('Check your Downloads folder!');
        } else {
            console.error('❌ Failed to get resume from vault:', response);
        }
    } catch (error) {
        console.error('❌ Error downloading resume:', error);
    }
})();
