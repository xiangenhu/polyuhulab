/**
 * OAuth Authentication System for Hu Lab @ PolyU
 * Using oauth.skoonline.org gateway
 */

class HuLabOAuth {
    constructor() {
        this.gateway = 'https://oauth.skoonline.org';
        this.tokenKey = 'oauth_token';  // Following docs/Oauth.md specification
        this.userKey = 'hulab_user_data';
        this.isInitializing = false;
        this.isInitialized = false;
    }

    /**
     * Initiate Google OAuth login
     * @param {string} redirectUrl - URL to redirect to after successful auth
     */
    loginWithGoogle(redirectUrl = null) {
        if (!redirectUrl) {
            redirectUrl = window.location.origin + '/views/dashboard.html';
        }
        
        const authUrl = `${this.gateway}/auth/google/login?redirect_uri=${encodeURIComponent(redirectUrl)}`;
        console.log('Redirecting to OAuth:', authUrl);
        window.location.href = authUrl;
    }

    /**
     * Handle OAuth callback and process tokens
     */
    async handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const success = urlParams.get('success');
        const error = urlParams.get('error');

        if (error) {
            console.error('OAuth callback error:', error);
            // Clean the URL
            window.history.replaceState({}, document.title, window.location.pathname);
            return false;
        }

        if (success && token) {
            console.log('OAuth callback successful, storing token');
            localStorage.setItem(this.tokenKey, token);
            
            // Clean the URL first
            window.history.replaceState({}, document.title, window.location.pathname);
            
            // Load user profile
            const user = await this.loadUserProfile();
            return !!user;
        }
        
