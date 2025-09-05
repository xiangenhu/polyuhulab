/**
 * Research Routes for Hu Lab Portal
 * Handles research project CRUD operations following RIDE-I framework
 * (Resource, Information, Decisions, Experience, Implementation)
 */

const express = require('express');
const xapiService = require('../services/xapiService');
const gcsService = require('../services/gcsService');
const aiService = require('../services/aiService');
const analyticsService = require('../services/analyticsService');
const { authenticate, requireRole, requirePermission } = require('../middleware/authentication');
const winston = require('winston');
const uuid = require('uuid');

const router = express.Router();

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'research-routes' },
    transports: [
        new winston.transports.File({ filename: 'logs/research.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// All research routes require authentication
router.use(authenticate);

// RIDE-I Framework phases
const RIDE_I_PHASES = {
    RESOURCE: 'resource',
    INFORMATION: 'information', 
    DECISIONS: 'decisions',
    EXPERIENCE: 'experience',
    IMPLEMENTATION: 'implementation'
};

/**
 * GET /research/projects
 * Get user's research projects
 */
router.get('/projects', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const { status, phase, limit = 50, offset = 0 } = req.query;

        // Get projects from xAPI activity states
        const projects = [];
        
        // This is a simplified approach - in production you might want a dedicated project index
        const activities = await xapiService.getUserActivities(userEmail, parseInt(limit) * 2);
        const projectActivities = activities.filter(activity => 
            activity.object.id.includes('/project/') &&
            activity.verb.display['en-US'] === 'created'
        );

        for (const activity of projectActivities) {
            try {
                const projectId = activity.object.id.split('/project/')[1];
                const projectData = await xapiService.getActivityState(
                    userEmail,
                    `${xapiService.baseActivityId}/project/${projectId}`,
                    'project-data'
                );

                if (projectData) {
                    // Apply filters
                    if (status && projectData.status !== status) continue;
                    if (phase && projectData.currentPhase !== phase) continue;

                    projects.push({
                        id: projectId,
                        ...projectData,
                        lastActivity: activity.timestamp
                    });
                }
            } catch (error) {
                logger.warn('Error retrieving project data', { 
                    error: error.message, 
                    projectId: activity.object.id 
                });
            }
        }

        // Sort by last activity (most recent first)
        projects.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

        // Apply pagination
        const paginatedProjects = projects.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        res.json({
            success: true,
            projects: paginatedProjects,
            totalCount: projects.length,
            hasMore: projects.length > parseInt(offset) + parseInt(limit)
        });
    } catch (error) {
        logger.error('Error retrieving research projects', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve research projects'
        });
    }
});

/**
 * POST /research/projects
 * Create a new research project
 */
router.post('/projects', requirePermission('canCreateProjects'), async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const userId = req.userContext.id;
        const {
            title,
            description,
            researchQuestions = [],
            methodology = '',
            expectedOutcomes = [],
            timeline = {},
            collaborators = [],
            keywords = [],
            fundingSource = null,
            ethicsApproval = null
        } = req.body;

        if (!title || !description) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Title and description are required'
            });
        }

        const projectId = uuid.v4();
        const projectData = {
            id: projectId,
            title: title.trim(),
            description: description.trim(),
            researchQuestions: researchQuestions,
            methodology: methodology.trim(),
            expectedOutcomes: expectedOutcomes,
            timeline: timeline,
            collaborators: collaborators,
            keywords: keywords,
            fundingSource: fundingSource,
            ethicsApproval: ethicsApproval,
            // RIDE-I Framework tracking
            currentPhase: RIDE_I_PHASES.RESOURCE,
            phases: {
                [RIDE_I_PHASES.RESOURCE]: {
                    status: 'in_progress',
                    startedAt: new Date().toISOString(),
                    completedAt: null,
                    activities: [],
                    resources: []
                },
                [RIDE_I_PHASES.INFORMATION]: {
                    status: 'pending',
                    startedAt: null,
                    completedAt: null,
                    activities: [],
                    sources: []
                },
                [RIDE_I_PHASES.DECISIONS]: {
                    status: 'pending',
                    startedAt: null,
                    completedAt: null,
                    activities: [],
                    decisions: []
                },
                [RIDE_I_PHASES.EXPERIENCE]: {
                    status: 'pending',
                    startedAt: null,
                    completedAt: null,
                    activities: [],
                    experiences: []
                },
                [RIDE_I_PHASES.IMPLEMENTATION]: {
                    status: 'pending',
                    startedAt: null,
                    completedAt: null,
                    activities: [],
                    outputs: []
                }
            },
            // Project metadata
            createdBy: userEmail,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'active',
            visibility: 'private',
            version: 1
        };

        // Save project data to xAPI activity state
        await xapiService.saveActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data',
            projectData
        );

        // Track project creation
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/created', display: { 'en-US': 'created' }},
            object: {
                id: `${xapiService.baseActivityId}/project/${projectId}`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/research-project',
                    name: { 'en-US': title },
                    description: { 'en-US': description }
                }
            },
            context: {
                extensions: {
                    'http://hulab.edu.hk/ride-i-phase': RIDE_I_PHASES.RESOURCE
                }
            }
        });

        logger.info('Research project created', { projectId, title, email: userEmail });

        res.status(201).json({
            success: true,
            message: 'Research project created successfully',
            project: projectData
        });
    } catch (error) {
        logger.error('Error creating research project', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to create research project'
        });
    }
});

