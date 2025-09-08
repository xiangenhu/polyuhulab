/**
 * Authentication Routes for Hu Lab Portal
 * Handles Google OAuth authentication, login, logout, and session management
 */

const express = require('express');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const xapiService = require('../services/xapiService');
const { optionalAuthenticate } = require('../middleware/authentication');
const winston = require('winston');

const router = express.Router();

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'auth-routes' },
    transports: [
        new winston.transports.File({ filename: 'logs/auth.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Configure Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        logger.info('Google OAuth callback received', {
            googleId: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName
        });

        // Create user object from Google profile
        const user = {
            id: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName,
            firstName: profile.name.givenName,
            lastName: profile.name.familyName,
            avatar: profile.photos[0] ? profile.photos[0].value : null,
            provider: 'google',
            accessToken: accessToken,
            refreshToken: refreshToken,
            role: 'student', // Default role, can be updated later
            lastLogin: new Date().toISOString()
        };

        // Check if user already exists in xAPI profiles
        const existingProfile = await xapiService.getUserProfile(user.email);
        
        if (existingProfile) {
            // Update existing user profile
            const updatedProfile = {
                ...existingProfile,
                ...user,
                loginCount: (existingProfile.loginCount || 0) + 1,
                lastLogin: user.lastLogin
            };

            await xapiService.saveUserProfile(user.email, updatedProfile);
            logger.info('Updated existing user profile', { email: user.email });
        } else {
            // Create new user profile
            const newProfile = {
                ...user,
                createdAt: new Date().toISOString(),
                loginCount: 1,
                preferences: {
                    theme: 'light',
                    language: 'en',
                    notifications: true,
                    emailNotifications: true
                },
                permissions: {
                    canCreateProjects: true,
                    canUploadFiles: true,
                    canCollaborate: true,
                    canUseAI: true
                }
            };

            await xapiService.saveUserProfile(user.email, newProfile);
            
            // Track user registration in xAPI
            await xapiService.trackUserRegistration(user.email, user.name);
            
            logger.info('Created new user profile', { email: user.email });
        }

        return done(null, user);
    } catch (error) {
        logger.error('Error in Google OAuth callback', {
            error: error.message,
            stack: error.stack,
            profile: profile ? profile.id : 'unknown'
        });
        return done(error, null);
    }
}));

// Passport serialization
passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        // Find user by Google ID in xAPI profiles
        // This is a simplified approach - in production, you might want a more efficient lookup
        const profile = await xapiService.getUserProfile(`google:${id}`);
        if (profile) {
            done(null, profile);
        } else {
            done(null, false);
        }
    } catch (error) {
        logger.error('Error deserializing user', { error: error.message, userId: id });
        done(error, null);
    }
});

/**
 * GET /auth/status
 * Check current authentication status
 */
router.get('/status', optionalAuthenticate, (req, res) => {
    try {
        if (req.userContext) {
            res.json({
                authenticated: true,
                user: {
                    id: req.userContext.id,
                    email: req.userContext.email,
                    name: req.userContext.name,
                    role: req.userContext.role
                }
            });
        } else {
            res.json({
                authenticated: false,
                user: null
            });
        }
    } catch (error) {
        logger.error('Error checking auth status', { error: error.message });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to check authentication status'
        });
    }
});

/**
 * GET /auth/google
 * Initiate Google OAuth flow
 */
router.get('/google', (req, res, next) => {
    try {
        logger.info('Initiating Google OAuth flow', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            returnTo: req.query.returnTo
        });

        // Store return URL in session
        if (req.query.returnTo) {
            req.session.returnTo = req.query.returnTo;
        }

        passport.authenticate('google', {
            scope: ['profile', 'email'],
            prompt: 'select_account' // Always show account selection
        })(req, res, next);
    } catch (error) {
        logger.error('Error initiating Google OAuth', { error: error.message });
        res.status(500).json({
            error: 'Authentication error',
            message: 'Unable to initiate Google authentication'
        });
    }
});

/**
 * GET /auth/google/callback
 * Google OAuth callback
 */
