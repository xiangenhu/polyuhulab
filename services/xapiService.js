/**
 * xAPI Service for Hu Lab Portal
 * Handles all xAPI (Experience API) operations including statements, activities, profiles, and documents
 * All data storage operations should go through this service
 */

const TinCan = require('tincanjs');
const moment = require('moment');
const uuid = require('uuid');

class XAPIService {
    constructor() {
        this.lrs = null;
        this.initialized = false;
        this.baseActivityId = 'http://hulab.edu.hk';
        this.customVerbs = {
            registered: { id: 'http://adlnet.gov/expapi/verbs/registered', display: { 'en-US': 'registered' }},
            uploaded: { id: 'http://hulab.edu.hk/verbs/uploaded', display: { 'en-US': 'uploaded' }},
            downloaded: { id: 'http://hulab.edu.hk/verbs/downloaded', display: { 'en-US': 'downloaded' }},
            collaborated: { id: 'http://hulab.edu.hk/verbs/collaborated', display: { 'en-US': 'collaborated' }},
            researched: { id: 'http://hulab.edu.hk/verbs/researched', display: { 'en-US': 'researched' }},
            analyzed: { id: 'http://hulab.edu.hk/verbs/analyzed', display: { 'en-US': 'analyzed' }},
            assessed: { id: 'http://hulab.edu.hk/verbs/assessed', display: { 'en-US': 'assessed' }},
            reviewed: { id: 'http://hulab.edu.hk/verbs/reviewed', display: { 'en-US': 'reviewed' }},
            shared: { id: 'http://hulab.edu.hk/verbs/shared', display: { 'en-US': 'shared' }},
            commented: { id: 'http://hulab.edu.hk/verbs/commented', display: { 'en-US': 'commented' }},
            annotated: { id: 'http://hulab.edu.hk/verbs/annotated', display: { 'en-US': 'annotated' }},
            queried: { id: 'http://hulab.edu.hk/verbs/queried', display: { 'en-US': 'queried AI' }},
            completed: { id: 'http://adlnet.gov/expapi/verbs/completed', display: { 'en-US': 'completed' }},
            attempted: { id: 'http://adlnet.gov/expapi/verbs/attempted', display: { 'en-US': 'attempted' }},
            experienced: { id: 'http://adlnet.gov/expapi/verbs/experienced', display: { 'en-US': 'experienced' }},
            interacted: { id: 'http://adlnet.gov/expapi/verbs/interacted', display: { 'en-US': 'interacted' }},
            created: { id: 'http://hulab.edu.hk/verbs/created', display: { 'en-US': 'created' }},
            updated: { id: 'http://hulab.edu.hk/verbs/updated', display: { 'en-US': 'updated' }},
            deleted: { id: 'http://hulab.edu.hk/verbs/deleted', display: { 'en-US': 'deleted' }}
        };
    }

    /**
     * Initialize xAPI connection
     */
    async initialize() {
        try {
            this.lrs = new TinCan.LRS({
                endpoint: process.env.LRS_ENDPOINT,
                username: process.env.LRS_USERNAME,
                password: process.env.LRS_PASSWORD,
                allowFail: false
            });

            this.initialized = true;
            console.log('xAPI LRS initialized successfully');
            return true;
        } catch (error) {
            console.error('Failed to initialize xAPI LRS:', error);
            throw new Error('xAPI initialization failed');
        }
    }

    /**
     * Create and send an xAPI statement
     */
    async sendStatement(statementData) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const statement = new TinCan.Statement({
                id: statementData.id || uuid.v4(),
                actor: this.createActor(statementData.actor),
                verb: statementData.verb,
                object: statementData.object,
                result: statementData.result || null,
                context: statementData.context || null,
                timestamp: statementData.timestamp || new Date().toISOString()
            });

