const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'error-handler' },
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

/**
 * Global error handling middleware
 * Catches all unhandled errors and provides appropriate responses
 */
function errorHandler(err, req, res, next) {
    // Log the error with context
    const errorContext = {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user ? req.user.id : 'anonymous',
        sessionId: req.sessionID,
        timestamp: new Date().toISOString()
    };
    
    // Add request body for POST/PUT requests (but sanitize sensitive data)
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
        errorContext.requestBody = sanitizeRequestBody(req.body);
    }
    
    // Add query parameters
    if (Object.keys(req.query).length > 0) {
        errorContext.queryParams = req.query;
    }
    
    // Log error with appropriate level based on error type
    if (err.status >= 400 && err.status < 500) {
        logger.warn('Client error occurred', errorContext);
    } else {
        logger.error('Server error occurred', errorContext);
    }
    
    // Log to xAPI if available (async, don't block response)
    setImmediate(() => {
        logErrorToXAPI(err, req, errorContext);
    });
    
    // Determine error status and message
    const status = err.status || err.statusCode || 500;
    const message = determineErrorMessage(err, status);
    const details = determineErrorDetails(err, status);
    
    // Handle different response types
    if (req.path.startsWith('/api/') || req.xhr || req.accepts('json')) {
        // API/AJAX request - return JSON error
        const errorResponse = {
            error: true,
            status: status,
            message: message,
            timestamp: new Date().toISOString(),
            path: req.path,
            method: req.method
        };
        
        // Add error details in development/debug mode
        if (process.env.NODE_ENV === 'development' || process.env.DEBUG_ERRORS === 'true') {
            errorResponse.details = details;
            errorResponse.stack = err.stack;
        }
        
        // Add request ID if available
        if (req.id) {
            errorResponse.requestId = req.id;
        }
        
        return res.status(status).json(errorResponse);
    } else {
        // Browser request - render error page
        const errorData = {
            title: getErrorTitle(status),
            message: message,
            status: status,
            timestamp: new Date().toISOString(),
            showDetails: process.env.NODE_ENV === 'development',
            details: process.env.NODE_ENV === 'development' ? details : null,
            stack: process.env.NODE_ENV === 'development' ? err.stack : null
        };
        
        // Try to render error page, fallback to simple response
        try {
            return res.status(status).render('error', errorData);
        } catch (renderError) {
            logger.error('Failed to render error page', {
                originalError: err.message,
                renderError: renderError.message,
                path: req.path
            });
            
            // Fallback to simple HTML response
            return res.status(status).send(`
                <!DOCTYPE html>
                <html>
                <head>
                    <title>Error ${status}</title>
                    <meta charset="utf-8">
                    <style>
                        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
                        .error-container { background: #f8f9fa; border: 1px solid #dee2e6; border-radius: 5px; padding: 20px; }
                        .error-code { color: #dc3545; font-size: 24px; margin-bottom: 10px; }
                        .error-message { margin-bottom: 15px; }
                        .error-timestamp { color: #6c757d; font-size: 14px; }
                    </style>
                </head>
                <body>
                    <div class="error-container">
                        <div class="error-code">Error ${status}</div>
                        <div class="error-message">${message}</div>
                        <div class="error-timestamp">Timestamp: ${errorData.timestamp}</div>
                    </div>
                </body>
                </html>
            `);
        }
    }
}

/**
 * Async function to log errors to xAPI
 */
async function logErrorToXAPI(err, req, errorContext) {
    try {
        // Import xAPI config
        const xapiConfig = require('../config/xapi');
        
        // Skip if xAPI is not initialized
        if (!xapiConfig.initialized) {
            return;
        }
        
        const lrs = xapiConfig.getLRS();
        const TinCan = require('tincanjs');
        const uuid = require('uuid');
        
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
        
        // Create error statement
        const statement = new TinCan.Statement({
            id: uuid.v4(),
            actor: actor,
            verb: xapiConfig.createVerb('failed', 'encountered error'),
            object: xapiConfig.createActivity(
                `error/${err.status || 500}`,
                'interaction',
                `Error ${err.status || 500}`,
                `System error encountered: ${err.message}`
            ),
            context: xapiConfig.createContext({
                extensions: {
                    'http://hulab.edu.hk/extensions/error-type': err.name || 'Error',
                    'http://hulab.edu.hk/extensions/error-message': err.message,
                    'http://hulab.edu.hk/extensions/error-status': err.status || 500,
                    'http://hulab.edu.hk/extensions/request-path': req.path,
                    'http://hulab.edu.hk/extensions/request-method': req.method,
                    'http://hulab.edu.hk/extensions/user-agent': req.get('User-Agent'),
                    'http://hulab.edu.hk/extensions/ip-address': req.ip,
                    'http://hulab.edu.hk/extensions/session-id': req.sessionID
                }
            }),
            result: xapiConfig.createResult({
                success: false,
                extensions: {
                    'http://hulab.edu.hk/extensions/error-stack': process.env.NODE_ENV === 'development' ? err.stack : 'Stack trace hidden in production'
                }
            }),
            timestamp: new Date().toISOString()
        });
        
        // Save statement to LRS
        lrs.saveStatement(statement, {
            callback: (xapiErr, xhr) => {
                if (xapiErr) {
                    logger.error('Failed to log error to xAPI', {
                        xapiError: xapiErr.message,
                        originalError: err.message
                    });
                } else {
                    logger.debug('Error logged to xAPI successfully', {
                        statementId: statement.id,
                        errorStatus: err.status || 500
                    });
                }
            }
        });
        
    } catch (xapiError) {
        logger.error('Error in xAPI error logging', {
            xapiError: xapiError.message,
            originalError: err.message
        });
    }
}

