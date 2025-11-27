(function () {
    console.log('[Jobzippy Page Script] Initializing alert overrides...');

    const originalAlert = window.alert;
    const originalConfirm = window.confirm;

    window.alert = function (message) {
        console.log('[Jobzippy Page Script] Alert intercepted:', message);
        window.dispatchEvent(new CustomEvent('JOBZIPPY_ALERT', { detail: { message } }));
        // We suppress the native alert to prevent blocking the UI
        // originalAlert(message); 
        return true;
    };

    window.confirm = function (message) {
        console.log('[Jobzippy Page Script] Confirm intercepted:', message);
        window.dispatchEvent(new CustomEvent('JOBZIPPY_ALERT', { detail: { message } }));
        return true; // Auto-confirm
    };

    console.log('[Jobzippy Page Script] Alert overrides active.');
})();
