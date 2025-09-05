/**
 * Collaboration Routes for Hu Lab Portal
 * Handles collaboration features, real-time communication, and team management
 */

const express = require('express');
const xapiService = require('../services/xapiService');
const gcsService = require('../services/gcsService');
const aiService = require('../services/aiService');
const { authenticate, requireRole, requirePermission } = require('../middleware/authentication');
const winston = require('winston');
const uuid = require('uuid');

const router = express.Router();

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'collaboration-routes' },
    transports: [
        new winston.transports.File({ filename: 'logs/collaboration.log' }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

// All collaboration routes require authentication
router.use(authenticate);

/**
 * GET /collaboration/teams
 * Get user's collaboration teams and projects
 */
router.get('/teams', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const { status = 'active', limit = 50 } = req.query;

        // Get user's collaboration activities
        const collaborationStatements = await xapiService.getStatements({
            agent: xapiService.createActor({ email: userEmail }),
            verb: xapiService.customVerbs.collaborated,
            limit: parseInt(limit) * 2
        });

        // Extract unique projects and teams
        const teams = new Map();
        const projects = new Set();

        for (const statement of collaborationStatements) {
            const projectId = statement.object.id.split('/project/')[1];
            if (projectId) {
                projects.add(projectId);

                // Get team information from context
                if (statement.context?.team) {
                    const teamMembers = statement.context.team;
                    const teamKey = teamMembers.map(member => member.mbox).sort().join(',');
                    
                    if (!teams.has(teamKey)) {
                        teams.set(teamKey, {
                            id: uuid.v5(teamKey, uuid.v5.DNS),
                            members: teamMembers,
                            projects: new Set(),
                            lastActivity: statement.timestamp,
                            activities: []
                        });
                    }
                    
                    teams.get(teamKey).projects.add(projectId);
                    teams.get(teamKey).activities.push({
                        action: statement.verb.display['en-US'],
                        timestamp: statement.timestamp,
                        actor: statement.actor
                    });
                }
            }
        }

        // Get detailed project information for each team
        const teamList = [];
        for (const [teamKey, teamInfo] of teams) {
            try {
                // Get project details for the team's projects
                const projectDetails = [];
                for (const projectId of teamInfo.projects) {
                    try {
                        const projectData = await xapiService.getActivityState(
                            userEmail,
                            `${xapiService.baseActivityId}/project/${projectId}`,
                            'project-data'
                        );
                        if (projectData && (status === 'all' || projectData.status === status)) {
                            projectDetails.push({
                                id: projectId,
                                title: projectData.title,
                                status: projectData.status,
                                currentPhase: projectData.currentPhase,
                                createdBy: projectData.createdBy
                            });
                        }
                    } catch (error) {
                        logger.warn('Could not fetch project details', { projectId, error: error.message });
                    }
                }

                if (projectDetails.length > 0) {
                    teamList.push({
                        id: teamInfo.id,
                        members: teamInfo.members.map(member => ({
                            email: member.mbox.replace('mailto:', ''),
                            name: member.name
                        })),
                        projects: projectDetails,
                        memberCount: teamInfo.members.length,
                        projectCount: projectDetails.length,
                        lastActivity: teamInfo.lastActivity,
                        recentActivities: teamInfo.activities.slice(0, 5)
                    });
                }
            } catch (error) {
                logger.warn('Error processing team data', { teamKey, error: error.message });
            }
        }

        // Sort by last activity
        teamList.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

        res.json({
            success: true,
            teams: teamList,
            totalCount: teamList.length
        });
    } catch (error) {
        logger.error('Error retrieving collaboration teams', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve collaboration teams'
        });
    }
});

/**
 * POST /collaboration/invite
 * Send collaboration invitation
 */