router.get('/google/callback', 
    passport.authenticate('google', { failureRedirect: '/auth/failure' }),
    async (req, res) => {
        try {
            logger.info('Google OAuth callback successful', {
                userId: req.user.id,
                email: req.user.email
            });

            // Track page view for successful login
            await xapiService.trackPageView(
                req.user.email, 
                '/auth/login/success',
                req.get('Referer')
            );

            // Redirect to intended destination or dashboard
            const returnTo = req.session.returnTo || '/dashboard';
            delete req.session.returnTo;

            res.redirect(returnTo);
        } catch (error) {
            logger.error('Error in OAuth callback success handler', {
                error: error.message,
                userId: req.user ? req.user.id : 'unknown'
            });
            res.redirect('/dashboard'); // Fallback redirect
        }
    }
);

/**
 * GET /auth/failure
 * Authentication failure page
 */
router.get('/failure', (req, res) => {
    logger.warn('Authentication failure', {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    res.status(401).json({
        error: 'Authentication failed',
        message: 'Google authentication was not successful. Please try again.',
        redirectUrl: '/auth/google'
    });
});

/**
 * POST /auth/logout
 * Logout user and destroy session
 */
router.post('/logout', optionalAuthenticate, async (req, res) => {
    try {
        const userEmail = req.userContext ? req.userContext.email : null;

        logger.info('User logout initiated', {
            email: userEmail,
            sessionId: req.sessionID
        });

        // Track logout activity if user was authenticated
        if (userEmail) {
            try {
                await xapiService.sendStatement({
                    actor: { email: userEmail },
                    verb: {
                        id: 'http://adlnet.gov/expapi/verbs/terminated',
                        display: { 'en-US': 'logged out' }
                    },
                    object: {
                        id: `${xapiService.baseActivityId}/portal`,
                        definition: {
                            type: 'http://adlnet.gov/expapi/activities/application',
                            name: { 'en-US': 'HuLab Portal Session' }
                        }
                    }
                });
            } catch (xapiError) {
                logger.warn('Failed to track logout in xAPI', { 
                    error: xapiError.message, 
                    email: userEmail 
                });
            }
        }

        // Destroy session
        req.logout((err) => {
            if (err) {
                logger.error('Error during logout', { error: err.message, email: userEmail });
                return res.status(500).json({
                    error: 'Logout error',
                    message: 'An error occurred during logout'
                });
            }

            req.session.destroy((destroyErr) => {
                if (destroyErr) {
                    logger.error('Error destroying session', { 
                        error: destroyErr.message, 
                        email: userEmail 
                    });
                }

                res.clearCookie('connect.sid'); // Clear session cookie
                res.json({
                    success: true,
                    message: 'Logged out successfully',
                    timestamp: new Date().toISOString()
                });
            });
        });
    } catch (error) {
        logger.error('Unexpected error during logout', { 
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'An unexpected error occurred during logout'
        });
    }
});

/**
 * GET /auth/logout
 * Logout via GET (for compatibility)
 */
router.get('/logout', (req, res) => {
    // Redirect GET requests to use POST
    res.json({
        error: 'Method not allowed',
        message: 'Please use POST /auth/logout to logout',
        allowedMethods: ['POST']
    });
});

/**
 * GET /auth/profile
 * Get current user profile
 */
router.get('/profile', optionalAuthenticate, async (req, res) => {
    try {
        if (!req.userContext) {
            return res.status(401).json({
                error: 'Not authenticated',
                message: 'Please log in to view your profile'
            });
        }

        // Get full profile from xAPI
        const profile = await xapiService.getUserProfile(req.userContext.email);
        
        if (!profile) {
            return res.status(404).json({
                error: 'Profile not found',
                message: 'User profile could not be retrieved'
            });
        }

        // Remove sensitive information
        const safeProfile = {
            ...profile,
            accessToken: undefined,
            refreshToken: undefined
        };

        res.json({
            success: true,
            profile: safeProfile
        });
    } catch (error) {
        logger.error('Error retrieving user profile', {
            error: error.message,
            email: req.userContext ? req.userContext.email : 'unknown'
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve user profile'
        });
    }
});

/**
 * PUT /auth/profile
 * Update user profile
 */
router.put('/profile', optionalAuthenticate, async (req, res) => {
    try {
        if (!req.userContext) {
            return res.status(401).json({
                error: 'Not authenticated',
                message: 'Please log in to update your profile'
            });
        }

        const updates = req.body;
        const userEmail = req.userContext.email;

        // Get current profile
        const currentProfile = await xapiService.getUserProfile(userEmail);
        if (!currentProfile) {
            return res.status(404).json({
                error: 'Profile not found',
                message: 'User profile could not be found'
            });
        }

        // Merge updates with current profile (protect sensitive fields)
        const updatedProfile = {
            ...currentProfile,
            ...updates,
            // Protect these fields from being updated via this endpoint
            id: currentProfile.id,
            email: currentProfile.email,
            provider: currentProfile.provider,
            createdAt: currentProfile.createdAt,
            updatedAt: new Date().toISOString()
        };

        // Save updated profile
        await xapiService.saveUserProfile(userEmail, updatedProfile);

        // Track profile update
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: {
                id: 'http://hulab.edu.hk/verbs/updated',
                display: { 'en-US': 'updated' }
            },
            object: {
                id: `${xapiService.baseActivityId}/profile/${userEmail}`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/profile',
                    name: { 'en-US': 'User Profile' }
                }
            }
        });

        logger.info('User profile updated', {
            email: userEmail,
            updatedFields: Object.keys(updates)
        });

        // Return safe profile (without sensitive data)
        const safeProfile = {
            ...updatedProfile,
            accessToken: undefined,
            refreshToken: undefined
        };

        res.json({
            success: true,
            message: 'Profile updated successfully',
            profile: safeProfile
        });
    } catch (error) {
        logger.error('Error updating user profile', {
            error: error.message,
            email: req.userContext ? req.userContext.email : 'unknown'
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to update user profile'
        });
    }
});