        return false;
    }

    /**
     * Load user profile from OAuth gateway
     */
    async loadUserProfile() {
        const token = this.getToken();
        if (!token) {
            console.log('No OAuth token found');
            return false;
        }

        try {
            const response = await fetch(`${this.gateway}/auth/userinfo`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (response.ok) {
                const userInfo = await response.json();
                console.log('User profile loaded:', userInfo.user);
                
                // Register/legitimize user in LRS system
                try {
                    await this.registerUserInLRS(userInfo.user, token);
                } catch (error) {
                    console.error('Failed to register user in LRS:', error);
                    // Continue anyway as OAuth authentication succeeded
                }
                
                // Store user data
                localStorage.setItem(this.userKey, JSON.stringify(userInfo.user));
                
                // Notify other parts of the application
                this.onUserLogin(userInfo.user);
                
                return userInfo.user;
            } else {
                console.error('Failed to load user profile:', response.status);
                this.logout();
                return false;
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
            this.logout();
            return false;
        }
    }

    /**
     * Register/legitimize user in the Learning Record Store (LRS) system
     * @param {Object} user - User information from OAuth
     * @param {string} token - OAuth token
     */
    async registerUserInLRS(user, token) {
        try {
            console.log('Registering user in LRS system:', user.email);
            
            const response = await fetch('/auth/oauth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    user: user,
                    token: token
                })
            });

            if (response.ok) {
                const result = await response.json();
                console.log('User registration result:', result);
                
                // Update stored user data with LRS profile information
                if (result.user) {
                    localStorage.setItem(this.userKey, JSON.stringify(result.user));
                }
                
                return result;
            } else {
                const error = await response.json();
                throw new Error(`Registration failed: ${error.message || 'Unknown error'}`);
            }
        } catch (error) {
            console.error('LRS registration error:', error);
            throw error;
        }
    }

    /**
     * Get Google access token for API calls
     * @param {Array} scopes - Google OAuth scopes needed
     */
    async getGoogleAccessToken(scopes = ['https://www.googleapis.com/auth/userinfo.profile']) {
        const gatewayToken = this.getToken();
        if (!gatewayToken) return null;

        try {
            const response = await fetch(`${this.gateway}/auth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    gatewayToken: gatewayToken,
                    provider: 'google',
                    scope: scopes
                })
            });

            if (response.ok) {
                const data = await response.json();
                return data.access_token;
            }
        } catch (error) {
            console.error('Error getting Google access token:', error);
        }
        return null;
    }

    /**
     * Get stored OAuth token
     */
    getToken() {
        return localStorage.getItem(this.tokenKey);
    }

    /**
     * Get stored user data
     */
    getUser() {
        const userData = localStorage.getItem(this.userKey);
        return userData ? JSON.parse(userData) : null;
    }

    /**
     * Check if user is authenticated
     */
    isAuthenticated() {
        const token = this.getToken();
        const user = this.getUser();
        
        console.log('Authentication check:', {
            hasToken: !!token,
            hasUser: !!user,
            token: token ? token.substring(0, 10) + '...' : null,
            userEmail: user?.email || null
        });
        
        return !!token && !!user;
    }

    /**
     * Logout user and clear storage
     */
    async logout() {
        const token = this.getToken();
        
        // Try to revoke token on server
        if (token) {
            try {
                await fetch(`${this.gateway}/auth/logout`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
            } catch (error) {
                console.error('Error revoking token:', error);
            }
        }

        // Clear local storage
        localStorage.removeItem(this.tokenKey);
        localStorage.removeItem(this.userKey);
        
        // Notify application
        this.onUserLogout();
        
        // Redirect to home
        window.location.href = '/views/index.html';
    }

    /**
     * Initialize OAuth system
     */
    async initialize() {
        // Prevent double initialization
        if (this.isInitializing) {
            console.log('OAuth initialization already in progress...');
            // Wait for current initialization to complete
            while (this.isInitializing) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
            return this.isAuthenticated();
        }
        
        if (this.isInitialized) {
            console.log('OAuth already initialized');
            return this.isAuthenticated();
        }
        
        this.isInitializing = true;
        console.log('Initializing HuLab OAuth system');
        
        try {
            // Handle OAuth callback if present
            console.log('Checking for OAuth callback...');
            const callbackResult = await this.handleCallback();
            if (callbackResult) {
                console.log('OAuth callback processed successfully');
                this.isInitialized = true;
                this.isInitializing = false;
                return true;
            }
            
            // Check if user is already logged in
            console.log('Checking existing authentication...');
            if (this.getToken()) {
                console.log('Found existing token, loading user profile...');
                const user = await this.loadUserProfile();
                this.isInitialized = true;
                this.isInitializing = false;
                const result = !!user;
                console.log('Profile load result:', result);
                return result;
            }
            
            console.log('No existing authentication found');
            this.isInitialized = true;
            this.isInitializing = false;
            return false;
        } catch (error) {
            console.error('OAuth initialization error:', error);
            this.isInitializing = false;
            return false;
        }
    }

    /**
     * Update UI when user logs in
     */
    onUserLogin(user) {
        console.log('User logged in:', user.name);
        
        // Update navigation if present
        this.updateNavigationForLoggedInUser(user);
        
        // Show user profile sections, hide login sections
        const loginSections = document.querySelectorAll('.login-section, #loginSection');
        const userSections = document.querySelectorAll('.user-section, #userSection');
        
        loginSections.forEach(el => el.style.display = 'none');
        userSections.forEach(el => el.style.display = 'block');
        
        // Update user welcome messages
        const welcomeElements = document.querySelectorAll('.welcome-title, #welcomeTitle');
        welcomeElements.forEach(el => {
            if (el) el.textContent = `Welcome back, ${user.given_name || user.name}!`;
        });
        
        // Update user avatars
        const avatarElements = document.querySelectorAll('.user-avatar, #userAvatar');
        avatarElements.forEach(el => {
            if (el && user.picture) {
                el.src = user.picture;
                el.alt = user.name;
            }
        });
        
        // If on index page, redirect to dashboard
        if (window.location.pathname === '/' || window.location.pathname.endsWith('index.html')) {
            setTimeout(() => {
                window.location.href = '/views/dashboard.html';
            }, 1000);
        }
        
        // Trigger custom event
        window.dispatchEvent(new CustomEvent('hulab:userLogin', { detail: user }));
    }

    /**
     * Update UI when user logs out
     */
    onUserLogout() {
        console.log('User logged out');
        
        // Show login sections, hide user sections
        const loginSections = document.querySelectorAll('.login-section, #loginSection');
        const userSections = document.querySelectorAll('.user-section, #userSection');
        
        loginSections.forEach(el => el.style.display = 'block');
        userSections.forEach(el => el.style.display = 'none');
        
        // Trigger custom event
        window.dispatchEvent(new CustomEvent('hulab:userLogout'));
    }

    /**
     * Update navigation for logged in user
     */
    updateNavigationForLoggedInUser(user) {
        // Add user info to navigation if there's a user info container
        const userNavContainer = document.querySelector('.nav-user-info');
        if (userNavContainer) {
            userNavContainer.innerHTML = `
                <div class="nav-user-profile">
                    ${user.picture ? `<img src="${user.picture}" alt="${user.name}" class="nav-avatar">` : ''}
                    <span class="nav-username">${user.given_name || user.name}</span>
                    <button class="nav-logout-btn" data-action="logout">Logout</button>
                </div>
            `;
            userNavContainer.style.display = 'flex';
            
            // Bind logout button event
            const logoutBtn = userNavContainer.querySelector('.nav-logout-btn');
            if (logoutBtn) {
                logoutBtn.addEventListener('click', () => this.logout());
            }
        }
    }

    /**
     * Create login button HTML
     */
    createLoginButton(text = '🔑 Login with Google', className = 'btn btn-primary oauth-login-btn') {
        return `
            <button onclick="huLabAuth.loginWithGoogle()" class="${className}">
                ${text}
            </button>
        `;
    }

    /**
     * Create user profile HTML
     */
    createUserProfileHTML(user) {
        return `
            <div class="user-profile-display">
                <div class="user-info">
                    ${user.picture ? `<img src="${user.picture}" alt="${user.name}" class="profile-avatar">` : ''}
                    <div class="profile-details">
                        <h3>${user.name}</h3>
                        <p class="user-email">📧 ${user.email}</p>
                    </div>
                </div>
                <button onclick="huLabAuth.logout()" class="btn btn-secondary">Logout</button>
            </div>
        `;
    }
}

// Global instance
const huLabAuth = new HuLabOAuth();

// Auto-initialization disabled to prevent conflicts with shared-app.js
// OAuth will be initialized manually by each page as needed

// Export for use in other modules
window.HuLabAuth = HuLabOAuth;
window.huLabAuth = huLabAuth;