/**
 * GET /research/projects/:projectId
 * Get specific research project
 */
router.get('/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const userEmail = req.userContext.email;

        const projectData = await xapiService.getActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data'
        );

        if (!projectData) {
            return res.status(404).json({
                error: 'Project not found',
                message: 'Research project could not be found or you do not have access'
            });
        }

        // Check if user has access to this project
        const hasAccess = projectData.createdBy === userEmail || 
                         projectData.collaborators.some(collab => collab.email === userEmail) ||
                         req.userContext.role === 'admin';

        if (!hasAccess) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this project'
            });
        }

        // Get recent project activities
        const recentActivities = await xapiService.getProjectActivities(projectId, 20);

        res.json({
            success: true,
            project: projectData,
            recentActivities: recentActivities
        });
    } catch (error) {
        logger.error('Error retrieving research project', { 
            error: error.message, 
            projectId: req.params.projectId,
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve research project'
        });
    }
});

/**
 * PUT /research/projects/:projectId
 * Update research project
 */
router.put('/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const userEmail = req.userContext.email;
        const updates = req.body;

        // Get current project data
        const currentProject = await xapiService.getActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data'
        );

        if (!currentProject) {
            return res.status(404).json({
                error: 'Project not found',
                message: 'Research project could not be found'
            });
        }

        // Check permissions
        const canEdit = currentProject.createdBy === userEmail || 
                       currentProject.collaborators.some(collab => 
                           collab.email === userEmail && collab.role === 'editor'
                       ) ||
                       req.userContext.role === 'admin';

        if (!canEdit) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to edit this project'
            });
        }

        // Merge updates (protect certain fields)
        const updatedProject = {
            ...currentProject,
            ...updates,
            id: currentProject.id,
            createdBy: currentProject.createdBy,
            createdAt: currentProject.createdAt,
            updatedAt: new Date().toISOString(),
            version: currentProject.version + 1
        };

        // Save updated project
        await xapiService.saveActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data',
            updatedProject
        );

        // Track project update
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/updated', display: { 'en-US': 'updated' }},
            object: {
                id: `${xapiService.baseActivityId}/project/${projectId}`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/research-project',
                    name: { 'en-US': updatedProject.title }
                }
            }
        });

        logger.info('Research project updated', { 
            projectId, 
            updatedFields: Object.keys(updates), 
            email: userEmail 
        });

        res.json({
            success: true,
            message: 'Research project updated successfully',
            project: updatedProject
        });
    } catch (error) {
        logger.error('Error updating research project', { 
            error: error.message, 
            projectId: req.params.projectId,
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to update research project'
        });
    }
});

/**
 * DELETE /research/projects/:projectId
 * Delete research project
 */
