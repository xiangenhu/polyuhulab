const TinCan = require('tincanjs');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'xapi-config' }
});

class XAPIConfig {
    constructor() {
        this.lrs = null;
        this.initialized = false;
    }

    async initialize() {
        try {
            // Configure TinCan LRS
            this.lrs = new TinCan.LRS({
                endpoint: process.env.XAPI_ENDPOINT,
                username: process.env.XAPI_USERNAME,
                password: process.env.XAPI_PASSWORD,
                allowFail: false
            });

            // Test connection
            const result = await this.testConnection();
            if (result) {
                this.initialized = true;
                logger.info('xAPI LRS connection established successfully');
                return true;
            } else {
                throw new Error('Failed to connect to xAPI LRS');
            }
        } catch (error) {
            logger.error('xAPI initialization failed:', error);
            throw error;
        }
    }

    async testConnection() {
        return new Promise((resolve) => {
            this.lrs.saveStatement(
                new TinCan.Statement({
                    actor: {
                        mbox: 'mailto:system@hulab.edu.hk',
                        name: 'System'
                    },
                    verb: {
                        id: 'http://adlnet.gov/expapi/verbs/initialized',
                        display: { 'en-US': 'initialized' }
                    },
                    object: {
                        id: 'http://hulab.edu.hk/portal',
                        definition: {
                            type: 'http://adlnet.gov/expapi/activities/application',
                            name: { 'en-US': 'HuLab Portal' },
                            description: { 'en-US': 'Educational Research Collaboration Portal' }
                        }
                    },
                    context: {
                        platform: 'HuLab Portal',
                        language: 'en-US',
                        extensions: {
                            'http://hulab.edu.hk/version': '1.0.0',
                            'http://hulab.edu.hk/environment': process.env.NODE_ENV || 'development'
                        }
                    }
                }),
                {
                    callback: (err, xhr) => {
                        if (err !== null) {
                            logger.error('xAPI connection test failed:', err);
                            resolve(false);
                        } else {
                            resolve(true);
                        }
                    }
                }
            );
        });
    }

    getLRS() {
        if (!this.initialized) {
            throw new Error('xAPI not initialized. Call initialize() first.');
        }
        return this.lrs;
    }

    // Helper method to create consistent actor objects
    createActor(email, name) {
        return {
            mbox: `mailto:${email}`,
            name: name,
            objectType: 'Agent'
        };
    }

    // Helper method to create verb objects
    createVerb(verbId, display) {
        const baseUrl = 'http://hulab.edu.hk/verbs/';
        const standardVerbs = {
            'completed': 'http://adlnet.gov/expapi/verbs/completed',
            'attempted': 'http://adlnet.gov/expapi/verbs/attempted',
            'passed': 'http://adlnet.gov/expapi/verbs/passed',
            'failed': 'http://adlnet.gov/expapi/verbs/failed',
            'answered': 'http://adlnet.gov/expapi/verbs/answered',
            'asked': 'http://adlnet.gov/expapi/verbs/asked',
            'commented': 'http://adlnet.gov/expapi/verbs/commented',
            'shared': 'http://adlnet.gov/expapi/verbs/shared',
            'registered': 'http://adlnet.gov/expapi/verbs/registered',
            'logged-in': 'http://adlnet.gov/expapi/verbs/logged-in',
            'logged-out': 'http://adlnet.gov/expapi/verbs/logged-out'
        };

        const customVerbs = {
            'uploaded': baseUrl + 'uploaded',
            'downloaded': baseUrl + 'downloaded',
            'collaborated': baseUrl + 'collaborated',
            'researched': baseUrl + 'researched',
            'analyzed': baseUrl + 'analyzed',
            'assessed': baseUrl + 'assessed',
            'reviewed': baseUrl + 'reviewed',
            'annotated': baseUrl + 'annotated',
            'ai-queried': baseUrl + 'ai-queried',
            'generated': baseUrl + 'generated'
        };

        let id = standardVerbs[verbId] || customVerbs[verbId] || baseUrl + verbId;
        
        return {
            id: id,
            display: { 'en-US': display || verbId }
        };
    }

    // Helper method to create activity objects
    createActivity(id, type, name, description) {
        const baseUrl = 'http://hulab.edu.hk/';
        const activityTypes = {
            'application': 'http://adlnet.gov/expapi/activities/application',
            'assessment': 'http://adlnet.gov/expapi/activities/assessment',
            'course': 'http://adlnet.gov/expapi/activities/course',
            'file': 'http://adlnet.gov/expapi/activities/file',
            'interaction': 'http://adlnet.gov/expapi/activities/interaction',
            'lesson': 'http://adlnet.gov/expapi/activities/lesson',
            'media': 'http://adlnet.gov/expapi/activities/media',
            'meeting': 'http://adlnet.gov/expapi/activities/meeting',
            'module': 'http://adlnet.gov/expapi/activities/module',
            'objective': 'http://adlnet.gov/expapi/activities/objective',
            'performance': 'http://adlnet.gov/expapi/activities/performance',
            'profile': 'http://adlnet.gov/expapi/activities/profile',
            'question': 'http://adlnet.gov/expapi/activities/question',
            'project': baseUrl + 'activities/project',
            'research': baseUrl + 'activities/research',
            'collaboration': baseUrl + 'activities/collaboration',
            'ai-interaction': baseUrl + 'activities/ai-interaction'
        };

        return {
            id: id.startsWith('http') ? id : baseUrl + id,
            definition: {
                type: activityTypes[type] || type,
                name: { 'en-US': name },
                description: { 'en-US': description }
            }
        };
    }

    // Helper method to create context objects
    createContext(options = {}) {
        const context = {
            platform: 'HuLab Portal',
            language: options.language || 'en-US',
            contextActivities: {}
        };

        if (options.parent) {
            context.contextActivities.parent = Array.isArray(options.parent) ? options.parent : [options.parent];
        }

        if (options.grouping) {
            context.contextActivities.grouping = Array.isArray(options.grouping) ? options.grouping : [options.grouping];
        }

        if (options.category) {
            context.contextActivities.category = Array.isArray(options.category) ? options.category : [options.category];
        }

        if (options.extensions) {
            context.extensions = options.extensions;
        }

        if (options.team) {
            context.team = options.team;
        }

        if (options.instructor) {
            context.instructor = options.instructor;
        }

        return context;
    }

    // Helper method to create result objects
    createResult(options = {}) {
        const result = {};

        if (options.score) {
            result.score = {
                scaled: options.score.scaled,
                raw: options.score.raw,
                min: options.score.min || 0,
                max: options.score.max || 100
            };
        }

        if (options.success !== undefined) {
            result.success = options.success;
        }

        if (options.completion !== undefined) {
            result.completion = options.completion;
        }

        if (options.response) {
            result.response = options.response;
        }

        if (options.duration) {
            result.duration = options.duration;
        }

        if (options.extensions) {
            result.extensions = options.extensions;
        }

        return result;
    }
}

module.exports = new XAPIConfig();