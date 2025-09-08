/**
 * Hybrid Authentication Manager for Hu Lab @ PolyU
 * Supports both OAuth (via oauth.skoonline.org) and Email/Password authentication
 * Based on the design in USERMANAGEMENT.md
 */

class HybridAuthenticationManager {
    constructor() {
        this.authGateway = 'https://oauth.skoonline.org';
        this.returnUrl = window.location.origin + '/views/dashboard.html';
        this.apiBase = window.location.origin;
        this.tokenKey = 'oauth_token';  // Following docs/Oauth.md specification
        this.userKey = 'userData';
    }

    // OAuth Authentication Methods
    async loginWithOAuth(provider = 'google') {
        // Following docs/Oauth.md: use redirect_uri parameter name
        const loginUrl = `${this.authGateway}/auth/${provider}/login?redirect_uri=${encodeURIComponent(this.returnUrl)}`;
        console.log(`Initiating ${provider} OAuth login:`, loginUrl);
        window.location.href = loginUrl;
    }

    // Email Registration
    async registerWithEmail(registrationData) {
        try {
            const response = await fetch(`${this.apiBase}/auth/email/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(registrationData)
            });

            const result = await response.json();

            if (response.ok) {
                this.showMessage(result.message, 'success');
                return result;
            } else {
                throw new AuthenticationError(result.message || 'Registration failed', result.error);
            }
        } catch (error) {
            console.error('Registration error:', error);
            if (error instanceof AuthenticationError) {
                throw error;
            }
            throw new AuthenticationError('Registration failed. Please try again.');
        }
    }

    // Email Login
    async loginWithEmail(email, password) {
        try {
            const response = await fetch(`${this.apiBase}/auth/email/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const result = await response.json();

            if (response.ok) {
                // Store token and handle successful login
                localStorage.setItem(this.tokenKey, result.token);
                await this.handleSuccessfulLogin(result.user);
                return result;
            } else {
                // Handle specific error types
                switch (result.error) {
                    case 'EMAIL_NOT_VERIFIED':
                        throw new EmailNotVerifiedError(result.message, email);
                    case 'ACCOUNT_LOCKED':
                        throw new AccountLockedError(result.message, result.lockUntil);
                    default:
                        throw new AuthenticationError(result.message);
                }
            }
        } catch (error) {
            console.error('Email login error:', error);
            if (error instanceof AuthenticationError) {
                throw error;
            }
            throw new AuthenticationError('Login failed. Please try again.');
        }
    }

    // Password Reset
    async requestPasswordReset(email) {
        try {
            const response = await fetch(`${this.apiBase}/auth/password/forgot`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const result = await response.json();
            this.showMessage(result.message, 'info');
            return result;
        } catch (error) {
            console.error('Password reset error:', error);
            throw new AuthenticationError('Failed to send password reset email.');
        }
    }

    async resetPassword(token, password, confirmPassword) {
        try {
            const response = await fetch(`${this.apiBase}/auth/password/reset`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password, confirmPassword })
            });

            const result = await response.json();

            if (response.ok) {
                this.showMessage(result.message, 'success');
                // Redirect to login
                setTimeout(() => window.location.href = '/views/login.html', 2000);
            } else {
                throw new AuthenticationError(result.message || 'Password reset failed');
            }

            return result;
        } catch (error) {
            console.error('Password reset error:', error);
            if (error instanceof AuthenticationError) {
                throw error;
            }
            throw new AuthenticationError('Password reset failed. Please try again.');
        }
    }

    // Email Verification
    async verifyEmail(token) {
        try {
            const response = await fetch(`${this.apiBase}/auth/email/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });

            const result = await response.json();

            if (response.ok) {
                this.showMessage(result.message, 'success');
                // Redirect to login after verification
                setTimeout(() => window.location.href = '/views/login.html', 2000);
            } else {
                throw new AuthenticationError(result.message || 'Email verification failed');
            }

            return result;
        } catch (error) {
            console.error('Email verification error:', error);
            if (error instanceof AuthenticationError) {
                throw error;
            }
            throw new AuthenticationError('Email verification failed. Please try again.');
        }
    }

    async resendVerificationEmail(email) {
        try {
            const response = await fetch(`${this.apiBase}/auth/email/resend`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const result = await response.json();
            this.showMessage(result.message, 'info');
            return result;
        } catch (error) {
            console.error('Resend verification error:', error);
            throw new AuthenticationError('Failed to resend verification email.');
        }
    }

    // OAuth Callback Handler
    async handleOAuthCallback() {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const success = params.get('success');
        const error = params.get('error');

        if (success === 'true' && token) {
            try {
                // Store gateway token following docs/Oauth.md
                localStorage.setItem(this.tokenKey, token);
                
                // Clean the URL first as recommended in docs
                window.history.replaceState({}, document.title, window.location.pathname);
                
                // Load user profile from OAuth gateway
                const user = await this.loadUserProfileFromGateway();

                if (user) {
                    await this.handleSuccessfulLogin(user);
                } else {
                    throw new Error('Failed to get user profile from OAuth gateway');
                }
            } catch (error) {
                console.error('OAuth callback error:', error);
                this.showMessage('Authentication failed. Please try again.', 'error');
                setTimeout(() => window.location.href = '/views/login.html', 3000);
            }
        } else {
            // Handle OAuth failure
            const errorMessage = error || 'Authentication failed';
            this.showMessage(errorMessage, 'error');
            setTimeout(() => window.location.href = '/views/login.html', 3000);
        }
    }

    // Common success handler
    async handleSuccessfulLogin(user) {
        try {
            // Store user data
            localStorage.setItem(this.userKey, JSON.stringify(user));

            // Emit login event
            window.dispatchEvent(new CustomEvent('hulab:userLogin', { detail: user }));

            // Redirect to intended destination or dashboard
            const returnTo = new URLSearchParams(window.location.search).get('returnTo') || '/views/dashboard.html';
            window.location.href = returnTo;
        } catch (error) {
            console.error('Login success handler error:', error);
            this.showMessage('Login successful, but there was an issue. Redirecting...', 'warning');
            setTimeout(() => window.location.href = '/views/dashboard.html', 2000);
        }
    }

    // Universal logout
    async logout() {
        const token = localStorage.getItem(this.tokenKey);

        if (token) {
            try {
                await fetch(`${this.apiBase}/auth/logout`, {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (error) {
                console.warn('Logout API call failed:', error);
            }
        }

        // Clear local storage
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);

        // Emit logout event
        window.dispatchEvent(new CustomEvent('hulab:userLogout'));

        // Redirect to login
        window.location.href = '/views/login.html';
    }

    // Check authentication status using OAuth gateway
    async isAuthenticated() {
        const gatewayToken = localStorage.getItem(this.tokenKey);
        if (!gatewayToken) return false;

        try {
            // Test token validity by trying to get user info from gateway
            const response = await fetch('https://oauth.skoonline.org/auth/userinfo', {
                headers: { 'Authorization': `Bearer ${gatewayToken}` }
            });

            return response.ok;
        } catch (error) {
            console.error('Auth check error:', error);
            return false;
        }
    }

    // Get current user data
    getUser() {
        const userData = localStorage.getItem(this.userKey);
        if (userData) {
            try {
                return JSON.parse(userData);
            } catch (error) {
                console.error('Failed to parse user data:', error);
                return null;
            }
        }
        return null;
    }

    // Get user profile from OAuth gateway (following docs/Oauth.md)
    async loadUserProfileFromGateway() {
        const gatewayToken = localStorage.getItem(this.tokenKey);
        if (!gatewayToken) return null;

        try {
            // Following docs/Oauth.md: use /auth/userinfo endpoint
            const response = await fetch('https://oauth.skoonline.org/auth/userinfo', {
                headers: { 'Authorization': `Bearer ${gatewayToken}` }
            });

            if (response.ok) {
                const userInfo = await response.json();
                // Following docs structure: userInfo.user contains the actual user data
                return userInfo.user;
            } else {
                console.error('Failed to load user info from OAuth gateway');
                return null;
            }
        } catch (error) {
            console.error('Error connecting to OAuth gateway:', error);
            return null;
        }
    }

    // Backwards compatibility method
    async getUserProfile() {
        return await this.loadUserProfileFromGateway();
    }

    // Initialize authentication system
    async initialize() {
        try {
            // Check for OAuth callback
            const params = new URLSearchParams(window.location.search);
            if (params.get('token') || params.get('success')) {
                await this.handleOAuthCallback();
                return true;
            }

            // Check for email verification
            const verifyToken = params.get('verify');
            if (verifyToken) {
                await this.verifyEmail(verifyToken);
                return true;
            }

            // Check if user is already authenticated
            return await this.isAuthenticated();
        } catch (error) {
            console.error('Authentication initialization error:', error);
            return false;
        }
    }

    // Utility method for showing messages
    showMessage(message, type = 'info') {
        // Try to use existing notification system first
        if (typeof showNotification === 'function') {
            showNotification(message, type);
            return;
        }

        // Fallback to custom alert system
        const alertClass = {
            'success': 'alert-success',
            'error': 'alert-danger',
            'info': 'alert-info',
            'warning': 'alert-warning'
        }[type] || 'alert-info';

        const alert = document.createElement('div');
        alert.className = `alert ${alertClass}`;
        alert.innerHTML = message;
        alert.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            padding: 12px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 500;
            max-width: 400px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            background: ${type === 'success' ? '#10b981' : 
                       type === 'error' ? '#ef4444' :
                       type === 'warning' ? '#f59e0b' : '#3b82f6'};
        `;

        document.body.appendChild(alert);

        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (alert.parentNode) {
                alert.parentNode.removeChild(alert);
            }
        }, 5000);
    }
}