router.post('/invite', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const { 
            projectId, 
            inviteeEmails = [], 
            role = 'collaborator', 
            message = '',
            permissions = []
        } = req.body;

        if (!projectId || !Array.isArray(inviteeEmails) || inviteeEmails.length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Project ID and invitee emails are required'
            });
        }

        // Verify project exists and user has permission to invite
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

        const canInvite = projectData.createdBy === userEmail || 
                         projectData.collaborators?.some(collab => 
                             collab.email === userEmail && ['manager', 'editor'].includes(collab.role)
                         ) ||
                         req.userContext.role === 'admin';

        if (!canInvite) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to send invitations for this project'
            });
        }

        // Process invitations
        const invitationResults = [];
        const invitationId = uuid.v4();

        for (const inviteeEmail of inviteeEmails) {
            try {
                // Create invitation record
                const invitation = {
                    id: uuid.v4(),
                    invitationId: invitationId,
                    projectId: projectId,
                    projectTitle: projectData.title,
                    inviterEmail: userEmail,
                    inviterName: req.userContext.name,
                    inviteeEmail: inviteeEmail.toLowerCase(),
                    role: role,
                    permissions: permissions,
                    message: message,
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
                };

                // Save invitation state
                await xapiService.saveActivityState(
                    inviteeEmail,
                    `${xapiService.baseActivityId}/invitation/${invitation.id}`,
                    'invitation-data',
                    invitation
                );

                // Track collaboration invitation
                await xapiService.sendStatement({
                    actor: { email: userEmail },
                    verb: { id: 'http://hulab.edu.hk/verbs/invited', display: { 'en-US': 'invited' }},
                    object: {
                        id: `${xapiService.baseActivityId}/project/${projectId}`,
                        definition: {
                            type: 'http://hulab.edu.hk/activities/research-project',
                            name: { 'en-US': projectData.title }
                        }
                    },
                    context: {
                        contextActivities: {
                            other: [{
                                id: `${xapiService.baseActivityId}/invitation/${invitation.id}`,
                                definition: {
                                    type: 'http://hulab.edu.hk/activities/collaboration-invitation',
                                    name: { 'en-US': 'Collaboration Invitation' }
                                }
                            }]
                        },
                        extensions: {
                            'http://hulab.edu.hk/invitee': inviteeEmail,
                            'http://hulab.edu.hk/role': role
                        }
                    }
                });

                invitationResults.push({
                    success: true,
                    inviteeEmail: inviteeEmail,
                    invitationId: invitation.id,
                    status: 'sent'
                });

                logger.info('Collaboration invitation sent', {
                    projectId,
                    inviter: userEmail,
                    invitee: inviteeEmail,
                    role
                });
            } catch (error) {
                logger.error('Error sending invitation', {
                    projectId,
                    invitee: inviteeEmail,
                    error: error.message
                });
                
                invitationResults.push({
                    success: false,
                    inviteeEmail: inviteeEmail,
                    error: error.message
                });
            }
        }

        const successCount = invitationResults.filter(r => r.success).length;

        res.json({
            success: successCount > 0,
            message: `Sent ${successCount} of ${inviteeEmails.length} invitations`,
            invitationId: invitationId,
            results: invitationResults
        });
    } catch (error) {
        logger.error('Error sending collaboration invitations', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to send collaboration invitations'
        });
    }
});

/**
 * GET /collaboration/invitations
 * Get user's collaboration invitations (sent and received)
 */
router.get('/invitations', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const { type = 'received', status = 'all' } = req.query;

        const invitations = [];

        // Get invitations based on type
        if (type === 'received' || type === 'all') {
            // Get received invitations from xAPI statements
            const invitationStatements = await xapiService.getStatements({
                verb: { id: 'http://hulab.edu.hk/verbs/invited' },
                limit: 100
            });

            // Filter for invitations targeting this user
            const userInvitations = invitationStatements.filter(statement => 
                statement.context?.extensions?.['http://hulab.edu.hk/invitee'] === userEmail
            );

            for (const statement of userInvitations) {
                try {
                    if (statement.context?.contextActivities?.other) {
                        const invitationActivity = statement.context.contextActivities.other[0];
                        const invitationId = invitationActivity.id.split('/invitation/')[1];
                        
                        const invitationData = await xapiService.getActivityState(
                            userEmail,
                            `${xapiService.baseActivityId}/invitation/${invitationId}`,
                            'invitation-data'
                        );

                        if (invitationData && (status === 'all' || invitationData.status === status)) {
                            invitations.push({
                                ...invitationData,
                                type: 'received'
                            });
                        }
                    }
                } catch (error) {
                    logger.warn('Error retrieving invitation data', { error: error.message });
                }
            }
        }

        if (type === 'sent' || type === 'all') {
            // Get sent invitations
            const sentInvitations = await xapiService.getStatements({
                agent: xapiService.createActor({ email: userEmail }),
                verb: { id: 'http://hulab.edu.hk/verbs/invited' },
                limit: 100
            });

            for (const statement of sentInvitations) {
                try {
                    if (statement.context?.contextActivities?.other) {
                        const invitationActivity = statement.context.contextActivities.other[0];
                        const invitationId = invitationActivity.id.split('/invitation/')[1];
                        
                        const inviteeEmail = statement.context?.extensions?.['http://hulab.edu.hk/invitee'];
                        if (inviteeEmail) {
                            const invitationData = await xapiService.getActivityState(
                                inviteeEmail,
                                `${xapiService.baseActivityId}/invitation/${invitationId}`,
                                'invitation-data'
                            );

                            if (invitationData && (status === 'all' || invitationData.status === status)) {
                                invitations.push({
                                    ...invitationData,
                                    type: 'sent'
                                });
                            }
                        }
                    }
                } catch (error) {
                    logger.warn('Error retrieving sent invitation data', { error: error.message });
                }
            }
        }

        // Sort by creation date (most recent first)
        invitations.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({
            success: true,
            invitations: invitations,
            totalCount: invitations.length
        });
    } catch (error) {
        logger.error('Error retrieving invitations', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve invitations'
        });
    }
});