router.delete('/projects/:projectId', async (req, res) => {
    try {
        const { projectId } = req.params;
        const userEmail = req.userContext.email;

        const projectData = await xapiService.getActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data'
        );

        if (!projectData) {
            return res.status(404).json({
                error: 'Project not found',
                message: 'Research project could not be found'
            });
        }

        // Only project creator or admin can delete
        if (projectData.createdBy !== userEmail && req.userContext.role !== 'admin') {
            return res.status(403).json({
                error: 'Access denied',
                message: 'Only the project creator can delete this project'
            });
        }

        // Mark as deleted instead of actually deleting (soft delete)
        const deletedProject = {
            ...projectData,
            status: 'deleted',
            deletedAt: new Date().toISOString(),
            deletedBy: userEmail,
            updatedAt: new Date().toISOString()
        };

        await xapiService.saveActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data',
            deletedProject
        );

        // Track project deletion
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/deleted', display: { 'en-US': 'deleted' }},
            object: {
                id: `${xapiService.baseActivityId}/project/${projectId}`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/research-project',
                    name: { 'en-US': projectData.title }
                }
            }
        });

        logger.info('Research project deleted', { projectId, email: userEmail });

        res.json({
            success: true,
            message: 'Research project deleted successfully'
        });
    } catch (error) {
        logger.error('Error deleting research project', { 
            error: error.message, 
            projectId: req.params.projectId,
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to delete research project'
        });
    }
});

/**
 * POST /research/projects/:projectId/phase/:phase
 * Advance project to next RIDE-I phase
 */
router.post('/projects/:projectId/phase/:phase', async (req, res) => {
    try {
        const { projectId, phase } = req.params;
        const userEmail = req.userContext.email;
        const { completionNotes = '', outputs = [] } = req.body;

        if (!Object.values(RIDE_I_PHASES).includes(phase)) {
            return res.status(400).json({
                error: 'Invalid phase',
                message: 'Phase must be one of: ' + Object.values(RIDE_I_PHASES).join(', ')
            });
        }

        const projectData = await xapiService.getActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data'
        );

        if (!projectData) {
            return res.status(404).json({
                error: 'Project not found',
                message: 'Research project could not be found'
            });
        }

        // Check permissions
        const canAdvance = projectData.createdBy === userEmail || 
                          projectData.collaborators.some(collab => 
                              collab.email === userEmail && ['editor', 'manager'].includes(collab.role)
                          ) ||
                          req.userContext.role === 'admin';

        if (!canAdvance) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to advance project phases'
            });
        }

        // Update phase information
        const updatedProject = { ...projectData };
        
        // Complete current phase if moving forward
        if (updatedProject.phases[updatedProject.currentPhase]) {
            updatedProject.phases[updatedProject.currentPhase].status = 'completed';
            updatedProject.phases[updatedProject.currentPhase].completedAt = new Date().toISOString();
            updatedProject.phases[updatedProject.currentPhase].completionNotes = completionNotes;
            
            if (outputs.length > 0) {
                updatedProject.phases[updatedProject.currentPhase].outputs = outputs;
            }
        }

        // Start new phase
        if (updatedProject.phases[phase]) {
            updatedProject.phases[phase].status = 'in_progress';
            updatedProject.phases[phase].startedAt = new Date().toISOString();
        }

        updatedProject.currentPhase = phase;
        updatedProject.updatedAt = new Date().toISOString();
        updatedProject.version = projectData.version + 1;

        // Save updated project
        await xapiService.saveActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data',
            updatedProject
        );

        // Track phase advancement
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/advanced', display: { 'en-US': 'advanced to phase' }},
            object: {
                id: `${xapiService.baseActivityId}/project/${projectId}`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/research-project',
                    name: { 'en-US': projectData.title }
                }
            },
            context: {
                extensions: {
                    'http://hulab.edu.hk/ride-i-phase': phase,
                    'http://hulab.edu.hk/previous-phase': projectData.currentPhase
                }
            }
        });

        logger.info('Project phase advanced', { 
            projectId, 
            from: projectData.currentPhase, 
            to: phase, 
            email: userEmail 
        });

        res.json({
            success: true,
            message: `Project advanced to ${phase} phase`,
            project: updatedProject
        });
    } catch (error) {
        logger.error('Error advancing project phase', { 
            error: error.message, 
            projectId: req.params.projectId,
            phase: req.params.phase,
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to advance project phase'
        });
    }
});

