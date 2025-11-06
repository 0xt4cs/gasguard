(function() {
    'use strict';
    
    const oldTheme = localStorage.getItem('gasguard-theme');
    const currentTheme = localStorage.getItem('theme');
    
    if (oldTheme && !currentTheme) {
        localStorage.setItem('theme', oldTheme);
        localStorage.removeItem('gasguard-theme');
        console.log('Migrated theme from gasguard-theme to theme');
        
        document.documentElement.setAttribute('data-theme', oldTheme);
    }
    
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
        themeToggle.checked = theme === 'dark';
    }
})();
