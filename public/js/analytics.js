/**
 * Analytics Visualization and Reporting for Hu Lab Portal
 * Handles data visualization, reports generation, xAPI analytics, and interactive charts
 * Integrates with Chart.js, D3.js, and custom visualization libraries
 */

class AnalyticsManager {
    constructor() {
        this.socket = null;
        this.xapi = window.XAPIClient || null;
        this.charts = {};
        this.currentDateRange = '30d';
        this.currentFilters = {};
        this.refreshInterval = 60000; // 1 minute
        this.refreshTimer = null;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupSocketConnection();
        this.loadAnalyticsData();
        this.setupAutoRefresh();
        this.trackPageAccess();
    }

    /**
     * Bind UI event handlers
     */
    bindEvents() {
        // Date range controls
        $(document).on('change', '.date-range-selector', (e) => {
            this.handleDateRangeChange($(e.target).val());
        });

        $(document).on('click', '.date-range-btn', (e) => {
            e.preventDefault();
            $('.date-range-btn').removeClass('active');
            $(e.target).addClass('active');
            this.handleDateRangeChange($(e.target).data('range'));
        });

        // Filter controls
        $(document).on('change', '.analytics-filter', (e) => {
            this.handleFilterChange($(e.target));
        });

        $(document).on('click', '.clear-filters', (e) => {
            e.preventDefault();
            this.clearAllFilters();
        });

        // Chart interactions
        $(document).on('click', '.chart-type-selector', (e) => {
            e.preventDefault();
            this.changeChartType($(e.target));
        });

        $(document).on('click', '.toggle-chart-data', (e) => {
            e.preventDefault();
            this.toggleChartDataSeries($(e.target));
        });

        // Export functionality
        $(document).on('click', '.export-chart', (e) => {
            e.preventDefault();
            const chartId = $(e.target).data('chart-id');
            const format = $(e.target).data('format') || 'png';
            this.exportChart(chartId, format);
        });

        $(document).on('click', '.export-report', (e) => {
            e.preventDefault();
            const format = $(e.target).data('format') || 'pdf';
            this.exportReport(format);
        });

        // Real-time controls
        $(document).on('click', '.toggle-realtime', (e) => {
            e.preventDefault();
            this.toggleRealTimeUpdates($(e.target));
        });

        // Drill-down functionality
        $(document).on('click', '.drill-down', (e) => {
            e.preventDefault();
            const dimension = $(e.target).data('dimension');
            const value = $(e.target).data('value');
            this.drillDown(dimension, value);
        });

        // Comparison mode
        $(document).on('click', '.comparison-toggle', (e) => {
            e.preventDefault();
            this.toggleComparisonMode();
        });

        // Custom query builder
        $(document).on('click', '.build-custom-query', (e) => {
            e.preventDefault();
            this.showQueryBuilder();
        });

        $(document).on('submit', '.custom-query-form', (e) => {
            e.preventDefault();
            this.executeCustomQuery($(e.target));
        });

        // Refresh controls
        $(document).on('click', '.refresh-analytics', (e) => {
            e.preventDefault();
            this.refreshAnalytics();
        });
    }

    /**
     * Load analytics data from API
     */
    async loadAnalyticsData() {
        try {
            this.showGlobalLoading(true);

            const [overview, userActivity, projectMetrics, xapiData, customMetrics] = await Promise.all([
                this.fetchOverviewMetrics(),
                this.fetchUserActivityData(),
                this.fetchProjectMetrics(),
                this.fetchXAPIAnalytics(),
                this.fetchCustomMetrics()
            ]);

            this.renderOverviewMetrics(overview);
            this.renderUserActivityCharts(userActivity);
            this.renderProjectMetrics(projectMetrics);
            this.renderXAPIAnalytics(xapiData);
            this.renderCustomMetrics(customMetrics);

            this.showGlobalLoading(false);

        } catch (error) {
            console.error('Analytics loading error:', error);
            this.showError('Failed to load analytics data');
            this.showGlobalLoading(false);
            
            // Track error
            if (this.xapi) {
                this.xapi.track('failed', 'http://adlnet.gov/expapi/verbs/failed', {
                    type: 'analytics',
                    action: 'load_data',
                    error: error.message
                });
            }
        }
    }

    /**
     * Fetch overview metrics
     */
    async fetchOverviewMetrics() {
        const response = await $.ajax({
            url: '/api/analytics/overview',
            method: 'GET',
            data: {
                range: this.currentDateRange,
                ...this.currentFilters
            }
        });
        return response.data;
    }

    /**
     * Fetch user activity data
     */
    async fetchUserActivityData() {
        const response = await $.ajax({
            url: '/api/analytics/user-activity',
            method: 'GET',
            data: {
                range: this.currentDateRange,
                ...this.currentFilters
            }
        });
        return response.data;
    }