/**
 * POST /research/projects/:projectId/collaborate
 * Add collaborator to project
 */
router.post('/projects/:projectId/collaborate', async (req, res) => {
    try {
        const { projectId } = req.params;
        const userEmail = req.userContext.email;
        const { collaboratorEmail, role = 'viewer', permissions = [] } = req.body;

        if (!collaboratorEmail || !collaboratorEmail.includes('@')) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Valid collaborator email is required'
            });
        }

        const projectData = await xapiService.getActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data'
        );

        if (!projectData) {
            return res.status(404).json({
                error: 'Project not found',
                message: 'Research project could not be found'
            });
        }

        // Check if user can add collaborators
        const canAddCollaborators = projectData.createdBy === userEmail || 
                                   projectData.collaborators.some(collab => 
                                       collab.email === userEmail && collab.role === 'manager'
                                   ) ||
                                   req.userContext.role === 'admin';

        if (!canAddCollaborators) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to add collaborators'
            });
        }

        // Check if collaborator already exists
        const existingCollaborator = projectData.collaborators.find(
            collab => collab.email === collaboratorEmail
        );

        if (existingCollaborator) {
            return res.status(400).json({
                error: 'Collaborator exists',
                message: 'This user is already a collaborator on this project'
            });
        }

        // Add new collaborator
        const newCollaborator = {
            email: collaboratorEmail,
            role: role,
            permissions: permissions,
            addedBy: userEmail,
            addedAt: new Date().toISOString(),
            status: 'invited'
        };

        const updatedProject = {
            ...projectData,
            collaborators: [...projectData.collaborators, newCollaborator],
            updatedAt: new Date().toISOString(),
            version: projectData.version + 1
        };

        await xapiService.saveActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data',
            updatedProject
        );

        // Track collaboration invitation
        await xapiService.trackCollaboration(
            userEmail,
            'invited_collaborator',
            projectId,
            [collaboratorEmail]
        );

        logger.info('Collaborator added to project', { 
            projectId, 
            collaborator: collaboratorEmail, 
            role, 
            addedBy: userEmail 
        });

        res.json({
            success: true,
            message: 'Collaborator added successfully',
            collaborator: newCollaborator
        });
    } catch (error) {
        logger.error('Error adding collaborator', { 
            error: error.message, 
            projectId: req.params.projectId,
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to add collaborator'
        });
    }
});

/**
 * GET /research/projects/:projectId/analytics
 * Get project analytics
 */
