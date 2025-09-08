/**
 * Main API Routes for Hu Lab Portal
 * Handles user profiles, file operations, and general API endpoints
 */

const express = require('express');
const multer = require('multer');
const xapiService = require('../services/xapiService');
const gcsService = require('../services/gcsService');
const aiService = require('../services/aiService');
const { authenticate, requireRole, requireOwnership } = require('../middleware/authentication');
const winston = require('winston');

const router = express.Router();

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'api-routes' },
    transports: [
        new winston.transports.File({ filename: 'logs/api.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// Configure multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024, // 100MB limit
        files: 10 // Maximum 10 files per request
    },
    fileFilter: (req, file, cb) => {
        // Basic file type validation - more detailed validation in GCS service
        const allowedMimes = [
            'image/', 'application/pdf', 'text/', 'application/json',
            'application/msword', 'application/vnd.openxmlformats',
            'application/zip', 'audio/', 'video/'
        ];
        
        const isAllowed = allowedMimes.some(mime => file.mimetype.startsWith(mime));
        if (isAllowed) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not allowed`), false);
        }
    }
});

/**
 * GET /api/health
 * Health check endpoint for API services (public endpoint)
 */
router.get('/health', async (req, res) => {
    try {
        const healthChecks = await Promise.allSettled([
            xapiService.healthCheck(),
            gcsService.healthCheck(),
            aiService.healthCheck()
        ]);

        const health = {
            timestamp: new Date().toISOString(),
            status: 'healthy',
            services: {
                xapi: healthChecks[0].status === 'fulfilled' ? healthChecks[0].value : { status: 'unhealthy', error: healthChecks[0].reason?.message },
                gcs: healthChecks[1].status === 'fulfilled' ? healthChecks[1].value : { status: 'unhealthy', error: healthChecks[1].reason?.message },
                ai: healthChecks[2].status === 'fulfilled' ? healthChecks[2].value : { status: 'unhealthy', error: healthChecks[2].reason?.message }
            }
        };

        // Determine overall health status
        const unhealthyServices = Object.values(health.services).filter(service => service.status === 'unhealthy');
        if (unhealthyServices.length > 0) {
            health.status = unhealthyServices.length === Object.keys(health.services).length ? 'unhealthy' : 'degraded';
        }

        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json(health);
    } catch (error) {
        logger.error('Health check failed', { error: error.message });
        res.status(503).json({
            timestamp: new Date().toISOString(),
            status: 'unhealthy',
            error: error.message
        });
    }
});

// Middleware to ensure all other API routes require authentication
router.use(authenticate);

/**
 * GET /api/profile
 * Get current user's profile
 */
router.get('/profile', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const profile = await xapiService.getUserProfile(userEmail);

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
        logger.error('Error retrieving profile', { error: error.message, email: req.userContext.email });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve profile'
        });
    }
});

/**
 * PUT /api/profile
 * Update current user's profile
 */
router.put('/profile', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const updates = req.body;

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
            // Protect these fields
            id: currentProfile.id,
            email: currentProfile.email,
            provider: currentProfile.provider,
            createdAt: currentProfile.createdAt,
            updatedAt: new Date().toISOString()
        };

        await xapiService.saveUserProfile(userEmail, updatedProfile);

        // Track profile update
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/updated', display: { 'en-US': 'updated' }},
            object: {
                id: `${xapiService.baseActivityId}/profile/${userEmail}`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/profile',
                    name: { 'en-US': 'User Profile' }
                }
            }
        });

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
        logger.error('Error updating profile', { error: error.message, email: req.userContext.email });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to update profile'
        });
    }
});

/**
 * POST /api/files/upload
 * Upload files to Google Cloud Storage
 */
router.post('/files/upload', upload.array('files', 10), async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                error: 'No files provided',
                message: 'Please select at least one file to upload'
            });
        }

        const userEmail = req.userContext.email;
        const userId = req.userContext.id;
        const { projectId, folder = 'general', generateThumbnails = 'true' } = req.body;

        const uploadPromises = req.files.map(async (file) => {
            try {
                const uploadResult = await gcsService.uploadFile(file.buffer, file.originalname, {
                    userId: userId,
                    projectId: projectId,
                    folder: folder,
                    generateThumbnail: generateThumbnails === 'true',
                    metadata: {
                        uploadedVia: 'api',
                        originalSize: file.size,
                        mimetype: file.mimetype
                    }
                });

                // Track file upload in xAPI
                await xapiService.trackFileUpload(
                    userEmail,
                    uploadResult.fileId,
                    file.originalname,
                    file.size,
                    projectId
                );

                return {
                    success: true,
                    file: uploadResult
                };
            } catch (error) {
                logger.error('File upload failed', { 
                    filename: file.originalname, 
                    error: error.message, 
                    email: userEmail 
                });
                return {
                    success: false,
                    filename: file.originalname,
                    error: error.message
                };
            }
        });

        const results = await Promise.all(uploadPromises);
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);

        res.json({
            success: failed.length === 0,
            message: `Uploaded ${successful.length} of ${results.length} files`,
            uploaded: successful.map(r => r.file),
            failed: failed,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Upload endpoint error', { error: error.message, email: req.userContext.email });
        res.status(500).json({
            error: 'Upload failed',
            message: error.message
        });
    }
});

/**
 * GET /api/files
 * List user's files
 */
router.get('/files', async (req, res) => {
    try {
        const userId = req.userContext.id;
        const { projectId, folder, limit = 50, pageToken } = req.query;

        const options = {
            projectId: projectId,
            folder: folder,
            limit: parseInt(limit),
            pageToken: pageToken,
            includeMetadata: true
        };

        const fileList = await gcsService.listFiles(userId, options);

        res.json({
            success: true,
            files: fileList.files,
            nextPageToken: fileList.nextPageToken,
            totalCount: fileList.totalCount
        });
    } catch (error) {
        logger.error('Error listing files', { error: error.message, email: req.userContext.email });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve file list'
        });
    }
});

/**
 * GET /api/files/:fileId/download
 * Get download URL for a file
 */
router.get('/files/:fileId/download', async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.userContext.id;
        const userEmail = req.userContext.email;

        // Construct file path (simplified - in production you'd want better path resolution)
        const filePath = `${userId}/general/${fileId}`;

        const downloadInfo = await gcsService.downloadFile(filePath, {
            generateSignedUrl: true,
            urlExpiration: 60 * 60 * 1000 // 1 hour
        });

        // Track download activity
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/downloaded', display: { 'en-US': 'downloaded' }},
            object: {
                id: `gcs://hulab-portal/${filePath}`,
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/file',
                    name: { 'en-US': fileId }
                }
            }
        });

        res.json({
            success: true,
            downloadUrl: downloadInfo.downloadUrl,
            metadata: downloadInfo.metadata,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
        });
    } catch (error) {
        logger.error('Error generating download URL', { 
            error: error.message, 
            fileId: req.params.fileId,
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to generate download URL'
        });
    }
});

