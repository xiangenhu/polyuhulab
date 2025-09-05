const winston = require('winston');
const TinCan = require('tincanjs');
const uuid = require('uuid');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'xapi-logger' },
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

/**
 * Middleware to log all HTTP requests to xAPI as statements
 * Creates xAPI statements for user interactions with the portal
 */
function xapiLogger(req, res, next) {
    // Store the start time for duration calculation
    req.startTime = Date.now();
    
    // Store original res.end to intercept response
    const originalEnd = res.end;
    
    // Override res.end to capture response details
    res.end = function(chunk, encoding) {
        // Call the original end method
        originalEnd.call(this, chunk, encoding);
        
        // Calculate request duration
        const duration = Date.now() - req.startTime;
        
        // Log the request to xAPI (async, don't block response)
        setImmediate(() => {
            logRequestToXAPI(req, res, duration);
        });
    };
    
    // Continue with the next middleware
    next();
}

/**
 * Asynchronously log request to xAPI
 */
async function logRequestToXAPI(req, res, duration) {
    try {
        // Skip logging for certain routes to avoid noise
        if (shouldSkipLogging(req.path)) {
            return;
        }
        
        // Import xAPI config
        const xapiConfig = require('../config/xapi');
        
        // Skip if xAPI is not initialized
        if (!xapiConfig.initialized) {
            logger.debug('xAPI not initialized, skipping request logging');
            return;
        }
        
        const lrs = xapiConfig.getLRS();
        
        // Create the xAPI statement
        const statement = createRequestStatement(req, res, duration, xapiConfig);
        
        // Save statement to LRS
        lrs.saveStatement(statement, {
            callback: (err, xhr) => {
                if (err) {
                    logger.error('Failed to log request to xAPI', {
                        error: err.message,
                        method: req.method,
                        path: req.path,
                        statusCode: res.statusCode,
                        userId: req.user ? req.user.id : 'anonymous'
                    });
                } else {
                    logger.debug('Request logged to xAPI successfully', {
                        method: req.method,
                        path: req.path,
                        statusCode: res.statusCode,
                        duration: duration,
                        statementId: statement.id
                    });
                }
            }
        });
        
    } catch (error) {
        logger.error('Error in xAPI request logging', {
            error: error.message,
            stack: error.stack,
            method: req.method,
            path: req.path
        });
    }
}

/**
 * Create xAPI statement for HTTP request
 */
function createRequestStatement(req, res, duration, xapiConfig) {
    // Create actor (user or anonymous)
    let actor;
    if (req.user && req.user.email) {
        actor = xapiConfig.createActor(req.user.email, req.user.name);
    } else {
        actor = {
            account: {
                homePage: 'http://hulab.edu.hk/portal',
                name: `anonymous-${req.ip.replace(/[.:]/g, '-')}`
            },
            name: 'Anonymous User'
        };
    }
    
    // Determine verb based on HTTP method and response status
    let verbId, verbDisplay;
    if (req.method === 'GET') {
        verbId = res.statusCode >= 400 ? 'failed' : 'experienced';
        verbDisplay = res.statusCode >= 400 ? 'failed to access' : 'accessed';
    } else if (req.method === 'POST') {
        verbId = res.statusCode >= 400 ? 'failed' : 'created';
        verbDisplay = res.statusCode >= 400 ? 'failed to create' : 'created';
    } else if (req.method === 'PUT' || req.method === 'PATCH') {
        verbId = res.statusCode >= 400 ? 'failed' : 'updated';
        verbDisplay = res.statusCode >= 400 ? 'failed to update' : 'updated';
    } else if (req.method === 'DELETE') {
        verbId = res.statusCode >= 400 ? 'failed' : 'deleted';
        verbDisplay = res.statusCode >= 400 ? 'failed to delete' : 'deleted';
    } else {
        verbId = 'interacted-with';
        verbDisplay = 'interacted with';
    }
    
    const verb = xapiConfig.createVerb(verbId, verbDisplay);
    
    // Create activity object based on the request path
    const activity = createActivityFromPath(req.path, req.method, xapiConfig);
    
    // Create context with request details
    const context = xapiConfig.createContext({
        extensions: {
            'http://hulab.edu.hk/extensions/http-method': req.method,
            'http://hulab.edu.hk/extensions/status-code': res.statusCode,
            'http://hulab.edu.hk/extensions/user-agent': req.get('User-Agent'),
            'http://hulab.edu.hk/extensions/ip-address': req.ip,
            'http://hulab.edu.hk/extensions/query-params': req.query,
            'http://hulab.edu.hk/extensions/request-size': req.get('Content-Length') || 0,
            'http://hulab.edu.hk/extensions/response-size': res.get('Content-Length') || 0,
            'http://hulab.edu.hk/extensions/session-id': req.sessionID
        }
    });
    
    // Add user role to context if available
    if (req.user && req.user.role) {
        context.extensions['http://hulab.edu.hk/extensions/user-role'] = req.user.role;
    }
    
    // Create result with duration and success status
    const result = xapiConfig.createResult({
        success: res.statusCode < 400,
        completion: true,
        duration: `PT${duration / 1000}S`, // ISO 8601 duration format
        extensions: {
            'http://hulab.edu.hk/extensions/response-time-ms': duration,
            'http://hulab.edu.hk/extensions/error-details': res.statusCode >= 400 ? getErrorDetails(res) : undefined
        }
    });
    
    // Create and return the statement
    return new TinCan.Statement({
        id: uuid.v4(),
        actor: actor,
        verb: verb,
        object: activity,
        context: context,
        result: result,
        timestamp: new Date().toISOString()
    });
}