/**
 * GET /auth/sessions
 * Get active sessions (simplified - just current session info)
 */
router.get('/sessions', optionalAuthenticate, (req, res) => {
    try {
        if (!req.userContext) {
            return res.status(401).json({
                error: 'Not authenticated',
                message: 'Please log in to view session information'
            });
        }

        const sessionInfo = {
            current: {
                sessionId: req.sessionID,
                userId: req.userContext.id,
                email: req.userContext.email,
                loginTime: req.session.cookie.originalMaxAge ? 
                    new Date(Date.now() - req.session.cookie.originalMaxAge).toISOString() : 
                    'unknown',
                expires: req.session.cookie.expires ? 
                    req.session.cookie.expires.toISOString() : 
                    'session',
                userAgent: req.get('User-Agent'),
                ip: req.ip
            }
        };

        res.json({
            success: true,
            sessions: sessionInfo
        });
    } catch (error) {
        logger.error('Error retrieving session info', {
            error: error.message,
            email: req.userContext ? req.userContext.email : 'unknown'
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve session information'
        });
    }
});

/**
 * OAuth user registration endpoint for oauth.skoonline.org integration
 * This endpoint is called after successful OAuth authentication to register/legitimize users
 */
router.post('/oauth/register', async (req, res) => {
    try {
        const { user, token } = req.body;
        
        // Validate required fields
        if (!user || !user.email || !user.name) {
            return res.status(400).json({
                error: 'Invalid user data',
                message: 'User email and name are required'
            });
        }

        logger.info('OAuth user registration initiated', {
            email: user.email,
            name: user.name,
            provider: 'oauth.skoonline.org'
        });

        // Check if user already exists in xAPI profiles
        const existingProfile = await xapiService.getUserProfile(user.email);
        
        // Create comprehensive user profile
        const userProfile = {
            id: user.sub || user.id || user.email, // Use Google ID or email as fallback
            email: user.email,
            name: user.name,
            firstName: user.given_name || user.givenName,
            lastName: user.family_name || user.familyName,
            avatar: user.picture,
            provider: 'oauth.skoonline.org',
            googleId: user.sub,
            role: existingProfile?.role || 'student', // Preserve existing role or default to student
            lastLogin: new Date().toISOString(),
            locale: user.locale || 'en'
        };

        if (existingProfile) {
            // Update existing user profile
            const updatedProfile = {
                ...existingProfile,
                ...userProfile,
                loginCount: (existingProfile.loginCount || 0) + 1,
                lastLogin: userProfile.lastLogin,
                // Preserve existing preferences and permissions
                preferences: existingProfile.preferences || {
                    theme: 'light',
                    language: user.locale || 'en',
                    notifications: true,
                    emailNotifications: true
                },
                permissions: existingProfile.permissions || {
                    canCreateProjects: true,
                    canUploadFiles: true,
                    canCollaborate: true,
                    canUseAI: true
                }
            };

            await xapiService.saveUserProfile(user.email, updatedProfile);
            
            // Track login activity
            await xapiService.sendStatement({
                actor: { email: user.email, name: user.name },
                verb: {
                    id: 'http://adlnet.gov/expapi/verbs/experienced',
                    display: { 'en-US': 'logged in' }
                },
                object: {
                    id: `${xapiService.baseActivityId}/portal`,
                    definition: {
                        type: 'http://adlnet.gov/expapi/activities/application',
                        name: { 'en-US': 'HuLab Portal' }
                    }
                }
            });
            
            logger.info('Updated existing user profile', { 
                email: user.email, 
                loginCount: updatedProfile.loginCount 
            });

            return res.json({
                success: true,
                user: updatedProfile,
                isNewUser: false,
                message: 'User profile updated successfully'
            });
        } else {
            // Create new user profile
            const newProfile = {
                ...userProfile,
                createdAt: new Date().toISOString(),
                loginCount: 1,
                isLegitimate: true, // Mark as legitimate user
                status: 'active',
                preferences: {
                    theme: 'light',
                    language: user.locale || 'en',
                    notifications: true,
                    emailNotifications: true
                },
                permissions: {
                    canCreateProjects: true,
                    canUploadFiles: true,
                    canCollaborate: true,
                    canUseAI: true
                }
            };

            await xapiService.saveUserProfile(user.email, newProfile);
            
            // Track user registration in xAPI LRS
            await xapiService.trackUserRegistration(user.email, user.name, 'OAuth via oauth.skoonline.org');
            
            logger.info('Created new legitimate user profile', { 
                email: user.email,
                role: newProfile.role 
            });

            return res.json({
                success: true,
                user: newProfile,
                isNewUser: true,
                message: 'User registered and legitimized successfully'
            });
        }

    } catch (error) {
        logger.error('OAuth user registration error', {
            error: error.message,
            stack: error.stack,
            email: req.body?.user?.email
        });

        return res.status(500).json({
            error: 'Registration failed',
            message: 'Failed to register user in system',
            timestamp: new Date().toISOString()
        });
    }
});