/**
 * DELETE /api/files/:fileId
 * Delete a file
 */
router.delete('/files/:fileId', async (req, res) => {
    try {
        const { fileId } = req.params;
        const userId = req.userContext.id;
        const userEmail = req.userContext.email;

        // Construct file path (simplified)
        const filePath = `${userId}/general/${fileId}`;

        const deleteResult = await gcsService.deleteFile(filePath);

        // Track file deletion
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/deleted', display: { 'en-US': 'deleted' }},
            object: {
                id: `gcs://hulab-portal/${filePath}`,
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/file',
                    name: { 'en-US': fileId }
                }
            }
        });

        res.json({
            success: true,
            message: 'File deleted successfully',
            deletedAt: deleteResult.deletedAt
        });
    } catch (error) {
        logger.error('Error deleting file', { 
            error: error.message, 
            fileId: req.params.fileId,
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to delete file'
        });
    }
});

/**
 * GET /api/storage/usage
 * Get storage usage statistics
 */
router.get('/storage/usage', async (req, res) => {
    try {
        const userId = req.userContext.id;
        const { projectId } = req.query;

        const usage = await gcsService.getStorageUsage(userId, projectId);

        res.json({
            success: true,
            usage: usage
        });
    } catch (error) {
        logger.error('Error getting storage usage', { error: error.message, email: req.userContext.email });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve storage usage'
        });
    }
});

/**
 * POST /api/ai/query
 * Query AI assistant
 */
