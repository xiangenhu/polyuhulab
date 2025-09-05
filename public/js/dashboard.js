/**
 * Dashboard Functionality for Hu Lab Portal
 * Handles charts, activity feeds, statistics, and real-time updates
 * Integrates with xAPI tracking and WebSocket connections
 */

class DashboardManager {
    constructor() {
        this.socket = null;
        this.xapi = window.XAPIClient || null;
        this.charts = {};
        this.refreshInterval = 30000; // 30 seconds
        this.refreshTimer = null;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupSocketConnection();
        this.loadDashboardData();
        this.setupAutoRefresh();
        this.trackDashboardAccess();
    }

    /**
     * Bind UI event handlers
     */
    bindEvents() {
        // Refresh button
        $(document).on('click', '.refresh-dashboard', (e) => {
            e.preventDefault();
            this.refreshDashboard();
        });

        // Date range selector
        $(document).on('change', '.date-range-selector', (e) => {
            this.handleDateRangeChange($(e.target).val());
        });

        // Chart type toggles
        $(document).on('click', '.chart-toggle', (e) => {
            e.preventDefault();
            this.toggleChartType($(e.target));
        });

        // Activity filter buttons
        $(document).on('click', '.activity-filter', (e) => {
            e.preventDefault();
            this.filterActivity($(e.target).data('filter'));
        });

        // Quick action buttons
        $(document).on('click', '.quick-action', (e) => {
            e.preventDefault();
            this.handleQuickAction($(e.target));
        });

        // Export functionality
        $(document).on('click', '.export-dashboard', (e) => {
            e.preventDefault();
            this.exportDashboard($(e.target).data('format'));
        });

        // Settings modal
        $(document).on('click', '.dashboard-settings', (e) => {
            e.preventDefault();
            this.showSettingsModal();
        });
    }

    /**
     * Load main dashboard data
     */
    async loadDashboardData() {
        try {
            this.showLoadingState();

            const [overview, activities, projects, analytics] = await Promise.all([
                this.fetchOverviewData(),
                this.fetchRecentActivities(),
                this.fetchProjectsData(),
                this.fetchAnalyticsData()
            ]);

            this.renderOverview(overview);
            this.renderActivityFeed(activities);
            this.renderProjectsWidget(projects);
            this.renderAnalyticsCharts(analytics);

            this.hideLoadingState();

        } catch (error) {
            console.error('Dashboard loading error:', error);
            this.showError('Failed to load dashboard data');
            this.hideLoadingState();
            
            // Track error
            if (this.xapi) {
                this.xapi.track('failed', 'http://adlnet.gov/expapi/verbs/failed', {
                    type: 'dashboard',
                    action: 'load',
                    error: error.message
                });
            }
        }
    }

    /**
     * Fetch overview statistics
     */
    async fetchOverviewData() {
        const response = await $.ajax({
            url: '/api/dashboard/overview',
            method: 'GET'
        });
        return response.data;
    }

    /**
     * Fetch recent activities
     */
    async fetchRecentActivities(limit = 20) {
        const response = await $.ajax({
            url: '/api/dashboard/activities',
            method: 'GET',
            data: { limit }
        });
        return response.data;
    }

    /**
     * Fetch projects data
     */
    async fetchProjectsData() {
        const response = await $.ajax({
            url: '/api/dashboard/projects',
            method: 'GET'
        });
        return response.data;
    }

    /**
     * Fetch analytics data
     */
    async fetchAnalyticsData(dateRange = '30d') {
        const response = await $.ajax({
            url: '/api/dashboard/analytics',
            method: 'GET',
            data: { range: dateRange }
        });
        return response.data;
    }

