// Theme Management System for Hu Lab @ PolyU
class ThemeManager {
    constructor() {
        this.currentTheme = this.loadTheme();
        this.init();
    }

    init() {
        // Apply saved theme
        this.applyTheme(this.currentTheme);
        
        // Create theme toggle button
        this.createThemeToggle();
        
        // Listen for system theme changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addListener(this.handleSystemThemeChange.bind(this));
        }
    }

    createThemeToggle() {
        const toggle = document.createElement('div');
        toggle.className = 'theme-toggle tooltip';
        toggle.setAttribute('data-tooltip', 'Switch theme');
        toggle.innerHTML = `
            <div class="theme-toggle-slider">
                <span class="theme-toggle-icon">${this.currentTheme === 'dark' ? '🌙' : '☀️'}</span>
            </div>
        `;
        
        if (this.currentTheme === 'light') {
            toggle.classList.add('light');
        }
        
        toggle.addEventListener('click', () => {
            this.toggleTheme();
        });
        
        document.body.appendChild(toggle);
        this.toggleElement = toggle;
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        this.currentTheme = theme;
        this.applyTheme(theme);
        this.saveTheme(theme);
        this.updateToggleUI();
        
        // Emit theme change event
        document.dispatchEvent(new CustomEvent('themeChanged', { 
            detail: { theme } 
        }));
    }

    applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        
        // Update CSS custom properties for smooth transitions
        const root = document.documentElement;
        
        if (theme === 'light') {
            root.style.setProperty('--bg-primary', 'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)');
            root.style.setProperty('--bg-secondary', 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)');
        } else {
            root.style.setProperty('--bg-primary', 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)');
            root.style.setProperty('--bg-secondary', 'linear-gradient(135deg, #2d1b69 0%, #11052c 100%)');
        }
    }

    updateToggleUI() {
        if (this.toggleElement) {
            const icon = this.toggleElement.querySelector('.theme-toggle-icon');
            
            if (this.currentTheme === 'light') {
                this.toggleElement.classList.add('light');
                icon.textContent = '☀️';
                this.toggleElement.setAttribute('data-tooltip', 'Switch to dark theme');
            } else {
                this.toggleElement.classList.remove('light');
                icon.textContent = '🌙';
                this.toggleElement.setAttribute('data-tooltip', 'Switch to light theme');
            }
        }
    }

    loadTheme() {
        const saved = localStorage.getItem('hulab_theme');
        if (saved) {
            return saved;
        }
        
        // Check system preference
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
            return 'light';
        }
        
        return 'dark'; // Default
    }

    saveTheme(theme) {
        localStorage.setItem('hulab_theme', theme);
    }

    handleSystemThemeChange(e) {
        if (!localStorage.getItem('hulab_theme')) {
            // Only follow system if user hasn't manually set a theme
            this.setTheme(e.matches ? 'dark' : 'light');
        }
    }
}

// Initialize theme manager when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    if (!window.themeManager) {
        window.themeManager = new ThemeManager();
    }
});

// Export for use in other modules
window.ThemeManager = ThemeManager;