/**
 * Create activity object based on request path
 */
function createActivityFromPath(path, method, xapiConfig) {
    // Clean up path and determine activity type
    const cleanPath = path.replace(/\/+$/, '') || '/';
    let activityType = 'application';
    let activityName = 'Portal Page';
    let activityDescription = `HuLab Portal page at ${cleanPath}`;
    
    // Determine activity type based on path patterns
    if (cleanPath.startsWith('/api/')) {
        activityType = 'interaction';
        activityName = `API Endpoint: ${method} ${cleanPath}`;
        activityDescription = `API endpoint for ${cleanPath.replace('/api/', '')}`;
    } else if (cleanPath.includes('/research')) {
        activityType = 'research';
        activityName = 'Research Tools';
        activityDescription = 'Research collaboration tools and data';
    } else if (cleanPath.includes('/analytics')) {
        activityType = 'performance';
        activityName = 'Analytics Dashboard';
        activityDescription = 'Learning analytics and performance metrics';
    } else if (cleanPath.includes('/collaboration')) {
        activityType = 'collaboration';
        activityName = 'Collaboration Space';
        activityDescription = 'Collaborative learning and research environment';
    } else if (cleanPath.includes('/assessment')) {
        activityType = 'assessment';
        activityName = 'Assessment Tool';
        activityDescription = 'Assessment and evaluation activities';
    } else if (cleanPath.includes('/profile')) {
        activityType = 'profile';
        activityName = 'User Profile';
        activityDescription = 'User profile and account management';
    } else if (cleanPath.includes('/upload') || cleanPath.includes('/download')) {
        activityType = 'file';
        activityName = 'File Management';
        activityDescription = 'File upload, download, and management';
    }
    
    return xapiConfig.createActivity(
        `portal${cleanPath}`,
        activityType,
        activityName,
        activityDescription
    );
}

/**
 * Determine if request should be skipped from logging
 */
function shouldSkipLogging(path) {
    const skipPaths = [
        '/favicon.ico',
        '/robots.txt',
        '/health',
        '/ping',
        '/status'
    ];
    
    const skipPatterns = [
        /^\/css\//,
        /^\/js\//,
        /^\/img\//,
        /^\/images\//,
        /^\/static\//,
        /^\/assets\//,
        /\.(css|js|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$/i
    ];
    
    // Skip specific paths
    if (skipPaths.includes(path)) {
        return true;
    }
    
    // Skip pattern matches
    return skipPatterns.some(pattern => pattern.test(path));
}

/**
 * Extract error details from response
 */
function getErrorDetails(res) {
    const statusCode = res.statusCode;
    
    // Map common HTTP status codes to descriptions
    const statusMessages = {
        400: 'Bad Request',
        401: 'Unauthorized',
        403: 'Forbidden',
        404: 'Not Found',
        405: 'Method Not Allowed',
        409: 'Conflict',
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout'
    };
    
    return {
        statusCode: statusCode,
        statusMessage: statusMessages[statusCode] || 'Unknown Error',
        contentType: res.get('Content-Type')
    };
}

/**
 * Middleware specifically for logging user learning activities
 * Use this for educational interactions that need special xAPI treatment
 */
function xapiLearningLogger(activityType, verb, objectName) {
    return async (req, res, next) => {
        try {
            // Skip if user is not authenticated
            if (!req.user || !req.user.email) {
                return next();
            }
            
            // Import xAPI config
            const xapiConfig = require('../config/xapi');
            
            // Skip if xAPI is not initialized
            if (!xapiConfig.initialized) {
                return next();
            }
            
            const lrs = xapiConfig.getLRS();
            
            // Create specific learning activity statement
            const statement = new TinCan.Statement({
                id: uuid.v4(),
                actor: xapiConfig.createActor(req.user.email, req.user.name),
                verb: xapiConfig.createVerb(verb, verb),
                object: xapiConfig.createActivity(
                    `learning/${objectName}`,
                    activityType,
                    objectName,
                    `User ${verb} ${objectName} in HuLab Portal`
                ),
                context: xapiConfig.createContext({
                    extensions: {
                        'http://hulab.edu.hk/extensions/user-role': req.user.role,
                        'http://hulab.edu.hk/extensions/session-id': req.sessionID,
                        'http://hulab.edu.hk/extensions/path': req.path
                    }
                }),
                timestamp: new Date().toISOString()
            });
            
            // Save statement to LRS (async, don't block)
            lrs.saveStatement(statement, {
                callback: (err, xhr) => {
                    if (err) {
                        logger.error('Failed to log learning activity to xAPI', {
                            error: err.message,
                            activityType,
                            verb,
                            objectName,
                            userId: req.user.id
                        });
                    } else {
                        logger.debug('Learning activity logged to xAPI', {
                            activityType,
                            verb,
                            objectName,
                            userId: req.user.id,
                            statementId: statement.id
                        });
                    }
                }
            });
            
        } catch (error) {
            logger.error('Error in xAPI learning activity logging', {
                error: error.message,
                activityType,
                verb,
                objectName
            });
        }
        
        next();
    };
}

module.exports = {
    xapiLogger,
    xapiLearningLogger
};