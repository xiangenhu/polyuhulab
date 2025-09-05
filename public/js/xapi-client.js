/**
 * xAPI Client for Hu Lab Portal
 * Handles client-side xAPI statement tracking and learning analytics
 * Provides comprehensive user interaction tracking and learning progress monitoring
 */

class XAPIClient {
    constructor(config = {}) {
        this.endpoint = config.endpoint || '/api/xapi/statements';
        this.actor = null;
        this.sessionId = this.generateUUID();
        this.statementQueue = [];
        this.batchSize = config.batchSize || 10;
        this.flushInterval = config.flushInterval || 30000; // 30 seconds
        this.retryAttempts = config.retryAttempts || 3;
        this.isOnline = navigator.onLine;
        this.contextActivities = config.contextActivities || {};
        this.extensions = config.extensions || {};
        
        this.init();
    }

    /**
     * Initialize xAPI client
     */
    init() {
        this.bindEvents();
        this.setupAutoFlush();
        this.setupNetworkListeners();
        this.loadStoredStatements();
        
        // Track session start
        this.trackSessionStart();
    }

    /**
     * Bind automatic tracking events
     */
    bindEvents() {
        // Page navigation tracking
        $(window).on('beforeunload', () => {
            this.trackSessionEnd();
            this.flushStatements(true); // Force immediate flush
        });

        $(window).on('popstate', () => {
            this.track('navigated', 'http://adlnet.gov/expapi/verbs/navigated', {
                type: 'page',
                url: window.location.href,
                referrer: document.referrer
            });
        });

        // User interaction tracking
        $(document).on('click', 'a, button, .trackable', (e) => {
            const element = $(e.target);
            this.trackInteraction(element, 'clicked');
        });

        $(document).on('submit', 'form', (e) => {
            const form = $(e.target);
            this.trackFormSubmission(form);
        });

        $(document).on('focus', 'input, textarea, select', (e) => {
            const element = $(e.target);
            this.trackInteraction(element, 'focused');
        });

        // Scroll tracking
        let scrollTimeout;
        $(window).on('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                this.trackScrollProgress();
            }, 1000);
        });

        // Time-based tracking
        this.setupTimeTracking();

        // Error tracking
        window.addEventListener('error', (e) => {
            this.trackError(e.error, e.filename, e.lineno);
        });

        // Performance tracking
        this.setupPerformanceTracking();
    }

    /**
     * Set the current user/actor
     */
    setUser(user) {
        this.actor = {
            name: user.name,
            mbox: `mailto:${user.email}`,
            objectType: 'Agent',
            account: {
                name: user.id.toString(),
                homePage: window.location.origin
            }
        };

        // Track user identification
        this.track('identified', 'http://adlnet.gov/expapi/verbs/identified', {
            type: 'user-profile',
            userId: user.id,
            userRole: user.role || 'researcher'
        });
    }

    /**
     * Track a learning activity/statement
     */
    track(verb, verbId, objectData, result = null, context = null) {
        if (!this.actor) {
            console.warn('xAPI: No actor set, cannot track activity');
            return;
        }

        const statement = this.createStatement(verb, verbId, objectData, result, context);
        this.queueStatement(statement);
        
        return statement.id;
    }

    /**
     * Create xAPI statement
     */
    createStatement(verb, verbId, objectData, result = null, context = null) {
        const statement = {
            id: this.generateUUID(),
            timestamp: new Date().toISOString(),
            actor: this.actor,
            verb: {
                id: verbId,
                display: { 'en-US': verb }
            },
            object: this.createObject(objectData),
            stored: new Date().toISOString()
        };

        // Add result if provided
        if (result) {
            statement.result = this.createResult(result);
        }

        // Add context if provided or use default context
        statement.context = this.createContext(context);

        return statement;
    }

    /**
     * Create xAPI object
     */
    createObject(objectData) {
        const baseObject = {
            objectType: 'Activity',
            id: this.generateActivityId(objectData),
            definition: {
                name: { 'en-US': objectData.name || objectData.type },
                description: { 'en-US': objectData.description || `User interacted with ${objectData.type}` },
                type: this.mapActivityType(objectData.type)
            }
        };

        // Add extensions if provided
        if (objectData.extensions) {
            baseObject.definition.extensions = objectData.extensions;
        }

        return baseObject;
    }

    /**
     * Create xAPI result object
     */
    createResult(resultData) {
        const result = {};

        if (resultData.score !== undefined) {
            result.score = {
                raw: resultData.score,
                min: resultData.minScore || 0,
                max: resultData.maxScore || 100,
                scaled: resultData.scaledScore || (resultData.score / (resultData.maxScore || 100))
            };
        }

        if (resultData.completion !== undefined) {
            result.completion = resultData.completion;
        }

        if (resultData.success !== undefined) {
            result.success = resultData.success;
        }

        if (resultData.duration !== undefined) {
            result.duration = this.formatDuration(resultData.duration);
        }

        if (resultData.extensions) {
            result.extensions = resultData.extensions;
        }

        return result;
    }

    /**
     * Create xAPI context
     */
    createContext(contextData = {}) {
        const context = {
            registration: this.sessionId,
            platform: 'Hu Lab Portal',
            language: 'en-US',
            instructor: contextData.instructor || null,
            team: contextData.team || null,
            contextActivities: {
                parent: contextData.parent || this.contextActivities.parent || [],
                grouping: contextData.grouping || this.contextActivities.grouping || [],
                category: contextData.category || this.contextActivities.category || [],
                other: contextData.other || this.contextActivities.other || []
            },
            extensions: {
                ...this.extensions,
                'http://hulabportal.com/extensions/sessionId': this.sessionId,
                'http://hulabportal.com/extensions/userAgent': navigator.userAgent,
                'http://hulabportal.com/extensions/screenResolution': `${screen.width}x${screen.height}`,
                'http://hulabportal.com/extensions/timestamp': Date.now(),
                ...contextData.extensions
            }
        };

        return context;
    }

    /**
     * Generate activity ID based on object data
     */
    generateActivityId(objectData) {
        const baseUrl = window.location.origin;
        const path = window.location.pathname;
        
        if (objectData.id) {
            return `${baseUrl}/activities/${objectData.id}`;
        }
        
        if (objectData.type && objectData.name) {
            const slug = objectData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            return `${baseUrl}${path}/${objectData.type}/${slug}`;
        }
        
        return `${baseUrl}${path}/${objectData.type || 'activity'}/${Date.now()}`;
    }

    /**
     * Map activity type to xAPI activity type IRI
     */
    mapActivityType(type) {
        const typeMap = {
            'page': 'http://adlnet.gov/expapi/activities/lesson',
            'button': 'http://adlnet.gov/expapi/activities/interaction',
            'form': 'http://adlnet.gov/expapi/activities/interaction',
            'document': 'http://adlnet.gov/expapi/activities/file',
            'video': 'http://adlnet.gov/expapi/activities/media',
            'audio': 'http://adlnet.gov/expapi/activities/media',
            'project': 'http://hulabportal.com/activities/research-project',
            'task': 'http://hulabportal.com/activities/research-task',
            'collaboration': 'http://adlnet.gov/expapi/activities/collaboration',
            'assessment': 'http://adlnet.gov/expapi/activities/assessment',
            'dashboard': 'http://hulabportal.com/activities/dashboard',
            'analytics': 'http://hulabportal.com/activities/analytics'
        };
        
        return typeMap[type] || 'http://adlnet.gov/expapi/activities/interaction';
    }

    /**
     * Queue statement for batch processing
     */
    queueStatement(statement) {
        this.statementQueue.push(statement);
        
        // Store in localStorage as backup
        this.storeStatementLocally(statement);
        
        // Auto-flush if queue is full
        if (this.statementQueue.length >= this.batchSize) {
            this.flushStatements();
        }
    }

    /**
     * Flush queued statements to server
     */
    async flushStatements(force = false) {
        if (this.statementQueue.length === 0) return;
        
        if (!this.isOnline && !force) {
            console.log('xAPI: Offline, statements queued for later');
            return;
        }

        const statements = [...this.statementQueue];
        this.statementQueue = [];

        try {
            const response = await $.ajax({
                url: this.endpoint,
                method: 'POST',
                data: JSON.stringify(statements),
                contentType: 'application/json',
                timeout: 10000
            });

            if (response.success) {
                console.log(`xAPI: Successfully sent ${statements.length} statements`);
                this.clearStoredStatements(statements);
            } else {
                throw new Error(response.message || 'Failed to send statements');
            }

        } catch (error) {
            console.error('xAPI: Failed to send statements:', error);
            
            // Re-queue failed statements if not forced
            if (!force) {
                this.statementQueue.unshift(...statements);
                this.retryFailedStatements();
            }
        }
    }

    /**
     * Setup automatic statement flushing
     */
    setupAutoFlush() {
        setInterval(() => {
            if (this.statementQueue.length > 0) {
                this.flushStatements();
            }
        }, this.flushInterval);
    }

    /**
     * Track specific interaction types
     */
    trackInteraction(element, interactionType) {
        const elementType = element.prop('tagName').toLowerCase();
        const elementId = element.attr('id');
        const elementClass = element.attr('class');
        const elementText = element.text().trim().substring(0, 100);

        this.track(`${interactionType}`, `http://adlnet.gov/expapi/verbs/${interactionType}`, {
            type: 'ui-element',
            name: elementText || elementId || `${elementType} element`,
            elementType: elementType,
            elementId: elementId,
            elementClass: elementClass,
            extensions: {
                'http://hulabportal.com/extensions/elementSelector': this.getElementSelector(element),
                'http://hulabportal.com/extensions/pageUrl': window.location.href,
                'http://hulabportal.com/extensions/timestamp': Date.now()
            }
        });
    }

    /**
     * Track form submission
     */
    trackFormSubmission(form) {
        const formId = form.attr('id');
        const formAction = form.attr('action');
        const formMethod = form.attr('method') || 'GET';
        const fieldCount = form.find('input, select, textarea').length;

        this.track('submitted', 'http://adlnet.gov/expapi/verbs/submitted', {
            type: 'form',
            name: formId || 'Anonymous form',
            formAction: formAction,
            formMethod: formMethod,
            extensions: {
                'http://hulabportal.com/extensions/fieldCount': fieldCount,
                'http://hulabportal.com/extensions/formSelector': this.getElementSelector(form)
            }
        });
    }

    /**
     * Track scroll progress
     */
    trackScrollProgress() {
        const scrollTop = $(window).scrollTop();
        const docHeight = $(document).height();
        const winHeight = $(window).height();
        const scrollPercent = Math.round((scrollTop / (docHeight - winHeight)) * 100);

        // Only track significant scroll milestones
        const milestones = [25, 50, 75, 90, 100];
        const milestone = milestones.find(m => scrollPercent >= m && !this.hasScrollMilestone(m));

        if (milestone) {
            this.setScrollMilestone(milestone);
            this.track('progressed', 'http://adlnet.gov/expapi/verbs/progressed', {
                type: 'page',
                name: document.title,
                extensions: {
                    'http://hulabportal.com/extensions/scrollPercent': milestone
                }
            }, {
                completion: milestone === 100,
                extensions: {
                    'http://hulabportal.com/extensions/scrollPosition': scrollTop
                }
            });
        }
    }

    /**
     * Track session start
     */
    trackSessionStart() {
        this.sessionStartTime = Date.now();
        
        this.track('launched', 'http://adlnet.gov/expapi/verbs/launched', {
            type: 'session',
            name: 'Hu Lab Portal Session',
            url: window.location.href,
            extensions: {
                'http://hulabportal.com/extensions/sessionId': this.sessionId,
                'http://hulabportal.com/extensions/userAgent': navigator.userAgent,
                'http://hulabportal.com/extensions/referrer': document.referrer
            }
        });
    }

    /**
     * Track session end
     */
    trackSessionEnd() {
        const sessionDuration = Date.now() - this.sessionStartTime;
        
        this.track('terminated', 'http://adlnet.gov/expapi/verbs/terminated', {
            type: 'session',
            name: 'Hu Lab Portal Session',
            extensions: {
                'http://hulabportal.com/extensions/sessionId': this.sessionId
            }
        }, {
            duration: sessionDuration,
            extensions: {
                'http://hulabportal.com/extensions/pageViews': this.getPageViewCount(),
                'http://hulabportal.com/extensions/interactionCount': this.getInteractionCount()
            }
        });
    }

    /**
     * Track errors
     */
    trackError(error, filename, lineno) {
        this.track('failed', 'http://adlnet.gov/expapi/verbs/failed', {
            type: 'error',
            name: error.name || 'JavaScript Error',
            description: error.message || 'Unknown error',
            extensions: {
                'http://hulabportal.com/extensions/errorStack': error.stack,
                'http://hulabportal.com/extensions/filename': filename,
                'http://hulabportal.com/extensions/lineNumber': lineno,
                'http://hulabportal.com/extensions/userAgent': navigator.userAgent
            }
        });
    }

    /**
     * Setup time-based tracking
     */
    setupTimeTracking() {
        let timeOnPageStart = Date.now();
        let isActive = true;

        // Track focus/blur for engagement
        $(window).on('focus', () => {
            if (!isActive) {
                isActive = true;
                timeOnPageStart = Date.now();
            }
        });

        $(window).on('blur', () => {
            if (isActive) {
                isActive = false;
                const timeSpent = Date.now() - timeOnPageStart;
                
                this.track('suspended', 'http://adlnet.gov/expapi/verbs/suspended', {
                    type: 'page',
                    name: document.title,
                    url: window.location.href
                }, {
                    duration: timeSpent,
                    extensions: {
                        'http://hulabportal.com/extensions/engagementTime': timeSpent
                    }
                });
            }
        });

        // Periodic engagement tracking
        setInterval(() => {
            if (isActive) {
                const currentTimeSpent = Date.now() - timeOnPageStart;
                
                // Track every 5 minutes of active time
                if (currentTimeSpent >= 300000) { // 5 minutes
                    this.track('experienced', 'http://adlnet.gov/expapi/verbs/experienced', {
                        type: 'page',
                        name: document.title,
                        url: window.location.href
                    }, {
                        duration: currentTimeSpent,
                        extensions: {
                            'http://hulabportal.com/extensions/activeTime': currentTimeSpent
                        }
                    });
                    
                    timeOnPageStart = Date.now();
                }
            }
        }, 60000); // Check every minute
    }

    /**
     * Setup performance tracking
     */
    setupPerformanceTracking() {
        if (performance && performance.timing) {
            $(window).on('load', () => {
                setTimeout(() => {
                    const timing = performance.timing;
                    const loadTime = timing.loadEventEnd - timing.navigationStart;
                    
                    this.track('completed', 'http://adlnet.gov/expapi/verbs/completed', {
                        type: 'page-load',
                        name: document.title,
                        url: window.location.href
                    }, {
                        duration: loadTime,
                        success: loadTime < 3000, // Consider successful if under 3 seconds
                        extensions: {
                            'http://hulabportal.com/extensions/domContentLoaded': timing.domContentLoadedEventEnd - timing.navigationStart,
                            'http://hulabportal.com/extensions/firstPaint': timing.responseEnd - timing.requestStart,
                            'http://hulabportal.com/extensions/totalLoadTime': loadTime
                        }
                    });
                }, 100);
            });
        }
    }

    /**
     * Setup network listeners
     */
    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            console.log('xAPI: Back online, flushing queued statements');
            this.flushStatements();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('xAPI: Gone offline, statements will be queued');
        });
    }

    /**
     * Store statement locally as backup
     */
    storeStatementLocally(statement) {
        try {
            const stored = JSON.parse(localStorage.getItem('xapi_statements') || '[]');
            stored.push(statement);
            
            // Keep only last 1000 statements
            if (stored.length > 1000) {
                stored.splice(0, stored.length - 1000);
            }
            
            localStorage.setItem('xapi_statements', JSON.stringify(stored));
        } catch (error) {
            console.warn('xAPI: Failed to store statement locally:', error);
        }
    }

    /**
     * Load stored statements from localStorage
     */
    loadStoredStatements() {
        try {
            const stored = JSON.parse(localStorage.getItem('xapi_statements') || '[]');
            this.statementQueue.push(...stored);
            console.log(`xAPI: Loaded ${stored.length} stored statements`);
        } catch (error) {
            console.warn('xAPI: Failed to load stored statements:', error);
        }
    }

    /**
     * Clear stored statements
     */
    clearStoredStatements(sentStatements) {
        try {
            const stored = JSON.parse(localStorage.getItem('xapi_statements') || '[]');
            const remaining = stored.filter(statement => 
                !sentStatements.some(sent => sent.id === statement.id)
            );
            localStorage.setItem('xapi_statements', JSON.stringify(remaining));
        } catch (error) {
            console.warn('xAPI: Failed to clear stored statements:', error);
        }
    }

    /**
     * Utility functions
     */
    generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            const r = Math.random() * 16 | 0;
            const v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        return `PT${hours > 0 ? hours + 'H' : ''}${minutes > 0 ? minutes + 'M' : ''}${secs}S`;
    }

    getElementSelector(element) {
        const id = element.attr('id');
        if (id) return `#${id}`;
        
        const className = element.attr('class');
        if (className) {
            const firstClass = className.split(' ')[0];
            return `.${firstClass}`;
        }
        
        return element.prop('tagName').toLowerCase();
    }

    hasScrollMilestone(milestone) {
        const milestones = JSON.parse(sessionStorage.getItem('scroll_milestones') || '[]');
        return milestones.includes(milestone);
    }

    setScrollMilestone(milestone) {
        const milestones = JSON.parse(sessionStorage.getItem('scroll_milestones') || '[]');
        milestones.push(milestone);
        sessionStorage.setItem('scroll_milestones', JSON.stringify(milestones));
    }

    getPageViewCount() {
        return parseInt(sessionStorage.getItem('page_view_count') || '0');
    }

    getInteractionCount() {
        return parseInt(sessionStorage.getItem('interaction_count') || '0');
    }

    retryFailedStatements() {
        // Implement retry logic with exponential backoff
        setTimeout(() => {
            if (this.isOnline && this.statementQueue.length > 0) {
                this.flushStatements();
            }
        }, 5000);
    }
}

// Initialize xAPI client when DOM is ready
$(document).ready(() => {
    // Initialize with configuration
    const xapiConfig = {
        endpoint: '/api/xapi/statements',
        batchSize: 10,
        flushInterval: 30000,
        retryAttempts: 3
    };
    
    window.XAPIClient = new XAPIClient(xapiConfig);
    
    // Set user if authenticated
    if (window.authManager && window.authManager.currentUser) {
        window.XAPIClient.setUser(window.authManager.currentUser);
    }
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = XAPIClient;
}