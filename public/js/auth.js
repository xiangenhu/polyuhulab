/**
 * Authentication UI Handler for Hu Lab Portal
 * Handles login, logout, session management, and user interface updates
 * Integrates with xAPI tracking and provides loading state management
 */

class AuthManager {
    constructor() {
        this.isAuthenticated = false;
        this.currentUser = null;
        this.socket = null;
        this.xapi = window.XAPIClient || null;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.checkAuthStatus();
        this.setupSocketConnection();
        this.trackPageLoad();
    }

    /**
     * Bind UI event listeners
     */
    bindEvents() {
        // Login button handlers
        $(document).on('click', '.login-btn', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Logout button handlers
        $(document).on('click', '.logout-btn', (e) => {
            e.preventDefault();
            this.handleLogout();
        });

        // Profile dropdown toggles
        $(document).on('click', '.profile-dropdown-toggle', (e) => {
            e.preventDefault();
            this.toggleProfileDropdown();
        });

        // Close dropdown when clicking outside
        $(document).on('click', (e) => {
            if (!$(e.target).closest('.profile-dropdown').length) {
                $('.profile-dropdown-menu').removeClass('show');
            }
        });

        // Session timeout warning
        this.setupSessionTimeoutWarning();
    }

    /**
     * Handle login process
     */
    async handleLogin() {
        const loginBtn = $('.login-btn');
        const originalText = loginBtn.text();
        
        try {
            // Show loading state
            this.setLoadingState(loginBtn, 'Signing in...');
            
            // Track login attempt
            if (this.xapi) {
                this.xapi.track('attempted', 'http://adlnet.gov/expapi/verbs/attempted', {
                    type: 'authentication',
                    action: 'login'
                });
            }

            // Redirect to Google OAuth
            window.location.href = '/auth/google';
            
        } catch (error) {
            console.error('Login error:', error);
            this.showError('Login failed. Please try again.');
            
            // Track login failure
            if (this.xapi) {
                this.xapi.track('failed', 'http://adlnet.gov/expapi/verbs/failed', {
                    type: 'authentication',
                    action: 'login',
                    error: error.message
                });
            }
        } finally {
            this.removeLoadingState(loginBtn, originalText);
        }
    }

    /**
     * Handle logout process
     */
    async handleLogout() {
        const logoutBtn = $('.logout-btn');
        const originalText = logoutBtn.text();
        
        try {
            // Show loading state
            this.setLoadingState(logoutBtn, 'Signing out...');
            
            // Track logout attempt
            if (this.xapi) {
                this.xapi.track('exited', 'http://adlnet.gov/expapi/verbs/exited', {
                    type: 'session',
                    action: 'logout',
                    sessionDuration: this.getSessionDuration()
                });
            }

            const response = await $.ajax({
                url: '/auth/logout',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.success) {
                this.handleLogoutSuccess();
            } else {
                throw new Error(response.message || 'Logout failed');
            }
            
        } catch (error) {
            console.error('Logout error:', error);
            this.showError('Logout failed. Please try again.');
            
            // Track logout failure
            if (this.xapi) {
                this.xapi.track('failed', 'http://adlnet.gov/expapi/verbs/failed', {
                    type: 'authentication',
                    action: 'logout',
                    error: error.message
                });
            }
        } finally {
            this.removeLoadingState(logoutBtn, originalText);
        }
    }

    /**
     * Check current authentication status
     */
    async checkAuthStatus() {
        try {
            const response = await $.ajax({
                url: '/auth/status',
                method: 'GET'
            });

            if (response.authenticated) {
                this.handleAuthSuccess(response.user);
            } else {
                this.handleAuthFailure();
            }
            
        } catch (error) {
            console.error('Auth status check error:', error);
            this.handleAuthFailure();
        }
    }

    /**
     * Handle successful authentication
     */
    handleAuthSuccess(user) {
        this.isAuthenticated = true;
        this.currentUser = user;
        
        this.updateUI();
        this.storeUserSession(user);
        
        // Track successful login
        if (this.xapi) {
            this.xapi.setUser(user);
            this.xapi.track('logged-in', 'https://brindlewaye.com/xAPITerms/verbs/loggedin/', {
                type: 'session',
                user: {
                    id: user.id,
                    email: user.email,
                    name: user.name
                }
            });
        }

        // Show welcome message
        this.showSuccess(`Welcome back, ${user.firstName || user.name}!`);
        
        // Emit to socket if connected
        if (this.socket && this.socket.connected) {
            this.socket.emit('user-authenticated', user);
        }
    }

    /**
     * Handle authentication failure
     */
    handleAuthFailure() {
        this.isAuthenticated = false;
        this.currentUser = null;
        
        this.updateUI();
        this.clearUserSession();
        
        // Redirect to login if on protected page
        if (this.isProtectedPage()) {
            this.redirectToLogin();
        }
    }

    /**
     * Handle successful logout
     */
    handleLogoutSuccess() {
        this.isAuthenticated = false;
        this.currentUser = null;
        
        this.clearUserSession();
        this.showSuccess('Successfully logged out');
        
        // Redirect to home page
        setTimeout(() => {
            window.location.href = '/';
        }, 1500);
    }

    /**
     * Update UI based on authentication state
     */
    updateUI() {
        if (this.isAuthenticated && this.currentUser) {
            // Show authenticated state
            $('.auth-required').show();
            $('.auth-hidden').hide();
            $('.login-section').hide();
            $('.user-section').show();
            
            // Update user info
            $('.user-name').text(this.currentUser.name);
            $('.user-email').text(this.currentUser.email);
            $('.user-avatar').attr('src', this.currentUser.avatar || '/images/default-avatar.png');
            
            // Update navigation
            this.updateNavigation(true);
            
        } else {
            // Show unauthenticated state
            $('.auth-required').hide();
            $('.auth-hidden').show();
            $('.login-section').show();
            $('.user-section').hide();
            
            // Update navigation
            this.updateNavigation(false);
        }
    }

    /**
     * Update navigation menu based on auth state
     */
    updateNavigation(authenticated) {
        const protectedNavItems = ['.nav-dashboard', '.nav-research', '.nav-analytics', '.nav-collaboration'];
        
        protectedNavItems.forEach(selector => {
            if (authenticated) {
                $(selector).show();
            } else {
                $(selector).hide();
            }
        });
    }

    /**
     * Toggle profile dropdown menu
     */
    toggleProfileDropdown() {
        $('.profile-dropdown-menu').toggleClass('show');
        
        // Track profile interaction
        if (this.xapi) {
            this.xapi.track('interacted', 'http://adlnet.gov/expapi/verbs/interacted', {
                type: 'ui-component',
                component: 'profile-dropdown'
            });
        }
    }

    /**
     * Setup session timeout warning
     */
    setupSessionTimeoutWarning() {
        let warningTimer;
        let logoutTimer;
        const warningTime = 23 * 60 * 1000; // 23 minutes
        const sessionTime = 24 * 60 * 60 * 1000; // 24 hours

        const resetTimers = () => {
            clearTimeout(warningTimer);
            clearTimeout(logoutTimer);
            
            if (this.isAuthenticated) {
                warningTimer = setTimeout(() => {
                    this.showSessionWarning();
                }, warningTime);
                
                logoutTimer = setTimeout(() => {
                    this.handleSessionTimeout();
                }, sessionTime);
            }
        };

        // Reset timers on user activity
        $(document).on('click keypress scroll', resetTimers);
        resetTimers();
    }

    /**
     * Show session timeout warning
     */
    showSessionWarning() {
        const modal = $(`
            <div class="modal fade" id="sessionWarningModal" tabindex="-1">
                <div class="modal-dialog">
                    <div class="modal-content">
                        <div class="modal-header">
                            <h5 class="modal-title">Session Timeout Warning</h5>
                        </div>
                        <div class="modal-body">
                            <p>Your session will expire in 1 minute due to inactivity. Would you like to extend your session?</p>
                        </div>
                        <div class="modal-footer">
                            <button type="button" class="btn btn-secondary" data-dismiss="modal">Logout</button>
                            <button type="button" class="btn btn-primary" id="extendSession">Extend Session</button>
                        </div>
                    </div>
                </div>
            </div>
        `);
        
        $('body').append(modal);
        modal.modal('show');
        
        $('#extendSession').on('click', async () => {
            await this.extendSession();
            modal.modal('hide');
        });
        
        modal.on('hidden.bs.modal', () => {
            modal.remove();
        });
    }

    /**
     * Handle session timeout
     */
    async handleSessionTimeout() {
        if (this.xapi) {
            this.xapi.track('suspended', 'http://adlnet.gov/expapi/verbs/suspended', {
                type: 'session',
                reason: 'timeout',
                sessionDuration: this.getSessionDuration()
            });
        }
        
        await this.handleLogout();
        this.showError('Your session has expired. Please log in again.');
    }

    /**
     * Extend user session
     */
    async extendSession() {
        try {
            await $.ajax({
                url: '/auth/extend-session',
                method: 'POST'
            });
            
            this.showSuccess('Session extended successfully');
            
            if (this.xapi) {
                this.xapi.track('renewed', 'http://adlnet.gov/expapi/verbs/renewed', {
                    type: 'session'
                });
            }
            
        } catch (error) {
            console.error('Session extension error:', error);
            this.showError('Failed to extend session');
        }
    }

    /**
     * Setup WebSocket connection
     */
    setupSocketConnection() {
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Socket connected');
                if (this.currentUser) {
                    this.socket.emit('user-authenticated', this.currentUser);
                }
            });
            
            this.socket.on('disconnect', () => {
                console.log('Socket disconnected');
            });
            
            this.socket.on('session-expired', () => {
                this.handleSessionTimeout();
            });
        }
    }

    /**
     * Store user session in localStorage
     */
    storeUserSession(user) {
        const sessionData = {
            user: user,
            timestamp: Date.now(),
            expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
        };
        
        localStorage.setItem('hulabSession', JSON.stringify(sessionData));
    }

    /**
     * Clear user session from localStorage
     */
    clearUserSession() {
        localStorage.removeItem('hulabSession');
    }

    /**
     * Get session duration in milliseconds
     */
    getSessionDuration() {
        const sessionData = localStorage.getItem('hulabSession');
        if (sessionData) {
            const session = JSON.parse(sessionData);
            return Date.now() - session.timestamp;
        }
        return 0;
    }

    /**
     * Check if current page requires authentication
     */
    isProtectedPage() {
        const protectedPaths = ['/dashboard', '/research', '/analytics', '/collaboration', '/assessment'];
        return protectedPaths.some(path => window.location.pathname.startsWith(path));
    }

    /**
     * Redirect to login page
     */
    redirectToLogin() {
        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/?return=${returnUrl}`;
    }

    /**
     * Track page load for xAPI
     */
    trackPageLoad() {
        if (this.xapi) {
            this.xapi.track('experienced', 'http://adlnet.gov/expapi/verbs/experienced', {
                type: 'page',
                url: window.location.href,
                title: document.title,
                referrer: document.referrer
            });
        }
    }

    /**
     * Set loading state for buttons
     */
    setLoadingState(element, loadingText = 'Loading...') {
        element.prop('disabled', true)
               .addClass('loading')
               .data('original-text', element.text())
               .html(`<span class="spinner-border spinner-border-sm me-2"></span>${loadingText}`);
    }

    /**
     * Remove loading state from buttons
     */
    removeLoadingState(element, originalText = null) {
        const text = originalText || element.data('original-text') || 'Submit';
        element.prop('disabled', false)
               .removeClass('loading')
               .html(text);
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showNotification(message, 'error');
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        const alertClass = type === 'error' ? 'alert-danger' : `alert-${type}`;
        const alert = $(`
            <div class="alert ${alertClass} alert-dismissible fade show notification-alert" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `);
        
        $('.notification-container, body').first().prepend(alert);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            alert.fadeOut(() => alert.remove());
        }, 5000);
    }
}

// Initialize authentication manager when DOM is ready
$(document).ready(() => {
    window.authManager = new AuthManager();
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AuthManager;
}