/**
 * POST /collaboration/invitations/:invitationId/respond
 * Respond to collaboration invitation
 */
router.post('/invitations/:invitationId/respond', async (req, res) => {
    try {
        const { invitationId } = req.params;
        const { response, message = '' } = req.body; // response: 'accept' or 'decline'
        const userEmail = req.userContext.email;

        if (!['accept', 'decline'].includes(response)) {
            return res.status(400).json({
                error: 'Invalid response',
                message: 'Response must be either "accept" or "decline"'
            });
        }

        // Get invitation data
        const invitationData = await xapiService.getActivityState(
            userEmail,
            `${xapiService.baseActivityId}/invitation/${invitationId}`,
            'invitation-data'
        );

        if (!invitationData) {
            return res.status(404).json({
                error: 'Invitation not found',
                message: 'Invitation could not be found or has expired'
            });
        }

        if (invitationData.inviteeEmail !== userEmail) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'This invitation is not for you'
            });
        }

        if (invitationData.status !== 'pending') {
            return res.status(400).json({
                error: 'Invalid invitation status',
                message: 'This invitation has already been responded to'
            });
        }

        // Check if invitation has expired
        if (new Date() > new Date(invitationData.expiresAt)) {
            return res.status(400).json({
                error: 'Invitation expired',
                message: 'This invitation has expired'
            });
        }

        // Update invitation status
        const updatedInvitation = {
            ...invitationData,
            status: response === 'accept' ? 'accepted' : 'declined',
            responseMessage: message,
            respondedAt: new Date().toISOString()
        };

        await xapiService.saveActivityState(
            userEmail,
            `${xapiService.baseActivityId}/invitation/${invitationId}`,
            'invitation-data',
            updatedInvitation
        );

        // If accepted, add user to project collaborators
        if (response === 'accept') {
            try {
                const projectData = await xapiService.getActivityState(
                    invitationData.inviterEmail,
                    `${xapiService.baseActivityId}/project/${invitationData.projectId}`,
                    'project-data'
                );

                if (projectData) {
                    const newCollaborator = {
                        email: userEmail,
                        name: req.userContext.name,
                        role: invitationData.role,
                        permissions: invitationData.permissions,
                        joinedAt: new Date().toISOString(),
                        invitedBy: invitationData.inviterEmail
                    };

                    const updatedProject = {
                        ...projectData,
                        collaborators: [...(projectData.collaborators || []), newCollaborator],
                        updatedAt: new Date().toISOString(),
                        version: projectData.version + 1
                    };

                    await xapiService.saveActivityState(
                        invitationData.inviterEmail,
                        `${xapiService.baseActivityId}/project/${invitationData.projectId}`,
                        'project-data',
                        updatedProject
                    );

                    logger.info('User joined project via invitation', {
                        projectId: invitationData.projectId,
                        user: userEmail,
                        role: invitationData.role
                    });
                }
            } catch (error) {
                logger.error('Error adding user to project after accepting invitation', {
                    error: error.message,
                    invitationId,
                    projectId: invitationData.projectId
                });
            }
        }

        // Track invitation response
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { 
                id: `http://hulab.edu.hk/verbs/${response}ed`, 
                display: { 'en-US': `${response}ed invitation` }
            },
            object: {
                id: `${xapiService.baseActivityId}/invitation/${invitationId}`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/collaboration-invitation',
                    name: { 'en-US': 'Collaboration Invitation' }
                }
            },
            context: {
                contextActivities: {
                    parent: [{
                        id: `${xapiService.baseActivityId}/project/${invitationData.projectId}`,
                        definition: {
                            type: 'http://hulab.edu.hk/activities/research-project',
                            name: { 'en-US': invitationData.projectTitle }
                        }
                    }]
                }
            }
        });

        res.json({
            success: true,
            message: `Invitation ${response}ed successfully`,
            invitation: updatedInvitation
        });
    } catch (error) {
        logger.error('Error responding to invitation', { 
            error: error.message,
            invitationId: req.params.invitationId,
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to respond to invitation'
        });
    }
});