/**
 * Get user profile endpoint for OAuth system
 */
router.get('/oauth/profile/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        if (!email) {
            return res.status(400).json({
                error: 'Email required',
                message: 'User email parameter is required'
            });
        }

        const profile = await xapiService.getUserProfile(email);
        
        if (!profile) {
            return res.status(404).json({
                error: 'User not found',
                message: 'User profile not found in system'
            });
        }

        // Remove sensitive information
        const safeProfile = {
            ...profile,
            accessToken: undefined,
            refreshToken: undefined
        };

        return res.json({
            success: true,
            user: safeProfile
        });

    } catch (error) {
        logger.error('Get user profile error', {
            error: error.message,
            email: req.params.email
        });

        return res.status(500).json({
            error: 'Profile retrieval failed',
            message: 'Failed to retrieve user profile'
        });
    }
});

/**
 * Proxy endpoint for OAuth user info (to handle CORS)
 * GET /auth/oauth/userinfo
 */
router.get('/oauth/userinfo', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({
                error: 'No authorization header',
                message: 'Authorization token is required'
            });
        }

        // Proxy the request to oauth.skoonline.org using axios
        const axios = require('axios');
        const response = await axios.get('https://oauth.skoonline.org/auth/userinfo', {
            headers: {
                'Authorization': authHeader
            }
        });

        const userInfo = response.data;
        
        // Log the user info retrieval
        logger.info('OAuth user info retrieved via proxy', {
            email: userInfo.user?.email,
            name: userInfo.user?.name
        });
        
        res.json(userInfo);

    } catch (error) {
        logger.error('OAuth userinfo proxy error', {
            error: error.message,
            status: error.response?.status,
            stack: error.stack
        });

        // Handle axios errors
        if (error.response) {
            res.status(error.response.status).json({
                error: 'OAuth gateway error',
                message: 'Failed to retrieve user information',
                details: error.response.data
            });
        } else {
            res.status(500).json({
                error: 'Proxy error',
                message: 'Failed to proxy OAuth request'
            });
        }
    }
});

/**
 * Error handling middleware for auth routes
 */
router.use((error, req, res, next) => {
    logger.error('Auth route error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method
    });

    res.status(500).json({
        error: 'Authentication system error',
        message: 'An error occurred in the authentication system',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;