    /**
     * Render overview statistics
     */
    renderOverview(data) {
        const overviewContainer = $('.overview-stats');
        
        const stats = [
            {
                title: 'Active Projects',
                value: data.activeProjects || 0,
                change: data.projectsChange || 0,
                icon: 'fas fa-project-diagram',
                color: 'primary'
            },
            {
                title: 'Team Members',
                value: data.teamMembers || 0,
                change: data.membersChange || 0,
                icon: 'fas fa-users',
                color: 'success'
            },
            {
                title: 'Research Hours',
                value: data.researchHours || 0,
                change: data.hoursChange || 0,
                icon: 'fas fa-clock',
                color: 'info'
            },
            {
                title: 'Publications',
                value: data.publications || 0,
                change: data.publicationsChange || 0,
                icon: 'fas fa-file-alt',
                color: 'warning'
            }
        ];

        const statsHtml = stats.map(stat => this.createStatCard(stat)).join('');
        overviewContainer.html(statsHtml);

        // Animate counters
        this.animateCounters();
    }

    /**
     * Create a statistics card
     */
    createStatCard(stat) {
        const changeIcon = stat.change >= 0 ? 'fas fa-arrow-up' : 'fas fa-arrow-down';
        const changeClass = stat.change >= 0 ? 'text-success' : 'text-danger';
        
        return `
            <div class="col-md-3 col-sm-6 mb-4">
                <div class="card stat-card border-left-${stat.color}">
                    <div class="card-body">
                        <div class="row no-gutters align-items-center">
                            <div class="col mr-2">
                                <div class="text-xs font-weight-bold text-${stat.color} text-uppercase mb-1">
                                    ${stat.title}
                                </div>
                                <div class="h5 mb-0 font-weight-bold text-gray-800 counter" 
                                     data-target="${stat.value}">0</div>
                                <div class="text-xs ${changeClass} mt-1">
                                    <i class="${changeIcon} mr-1"></i>
                                    ${Math.abs(stat.change)}% from last month
                                </div>
                            </div>
                            <div class="col-auto">
                                <i class="${stat.icon} fa-2x text-gray-300"></i>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render activity feed
     */
    renderActivityFeed(activities) {
        const feedContainer = $('.activity-feed');
        
        if (!activities || activities.length === 0) {
            feedContainer.html('<div class="text-center text-muted py-4">No recent activities</div>');
            return;
        }

        const activitiesHtml = activities.map(activity => this.createActivityItem(activity)).join('');
        feedContainer.html(activitiesHtml);

        // Setup infinite scroll if needed
        this.setupInfiniteScroll(feedContainer);
    }

    /**
     * Create an activity item
     */
    createActivityItem(activity) {
        const timeAgo = this.formatTimeAgo(activity.timestamp);
        const iconClass = this.getActivityIcon(activity.type);
        const colorClass = this.getActivityColor(activity.type);

        return `
            <div class="activity-item border-bottom py-3">
                <div class="d-flex">
                    <div class="flex-shrink-0">
                        <div class="activity-icon bg-${colorClass}">
                            <i class="${iconClass}"></i>
                        </div>
                    </div>
                    <div class="flex-grow-1 ms-3">
                        <div class="activity-content">
                            <strong>${activity.user?.name || 'Unknown User'}</strong>
                            <span class="activity-action">${activity.description}</span>
                        </div>
                        <div class="activity-meta text-muted small">
                            <span class="activity-time">${timeAgo}</span>
                            ${activity.project ? `<span class="activity-project ms-2">${activity.project.name}</span>` : ''}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render projects widget
     */
    renderProjectsWidget(projects) {
        const projectsContainer = $('.projects-widget');
        
        if (!projects || projects.length === 0) {
            projectsContainer.html('<div class="text-center text-muted py-4">No active projects</div>');
            return;
        }

        const projectsHtml = projects.map(project => this.createProjectCard(project)).join('');
        projectsContainer.html(projectsHtml);
    }

    /**
     * Create a project card
     */
    createProjectCard(project) {
        const progressPercent = Math.round((project.completedTasks / project.totalTasks) * 100) || 0;
        const statusClass = this.getProjectStatusClass(project.status);

        return `
            <div class="col-md-4 col-sm-6 mb-3">
                <div class="card project-card h-100">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="card-title mb-0">${project.title}</h6>
                            <span class="badge badge-${statusClass}">${project.status}</span>
                        </div>
                        <p class="card-text text-muted small mb-3">${project.description || 'No description'}</p>
                        <div class="progress mb-2" style="height: 6px;">
                            <div class="progress-bar bg-${statusClass}" 
                                 style="width: ${progressPercent}%"></div>
                        </div>
                        <div class="d-flex justify-content-between text-xs text-muted">
                            <span>${project.completedTasks}/${project.totalTasks} tasks</span>
                            <span>${progressPercent}% complete</span>
                        </div>
                        <div class="mt-3">
                            <a href="/research?project=${project.id}" class="btn btn-sm btn-outline-primary">
                                View Project
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render analytics charts
     */
    renderAnalyticsCharts(data) {
        this.renderActivityChart(data.activityChart);
        this.renderProgressChart(data.progressChart);
        this.renderCollaborationChart(data.collaborationChart);
    }

    /**
     * Render activity timeline chart
     */
    renderActivityChart(data) {
        const ctx = document.getElementById('activityChart');
        if (!ctx || !data) return;

        // Destroy existing chart
        if (this.charts.activity) {
            this.charts.activity.destroy();
        }

        this.charts.activity = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Daily Activity',
                    data: data.values || [],
                    borderColor: 'rgb(54, 162, 235)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            display: false
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    /**
     * Render progress donut chart
     */
    renderProgressChart(data) {
        const ctx = document.getElementById('progressChart');
        if (!ctx || !data) return;

        // Destroy existing chart
        if (this.charts.progress) {
            this.charts.progress.destroy();
        }

        this.charts.progress = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.labels || ['Completed', 'In Progress', 'Pending'],
                datasets: [{
                    data: data.values || [0, 0, 0],
                    backgroundColor: [
                        'rgba(40, 167, 69, 0.8)',
                        'rgba(255, 193, 7, 0.8)',
                        'rgba(108, 117, 125, 0.8)'
                    ],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    }

    /**
     * Render collaboration chart
     */
    renderCollaborationChart(data) {
        const ctx = document.getElementById('collaborationChart');
        if (!ctx || !data) return;

        // Destroy existing chart
        if (this.charts.collaboration) {
            this.charts.collaboration.destroy();
        }

        this.charts.collaboration = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: data.labels || [],
                datasets: [{
                    label: 'Team Contributions',
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
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: {
                            display: false
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        }
                    }
                }
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
                console.log('Dashboard socket connected');
                this.socket.emit('join-dashboard');
            });
            
            this.socket.on('dashboard-update', (data) => {
                this.handleRealTimeUpdate(data);
            });
            
            this.socket.on('activity-update', (activity) => {
                this.addNewActivity(activity);
            });
            
            this.socket.on('project-update', (project) => {
                this.updateProject(project);
            });
        }
    }

    /**
     * Handle real-time dashboard updates
     */
    handleRealTimeUpdate(data) {
        if (data.type === 'overview') {
            this.updateOverviewStats(data.stats);
        } else if (data.type === 'activity') {
            this.addNewActivity(data.activity);
        } else if (data.type === 'project') {
            this.updateProject(data.project);
        }
    }

    /**
     * Add new activity to feed
     */
    addNewActivity(activity) {
        const feedContainer = $('.activity-feed');
        const newActivityHtml = this.createActivityItem(activity);
        
        feedContainer.prepend(newActivityHtml);
        
        // Remove oldest activity if too many
        const activities = feedContainer.find('.activity-item');
        if (activities.length > 20) {
            activities.last().remove();
        }
        
        // Highlight new activity
        feedContainer.find('.activity-item:first').addClass('new-activity');
        setTimeout(() => {
            feedContainer.find('.activity-item:first').removeClass('new-activity');
        }, 3000);
    }

    /**
     * Update project in widget
     */
    updateProject(project) {
        // Find and update the project card
        const projectCard = $(`.project-card[data-project-id="${project.id}"]`);
        if (projectCard.length) {
            const updatedCard = this.createProjectCard(project);
            projectCard.replaceWith(updatedCard);
        }
    }

    /**
     * Refresh entire dashboard
     */
    async refreshDashboard() {
        const refreshBtn = $('.refresh-dashboard');
        const originalIcon = refreshBtn.find('i').attr('class');
        
        // Show spinning icon
        refreshBtn.find('i').attr('class', 'fas fa-spinner fa-spin');
        refreshBtn.prop('disabled', true);
        
        try {
            await this.loadDashboardData();
            this.showSuccess('Dashboard refreshed successfully');
            
            // Track refresh
            if (this.xapi) {
                this.xapi.track('refreshed', 'http://adlnet.gov/expapi/verbs/refreshed', {
                    type: 'dashboard'
                });
            }
            
        } catch (error) {
            console.error('Dashboard refresh error:', error);
            this.showError('Failed to refresh dashboard');
        } finally {
            refreshBtn.find('i').attr('class', originalIcon);
            refreshBtn.prop('disabled', false);
        }
    }

    /**
     * Handle date range change
     */
    async handleDateRangeChange(range) {
        try {
            const analyticsData = await this.fetchAnalyticsData(range);
            this.renderAnalyticsCharts(analyticsData);
            
            // Track filter change
            if (this.xapi) {
                this.xapi.track('filtered', 'http://adlnet.gov/expapi/verbs/filtered', {
                    type: 'dashboard',
                    filter: 'dateRange',
                    value: range
                });
            }
            
        } catch (error) {
            console.error('Date range change error:', error);
            this.showError('Failed to update data for selected date range');
        }
    }

    /**
     * Setup auto refresh
     */
    setupAutoRefresh() {
        this.refreshTimer = setInterval(() => {
            // Only refresh if page is visible
            if (!document.hidden) {
                this.loadDashboardData();
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
                duration: 1000,
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
     * Get activity icon class
     */
    getActivityIcon(type) {
        const icons = {
            'project_created': 'fas fa-plus-circle',
            'project_updated': 'fas fa-edit',
            'task_completed': 'fas fa-check-circle',
            'document_uploaded': 'fas fa-upload',
            'comment_added': 'fas fa-comment',
            'collaboration': 'fas fa-users',
            'analysis_complete': 'fas fa-chart-line'
        };
        return icons[type] || 'fas fa-info-circle';
    }

    /**
     * Get activity color class
     */
    getActivityColor(type) {
        const colors = {
            'project_created': 'success',
            'project_updated': 'info',
            'task_completed': 'success',
            'document_uploaded': 'warning',
            'comment_added': 'primary',
            'collaboration': 'secondary',
            'analysis_complete': 'info'
        };
        return colors[type] || 'light';
    }

    /**
     * Get project status class
     */
    getProjectStatusClass(status) {
        const statusClasses = {
            'active': 'success',
            'planning': 'info',
            'on_hold': 'warning',
            'completed': 'primary',
            'cancelled': 'danger'
        };
        return statusClasses[status] || 'secondary';
    }

    /**
     * Format time ago
     */
    formatTimeAgo(timestamp) {
        const now = new Date();
        const time = new Date(timestamp);
        const diff = now - time;
        
        const minute = 60 * 1000;
        const hour = minute * 60;
        const day = hour * 24;
        const week = day * 7;
        
        if (diff < minute) return 'just now';
        if (diff < hour) return Math.floor(diff / minute) + 'm ago';
        if (diff < day) return Math.floor(diff / hour) + 'h ago';
        if (diff < week) return Math.floor(diff / day) + 'd ago';
        
        return time.toLocaleDateString();
    }

    /**
     * Track dashboard access
     */
    trackDashboardAccess() {
        if (this.xapi) {
            this.xapi.track('accessed', 'http://adlnet.gov/expapi/verbs/accessed', {
                type: 'dashboard',
                url: window.location.href
            });
        }
    }

    /**
     * Show loading state
     */
    showLoadingState() {
        $('.dashboard-content').addClass('loading');
        $('.loading-overlay').show();
    }

    /**
     * Hide loading state
     */
    hideLoadingState() {
        $('.dashboard-content').removeClass('loading');
        $('.loading-overlay').hide();
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
        
        $('.notification-container, .dashboard-header').first().after(alert);
        
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

// Initialize dashboard manager when DOM is ready
$(document).ready(() => {
    // Only initialize on dashboard page
    if (window.location.pathname === '/dashboard') {
        window.dashboardManager = new DashboardManager();
    }
});

// Cleanup on page unload
$(window).on('beforeunload', () => {
    if (window.dashboardManager) {
        window.dashboardManager.destroy();
    }
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DashboardManager;
}