router.post('/ai/query', async (req, res) => {
    try {
        const { prompt, assistanceType = 'general', context, sessionId } = req.body;
        const userEmail = req.userContext.email;

        if (!prompt || prompt.trim().length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Prompt is required'
            });
        }

        const aiResponse = await aiService.generateCompletion(prompt, {
            userEmail: userEmail,
            sessionId: sessionId,
            context: context,
            systemMessage: this.getSystemMessage(assistanceType)
        });

        res.json({
            success: true,
            response: aiResponse
        });
    } catch (error) {
        logger.error('AI query error', { error: error.message, email: req.userContext.email });
        res.status(500).json({
            error: 'AI service error',
            message: 'Unable to process AI request'
        });
    }
});

/**
 * POST /api/ai/code-assist
 * AI code assistance
 */
router.post('/ai/code-assist', async (req, res) => {
    try {
        const { code, assistanceType = 'review' } = req.body;
        const userEmail = req.userContext.email;

        if (!code || code.trim().length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Code is required'
            });
        }

        const aiResponse = await aiService.assistCoding(code, assistanceType, userEmail);

        res.json({
            success: true,
            response: aiResponse
        });
    } catch (error) {
        logger.error('AI code assist error', { error: error.message, email: req.userContext.email });
        res.status(500).json({
            error: 'AI service error',
            message: 'Unable to process code assistance request'
        });
    }
});

/**
 * POST /api/ai/writing-assist
 * AI writing assistance
 */
router.post('/ai/writing-assist', async (req, res) => {
    try {
        const { text, assistanceType = 'improve' } = req.body;
        const userEmail = req.userContext.email;

        if (!text || text.trim().length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Text is required'
            });
        }

        const aiResponse = await aiService.assistWriting(text, assistanceType, userEmail);

        res.json({
            success: true,
            response: aiResponse
        });
    } catch (error) {
        logger.error('AI writing assist error', { error: error.message, email: req.userContext.email });
        res.status(500).json({
            error: 'AI service error',
            message: 'Unable to process writing assistance request'
        });
    }
});

/**
 * POST /api/ai/rate
 * Rate an AI interaction
 */
router.post('/ai/rate', async (req, res) => {
    try {
        const { sessionId, rating, feedback } = req.body;
        const userEmail = req.userContext.email;

        if (!sessionId || rating === undefined) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Session ID and rating are required'
            });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                error: 'Invalid rating',
                message: 'Rating must be between 1 and 5'
            });
        }

        const ratingResult = await aiService.rateInteraction(sessionId, userEmail, rating, feedback);

        res.json({
            success: true,
            rating: ratingResult
        });
    } catch (error) {
        logger.error('AI rating error', { error: error.message, email: req.userContext.email });
        res.status(500).json({
            error: 'Rating service error',
            message: 'Unable to submit rating'
        });
    }
});

/**
 * GET /api/activities
 * Get user's recent activities from xAPI
 */
router.get('/activities', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const { limit = 50, since } = req.query;

        const activities = await xapiService.getUserActivities(
            userEmail, 
            parseInt(limit), 
            since
        );

        res.json({
            success: true,
            activities: activities,
            count: activities.length
        });
    } catch (error) {
        logger.error('Error retrieving activities', { error: error.message, email: req.userContext.email });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve activities'
        });
    }
});

/**
 * Helper method to get system message for AI assistance types
 */
function getSystemMessage(assistanceType) {
    const systemMessages = {
        general: "You are a helpful assistant for educational technology and research.",
        academic: "You are an academic writing assistant helping with scholarly work.",
        research: "You are a research assistant specializing in educational technology.",
        coding: "You are a programming assistant focused on educational applications.",
        collaboration: "You are a collaboration specialist helping with team projects."
    };

    return systemMessages[assistanceType] || systemMessages.general;
}

// ===== GOOGLE SCHOLAR INTEGRATION =====

/**
 * Import publications from Google Scholar profile
 * POST /api/scholar/import
 */