/**
 * GET /collaboration/activities
 * Get recent collaboration activities
 */
router.get('/activities', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const { projectId, limit = 50, since } = req.query;

        const queryParams = {
            limit: parseInt(limit)
        };

        if (since) {
            queryParams.since = since;
        }

        let activities = [];

        if (projectId) {
            // Get activities for specific project
            activities = await xapiService.getProjectActivities(projectId, parseInt(limit));
        } else {
            // Get user's collaboration activities
            queryParams.verb = xapiService.customVerbs.collaborated;
            queryParams.agent = xapiService.createActor({ email: userEmail });
            activities = await xapiService.getStatements(queryParams);
        }

        // Process activities for display
        const processedActivities = activities.map(activity => ({
            id: activity.id,
            actor: {
                email: activity.actor.mbox?.replace('mailto:', ''),
                name: activity.actor.name
            },
            verb: activity.verb.display['en-US'],
            object: {
                id: activity.object.id,
                name: activity.object.definition?.name?.['en-US'] || 'Unknown',
                type: activity.object.definition?.type
            },
            timestamp: activity.timestamp,
            context: activity.context
        }));

        res.json({
            success: true,
            activities: processedActivities,
            count: processedActivities.length
        });
    } catch (error) {
        logger.error('Error retrieving collaboration activities', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve collaboration activities'
        });
    }
});

/**
 * POST /collaboration/share
 * Share resources with collaborators
 */
router.post('/share', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const { 
            resourceType, // 'file', 'project', 'note', 'link'
            resourceId,
            recipients = [],
            message = '',
            permissions = ['view']
        } = req.body;

        if (!resourceType || !resourceId || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Resource type, ID, and recipients are required'
            });
        }

        const shareId = uuid.v4();
        const shareData = {
            id: shareId,
            resourceType: resourceType,
            resourceId: resourceId,
            sharedBy: userEmail,
            recipients: recipients.map(email => email.toLowerCase()),
            message: message,
            permissions: permissions,
            sharedAt: new Date().toISOString(),
            status: 'active'
        };

        // Save share data
        await xapiService.saveActivityState(
            userEmail,
            `${xapiService.baseActivityId}/share/${shareId}`,
            'share-data',
            shareData
        );

        // Track sharing activity
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: xapiService.customVerbs.shared,
            object: {
                id: `${xapiService.baseActivityId}/${resourceType}/${resourceId}`,
                definition: {
                    type: `http://hulab.edu.hk/activities/${resourceType}`,
                    name: { 'en-US': `Shared ${resourceType}` }
                }
            },
            context: {
                extensions: {
                    'http://hulab.edu.hk/recipients': recipients,
                    'http://hulab.edu.hk/permissions': permissions
                }
            }
        });

        logger.info('Resource shared with collaborators', {
            shareId,
            resourceType,
            resourceId,
            sharedBy: userEmail,
            recipients: recipients.length
        });

        res.json({
            success: true,
            message: `${resourceType} shared with ${recipients.length} collaborator(s)`,
            shareId: shareId,
            shareData: shareData
        });
    } catch (error) {
        logger.error('Error sharing resource', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to share resource'
        });
    }
});

/**
 * GET /collaboration/shared
 * Get resources shared with or by the user
 */