/**
 * Determine user-friendly error message
 */
function determineErrorMessage(err, status) {
    // Use custom error message if available
    if (err.message && !err.message.includes('Error:')) {
        return err.message;
    }
    
    // Default messages based on status code
    const defaultMessages = {
        400: 'Bad request. Please check your input and try again.',
        401: 'You need to be logged in to access this resource.',
        403: 'You do not have permission to access this resource.',
        404: 'The requested resource could not be found.',
        405: 'This request method is not allowed for this resource.',
        409: 'There was a conflict with the current state of the resource.',
        422: 'The request contains invalid data.',
        429: 'Too many requests. Please try again later.',
        500: 'An internal server error occurred. Please try again later.',
        502: 'Bad gateway. The server received an invalid response.',
        503: 'Service temporarily unavailable. Please try again later.',
        504: 'Gateway timeout. The request took too long to process.'
    };
    
    return defaultMessages[status] || 'An unexpected error occurred.';
}

/**
 * Determine error details for debugging
 */
function determineErrorDetails(err, status) {
    const details = {
        type: err.name || 'Error',
        code: err.code || null,
        status: status
    };
    
    // Add specific error details based on error type
    if (err.name === 'ValidationError') {
        details.validationErrors = err.errors;
    } else if (err.name === 'CastError') {
        details.path = err.path;
        details.value = err.value;
    } else if (err.name === 'MongoError') {
        details.mongoCode = err.code;
    } else if (err.name === 'MulterError') {
        details.field = err.field;
        details.storageErrors = err.storageErrors;
    }
    
    return details;
}

/**
 * Get error title based on status code
 */
function getErrorTitle(status) {
    const titles = {
        400: 'Bad Request',
        401: 'Authentication Required',
        403: 'Access Forbidden',
        404: 'Page Not Found',
        405: 'Method Not Allowed',
        409: 'Conflict',
        422: 'Unprocessable Entity',
        429: 'Too Many Requests',
        500: 'Internal Server Error',
        502: 'Bad Gateway',
        503: 'Service Unavailable',
        504: 'Gateway Timeout'
    };
    
    return titles[status] || `Error ${status}`;
}

/**
 * Sanitize request body to remove sensitive information
 */
function sanitizeRequestBody(body) {
    if (!body || typeof body !== 'object') {
        return body;
    }
    
    const sensitiveFields = [
        'password',
        'token',
        'secret',
        'key',
        'auth',
        'authorization',
        'credential',
        'apikey',
        'api_key'
    ];
    
    const sanitized = { ...body };
    
    Object.keys(sanitized).forEach(key => {
        const lowerKey = key.toLowerCase();
        if (sensitiveFields.some(field => lowerKey.includes(field))) {
            sanitized[key] = '[REDACTED]';
        }
    });
    
    return sanitized;
}

/**
 * Middleware for handling 404 errors (route not found)
 */
function notFoundHandler(req, res, next) {
    const error = new Error(`Route not found: ${req.method} ${req.path}`);
    error.status = 404;
    next(error);
}

/**
 * Middleware for handling async errors
 * Wraps async route handlers to catch rejected promises
 */
function asyncErrorHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

/**
 * Development error handler - includes stack traces
 */
function developmentErrorHandler(err, req, res, next) {
    logger.error('Development error:', {
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
        body: req.body,
        query: req.query,
        params: req.params
    });
    
    const status = err.status || 500;
    
    if (req.path.startsWith('/api/') || req.xhr || req.accepts('json')) {
        return res.status(status).json({
            error: true,
            status: status,
            message: err.message,
            stack: err.stack,
            path: req.path,
            method: req.method,
            timestamp: new Date().toISOString()
        });
    }
    
    return res.status(status).render('error', {
        title: `Error ${status}`,
        message: err.message,
        error: err,
        status: status,
        stack: err.stack
    });
}

/**
 * Production error handler - hides stack traces and sensitive info
 */
function productionErrorHandler(err, req, res, next) {
    // Only log server errors in production
    if (!err.status || err.status >= 500) {
        logger.error('Production error:', {
            message: err.message,
            path: req.path,
            method: req.method,
            userId: req.user ? req.user.id : 'anonymous',
            ip: req.ip
        });
    }
    
    const status = err.status || 500;
    const message = determineErrorMessage(err, status);
    
    if (req.path.startsWith('/api/') || req.xhr || req.accepts('json')) {
        return res.status(status).json({
            error: true,
            status: status,
            message: message,
            timestamp: new Date().toISOString()
        });
    }
    
    return res.status(status).render('error', {
        title: getErrorTitle(status),
        message: message,
        status: status,
        error: {} // Hide error details in production
    });
}

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncErrorHandler,
    developmentErrorHandler,
    productionErrorHandler
};