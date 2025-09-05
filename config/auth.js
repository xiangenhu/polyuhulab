const GoogleStrategy = require('passport-google-oauth20').Strategy;
const winston = require('winston');
const xapiService = require('../services/xapiService');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'auth-config' }
});

class AuthConfig {
    initialize(passport) {
        // Serialize user for session
        passport.serializeUser((user, done) => {
            done(null, {
                id: user.id,
                email: user.email,
                name: user.name,
                picture: user.picture
            });
        });

        // Deserialize user from session
        passport.deserializeUser(async (sessionUser, done) => {
            try {
                // In a real app, you might fetch fresh user data from xAPI here
                // For now, we'll use the session data
                done(null, sessionUser);
            } catch (error) {
                logger.error('Failed to deserialize user:', error);
                done(error, null);
            }
        });

        // Configure Google OAuth strategy
        passport.use(new GoogleStrategy({
            clientID: process.env.GOOGLE_CLIENT_ID || 'placeholder-client-id',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'placeholder-client-secret',
            callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
        },
        async (accessToken, refreshToken, profile, done) => {
            try {
                // Log authentication to xAPI
                await xapiService.logAuthentication({
                    email: profile.emails[0].value,
                    name: profile.displayName,
                    action: 'logged-in',
                    provider: 'google',
                    profileId: profile.id
                });

                // Store user profile in xAPI
                await xapiService.storeUserProfile({
                    id: profile.id,
                    email: profile.emails[0].value,
                    name: profile.displayName,
                    firstName: profile.name.givenName,
                    lastName: profile.name.familyName,
                    picture: profile.photos[0].value,
                    provider: 'google',
                    lastLogin: new Date().toISOString()
                });

                const user = {
                    id: profile.id,
                    email: profile.emails[0].value,
                    name: profile.displayName,
                    firstName: profile.name.givenName,
                    lastName: profile.name.familyName,
                    picture: profile.photos[0].value,
                    role: await this.determineUserRole(profile.emails[0].value)
                };

                logger.info('User authenticated successfully', { userId: user.id, email: user.email });
                return done(null, user);
            } catch (error) {
                logger.error('Authentication failed:', error);
                return done(error, null);
            }
        }));
    }

    // Determine user role based on email or other criteria
    async determineUserRole(email) {
        // Check if user has existing role in xAPI
        try {
            const userProfile = await xapiService.getUserProfile(email);
            if (userProfile && userProfile.role) {
                return userProfile.role;
            }
        } catch (error) {
            logger.error('Failed to fetch user role:', error);
        }

        // Default role assignment logic
        if (email.endsWith('@polyu.edu.hk')) {
            if (email.includes('admin')) {
                return 'admin';
            } else if (email.includes('faculty') || email.includes('prof')) {
                return 'educator';
            } else if (email.includes('research')) {
                return 'researcher';
            }
        }

        // Default role for new users
        return 'student';
    }

    // Check if user has specific permission
    hasPermission(user, permission) {
        const permissions = {
            admin: ['all'],
            educator: [
                'view_analytics',
                'create_assessment',
                'manage_students',
                'create_content',
                'view_all_projects',
                'export_data'
            ],
            researcher: [
                'create_project',
                'view_analytics',
                'collaborate',
                'use_ai',
                'export_data'
            ],
            student: [
                'view_own_analytics',
                'submit_assessment',
                'collaborate',
                'use_ai',
                'view_content'
            ]
        };

        const userPermissions = permissions[user.role] || [];
        return userPermissions.includes('all') || userPermissions.includes(permission);
    }

    // Middleware to check if user has required role
    requireRole(roles) {
        return (req, res, next) => {
            if (!req.isAuthenticated()) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            const userRole = req.user.role;
            const allowedRoles = Array.isArray(roles) ? roles : [roles];

            if (!allowedRoles.includes(userRole)) {
                logger.warn('Access denied', { 
                    userId: req.user.id, 
                    userRole: userRole, 
                    requiredRoles: allowedRoles 
                });
                return res.status(403).json({ error: 'Insufficient permissions' });
            }

            next();
        };
    }

    // Middleware to check specific permission
    requirePermission(permission) {
        return (req, res, next) => {
            if (!req.isAuthenticated()) {
                return res.status(401).json({ error: 'Authentication required' });
            }

            if (!this.hasPermission(req.user, permission)) {
                logger.warn('Permission denied', { 
                    userId: req.user.id, 
                    permission: permission 
                });
                return res.status(403).json({ error: 'Permission denied' });
            }

            next();
        };
    }
}

module.exports = new AuthConfig();