router.get('/shared', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const { type = 'all', resourceType } = req.query; // type: 'received', 'sent', 'all'

        const sharedResources = [];

        // Get sharing activities
        const shareStatements = await xapiService.getStatements({
            verb: xapiService.customVerbs.shared,
            limit: 200
        });

        for (const statement of shareStatements) {
            try {
                const isSharedByUser = statement.actor.mbox === `mailto:${userEmail}`;
                const recipients = statement.context?.extensions?.['http://hulab.edu.hk/recipients'] || [];
                const isRecipient = recipients.includes(userEmail);

                if ((type === 'sent' && isSharedByUser) || 
                    (type === 'received' && isRecipient) ||
                    (type === 'all' && (isSharedByUser || isRecipient))) {
                    
                    const resourceId = statement.object.id.split('/').pop();
                    const statementResourceType = statement.object.definition?.type?.split('/').pop();

                    if (!resourceType || statementResourceType === resourceType) {
                        // Try to get additional share data
                        let shareData = null;
                        try {
                            // This is a simplified approach - in production you'd want better indexing
                            shareData = await xapiService.getActivityState(
                                statement.actor.mbox.replace('mailto:', ''),
                                statement.object.id.replace(statement.object.id.split('/').slice(-2, -1)[0], 'share'),
                                'share-data'
                            );
                        } catch (error) {
                            // Share data might not exist or be accessible
                        }

                        sharedResources.push({
                            id: statement.id,
                            resourceType: statementResourceType,
                            resourceId: resourceId,
                            sharedBy: statement.actor.mbox.replace('mailto:', ''),
                            sharedByName: statement.actor.name,
                            recipients: recipients,
                            sharedAt: statement.timestamp,
                            permissions: statement.context?.extensions?.['http://hulab.edu.hk/permissions'] || ['view'],
                            type: isSharedByUser ? 'sent' : 'received',
                            additionalData: shareData
                        });
                    }
                }
            } catch (error) {
                logger.warn('Error processing share statement', { error: error.message });
            }
        }

        // Sort by sharing date (most recent first)
        sharedResources.sort((a, b) => new Date(b.sharedAt) - new Date(a.sharedAt));

        res.json({
            success: true,
            shared: sharedResources,
            totalCount: sharedResources.length
        });
    } catch (error) {
        logger.error('Error retrieving shared resources', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve shared resources'
        });
    }
});

/**
 * POST /collaboration/comment
 * Add comment or annotation
 */
router.post('/comment', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const { 
            targetType, // 'project', 'file', 'activity'
            targetId,
            content,
            parentCommentId = null,
            mentions = []
        } = req.body;

        if (!targetType || !targetId || !content || content.trim().length === 0) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Target type, ID, and content are required'
            });
        }

        const commentId = uuid.v4();
        const comment = {
            id: commentId,
            targetType: targetType,
            targetId: targetId,
            content: content.trim(),
            author: userEmail,
            authorName: req.userContext.name,
            parentCommentId: parentCommentId,
            mentions: mentions,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            status: 'active'
        };

        // Save comment
        await xapiService.saveActivityState(
            userEmail,
            `${xapiService.baseActivityId}/comment/${commentId}`,
            'comment-data',
            comment
        );

        // Track comment activity
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: xapiService.customVerbs.commented,
            object: {
                id: `${xapiService.baseActivityId}/${targetType}/${targetId}`,
                definition: {
                    type: `http://hulab.edu.hk/activities/${targetType}`,
                    name: { 'en-US': `${targetType} ${targetId}` }
                }
            },
            result: {
                response: content
            },
            context: {
                contextActivities: {
                    other: [{
                        id: `${xapiService.baseActivityId}/comment/${commentId}`,
                        definition: {
                            type: 'http://hulab.edu.hk/activities/comment',
                            name: { 'en-US': 'Comment' }
                        }
                    }]
                },
                extensions: {
                    'http://hulab.edu.hk/mentions': mentions,
                    'http://hulab.edu.hk/parent-comment': parentCommentId
                }
            }
        });

        logger.info('Comment added', {
            commentId,
            targetType,
            targetId,
            author: userEmail,
            mentions: mentions.length
        });

        res.status(201).json({
            success: true,
            message: 'Comment added successfully',
            comment: comment
        });
    } catch (error) {
        logger.error('Error adding comment', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to add comment'
        });
    }
});