            const response = await new Promise((resolve, reject) => {
                this.lrs.saveStatement(statement, {
                    callback: (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                });
            });

            return response;
        } catch (error) {
            console.error('Error sending xAPI statement:', error);
            throw error;
        }
    }

    /**
     * Query xAPI statements with filters
     */
    async getStatements(params = {}) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const queryParams = {
                agent: params.agent || null,
                verb: params.verb || null,
                activity: params.activity || null,
                since: params.since || null,
                until: params.until || null,
                limit: params.limit || 100,
                ascending: params.ascending || false,
                related_activities: params.related_activities || false,
                related_agents: params.related_agents || false,
                format: params.format || 'canonical'
            };

            const response = await new Promise((resolve, reject) => {
                this.lrs.queryStatements(queryParams, {
                    callback: (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                });
            });

            return response.statements || [];
        } catch (error) {
            console.error('Error querying xAPI statements:', error);
            throw error;
        }
    }

    /**
     * User Profile Management
     */
    async saveUserProfile(userEmail, profileData) {
        try {
            const agent = this.createActor({ email: userEmail });
            const profile = {
                profileId: 'user-profile',
                contents: JSON.stringify(profileData),
                contentType: 'application/json',
                etag: '"' + Date.now() + '"'
            };

            const response = await new Promise((resolve, reject) => {
                this.lrs.saveAgentProfile(agent, profile.profileId, profile, {
                    callback: (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                });
            });

            return response;
        } catch (error) {
            console.error('Error saving user profile:', error);
            throw error;
        }
    }

    async getUserProfile(userEmail) {
        try {
            const agent = this.createActor({ email: userEmail });
            
            const response = await new Promise((resolve, reject) => {
                this.lrs.retrieveAgentProfile(agent, 'user-profile', {
                    callback: (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                });
            });

            return response ? JSON.parse(response.contents) : null;
        } catch (error) {
            console.error('Error retrieving user profile:', error);
            return null;
        }
    }

    /**
     * Activity State Management
     */
    async saveActivityState(userEmail, activityId, stateId, stateData) {
        try {
            const agent = this.createActor({ email: userEmail });
            const activity = { id: activityId };
            const state = {
                contents: JSON.stringify(stateData),
                contentType: 'application/json',
                etag: '"' + Date.now() + '"'
            };

            const response = await new Promise((resolve, reject) => {
                this.lrs.saveState(agent, activity, stateId, null, state, {
                    callback: (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                });
            });

            return response;
        } catch (error) {
            console.error('Error saving activity state:', error);
            throw error;
        }
    }

    async getActivityState(userEmail, activityId, stateId) {
        try {
            const agent = this.createActor({ email: userEmail });
            const activity = { id: activityId };

            const response = await new Promise((resolve, reject) => {
                this.lrs.retrieveState(agent, activity, stateId, {
                    callback: (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                });
            });

            return response ? JSON.parse(response.contents) : null;
        } catch (error) {
            console.error('Error retrieving activity state:', error);
            return null;
        }
    }

    /**
     * Document Storage (metadata)
     */
    async saveDocument(activityId, documentData) {
        try {
            const activity = { id: activityId };
            const profileId = `document-${documentData.id || uuid.v4()}`;
            
            const document = {
                contents: JSON.stringify(documentData),
                contentType: 'application/json',
                etag: '"' + Date.now() + '"'
            };

            const response = await new Promise((resolve, reject) => {
                this.lrs.saveActivityProfile(activity, profileId, document, {
                    callback: (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                });
            });

            return { profileId, ...response };
        } catch (error) {
            console.error('Error saving document:', error);
            throw error;
        }
    }

    async getDocument(activityId, documentId) {
        try {
            const activity = { id: activityId };
            const profileId = `document-${documentId}`;

            const response = await new Promise((resolve, reject) => {
                this.lrs.retrieveActivityProfile(activity, profileId, {
                    callback: (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                });
            });

            return response ? JSON.parse(response.contents) : null;
        } catch (error) {
            console.error('Error retrieving document:', error);
            return null;
        }
    }

    /**
     * Analytics Queries
     */
    async getUserActivities(userEmail, limit = 50, since = null) {
        const agent = this.createActor({ email: userEmail });
        return await this.getStatements({
            agent: agent,
            limit: limit,
            since: since,
            ascending: false
        });
    }

    async getProjectActivities(projectId, limit = 100) {
        const activity = { id: `${this.baseActivityId}/project/${projectId}` };
        return await this.getStatements({
            activity: activity,
            limit: limit,
            ascending: false
        });
    }

    async getActivityAnalytics(activityId, dateRange = null) {
        const params = {
            activity: { id: activityId },
            limit: 1000
        };

        if (dateRange) {
            params.since = dateRange.since;
            params.until = dateRange.until;
        }

        const statements = await this.getStatements(params);
        
        // Process statements for analytics
        const analytics = {
            totalInteractions: statements.length,
            uniqueUsers: new Set(statements.map(s => s.actor.mbox)).size,
            verbCounts: {},
            timeDistribution: {},
            userEngagement: {}
        };

        statements.forEach(statement => {
            // Count verbs
            const verbDisplay = statement.verb.display['en-US'] || 'unknown';
            analytics.verbCounts[verbDisplay] = (analytics.verbCounts[verbDisplay] || 0) + 1;

            // Time distribution
            const hour = new Date(statement.timestamp).getHours();
            analytics.timeDistribution[hour] = (analytics.timeDistribution[hour] || 0) + 1;

            // User engagement
            const userEmail = statement.actor.mbox;
            if (!analytics.userEngagement[userEmail]) {
                analytics.userEngagement[userEmail] = { count: 0, verbs: new Set() };
            }
            analytics.userEngagement[userEmail].count++;
            analytics.userEngagement[userEmail].verbs.add(verbDisplay);
        });

        return analytics;
    }

    /**
     * Convenience methods for common statement types
     */
    async trackUserRegistration(userEmail, userName, platform = 'HuLab Portal') {
        return await this.sendStatement({
            actor: { email: userEmail, name: userName },
            verb: this.customVerbs.registered,
            object: {
                id: `${this.baseActivityId}/portal`,
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/application',
                    name: { 'en-US': 'HuLab Portal' }
                }
            },
            context: {
                platform: platform,
                language: 'en-US'
            }
        });
    }

    async trackFileUpload(userEmail, fileId, fileName, fileSize, projectId = null) {
        const statementData = {
            actor: { email: userEmail },
            verb: this.customVerbs.uploaded,
            object: {
                id: `gcs://hulab-portal/${fileId}`,
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/file',
                    name: { 'en-US': fileName }
                }
            },
            result: {
                response: fileId,
                success: true,
                extensions: {
                    'http://hulab.edu.hk/file-size': fileSize
                }
            }
        };

        if (projectId) {
            statementData.context = {
                contextActivities: {
                    parent: [{ id: `${this.baseActivityId}/project/${projectId}` }]
                }
            };
        }

        return await this.sendStatement(statementData);
    }

    async trackCollaboration(userEmail, action, projectId, collaboratorEmails = []) {
        return await this.sendStatement({
            actor: { email: userEmail },
            verb: this.customVerbs.collaborated,
            object: {
                id: `${this.baseActivityId}/project/${projectId}`,
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/project',
                    name: { 'en-US': `Research Project ${projectId}` }
                }
            },
            context: {
                team: collaboratorEmails.map(email => ({ mbox: `mailto:${email}` })),
                extensions: {
                    'http://hulab.edu.hk/collaboration-action': action
                }
            }
        });
    }

    async trackAIInteraction(userEmail, prompt, aiResponse, sessionId, tokens = 0, rating = null) {
        const result = {
            response: aiResponse,
            extensions: {
                'http://hulab.edu.hk/ai-tokens': tokens,
                'http://hulab.edu.hk/prompt': prompt
            }
        };

        if (rating !== null) {
            result.score = { scaled: rating / 5.0 }; // Assuming 5-point scale
        }

        return await this.sendStatement({
            actor: { email: userEmail },
            verb: this.customVerbs.queried,
            object: {
                id: `${this.baseActivityId}/ai/session/${sessionId}`,
                definition: {
                    type: 'http://hulab.edu.hk/activities/ai-interaction',
                    name: { 'en-US': 'AI Assistant Session' }
                }
            },
            result: result
        });
    }

    async trackPageView(userEmail, pagePath, referrer = null) {
        const contextData = { platform: 'HuLab Portal' };
        if (referrer) {
            contextData.extensions = { 'http://hulab.edu.hk/referrer': referrer };
        }

        return await this.sendStatement({
            actor: { email: userEmail },
            verb: this.customVerbs.experienced,
            object: {
                id: `${this.baseActivityId}${pagePath}`,
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/lesson',
                    name: { 'en-US': `Page: ${pagePath}` }
                }
            },
            context: contextData
        });
    }

    async trackAssessmentSubmission(userEmail, assessmentId, responses, score = null, duration = null) {
        const result = {
            response: JSON.stringify(responses),
            success: score !== null,
            completion: true
        };

        if (score !== null) {
            result.score = { scaled: score };
        }

        if (duration !== null) {
            result.duration = `PT${duration}S`; // ISO 8601 duration format
        }

        return await this.sendStatement({
            actor: { email: userEmail },
            verb: this.customVerbs.completed,
            object: {
                id: `${this.baseActivityId}/assessment/${assessmentId}`,
                definition: {
                    type: 'http://adlnet.gov/expapi/activities/assessment',
                    name: { 'en-US': `Assessment ${assessmentId}` }
                }
            },
            result: result
        });
    }

    /**
     * Helper methods
     */
    createActor(actorData) {
        if (actorData.email) {
            return {
                mbox: `mailto:${actorData.email}`,
                name: actorData.name || actorData.email.split('@')[0]
            };
        } else if (actorData.mbox) {
            return {
                mbox: actorData.mbox,
                name: actorData.name || actorData.mbox.replace('mailto:', '').split('@')[0]
            };
        }
        throw new Error('Actor must have email or mbox');
    }

    /**
     * Batch operations for performance
     */
    async sendStatementsBatch(statements) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            const tinCanStatements = statements.map(stmt => new TinCan.Statement({
                id: stmt.id || uuid.v4(),
                actor: this.createActor(stmt.actor),
                verb: stmt.verb,
                object: stmt.object,
                result: stmt.result || null,
                context: stmt.context || null,
                timestamp: stmt.timestamp || new Date().toISOString()
            }));

            const response = await new Promise((resolve, reject) => {
                this.lrs.saveStatements(tinCanStatements, {
                    callback: (err, result) => {
                        if (err) reject(err);
                        else resolve(result);
                    }
                });
            });

            return response;
        } catch (error) {
            console.error('Error sending batch statements:', error);
            throw error;
        }
    }

    /**
     * Health check for xAPI connection
     */
    async healthCheck() {
        try {
            if (!this.initialized) {
                await this.initialize();
            }

            // Try to query a single statement to test connection
            await this.getStatements({ limit: 1 });
            return { status: 'healthy', timestamp: new Date().toISOString() };
        } catch (error) {
            return { status: 'unhealthy', error: error.message, timestamp: new Date().toISOString() };
        }
    }
}

module.exports = new XAPIService();