    /**
     * Fetch project metrics
     */
    async fetchProjectMetrics() {
        const response = await $.ajax({
            url: '/api/analytics/project-metrics',
            method: 'GET',
            data: {
                range: this.currentDateRange,
                ...this.currentFilters
            }
        });
        return response.data;
    }

    /**
     * Fetch xAPI analytics data
     */
    async fetchXAPIAnalytics() {
        const response = await $.ajax({
            url: '/api/analytics/xapi',
            method: 'GET',
            data: {
                range: this.currentDateRange,
                ...this.currentFilters
            }
        });
        return response.data;
    }

    /**
     * Fetch custom metrics
     */
    async fetchCustomMetrics() {
        const response = await $.ajax({
            url: '/api/analytics/custom-metrics',
            method: 'GET',
            data: {
                range: this.currentDateRange,
                ...this.currentFilters
            }
        });
        return response.data;
    }

    /**
     * Render overview metrics
     */
    renderOverviewMetrics(data) {
        const container = $('.overview-metrics');
        
        const metrics = [
            {
                title: 'Total Users',
                value: data.totalUsers || 0,
                change: data.usersChange || 0,
                icon: 'fas fa-users',
                color: 'primary'
            },
            {
                title: 'Active Sessions',
                value: data.activeSessions || 0,
                change: data.sessionsChange || 0,
                icon: 'fas fa-chart-line',
                color: 'success'
            },
            {
                title: 'Total Projects',
                value: data.totalProjects || 0,
                change: data.projectsChange || 0,
                icon: 'fas fa-project-diagram',
                color: 'info'
            },
            {
                title: 'Research Hours',
                value: data.researchHours || 0,
                change: data.hoursChange || 0,
                icon: 'fas fa-clock',
                color: 'warning'
            },
            {
                title: 'Data Points',
                value: data.totalDataPoints || 0,
                change: data.dataPointsChange || 0,
                icon: 'fas fa-database',
                color: 'secondary'
            },
            {
                title: 'Publications',
                value: data.publications || 0,
                change: data.publicationsChange || 0,
                icon: 'fas fa-file-alt',
                color: 'dark'
            }
        ];

        const metricsHtml = metrics.map(metric => this.createMetricCard(metric)).join('');
        container.html(metricsHtml);

        // Animate counters
        this.animateCounters();
    }