/**
 * GET /collaboration/comments/:targetType/:targetId
 * Get comments for a specific target
 */
router.get('/comments/:targetType/:targetId', async (req, res) => {
    try {
        const { targetType, targetId } = req.params;
        const { limit = 50, offset = 0 } = req.query;

        // Get comment statements for the target
        const commentStatements = await xapiService.getStatements({
            verb: xapiService.customVerbs.commented,
            activity: { id: `${xapiService.baseActivityId}/${targetType}/${targetId}` },
            limit: parseInt(limit) * 2 // Get more to account for filtering
        });

        const comments = [];

        for (const statement of commentStatements) {
            try {
                if (statement.context?.contextActivities?.other) {
                    const commentActivity = statement.context.contextActivities.other[0];
                    const commentId = commentActivity.id.split('/comment/')[1];
                    
                    const commentData = await xapiService.getActivityState(
                        statement.actor.mbox.replace('mailto:', ''),
                        `${xapiService.baseActivityId}/comment/${commentId}`,
                        'comment-data'
                    );

                    if (commentData && commentData.status === 'active') {
                        comments.push(commentData);
                    }
                }
            } catch (error) {
                logger.warn('Error retrieving comment data', { error: error.message });
            }
        }

        // Sort by creation date (oldest first for comment threads)
        comments.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        // Apply pagination
        const paginatedComments = comments.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

        res.json({
            success: true,
            comments: paginatedComments,
            totalCount: comments.length,
            hasMore: comments.length > parseInt(offset) + parseInt(limit)
        });
    } catch (error) {
        logger.error('Error retrieving comments', { 
            error: error.message,
            targetType: req.params.targetType,
            targetId: req.params.targetId,
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'Internal server error',
            message: 'Unable to retrieve comments'
        });
    }
});

/**
 * POST /collaboration/ai-suggestions
 * Get AI-powered collaboration suggestions
 */
router.post('/ai-suggestions', async (req, res) => {
    try {
        const userEmail = req.userContext.email;
        const { context, suggestionType = 'general' } = req.body;

        if (!context) {
            return res.status(400).json({
                error: 'Invalid request',
                message: 'Context is required for AI suggestions'
            });
        }

        let prompt;
        switch (suggestionType) {
            case 'team-formation':
                prompt = `Based on the following collaboration context, suggest optimal team formation strategies:\n\n${JSON.stringify(context, null, 2)}`;
                break;
            case 'workflow-optimization':
                prompt = `Analyze the following collaboration data and suggest workflow improvements:\n\n${JSON.stringify(context, null, 2)}`;
                break;
            case 'communication-enhancement':
                prompt = `Based on this collaboration analysis, suggest ways to improve team communication:\n\n${JSON.stringify(context, null, 2)}`;
                break;
            default:
                prompt = `Provide collaboration suggestions based on this context:\n\n${JSON.stringify(context, null, 2)}`;
        }

        const aiSuggestions = await aiService.generateCompletion(prompt, {
            userEmail: userEmail,
            systemMessage: "You are a collaboration specialist providing actionable suggestions for improving team effectiveness in educational research projects."
        });

        // Track AI suggestion usage
        await xapiService.sendStatement({
            actor: { email: userEmail },
            verb: { id: 'http://hulab.edu.hk/verbs/requested', display: { 'en-US': 'requested AI suggestions' }},
            object: {
                id: `${xapiService.baseActivityId}/ai/collaboration-suggestions`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/ai-assistance',
                    name: { 'en-US': 'Collaboration AI Suggestions' }
                }
            },
            context: {
                extensions: {
                    'http://hulab.edu.hk/suggestion-type': suggestionType
                }
            }
        });

        res.json({
            success: true,
            suggestions: aiSuggestions,
            suggestionType: suggestionType,
            generatedAt: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error generating AI collaboration suggestions', { 
            error: error.message, 
            email: req.userContext.email 
        });
        res.status(500).json({
            error: 'AI service error',
            message: 'Unable to generate collaboration suggestions'
        });
    }
});

/**
 * Error handling middleware for collaboration routes
 */
router.use((error, req, res, next) => {
    logger.error('Collaboration route error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        body: req.body
    });

    res.status(500).json({
        error: 'Collaboration system error',
        message: 'An error occurred in the collaboration system',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;