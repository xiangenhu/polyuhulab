/**
 * Analytics Routes for Hu Lab Portal
 * Handles analytics and reporting endpoints for learning analytics, user engagement, and research insights
 */

const express = require('express');
const analyticsService = require('../services/analyticsService');
const xapiService = require('../services/xapiService');
const { authenticate, requireRole, requirePermission } = require('../middleware/authentication');
const winston = require('winston');

const router = express.Router();

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'analytics-routes' },
    transports: [
        new winston.transports.File({ filename: 'logs/analytics.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// All analytics routes require authentication
router.use(authenticate);

/**
 * GET /analytics/dashboard
 * Get dashboard overview analytics
 */
router.get('/dashboard', async (req, res) => {
    try {
        const { timeRange = 'last30days', includePersonal = 'true' } = req.query;
        const userEmail = includePersonal === 'true' ? req.userContext.email : null;

        const overview = await analyticsService.getDashboardOverview(userEmail, timeRange);

        // Track analytics access
        await xapiService.sendStatement({
            actor: { email: req.userContext.email },
            verb: { id: 'http://hulab.edu.hk/verbs/viewed', display: { 'en-US': 'viewed' }},
            object: {
                id: `${xapiService.baseActivityId}/analytics/dashboard`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/analytics-dashboard',
                    name: { 'en-US': 'Analytics Dashboard' }
                }
            },
            context: {
                extensions: {
                    'http://hulab.edu.hk/time-range': timeRange,
                    'http://hulab.edu.hk/personal-view': includePersonal === 'true'
                }
            }
        });

        res.json({
            success: true,
            dashboard: overview
        });
    } catch (error) {
        logger.error('Error retrieving dashboard analytics', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve dashboard analytics'
        });
    }
});

/**
 * GET /analytics/user
 * Get user-specific analytics
 */
router.get('/user', async (req, res) => {
    try {
        const { timeRange = 'last30days', targetUser } = req.query;
        const requestingUserEmail = req.userContext.email;
        
        // Determine target user
        let targetUserEmail = requestingUserEmail;
        if (targetUser) {
            // Check if user has permission to view other users' analytics
            if (req.userContext.role !== 'admin' && !req.userContext.role !== 'instructor') {
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'You do not have permission to view other users\' analytics'
                });
            }
            targetUserEmail = targetUser;
        }

        const userAnalytics = await analyticsService.getUserAnalytics(targetUserEmail, timeRange);

        // Track analytics access
        await xapiService.sendStatement({
            actor: { email: requestingUserEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/analyzed', display: { 'en-US': 'analyzed' }},
            object: {
                id: `${xapiService.baseActivityId}/analytics/user/${targetUserEmail}`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/user-analytics',
                    name: { 'en-US': `User Analytics for ${targetUserEmail}` }
                }
            },
            context: {
                extensions: {
                    'http://hulab.edu.hk/time-range': timeRange
                }
            }
        });

        res.json({
            success: true,
            analytics: userAnalytics
        });
    } catch (error) {
        logger.error('Error retrieving user analytics', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve user analytics'
        });
    }
});

/**
 * GET /analytics/project/:projectId
 * Get project-specific analytics
 */
router.get('/project/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const { timeRange = 'all' } = req.query;
        const userEmail = req.userContext.email;

        // Check if user has access to this project
        const projectData = await xapiService.getActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data'
        );

        if (!projectData) {
            return res.status(404).json({
                error: 'Project not found',
                message: 'Project could not be found or you do not have access'
            });
        }

        const hasAccess = projectData.createdBy === userEmail || 
                         projectData.collaborators.some(collab => collab.email === userEmail) ||
                         req.userContext.role === 'admin';

        if (!hasAccess) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this project\'s analytics'
            });
        }

        const projectAnalytics = await analyticsService.getProjectAnalytics(projectId, timeRange);

        // Track analytics access
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/analyzed', display: { 'en-US': 'analyzed' }},
            object: {
                id: `${xapiService.baseActivityId}/project/${projectId}/analytics`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/project-analytics',
                    name: { 'en-US': `Project Analytics for ${projectData.title}` }
                }
            },
            context: {
                extensions: {
                    'http://hulab.edu.hk/time-range': timeRange
                }
            }
        });

        res.json({
            success: true,
            analytics: projectAnalytics
        });
    } catch (error) {
        logger.error('Error retrieving project analytics', { 
            error: error.message, 
            projectId: req.params.projectId,
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve project analytics'
        });
    }
});

/**
 * GET /analytics/learning
 * Get learning analytics
 */
router.get('/learning', async (req, res) => {
    try {
        const { activityId, timeRange = 'last30days' } = req.query;
        const userEmail = req.userContext.email;

        const learningAnalytics = await analyticsService.getLearningAnalytics(activityId, timeRange);

        // Track learning analytics access
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/analyzed', display: { 'en-US': 'analyzed' }},
            object: {
                id: `${xapiService.baseActivityId}/analytics/learning`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/learning-analytics',
                    name: { 'en-US': 'Learning Analytics' }
                }
            },
            context: {
                extensions: {
                    'http://hulab.edu.hk/time-range': timeRange,
                    'http://hulab.edu.hk/activity-id': activityId || 'all'
                }
            }
        });

        res.json({
            success: true,
            analytics: learningAnalytics
        });
    } catch (error) {
        logger.error('Error retrieving learning analytics', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve learning analytics'
        });
    }
});

