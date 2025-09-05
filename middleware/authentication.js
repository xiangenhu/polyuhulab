const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'auth-middleware' },
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

/**
 * Middleware to check if user is authenticated
 * Redirects to login if not authenticated for browser requests
 * Returns 401 JSON response for API requests
 */
function authenticate(req, res, next) {
    // Check if user is authenticated
    if (req.isAuthenticated && req.isAuthenticated()) {
        // Add user info to request context for logging
        req.userContext = {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role,
            name: req.user.name
        };
        
        logger.info('User authenticated', {
            userId: req.user.id,
            email: req.user.email,
            path: req.path,
            method: req.method,
            ip: req.ip
        });
        
        return next();
    }

    // Log authentication failure
    logger.warn('Authentication required', {
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });

    // Handle API requests with JSON response
    if (req.path.startsWith('/api/') || req.xhr || req.accepts('json')) {
        return res.status(401).json({
            error: 'Authentication required',
            message: 'Please log in to access this resource',
            redirectUrl: '/auth/google'
        });
    }

    // Handle browser requests with redirect
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/google');
}

/**
 * Middleware to check if user is authenticated (optional)
 * Sets user context if authenticated but doesn't block if not
 */
function optionalAuthenticate(req, res, next) {
    if (req.isAuthenticated && req.isAuthenticated()) {
        req.userContext = {
            id: req.user.id,
            email: req.user.email,
            role: req.user.role,
            name: req.user.name
        };
        
        logger.debug('User context set', {
            userId: req.user.id,
            path: req.path,
            method: req.method
        });
    } else {
        req.userContext = null;
        logger.debug('No user authentication found', {
            path: req.path,
            method: req.method
        });
    }
    
    return next();
}

/**
 * Middleware to check if user has required role
 * @param {string|Array} allowedRoles - Single role or array of allowed roles
 */
function requireRole(allowedRoles) {
    return (req, res, next) => {
        // First check if user is authenticated
        if (!req.isAuthenticated || !req.isAuthenticated()) {
            logger.warn('Role check failed - not authenticated', {
                path: req.path,
                method: req.method,
                requiredRoles: allowedRoles,
                ip: req.ip
            });
            
            if (req.path.startsWith('/api/') || req.xhr || req.accepts('json')) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Please log in to access this resource'
                });
            }
            
            req.session.returnTo = req.originalUrl;
            return res.redirect('/auth/google');
        }

        const userRole = req.user.role;
        const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];
        
        // Admin role has access to everything
        if (userRole === 'admin' || roles.includes(userRole)) {
            logger.info('Role check passed', {
                userId: req.user.id,
                userRole: userRole,
                requiredRoles: roles,
                path: req.path,
                method: req.method
            });
            return next();
        }
        
        // Role check failed
        logger.warn('Role check failed - insufficient permissions', {
            userId: req.user.id,
            userRole: userRole,
            requiredRoles: roles,
            path: req.path,
            method: req.method,
            ip: req.ip
        });
        
        if (req.path.startsWith('/api/') || req.xhr || req.accepts('json')) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: `This resource requires one of the following roles: ${roles.join(', ')}`,
                userRole: userRole,
                requiredRoles: roles
            });
        }
        
        return res.status(403).render('error', {
            title: 'Access Denied',
            message: 'You do not have permission to access this resource.',
            error: { status: 403 }
        });
    };
}

/**
 * Middleware to check if user has specific permission
 * Uses the permission system defined in auth config
 * @param {string} permission - Required permission
 */
function requirePermission(permission) {
    return (req, res, next) => {
        // First check if user is authenticated
        if (!req.isAuthenticated || !req.isAuthenticated()) {
            logger.warn('Permission check failed - not authenticated', {
                path: req.path,
                method: req.method,
                requiredPermission: permission,
                ip: req.ip
            });
            
            if (req.path.startsWith('/api/') || req.xhr || req.accepts('json')) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Please log in to access this resource'
                });
            }
            
            req.session.returnTo = req.originalUrl;
            return res.redirect('/auth/google');
        }

        // Import auth config to check permissions
        const authConfig = require('../config/auth');
        
        if (authConfig.hasPermission(req.user, permission)) {
            logger.info('Permission check passed', {
                userId: req.user.id,
                userRole: req.user.role,
                permission: permission,
                path: req.path,
                method: req.method
            });
            return next();
        }
        
        // Permission check failed
        logger.warn('Permission check failed', {
            userId: req.user.id,
            userRole: req.user.role,
            permission: permission,
            path: req.path,
            method: req.method,
            ip: req.ip
        });
        
        if (req.path.startsWith('/api/') || req.xhr || req.accepts('json')) {
            return res.status(403).json({
                error: 'Permission denied',
                message: `You do not have the '${permission}' permission`,
                permission: permission,
                userRole: req.user.role
            });
        }
        
        return res.status(403).render('error', {
            title: 'Permission Denied',
            message: `You do not have the '${permission}' permission to access this resource.`,
            error: { status: 403 }
        });
    };
}

/**
 * Middleware to ensure user owns the resource being accessed
 * Checks if the user ID in the request matches the authenticated user
 * @param {string} paramName - Name of the parameter containing the user ID (default: 'userId')
 */
function requireOwnership(paramName = 'userId') {
    return (req, res, next) => {
        // First check if user is authenticated
        if (!req.isAuthenticated || !req.isAuthenticated()) {
            if (req.path.startsWith('/api/') || req.xhr || req.accepts('json')) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Please log in to access this resource'
                });
            }
            
            req.session.returnTo = req.originalUrl;
            return res.redirect('/auth/google');
        }

        // Admin users can access any resource
        if (req.user.role === 'admin') {
            logger.info('Ownership check bypassed for admin', {
                userId: req.user.id,
                targetUserId: req.params[paramName],
                path: req.path,
                method: req.method
            });
            return next();
        }

        const targetUserId = req.params[paramName] || req.body[paramName] || req.query[paramName];
        
        if (!targetUserId) {
            logger.warn('Ownership check failed - no user ID provided', {
                userId: req.user.id,
                paramName: paramName,
                path: req.path,
                method: req.method
            });
            
            if (req.path.startsWith('/api/') || req.xhr || req.accepts('json')) {
                return res.status(400).json({
                    error: 'Bad request',
                    message: `Missing required parameter: ${paramName}`
                });
            }
            
            return res.status(400).render('error', {
                title: 'Bad Request',
                message: 'Invalid request - missing user identifier.',
                error: { status: 400 }
            });
        }

        if (req.user.id === targetUserId) {
            logger.info('Ownership check passed', {
                userId: req.user.id,
                targetUserId: targetUserId,
                path: req.path,
                method: req.method
            });
            return next();
        }
        
        // Ownership check failed
        logger.warn('Ownership check failed - user does not own resource', {
            userId: req.user.id,
            targetUserId: targetUserId,
            path: req.path,
            method: req.method,
            ip: req.ip
        });
        
        if (req.path.startsWith('/api/') || req.xhr || req.accepts('json')) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only access your own resources'
            });
        }
        
        return res.status(403).render('error', {
            title: 'Access Denied',
            message: 'You can only access your own resources.',
            error: { status: 403 }
        });
    };
}

module.exports = {
    authenticate,
    optionalAuthenticate,
    requireRole,
    requirePermission,
    requireOwnership
};