router.get('/projects/:projectId/analytics', async (req, res) => {
    try {
        const { projectId } = req.params;
        const userEmail = req.userContext.email;
        const { timeRange = 'all' } = req.query;

        const projectData = await xapiService.getActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data'
        );

        if (!projectData) {
            return res.status(404).json({
                error: 'Project not found',
                message: 'Research project could not be found'
            });
        }

        // Check access permissions
        const hasAccess = projectData.createdBy === userEmail || 
                         projectData.collaborators.some(collab => collab.email === userEmail) ||
                         req.userContext.role === 'admin';

        if (!hasAccess) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this project\'s analytics'
            });
        }

        // Get project analytics
        const analytics = await analyticsService.getProjectAnalytics(projectId, timeRange);

        res.json({
            success: true,
            analytics: analytics
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
 * POST /research/projects/:projectId/ai-assist
 * Get AI assistance for research project
 */
router.post('/projects/:projectId/ai-assist', async (req, res) => {
    try {
        const { projectId } = req.params;
        const userEmail = req.userContext.email;
        const { assistanceType = 'general', context = '' } = req.body;

        const projectData = await xapiService.getActivityState(
            userEmail,
            `${xapiService.baseActivityId}/project/${projectId}`,
            'project-data'
        );

        if (!projectData) {
            return res.status(404).json({
                error: 'Project not found',
                message: 'Research project could not be found'
            });
        }

        // Check access permissions
        const hasAccess = projectData.createdBy === userEmail || 
                         projectData.collaborators.some(collab => collab.email === userEmail) ||
                         req.userContext.role === 'admin';

        if (!hasAccess) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to access AI assistance for this project'
            });
        }

        let aiResponse;

        switch (assistanceType) {
            case 'synthesis':
                aiResponse = await aiService.synthesizeResearch(
                    JSON.stringify(projectData, null, 2),
                    userEmail,
                    { context: context }
                );
                break;
            case 'collaboration':
                aiResponse = await aiService.suggestCollaborations(
                    projectData,
                    userEmail,
                    { context: context }
                );
                break;
            case 'next-steps':
                const prompt = `Based on the current research project in ${projectData.currentPhase} phase, suggest next steps:\n\nProject: ${JSON.stringify(projectData, null, 2)}\n\nContext: ${context}`;
                aiResponse = await aiService.generateCompletion(prompt, {
                    userEmail: userEmail,
                    systemMessage: "You are a research advisor specializing in educational technology projects using the RIDE-I framework."
                });
                break;
            default:
                const generalPrompt = `Please provide assistance for this research project:\n\nProject: ${JSON.stringify(projectData, null, 2)}\n\nContext: ${context}`;
                aiResponse = await aiService.generateCompletion(generalPrompt, {
                    userEmail: userEmail,
                    systemMessage: "You are a helpful research assistant for educational technology projects."
                });
        }

        res.json({
            success: true,
            response: aiResponse
        });
    } catch (error) {
        logger.error('Error getting AI assistance', { 
            error: error.message, 
            projectId: req.params.projectId,
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'AI assistance error',
            message: 'Unable to provide AI assistance'
        });
    }
});

/**
 * GET /research/templates
 * Get research project templates
 */
router.get('/templates', async (req, res) => {
    try {
        const templates = [
            {
                id: 'educational-technology',
                name: 'Educational Technology Research',
                description: 'Template for educational technology research projects',
                framework: 'RIDE-I',
                phases: Object.values(RIDE_I_PHASES),
                researchQuestions: [
                    'How does the technology intervention affect learning outcomes?',
                    'What are the usability and user experience factors?',
                    'How do students and teachers perceive the technology?'
                ],
                methodology: 'Mixed-methods research design combining quantitative analysis of learning outcomes with qualitative interviews and observations.',
                expectedOutcomes: [
                    'Improved learning outcomes',
                    'User experience insights',
                    'Implementation recommendations'
                ]
            },
            {
                id: 'collaborative-learning',
                name: 'Collaborative Learning Study',
                description: 'Template for studying collaborative learning environments',
                framework: 'RIDE-I',
                phases: Object.values(RIDE_I_PHASES),
                researchQuestions: [
                    'How does collaboration affect individual learning?',
                    'What collaboration patterns emerge in different contexts?',
                    'How can collaboration be optimized for learning?'
                ],
                methodology: 'Collaborative learning analytics using xAPI data, network analysis, and participant interviews.',
                expectedOutcomes: [
                    'Collaboration pattern insights',
                    'Learning effectiveness measures',
                    'Design recommendations'
                ]
            },
            {
                id: 'ai-assisted-learning',
                name: 'AI-Assisted Learning Research',
                description: 'Template for researching AI integration in education',
                framework: 'RIDE-I',
                phases: Object.values(RIDE_I_PHASES),
                researchQuestions: [
                    'How does AI assistance impact learning processes?',
                    'What are the optimal human-AI collaboration patterns?',
                    'How do learners adapt to AI-assisted environments?'
                ],
                methodology: 'Learning analytics combined with human-AI interaction analysis and longitudinal user studies.',
                expectedOutcomes: [
                    'Human-AI collaboration insights',
                    'Learning process improvements',
                    'AI integration guidelines'
                ]
            }
        ];

        res.json({
            success: true,
            templates: templates
        });
    } catch (error) {
        logger.error('Error retrieving research templates', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve research templates'
        });
    }
});

/**
 * Error handling middleware for research routes
 */
router.use((error, req, res, next) => {
    logger.error('Research route error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        body: req.body
    });

    res.status(500).json({
        error: 'Research system error',
        message: 'An error occurred in the research system',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;