/**
 * GET /analytics/collaboration
 * Get collaboration analytics
 */
router.get('/collaboration', async (req, res) => {
    try {
        const { timeRange = 'last30days', projectId } = req.query;
        const userEmail = req.userContext.email;

        // If projectId is specified, check access permissions
        if (projectId) {
            const projectData = await xapiService.getActivityState(
                userEmail,
                `${xapiService.baseActivityId}/project/${projectId}`,
                'project-data'
            );

            if (projectData) {
                const hasAccess = projectData.createdBy === userEmail || 
                                 projectData.collaborators.some(collab => collab.email === userEmail) ||
                                 req.userContext.role === 'admin';

                if (!hasAccess) {
                    return res.status(403).json({
                        error: 'Access denied',
                        message: 'You do not have permission to view this project\'s collaboration analytics'
                    });
                }
            }
        }

        const collaborationAnalytics = await analyticsService.getCollaborationAnalytics(timeRange, projectId);

        // Track collaboration analytics access
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/analyzed', display: { 'en-US': 'analyzed' }},
            object: {
                id: `${xapiService.baseActivityId}/analytics/collaboration`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/collaboration-analytics',
                    name: { 'en-US': 'Collaboration Analytics' }
                }
            },
            context: {
                extensions: {
                    'http://hulab.edu.hk/time-range': timeRange,
                    'http://hulab.edu.hk/project-id': projectId || 'all'
                }
            }
        });

        res.json({
            success: true,
            analytics: collaborationAnalytics
        });
    } catch (error) {
        logger.error('Error retrieving collaboration analytics', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve collaboration analytics'
        });
    }
});

/**
 * POST /analytics/reports/custom
 * Generate custom analytics report
 */
router.post('/reports/custom', async (req, res) => {
    try {
        const reportConfig = req.body;
        const userEmail = req.userContext.email;

        // Validate report configuration
        const {
            metrics = ['engagement'],
            timeRange = 'last30days',
            exportFormat = 'json',
            filters = {}
        } = reportConfig;

        // Check if user has permission for requested data
        if (filters.userEmail && filters.userEmail !== userEmail) {
            if (req.userContext.role !== 'admin' && req.userContext.role !== 'instructor') {
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'You do not have permission to generate reports for other users'
                });
            }
        }

        const customReport = await analyticsService.generateCustomReport({
            ...reportConfig,
            requestedBy: userEmail
        });

        // Track custom report generation
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/created', display: { 'en-US': 'generated report' }},
            object: {
                id: `${xapiService.baseActivityId}/analytics/report/${customReport.metadata.reportId}`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/analytics-report',
                    name: { 'en-US': 'Custom Analytics Report' }
                }
            },
            context: {
                extensions: {
                    'http://hulab.edu.hk/report-metrics': metrics,
                    'http://hulab.edu.hk/time-range': timeRange,
                    'http://hulab.edu.hk/export-format': exportFormat
                }
            }
        });

        // Set appropriate headers for different export formats
        if (exportFormat === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-report-${customReport.metadata.reportId}.csv"`);
        } else if (exportFormat === 'pdf') {
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-report-${customReport.metadata.reportId}.pdf"`);
        }

        res.json({
            success: true,
            report: customReport
        });
    } catch (error) {
        logger.error('Error generating custom report', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Report generation error',
            message: 'Unable to generate custom report'
        });
    }
});

/**
 * GET /analytics/realtime
 * Get real-time analytics
 */
router.get('/realtime', requireRole(['admin', 'instructor']), async (req, res) => {
    try {
        const { windowSize = 5, metrics = ['activity', 'users'] } = req.query;
        const userEmail = req.userContext.email;

        const realtimeAnalytics = await analyticsService.getRealtimeAnalytics({
            windowSize: parseInt(windowSize),
            metrics: Array.isArray(metrics) ? metrics : [metrics]
        });

        // Track real-time analytics access
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/monitored', display: { 'en-US': 'monitored' }},
            object: {
                id: `${xapiService.baseActivityId}/analytics/realtime`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/realtime-analytics',
                    name: { 'en-US': 'Real-time Analytics' }
                }
            }
        });

        res.json({
            success: true,
            analytics: realtimeAnalytics
        });
    } catch (error) {
        logger.error('Error retrieving real-time analytics', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Real-time analytics error',
            message: 'Unable to retrieve real-time analytics'
        });
    }
});

/**
 * GET /analytics/insights
 * Get AI-generated insights from analytics data
 */