    /**
     * Create metric card HTML
     */
    createMetricCard(metric) {
        const changeIcon = metric.change >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down';
        const changeClass = metric.change >= 0 ? 'text-success' : 'text-danger';
        
        return `
            <div class="col-md-4 col-lg-2 mb-4">
                <div class="card metric-card border-left-${metric.color} h-100">
                    <div class="card-body text-center">
                        <div class="metric-icon mb-2">
                            <i class="${metric.icon} fa-2x text-${metric.color}"></i>
                        </div>
                        <div class="metric-value h4 mb-1 counter" 
                             data-target="${metric.value}">0</div>
                        <div class="metric-title text-muted small mb-2">${metric.title}</div>
                        <div class="metric-change ${changeClass} small">
                            <i class="${changeIcon} me-1"></i>
                            ${Math.abs(metric.change)}%
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render user activity charts
     */
    renderUserActivityCharts(data) {
        this.renderActivityTimelineChart(data.timeline);
        this.renderUserEngagementChart(data.engagement);
        this.renderSessionDistributionChart(data.sessionDistribution);
    }

    /**
     * Render activity timeline chart
     */
    renderActivityTimelineChart(data) {
        const ctx = document.getElementById('activityTimelineChart');
        if (!ctx || !data) return;

        // Destroy existing chart
        if (this.charts.activityTimeline) {
            this.charts.activityTimeline.destroy();
        }

        this.charts.activityTimeline = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels || [],
                datasets: [
                    {
                        label: 'Page Views',
                        data: data.pageViews || [],
                        borderColor: 'rgb(54, 162, 235)',
                        backgroundColor: 'rgba(54, 162, 235, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'User Sessions',
                        data: data.sessions || [],
                        borderColor: 'rgb(255, 99, 132)',
                        backgroundColor: 'rgba(255, 99, 132, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Actions Performed',
                        data: data.actions || [],
                        borderColor: 'rgb(75, 192, 192)',
                        backgroundColor: 'rgba(75, 192, 192, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    intersect: false,
                    mode: 'index'
                },
                plugins: {
                    title: {
                        display: true,
                        text: 'User Activity Timeline'
                    },
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false
                    }
                },
                scales: {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Date'
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: 'Count'
                        },
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /**
     * Render user engagement chart
     */
    renderUserEngagementChart(data) {
        const ctx = document.getElementById('userEngagementChart');
        if (!ctx || !data) return;

        if (this.charts.userEngagement) {
            this.charts.userEngagement.destroy();
        }

        this.charts.userEngagement = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'User Engagement',
                    data: data.values || [],
                    backgroundColor: 'rgba(54, 162, 235, 0.2)',
                    borderColor: 'rgb(54, 162, 235)',
                    borderWidth: 2,
                    pointBackgroundColor: 'rgb(54, 162, 235)',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: 'rgb(54, 162, 235)'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'User Engagement Metrics'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 100
                    }
                }
            }
        });
    }

    /**
     * Render session distribution chart
     */
    renderSessionDistributionChart(data) {
        const ctx = document.getElementById('sessionDistributionChart');
        if (!ctx || !data) return;

        if (this.charts.sessionDistribution) {
            this.charts.sessionDistribution.destroy();
        }

        this.charts.sessionDistribution = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels || [],
                datasets: [{
                    data: data.values || [],
                    backgroundColor: [
                        'rgba(255, 99, 132, 0.8)',
                        'rgba(54, 162, 235, 0.8)',
                        'rgba(255, 205, 86, 0.8)',
                        'rgba(75, 192, 192, 0.8)',
                        'rgba(153, 102, 255, 0.8)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Session Duration Distribution'
                    },
                    legend: {
                        position: 'right'
                    }
                }
            }
        });
    }

    /**
     * Render project metrics
     */
    renderProjectMetrics(data) {
        this.renderProjectProgressChart(data.progress);
        this.renderProjectTimelineChart(data.timeline);
        this.renderCollaborationHeatmap(data.collaboration);
    }

    /**
     * Render project progress chart
     */
    renderProjectProgressChart(data) {
        const ctx = document.getElementById('projectProgressChart');
        if (!ctx || !data) return;

        if (this.charts.projectProgress) {
            this.charts.projectProgress.destroy();
        }

        this.charts.projectProgress = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels || [],
                datasets: [
                    {
                        label: 'Completed Tasks',
                        data: data.completed || [],
                        backgroundColor: 'rgba(40, 167, 69, 0.8)',
                        borderColor: 'rgba(40, 167, 69, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'In Progress Tasks',
                        data: data.inProgress || [],
                        backgroundColor: 'rgba(255, 193, 7, 0.8)',
                        borderColor: 'rgba(255, 193, 7, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Pending Tasks',
                        data: data.pending || [],
                        backgroundColor: 'rgba(108, 117, 125, 0.8)',
                        borderColor: 'rgba(108, 117, 125, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'Project Progress Overview'
                    },
                    legend: {
                        position: 'bottom'
                    }
                },
                scales: {
                    x: {
                        stacked: true
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true
                    }
                }
            }
        });
    }

    /**
     * Render xAPI analytics
     */
    renderXAPIAnalytics(data) {
        this.renderVerbsDistributionChart(data.verbs);
        this.renderLearningPathsChart(data.learningPaths);
        this.renderCompetencyChart(data.competencies);
    }

    /**
     * Render verbs distribution chart
     */
    renderVerbsDistributionChart(data) {
        const ctx = document.getElementById('verbsDistributionChart');
        if (!ctx || !data) return;

        if (this.charts.verbsDistribution) {
            this.charts.verbsDistribution.destroy();
        }

        this.charts.verbsDistribution = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'xAPI Verbs Usage',
                    data: data.values || [],
                    backgroundColor: 'rgba(155, 89, 182, 0.8)',
                    borderColor: 'rgba(155, 89, 182, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: 'xAPI Verbs Distribution'
                    },
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                },
                indexAxis: 'y'
            }
        });
    }

    /**
     * Setup WebSocket connection for real-time updates
     */
    setupSocketConnection() {
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Analytics socket connected');
                this.socket.emit('join-analytics');
            });
            
            this.socket.on('analytics-update', (data) => {
                this.handleRealTimeUpdate(data);
            });
            
            this.socket.on('metric-update', (data) => {
                this.updateMetric(data);
            });
        }
    }

    /**
     * Handle real-time analytics updates
     */
    handleRealTimeUpdate(data) {
        if (data.type === 'metric') {
            this.updateMetricValue(data.metric, data.value);
        } else if (data.type === 'chart') {
            this.updateChartData(data.chartId, data.data);
        }
    }

    /**
     * Handle date range change
     */
    async handleDateRangeChange(range) {
        this.currentDateRange = range;
        
        // Track filter change
        if (this.xapi) {
            this.xapi.track('filtered', 'http://adlnet.gov/expapi/verbs/filtered', {
                type: 'analytics',
                filter: 'dateRange',
                value: range
            });
        }
        
        await this.loadAnalyticsData();
    }

    /**
     * Handle filter change
     */
    handleFilterChange(filterElement) {
        const filterName = filterElement.attr('name');
        const filterValue = filterElement.val();
        
        if (filterValue) {
            this.currentFilters[filterName] = filterValue;
        } else {
            delete this.currentFilters[filterName];
        }
        
        this.applyFilters();
    }

    /**
     * Apply current filters
     */
    async applyFilters() {
        await this.loadAnalyticsData();
        this.updateFilterBadges();
    }

    /**
     * Export chart as image
     */
    exportChart(chartId, format = 'png') {
        const chart = this.charts[chartId];
        if (!chart) {
            this.showError('Chart not found');
            return;
        }
        
        const url = chart.toBase64Image();
        const link = document.createElement('a');
        link.download = `${chartId}-chart.${format}`;
        link.href = url;
        link.click();
        
        // Track export
        if (this.xapi) {
            this.xapi.track('exported', 'http://adlnet.gov/expapi/verbs/exported', {
                type: 'chart',
                chartId: chartId,
                format: format
            });
        }
    }

    /**
     * Export analytics report
     */
    async exportReport(format = 'pdf') {
        try {
            this.showLoadingState('.export-section');
            
            const response = await $.ajax({
                url: '/api/analytics/export',
                method: 'POST',
                data: JSON.stringify({
                    format: format,
                    dateRange: this.currentDateRange,
                    filters: this.currentFilters
                }),
                contentType: 'application/json'
            });
            
            if (response.downloadUrl) {
                window.open(response.downloadUrl, '_blank');
                this.showSuccess('Report exported successfully');
            }
            
            // Track export
            if (this.xapi) {
                this.xapi.track('exported', 'http://adlnet.gov/expapi/verbs/exported', {
                    type: 'report',
                    format: format
                });
            }
            
        } catch (error) {
            console.error('Report export error:', error);
            this.showError('Failed to export report');
        } finally {
            this.hideLoadingState('.export-section');
        }
    }

    /**
     * Setup auto refresh
     */
    setupAutoRefresh() {
        this.refreshTimer = setInterval(() => {
            if (!document.hidden) {
                this.loadAnalyticsData();
            }
        }, this.refreshInterval);
    }

    /**
     * Animate counter elements
     */
    animateCounters() {
        $('.counter').each(function() {
            const $this = $(this);
            const target = parseInt($this.data('target'));
            
            $({ value: 0 }).animate({ value: target }, {
                duration: 1500,
                easing: 'swing',
                step: function() {
                    $this.text(Math.floor(this.value));
                },
                complete: function() {
                    $this.text(target);
                }
            });
        });
    }

    /**
     * Track page access
     */
    trackPageAccess() {
        if (this.xapi) {
            this.xapi.track('accessed', 'http://adlnet.gov/expapi/verbs/accessed', {
                type: 'analytics-page',
                url: window.location.href
            });
        }
    }

    /**
     * Show global loading state
     */
    showGlobalLoading(show) {
        if (show) {
            $('.analytics-content').addClass('loading');
            $('.global-loading-overlay').show();
        } else {
            $('.analytics-content').removeClass('loading');
            $('.global-loading-overlay').hide();
        }
    }

    /**
     * Show loading state for specific element
     */
    showLoadingState(selector) {
        $(selector).addClass('loading').append('<div class="loading-overlay"><div class="spinner"></div></div>');
    }

    /**
     * Hide loading state
     */
    hideLoadingState(selector) {
        $(selector).removeClass('loading').find('.loading-overlay').remove();
    }

    /**
     * Show success message
     */
    showSuccess(message) {
        this.showNotification(message, 'success');
    }

    /**
     * Show error message
     */
    showError(message) {
        this.showNotification(message, 'error');
    }

    /**
     * Show notification
     */
    showNotification(message, type = 'info') {
        const alertClass = type === 'error' ? 'alert-danger' : `alert-${type}`;
        const alert = $(`
            <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            </div>
        `);
        
        $('.notification-container, .analytics-header').first().after(alert);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            alert.fadeOut(() => alert.remove());
        }, 5000);
    }

    /**
     * Cleanup resources
     */
    destroy() {
        // Clear timers
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }
        
        // Destroy charts
        Object.values(this.charts).forEach(chart => {
            if (chart && typeof chart.destroy === 'function') {
                chart.destroy();
            }
        });
        
        // Disconnect socket
        if (this.socket) {
            this.socket.disconnect();
        }
    }
}

// Initialize analytics manager when DOM is ready
$(document).ready(() => {
    // Only initialize on analytics page
    if (window.location.pathname === '/analytics') {
        window.analyticsManager = new AnalyticsManager();
    }
});

// Cleanup on page unload
$(window).on('beforeunload', () => {
    if (window.analyticsManager) {
        window.analyticsManager.destroy();
    }
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AnalyticsManager;
}