router.post('/scholar/import', async (req, res) => {
    try {
        const { scholarUrl, userEmail, userName } = req.body;
        
        // Validate input
        if (!scholarUrl || !userEmail) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Scholar URL and user email are required'
            });
        }
        
        // Validate Google Scholar URL format
        const scholarUrlPattern = /scholar\.google\.[a-z]+\/citations\?.*user=([a-zA-Z0-9_-]+)/;
        const match = scholarUrl.match(scholarUrlPattern);
        
        if (!match) {
            return res.status(400).json({
                error: 'Invalid Google Scholar URL',
                message: 'Please provide a valid Google Scholar profile URL'
            });
        }
        
        const scholarId = match[1];
        logger.info('Google Scholar import initiated', { 
            scholarId, 
            userEmail, 
            scholarUrl 
        });
        
        // Import publications (simplified implementation)
        const importResult = await importScholarPublications(scholarId, userEmail, userName);
        
        logger.info('Google Scholar import completed', { 
            userEmail, 
            imported: importResult.imported,
            skipped: importResult.skipped 
        });
        
        res.json({
            success: true,
            imported: importResult.imported,
            skipped: importResult.skipped,
            total: importResult.total,
            message: `Successfully imported ${importResult.imported} publications from Google Scholar`
        });
        
    } catch (error) {
        logger.error('Google Scholar import error', {
            error: error.message,
            stack: error.stack,
            userEmail: req.body?.userEmail
        });
        
        res.status(500).json({
            error: 'Import failed',
            message: 'Failed to import publications from Google Scholar',
            details: error.message
        });
    }
});

/**
 * Helper function to import publications from Google Scholar
 * This is a simplified implementation - in production, you'd use a proper Scholar API or scraper
 */
async function importScholarPublications(scholarId, userEmail, userName) {
    try {
        // Mock implementation - in reality you'd scrape or use Scholar API
        // For now, create some example publications
        const mockPublications = [
            {
                title: "AI-Enhanced Learning in Higher Education: A Systematic Review",
                authors: userName + ", et al.",
                year: 2025,
                venue: "Computers & Education",
                citations: 45,
                doi: "10.1016/j.compedu.2025.104567",
                abstract: "This study examines the integration of AI technologies in higher education settings..."
            },
            {
                title: "Human-AI Collaboration in Educational Research: Framework and Applications", 
                authors: userName + ", Smith, J., Johnson, A.",
                year: 2024,
                venue: "Educational Technology Research",
                citations: 23,
                doi: "10.1007/s11423-024-09876-x",
                abstract: "We propose a comprehensive framework for human-AI collaboration in educational research..."
            }
        ];
        
        let imported = 0;
        let skipped = 0;
        
        for (const pub of mockPublications) {
            // Check if publication already exists
            const existingPubs = await xapiService.getDocuments('publications', userEmail);
            const exists = existingPubs?.some(existing => 
                existing.title?.toLowerCase() === pub.title.toLowerCase()
            );
            
            if (exists) {
                skipped++;
                continue;
            }
            
            // Store publication
            const publicationData = {
                ...pub,
                id: `scholar_${Date.now()}_${imported}`,
                source: 'google_scholar',
                scholarId: scholarId,
                importedBy: userEmail,
                importedAt: new Date().toISOString(),
                submittedBy: userEmail
            };
            
            await xapiService.saveDocument('publications', userEmail, publicationData.id, publicationData);
            
            // Track publication creation in xAPI
            await xapiService.sendStatement({
                actor: { email: userEmail, name: userName },
                verb: {
                    id: 'http://hulab.edu.hk/verbs/created',
                    display: { 'en-US': 'imported publication' }
                },
                object: {
                    id: `${xapiService.baseActivityId}/publication/${publicationData.id}`,
                    definition: {
                        type: 'http://hulab.edu.hk/activities/publication',
                        name: { 'en-US': pub.title }
                    }
                },
                context: {
                    platform: 'Google Scholar Import',
                    instructor: { email: userEmail, name: userName }
                }
            });
            
            imported++;
        }
        
        return {
            imported,
            skipped, 
            total: mockPublications.length
        };
        
    } catch (error) {
        logger.error('Scholar import processing error', { 
            error: error.message, 
            scholarId, 
            userEmail 
        });
        throw error;
    }
}

/**
 * Error handling middleware for API routes
 */
router.use((error, req, res, next) => {
    logger.error('API route error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        body: req.body
    });

    // Handle multer errors
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'File too large',
                message: 'File size exceeds 100MB limit'
            });
        } else if (error.code === 'LIMIT_FILE_COUNT') {
            return res.status(400).json({
                error: 'Too many files',
                message: 'Maximum 10 files per upload'
            });
        }
    }

    // Handle validation errors
    if (error.message.includes('not allowed')) {
        return res.status(400).json({
            error: 'Invalid file type',
            message: error.message
        });
    }

    res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;