router.get('/insights', async (req, res) => {
    try {
        const { type = 'user', timeRange = 'last30days', targetId } = req.query;
        const userEmail = req.userContext.email;

        let analyticsData;
        let context = '';

        switch (type) {
            case 'user':
                const targetUser = targetId || userEmail;
                if (targetUser !== userEmail && req.userContext.role !== 'admin') {
                    return res.status(403).json({
                        error: 'Access denied',
                        message: 'You can only view insights for your own data'
                    });
                }
                analyticsData = await analyticsService.getUserAnalytics(targetUser, timeRange);
                context = 'user learning and engagement patterns';
                break;
            case 'project':
                if (!targetId) {
                    return res.status(400).json({
                        error: 'Missing project ID',
                        message: 'Project ID is required for project insights'
                    });
                }
                analyticsData = await analyticsService.getProjectAnalytics(targetId, timeRange);
                context = 'research project collaboration and progress';
                break;
            case 'learning':
                analyticsData = await analyticsService.getLearningAnalytics(targetId, timeRange);
                context = 'learning outcomes and educational effectiveness';
                break;
            default:
                return res.status(400).json({
                    error: 'Invalid insight type',
                    message: 'Type must be one of: user, project, learning'
                });
        }

        // Generate AI insights
        const aiService = require('../services/aiService');
        const insightsPrompt = `Please analyze the following analytics data and provide actionable insights about ${context}:

Analytics Data:
${JSON.stringify(analyticsData, null, 2)}

Please provide:
1. Key patterns and trends
2. Areas of strength
3. Areas for improvement
4. Specific recommendations
5. Potential concerns or red flags

Focus on actionable insights that can help improve learning outcomes and collaboration effectiveness.`;

        const aiInsights = await aiService.generateCompletion(insightsPrompt, {
            userEmail: userEmail,
            systemMessage: "You are an educational analytics expert specializing in learning analytics and research collaboration patterns."
        });

        // Track insights generation
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/generated', display: { 'en-US': 'generated insights' }},
            object: {
                id: `${xapiService.baseActivityId}/analytics/insights/${type}`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/analytics-insights',
                    name: { 'en-US': `${type.charAt(0).toUpperCase() + type.slice(1)} Analytics Insights` }
                }
            },
            context: {
                extensions: {
                    'http://hulab.edu.hk/insight-type': type,
                    'http://hulab.edu.hk/time-range': timeRange,
                    'http://hulab.edu.hk/target-id': targetId || 'self'
                }
            }
        });

        res.json({
            success: true,
            insights: {
                type: type,
                timeRange: timeRange,
                targetId: targetId,
                aiGenerated: aiInsights,
                rawData: analyticsData,
                generatedAt: new Date().toISOString()
            }
        });
    } catch (error) {
        logger.error('Error generating analytics insights', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Insights generation error',
            message: 'Unable to generate analytics insights'
        });
    }
});

/**
 * GET /analytics/options
 * Get available analytics options and capabilities
 */
router.get('/options', async (req, res) => {
    try {
        const options = await analyticsService.getAvailableOptions();
        
        res.json({
            success: true,
            options: options,
            userRole: req.userContext.role,
            permissions: {
                canViewOtherUsers: req.userContext.role === 'admin' || req.userContext.role === 'instructor',
                canViewRealtimeAnalytics: req.userContext.role === 'admin' || req.userContext.role === 'instructor',
                canGenerateCustomReports: true,
                canViewInsights: true
            }
        });
    } catch (error) {
        logger.error('Error retrieving analytics options', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve analytics options'
        });
    }
});

/**
 * POST /analytics/cache/clear
 * Clear analytics cache (admin only)
 */
router.post('/cache/clear', requireRole('admin'), async (req, res) => {
    try {
        const cacheResult = await analyticsService.clearCache();
        
        // Track cache clearing
        await xapiService.sendStatement({
            actor: { email: req.userContext.email },
            verb: { id: 'http://hulab.edu.hk/verbs/cleared', display: { 'en-US': 'cleared cache' }},
            object: {
                id: `${xapiService.baseActivityId}/analytics/cache`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/system-maintenance',
                    name: { 'en-US': 'Analytics Cache' }
                }
            }
        });

        logger.info('Analytics cache cleared', { email: req.userContext.email });

        res.json({
            success: true,
            message: 'Analytics cache cleared successfully',
            result: cacheResult
        });
    } catch (error) {
        logger.error('Error clearing analytics cache', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Cache clearing error',
            message: 'Unable to clear analytics cache'
        });
    }
});

/**
 * GET /analytics/health
 * Analytics service health check
 */
router.get('/health', async (req, res) => {
    try {
        const health = await analyticsService.healthCheck();
        
        const statusCode = health.status === 'healthy' ? 200 : 503;
        res.status(statusCode).json({
            success: health.status === 'healthy',
            health: health
        });
    } catch (error) {
        logger.error('Analytics health check failed', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(503).json({
            success: false,
            health: {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            }
        });
    }
});

/**
 * Error handling middleware for analytics routes
 */
router.use((error, req, res, next) => {
    logger.error('Analytics route error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        query: req.query,
        body: req.body
    });

    res.status(500).json({
        error: 'Analytics system error',
        message: 'An error occurred in the analytics system',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;