// Custom Error Classes
class AuthenticationError extends Error {
    constructor(message, code = null) {
        super(message);
        this.name = 'AuthenticationError';
        this.code = code;
    }
}

class EmailNotVerifiedError extends AuthenticationError {
    constructor(message, email) {
        super(message, 'EMAIL_NOT_VERIFIED');
        this.email = email;
    }
}

class AccountLockedError extends AuthenticationError {
    constructor(message, lockUntil) {
        super(message, 'ACCOUNT_LOCKED');
        this.lockUntil = lockUntil;
    }
}

// Backwards compatibility with existing OAuth system
class HuLabOAuthCompat extends HybridAuthenticationManager {
    loginWithGoogle(redirectUrl = null) {
        if (redirectUrl) {
            this.returnUrl = redirectUrl;
        }
        return this.loginWithOAuth('google');
    }

    async handleCallback() {
        return this.handleOAuthCallback();
    }
    
    // Override to use correct parameter name from docs/Oauth.md
    async loginWithOAuth(provider = 'google') {
        const loginUrl = `${this.authGateway}/auth/${provider}/login?redirect_uri=${encodeURIComponent(this.returnUrl)}`;
        console.log(`Initiating ${provider} OAuth login (compat):`, loginUrl);
        window.location.href = loginUrl;
    }
}

// Global instances for backwards compatibility
window.HybridAuthenticationManager = HybridAuthenticationManager;
window.AuthenticationError = AuthenticationError;
window.EmailNotVerifiedError = EmailNotVerifiedError;
window.AccountLockedError = AccountLockedError;

// Create global instance
window.authManager = new HybridAuthenticationManager();

// Backwards compatibility
window.huLabAuth = new HuLabOAuthCompat();