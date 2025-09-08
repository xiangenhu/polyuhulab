const express = require('express');
const session = require('express-session');
const passport = require('passport');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const path = require('path');
const { createServer } = require('http');
const { Server } = require('socket.io');
const winston = require('winston');

// Load environment variables
dotenv.config();

// Initialize express app
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        credentials: true
    }
});

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'hulab-portal' },
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Import configurations
const authConfig = require('./config/auth');
const xapiConfig = require('./config/xapi');
const gcsConfig = require('./config/gcs');

// Import middleware
const { xapiLogger } = require('./middleware/xapiLogger');
const { authenticate } = require('./middleware/authentication');
const { errorHandler } = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const researchRoutes = require('./routes/research');
const analyticsRoutes = require('./routes/analytics');
const collaborationRoutes = require('./routes/collaboration');

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://code.jquery.com", "https://accounts.google.com", "https://cdn.jsdelivr.net", "https://oauth.skoonline.org"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "https:", "https://oauth.skoonline.org"],
            frameSrc: ["'self'", "https://accounts.google.com", "https://oauth.skoonline.org"],
        },
    },
}));

// CORS configuration
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(compression());

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET || 'default-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

// Initialize authentication
authConfig.initialize(passport);

// xAPI logging middleware - log all requests
app.use(xapiLogger);

// Static files with proper MIME types
app.use(express.static(path.join(__dirname, 'public')));

// Serve CSS and JS files from views with correct MIME types
app.get('/shared-styles.css', (req, res) => {
    res.setHeader('Content-Type', 'text/css');
    res.sendFile(path.join(__dirname, 'views', 'shared-styles.css'));
});

app.get('/shared-app.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'views', 'shared-app.js'));
});

// Serve OAuth authentication script
app.get('/oauth-auth.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript');
    res.sendFile(path.join(__dirname, 'views', 'oauth-auth.js'));
});

// Serve other static files from views
app.use('/views', express.static(path.join(__dirname, 'views'), {
    setHeaders: (res, filepath) => {
        if (filepath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (filepath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// API Routes
app.use('/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/research', researchRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/collaboration', collaborationRoutes);

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

app.get('/index.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// Public pages (no authentication required)
app.get('/about.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'about.html'));
});

app.get('/projects.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'projects.html'));
});

app.get('/publications.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'publications.html'));
});

app.get('/members.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'members.html'));
});

app.get('/news.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'news.html'));
});

app.get('/events.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'events.html'));
});

app.get('/resources.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'resources.html'));
});

// Protected pages (require authentication)
app.get('/dashboard.html', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/research.html', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'research.html'));
});

app.get('/analytics.html', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'analytics.html'));
});

app.get('/collaboration.html', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'collaboration.html'));
});

app.get('/assessment.html', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'assessment.html'));
});

// Legacy routes without .html extension
app.get('/dashboard', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/research', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'research.html'));
});

app.get('/analytics', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'analytics.html'));
});

app.get('/collaboration', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'collaboration.html'));
});

app.get('/assessment', authenticate, (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'assessment.html'));
});

app.get('/projects', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'projects.html'));
});

app.get('/publications', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'publications.html'));
});

app.get('/members', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'members.html'));
});

app.get('/news', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'news.html'));
});

app.get('/events', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'events.html'));
});

app.get('/resources', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'resources.html'));
});

app.get('/about', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'about.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});

// WebSocket configuration for real-time features
io.use((socket, next) => {
    const sessionMiddleware = session({
        secret: process.env.SESSION_SECRET || 'default-secret-change-in-production',
        resave: false,
        saveUninitialized: false
    });
    sessionMiddleware(socket.request, {}, next);
});

io.on('connection', (socket) => {
    logger.info('New WebSocket connection', { socketId: socket.id });
    
    // Join user to their personal room
    if (socket.request.session && socket.request.session.userId) {
        socket.join(`user:${socket.request.session.userId}`);
    }
    
    // Handle joining project rooms
    socket.on('join-project', (projectId) => {
        socket.join(`project:${projectId}`);
        socket.to(`project:${projectId}`).emit('user-joined', {
            userId: socket.request.session.userId,
            socketId: socket.id
        });
    });
    
    // Handle collaborative editing
    socket.on('document-change', (data) => {
        socket.to(`project:${data.projectId}`).emit('document-update', {
            ...data,
            userId: socket.request.session.userId,
            timestamp: new Date().toISOString()
        });
        
        // Log collaboration activity to xAPI
        const xapiService = require('./services/xapiService');
        xapiService.logCollaboration({
            userId: socket.request.session.userId,
            projectId: data.projectId,
            action: 'edited',
            details: data
        });
    });
    
    // Handle real-time chat
    socket.on('chat-message', (data) => {
        io.to(`project:${data.projectId}`).emit('new-message', {
            ...data,
            userId: socket.request.session.userId,
            timestamp: new Date().toISOString()
        });
    });
    
    // Handle user presence
    socket.on('user-typing', (data) => {
        socket.to(`project:${data.projectId}`).emit('user-typing-update', {
            userId: socket.request.session.userId,
            isTyping: data.isTyping
        });
    });
    
    // Handle disconnect
    socket.on('disconnect', () => {
        logger.info('WebSocket disconnection', { socketId: socket.id });
        io.emit('user-disconnected', {
            userId: socket.request.session?.userId,
            socketId: socket.id
        });
    });
});

// Error handling middleware (should be last)
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource was not found',
        path: req.originalUrl
    });
});

// Start server
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    logger.info(`Hu Lab Portal server running on port ${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`WebSocket server initialized`);
    
    // Initialize services
    xapiConfig.initialize().then(() => {
        logger.info('xAPI service initialized');
    }).catch(err => {
        logger.error('Failed to initialize xAPI service:', err);
    });
    
    gcsConfig.initialize().then(() => {
        logger.info('Google Cloud Storage service initialized');
    }).catch(err => {
        logger.error('Failed to initialize GCS service:', err);
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM signal received: closing HTTP server');
    httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

module.exports = { app, io };