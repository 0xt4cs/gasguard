(function() {
    'use strict';

    // ==================== Confirmation Modal System ====================
    let confirmResolve = null;
    
    window.showConfirm = function(message, buttonText = 'Confirm', isDangerous = false) {
        return new Promise((resolve) => {
            const confirmModal = document.getElementById('confirm-modal');
            const confirmMessage = document.getElementById('confirm-message');
            const confirmBtn = document.getElementById('confirm-btn');
            
            if (!confirmModal || !confirmMessage || !confirmBtn) {
                console.warn('Confirmation modal elements not found');
                resolve(true); // Default to true if modal not available
                return;
            }
            
            confirmMessage.textContent = message;
            confirmBtn.textContent = buttonText;
            confirmBtn.className = isDangerous ? 'btn btn-error' : 'btn btn-warning';
            confirmResolve = resolve;
            confirmModal.showModal();
        });
    };
    
    window.confirmAction = function() {
        if (confirmResolve) {
            confirmResolve(true);
            confirmResolve = null;
        }
        const confirmModal = document.getElementById('confirm-modal');
        if (confirmModal) confirmModal.close();
    };
    
    window.cancelAction = function() {
        if (confirmResolve) {
            confirmResolve(false);
            confirmResolve = null;
        }
        const confirmModal = document.getElementById('confirm-modal');
        if (confirmModal) confirmModal.close();
    };

    // ==================== Toast Notification System ====================
    window.showToast = function(message, type = 'info') {
        const toastContainer = document.getElementById('toast-container') || createToastContainer();
        const toastId = 'toast-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        // Icon based on type
        let icon = '';
        let alertClass = 'alert-info';
        
        switch(type) {
            case 'success':
                icon = '<svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
                alertClass = 'alert-success';
                break;
            case 'error':
                icon = '<svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
                alertClass = 'alert-error';
                break;
            case 'warning':
                icon = '<svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
                alertClass = 'alert-warning';
                break;
            default:
                icon = '<svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
                alertClass = 'alert-info';
        }
        
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `alert ${alertClass} shadow-lg mb-2 toast-item`;
        toast.style.cssText = 'animation: slideInRight 0.3s ease-out; cursor: pointer; position: relative; user-select: none;';
        toast.innerHTML = `
            <div class="flex items-center gap-3 w-full">
                ${icon}
                <span class="flex-1">${message}</span>
                <button class="btn btn-ghost btn-sm btn-circle" onclick="closeToast('${toastId}')" aria-label="Close">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
        `;
        
        // Add swipe-to-dismiss functionality
        let startX = 0;
        let currentX = 0;
        let isDragging = false;
        
        toast.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return; 
            isDragging = true;
            startX = e.clientX;
            toast.style.transition = 'none';
        });
        
        toast.addEventListener('touchstart', (e) => {
            if (e.target.closest('button')) return;
            isDragging = true;
            startX = e.touches[0].clientX;
            toast.style.transition = 'none';
        });
        
        const handleMove = (clientX) => {
            if (!isDragging) return;
            currentX = clientX - startX;
            if (currentX > 0) {
                toast.style.transform = `translateX(${currentX}px)`;
                toast.style.opacity = Math.max(0, 1 - (currentX / 200));
            }
        };
        
        toast.addEventListener('mousemove', (e) => handleMove(e.clientX));
        toast.addEventListener('touchmove', (e) => handleMove(e.touches[0].clientX));
        
        const handleEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            
            if (currentX > 100) { 
                closeToast(toastId);
            } else { 
                toast.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
                toast.style.transform = 'translateX(0)';
                toast.style.opacity = '1';
            }
            currentX = 0;
        };
        
        toast.addEventListener('mouseup', handleEnd);
        toast.addEventListener('mouseleave', handleEnd);
        toast.addEventListener('touchend', handleEnd);
        
        toastContainer.appendChild(toast);
        
        setTimeout(() => closeToast(toastId), 3000);
    };
    
    function createToastContainer() {
        const container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position: fixed; bottom: 1rem; right: 1rem; z-index: 9999; display: flex; flex-direction: column-reverse; gap: 0.5rem; pointer-events: none; max-width: 500px;';
        document.body.appendChild(container);
        return container;
    }
    
    window.closeToast = function(toastId) {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.style.transition = 'transform 0.3s ease, opacity 0.3s ease';
            toast.style.transform = 'translateX(400px)';
            toast.style.opacity = '0';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }
    };

    console.log('Shared modals initialized');
})();
