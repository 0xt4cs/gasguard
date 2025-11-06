(function() {
    'use strict';
    
    // Only check if user is authenticated
    if (!window.isAuthenticated || !window.isAuthenticated()) {
        return;
    }
    
    // Check retention status on page load
    async function checkDataRetention() {
        try {
            const token = window.getToken();
            if (!token) return;
            
            console.log('[DATA RETENTION] Checking retention policy...');
            const response = await fetch('/api/retention/check-retention', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            
            if (!response.ok) return;
            
            const data = await response.json();
            console.log('[DATA RETENTION] Policy received:', data.retentionPolicy);
            console.log('[DATA RETENTION] Warnings:', data.warnings);
            
            if (data.hasWarning && data.warnings.length > 0) {
                showRetentionWarning(data.warnings, data.retentionPolicy);
            } else {
                console.log('[DATA RETENTION] No warnings to display');
            }
        } catch (error) {
            console.error('[DATA RETENTION ERROR] Failed to check data retention:', error);
        }
    }

    // Show retention warning banner    
    function showRetentionWarning(warnings, policy) {
        // Don't show warning if retention is set to "never" (-1)
        if (policy.days === -1) {
            return;
        }

        const minDays = Math.min(...warnings.map(w => w.daysUntilDeletion));
        const totalRecords = warnings.reduce((sum, w) => sum + w.recordCount, 0);
        
        const retentionText = policy.days === -1 
            ? 'data retention disabled' 
            : `${policy.days}-day retention policy`;
        
        const banner = document.createElement('div');
        banner.id = 'data-retention-banner';
        banner.className = 'alert alert-warning shadow-lg mb-4';
        banner.innerHTML = `
            <div>
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                    <h3 class="font-bold">Data Retention Notice</h3>
                    <div class="text-sm">
                        <p class="mb-1">
                            <strong>${totalRecords.toLocaleString()} record${totalRecords > 1 ? 's' : ''}</strong> will be automatically deleted in 
                            <strong class="text-warning-content">${minDays} day${minDays > 1 ? 's' : ''}</strong> 
                            as per the ${retentionText}.
                        </p>
                        <details class="mt-2">
                            <summary class="cursor-pointer hover:text-warning-content">View details</summary>
                            <ul class="list-disc list-inside mt-2 space-y-1">
                                ${warnings.map(w => `<li>${w.message}</li>`).join('')}
                            </ul>
                        </details>
                    </div>
                </div>
            </div>
            <div class="flex-none">
                <button class="btn btn-sm btn-ghost" onclick="document.getElementById('data-retention-banner').remove()">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>
        `;
        
        const mainContent = document.querySelector('main');
        if (mainContent) {
            const container = mainContent.querySelector('div');
            if (container) {
                container.insertBefore(banner, container.firstChild);
            }
        }
        
        console.log(`[DATA RETENTION] Warning shown: ${minDays} days until deletion`);
    }
    
    // Run check after a short delay to ensure page is loaded
    setTimeout(checkDataRetention, 1500);
})();

