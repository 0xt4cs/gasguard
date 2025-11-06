(function() {
    'use strict';

    // ===== SHARED UTILITY FUNCTIONS =====
    // These are exposed globally for use across all pages
    
    /**
     * Get authentication token from localStorage
     * @returns {string|null} JWT token or null if not found
     */
    window.getToken = function() {
        return localStorage.getItem('token');
    };

    /**
     * Get user object from localStorage
     * @returns {object|null} User object or null if not found
     */
    window.getUser = function() {
        try {
            const userStr = localStorage.getItem('user');
            return userStr ? JSON.parse(userStr) : null;
        } catch (error) {
            console.error('Error parsing user from localStorage:', error);
            return null;
        }
    };

    /**
     * Check if user is authenticated
     * @returns {boolean} True if user has valid token
     */
    window.isAuthenticated = function() {
        return !!window.getToken();
    };

    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const themeToggle = document.getElementById('theme-toggle');
    const themeToggleDropdown = document.getElementById('theme-toggle-dropdown');
    const currentTimeEl = document.getElementById('current-time');
    const userDropdown = document.getElementById('user-dropdown');
    const getAvatarLetter = (username) => {
        if (!username || username.length === 0) return '?';
        return username.charAt(0).toUpperCase();
    };

    const getFormattedRole = (role) => {
        if (role === 'admin') return 'Administrator';
        return 'Regular User';
    };

    const updateThemeStatus = (isDark) => {
        const themeStatusEl = document.getElementById('theme-status');
        if (themeStatusEl) {
            themeStatusEl.textContent = isDark ? 'Dark Mode' : 'Light Mode';
        }
    };

    const initTheme = () => {
        const theme = localStorage.getItem('theme') || 'light';
        const isDark = theme === 'dark';
        document.documentElement.setAttribute('data-theme', theme);
        if (themeToggle) themeToggle.checked = isDark;
        if (themeToggleDropdown) themeToggleDropdown.checked = isDark;
        updateThemeStatus(isDark);
    };

    const handleThemeChange = (isDark) => {
        const theme = isDark ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        if (themeToggle) themeToggle.checked = isDark;
        if (themeToggleDropdown) themeToggleDropdown.checked = isDark;
        updateThemeStatus(isDark);
    };

    if (themeToggle) {
        themeToggle.addEventListener('change', (e) => {
            handleThemeChange(e.target.checked);
        });
    }

    if (themeToggleDropdown) {
        themeToggleDropdown.addEventListener('change', (e) => {
            handleThemeChange(e.target.checked);
        });
    }

    const updateClock = () => {
        if (!currentTimeEl) return;
        const now = new Date();
        const newTime = now.toLocaleString('en-US', {
            month: '2-digit',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        });
        
        if (currentTimeEl.textContent !== newTime) {
            currentTimeEl.textContent = newTime;
        }
    };

    const toggleElements = (selector, show) => {
        const elements = document.querySelectorAll(selector);
        for (let i = 0; i < elements.length; i++) {
            elements[i].classList.toggle('hidden', !show);
        }
    };

    window.updateUIForLoggedInUser = function(user) {
        if (loginBtn) loginBtn.classList.add('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');

        if (userDropdown) {
            userDropdown.classList.remove('hidden');
            
            const avatarLetter = getAvatarLetter(user.username);
            const avatarLetterEl = document.getElementById('user-avatar-letter');
            const dropdownAvatarLetterEl = document.getElementById('user-dropdown-avatar-letter');
            if (avatarLetterEl) avatarLetterEl.textContent = avatarLetter;
            if (dropdownAvatarLetterEl) dropdownAvatarLetterEl.textContent = avatarLetter;
            
            const usernameEl = document.getElementById('user-dropdown-username');
            if (usernameEl) usernameEl.textContent = user.username;
            
            const roleEl = document.getElementById('user-dropdown-role');
            if (roleEl) {
                roleEl.textContent = getFormattedRole(user.role);
            }
        }

        toggleElements('.user-only', true);
        if (user.role === 'admin') toggleElements('.admin-only', true);
        
        setTimeout(() => {
            toggleElements('.user-only', true);
            if (user.role === 'admin') toggleElements('.admin-only', true);
        }, 100);
    };

    window.updateUIForLoggedOutUser = function() {
        if (loginBtn) loginBtn.classList.remove('hidden');
        if (logoutBtn) logoutBtn.classList.add('hidden');
        
        if (userDropdown) {
            userDropdown.classList.add('hidden');
        }
        
        toggleElements('.user-only', false);
        toggleElements('.admin-only', false);
    };

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            const loginModal = document.getElementById('login-modal');
            if (loginModal) {
                loginModal.showModal();
                const loginError = document.getElementById('login-error');
                if (loginError) loginError.classList.add('hidden');
                const loginForm = document.getElementById('login-form');
                if (loginForm) loginForm.reset();
            }
        });
    }

    const handleLogout = async () => {
        if (typeof showConfirm === 'function') {
            const confirmed = await showConfirm(
                'Are you sure you want to logout?',
                'Logout',
                true  // Make it red/dangerous
            );
            if (!confirmed) return;
        }
        
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/';
    };

    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }

    const logoutBtnDropdown = document.getElementById('logout-btn-dropdown');
    if (logoutBtnDropdown) {
        logoutBtnDropdown.addEventListener('click', handleLogout);
    }

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('username').value;
            const password = document.getElementById('password').value;
            const loginError = document.getElementById('login-error');
            const loginModal = document.getElementById('login-modal');

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ username, password })
                });

                const data = await response.json();

                if (response.ok) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));

                    if (loginModal) loginModal.close();
                    window.updateUIForLoggedInUser(data.user);

                    if (typeof showToast === 'function') {
                        showToast(`Welcome back, ${data.user.username}!`, 'success');
                    }
                } else {
                    if (loginError) {
                        loginError.classList.remove('hidden');
                        
                        if (data.lockout && data.lockout.locked) {
                            loginError.querySelector('span').textContent = data.lockout.message;
                            loginError.classList.remove('alert-error');
                            loginError.classList.add('alert-warning');
                        } else {
                            let errorMsg = data.error || 'Invalid credentials';
                            if (data.attemptsRemaining !== undefined) {
                                errorMsg += ` (${data.attemptsRemaining} attempt${data.attemptsRemaining !== 1 ? 's' : ''} remaining)`;
                            }
                            loginError.querySelector('span').textContent = errorMsg;
                            loginError.classList.remove('alert-warning');
                            loginError.classList.add('alert-error');
                        }
                    }
                }
            } catch (error) {
                console.error('Login error:', error);
                if (loginError) {
                    loginError.classList.remove('hidden');
                    loginError.querySelector('span').textContent = 'Connection error. Please try again.';
                }
            }
        });
    }

    const checkSession = () => {
        const token = window.getToken();
        const user = window.getUser();

        if (token && user) {
            window.updateUIForLoggedInUser(user);
        } else {
            window.updateUIForLoggedOutUser();
        }
    };

    const initialize = () => {
        initTheme();
        checkSession();
        if (currentTimeEl) {
            updateClock();
            setInterval(updateClock, 1000);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        initialize();
    }
})();
