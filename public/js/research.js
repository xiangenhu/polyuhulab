/**
 * Research Project Management UI for Hu Lab Portal
 * Handles project creation, editing, task management, document handling, and collaboration
 * Integrates with xAPI tracking and WebSocket connections
 */

class ResearchManager {
    constructor() {
        this.socket = null;
        this.xapi = window.XAPIClient || null;
        this.currentProject = null;
        this.selectedTasks = [];
        this.draggedElement = null;
        this.fileUploadQueue = [];
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupSocketConnection();
        this.setupDragAndDrop();
        this.loadProjects();
        this.setupAutoSave();
        this.trackPageAccess();
    }

    /**
     * Bind UI event handlers
     */
    bindEvents() {
        // Project management
        $(document).on('click', '.create-project-btn', (e) => {
            e.preventDefault();
            this.showCreateProjectModal();
        });

        $(document).on('click', '.edit-project-btn', (e) => {
            e.preventDefault();
            this.showEditProjectModal($(e.target).closest('[data-project-id]').data('project-id'));
        });

        $(document).on('click', '.delete-project-btn', (e) => {
            e.preventDefault();
            this.confirmDeleteProject($(e.target).closest('[data-project-id]').data('project-id'));
        });

        // Project selection
        $(document).on('click', '.project-card', (e) => {
            if (!$(e.target).closest('.project-actions').length) {
                const projectId = $(e.target).closest('[data-project-id]').data('project-id');
                this.selectProject(projectId);
            }
        });

        // Task management
        $(document).on('click', '.add-task-btn', (e) => {
            e.preventDefault();
            this.showAddTaskModal();
        });

        $(document).on('click', '.edit-task-btn', (e) => {
            e.preventDefault();
            const taskId = $(e.target).closest('[data-task-id]').data('task-id');
            this.showEditTaskModal(taskId);
        });

        $(document).on('change', '.task-checkbox', (e) => {
            const taskId = $(e.target).closest('[data-task-id]').data('task-id');
            const completed = $(e.target).is(':checked');
            this.updateTaskStatus(taskId, completed);
        });

        $(document).on('click', '.delete-task-btn', (e) => {
            e.preventDefault();
            const taskId = $(e.target).closest('[data-task-id]').data('task-id');
            this.deleteTask(taskId);
        });

        // Task bulk actions
        $(document).on('change', '.select-all-tasks', (e) => {
            const checked = $(e.target).is(':checked');
            $('.task-checkbox').prop('checked', checked);
            this.updateSelectedTasks();
        });

        $(document).on('change', '.task-checkbox', () => {
            this.updateSelectedTasks();
        });

        $(document).on('click', '.bulk-action-btn', (e) => {
            e.preventDefault();
            const action = $(e.target).data('action');
            this.handleBulkAction(action);
        });

        // Document management
        $(document).on('click', '.upload-document-btn', (e) => {
            e.preventDefault();
            $('.document-upload-input').click();
        });

        $(document).on('change', '.document-upload-input', (e) => {
            this.handleFileUpload(e.target.files);
        });

        $(document).on('click', '.delete-document-btn', (e) => {
            e.preventDefault();
            const documentId = $(e.target).closest('[data-document-id]').data('document-id');
            this.confirmDeleteDocument(documentId);
        });

        // Search and filtering
        $(document).on('input', '.project-search', (e) => {
            this.filterProjects($(e.target).val());
        });

        $(document).on('change', '.project-filter', (e) => {
            this.applyProjectFilter($(e.target).val());
        });

        $(document).on('input', '.task-search', (e) => {
            this.filterTasks($(e.target).val());
        });

        // Comments and notes
        $(document).on('click', '.add-comment-btn', (e) => {
            e.preventDefault();
            this.showAddCommentModal();
        });

        $(document).on('submit', '.comment-form', (e) => {
            e.preventDefault();
            this.submitComment($(e.target));
        });

        // Form submissions
        $(document).on('submit', '.project-form', (e) => {
            e.preventDefault();
            this.submitProject($(e.target));
        });

        $(document).on('submit', '.task-form', (e) => {
            e.preventDefault();
            this.submitTask($(e.target));
        });

        // Export functionality
        $(document).on('click', '.export-project-btn', (e) => {
            e.preventDefault();
            const format = $(e.target).data('format') || 'pdf';
            this.exportProject(format);
        });
    }

    /**
     * Load projects from API
     */
    async loadProjects() {
        try {
            this.showLoadingState('.projects-container');

            const response = await $.ajax({
                url: '/api/research/projects',
                method: 'GET'
            });

            this.renderProjects(response.data);
            this.hideLoadingState('.projects-container');

        } catch (error) {
            console.error('Projects loading error:', error);
            this.showError('Failed to load projects');
            this.hideLoadingState('.projects-container');
            
            // Track error
            if (this.xapi) {
                this.xapi.track('failed', 'http://adlnet.gov/expapi/verbs/failed', {
                    type: 'research',
                    action: 'load_projects',
                    error: error.message
                });
            }
        }
    }

    /**
     * Render projects list
     */
    renderProjects(projects) {
        const container = $('.projects-list');
        
        if (!projects || projects.length === 0) {
            container.html(`
                <div class="empty-state text-center py-5">
                    <i class="fas fa-project-diagram fa-3x text-muted mb-3"></i>
                    <h5 class="text-muted">No Research Projects</h5>
                    <p class="text-muted mb-4">Create your first research project to get started</p>
                    <button class="btn btn-primary create-project-btn">
                        <i class="fas fa-plus me-2"></i>Create Project
                    </button>
                </div>
            `);
            return;
        }

        const projectsHtml = projects.map(project => this.createProjectCard(project)).join('');
        container.html(projectsHtml);
    }

    /**
     * Create project card HTML
     */
    createProjectCard(project) {
        const statusClass = this.getProjectStatusClass(project.status);
        const progress = Math.round((project.completedTasks / project.totalTasks) * 100) || 0;
        const dueDate = project.dueDate ? new Date(project.dueDate).toLocaleDateString() : 'No due date';

        return `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card project-card h-100" data-project-id="${project.id}">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <span class="badge badge-${statusClass}">${project.status}</span>
                        <div class="project-actions">
                            <div class="dropdown">
                                <button class="btn btn-sm btn-link text-muted" type="button" 
                                        data-toggle="dropdown">
                                    <i class="fas fa-ellipsis-v"></i>
                                </button>
                                <div class="dropdown-menu">
                                    <a class="dropdown-item edit-project-btn" href="#">
                                        <i class="fas fa-edit me-2"></i>Edit
                                    </a>
                                    <a class="dropdown-item export-project-btn" href="#" data-format="pdf">
                                        <i class="fas fa-download me-2"></i>Export
                                    </a>
                                    <div class="dropdown-divider"></div>
                                    <a class="dropdown-item text-danger delete-project-btn" href="#">
                                        <i class="fas fa-trash me-2"></i>Delete
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="card-body">
                        <h5 class="card-title">${project.title}</h5>
                        <p class="card-text text-muted">${project.description || 'No description'}</p>
                        
                        <div class="project-meta mb-3">
                            <small class="text-muted">
                                <i class="fas fa-calendar me-1"></i>Due: ${dueDate}
                            </small>
                            <br>
                            <small class="text-muted">
                                <i class="fas fa-users me-1"></i>${project.collaborators?.length || 0} collaborators
                            </small>
                        </div>

                        <div class="progress mb-2" style="height: 6px;">
                            <div class="progress-bar bg-${statusClass}" 
                                 style="width: ${progress}%"></div>
                        </div>
                        
                        <div class="d-flex justify-content-between">
                            <small class="text-muted">${progress}% complete</small>
                            <small class="text-muted">${project.completedTasks}/${project.totalTasks} tasks</small>
                        </div>
                    </div>
                    <div class="card-footer">
                        <button class="btn btn-primary btn-sm w-100">
                            <i class="fas fa-arrow-right me-2"></i>Open Project
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Select and load project details
     */
    async selectProject(projectId) {
        try {
            this.showLoadingState('.project-details');

            const response = await $.ajax({
                url: `/api/research/projects/${projectId}`,
                method: 'GET'
            });

            this.currentProject = response.data;
            this.renderProjectDetails(this.currentProject);
            this.loadProjectTasks(projectId);
            this.loadProjectDocuments(projectId);
            
            // Switch to project view
            $('.projects-view').hide();
            $('.project-details-view').show();
            
            // Track project selection
            if (this.xapi) {
                this.xapi.track('selected', 'http://adlnet.gov/expapi/verbs/selected', {
                    type: 'research-project',
                    projectId: projectId,
                    projectTitle: this.currentProject.title
                });
            }

        } catch (error) {
            console.error('Project selection error:', error);
            this.showError('Failed to load project details');
            
            if (this.xapi) {
                this.xapi.track('failed', 'http://adlnet.gov/expapi/verbs/failed', {
                    type: 'research-project',
                    action: 'select',
                    projectId: projectId,
                    error: error.message
                });
            }
        }
    }

    /**
     * Render project details
     */
    renderProjectDetails(project) {
        const container = $('.project-details-content');
        
        const detailsHtml = `
            <div class="project-header mb-4">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h2>${project.title}</h2>
                        <p class="text-muted mb-2">${project.description || 'No description'}</p>
                        <span class="badge badge-${this.getProjectStatusClass(project.status)} me-2">
                            ${project.status}
                        </span>
                        <span class="badge badge-outline-secondary">
                            <i class="fas fa-calendar me-1"></i>
                            ${project.dueDate ? new Date(project.dueDate).toLocaleDateString() : 'No due date'}
                        </span>
                    </div>
                    <div class="project-actions">
                        <button class="btn btn-outline-secondary me-2 back-to-projects">
                            <i class="fas fa-arrow-left me-1"></i>Back
                        </button>
                        <button class="btn btn-primary edit-project-btn">
                            <i class="fas fa-edit me-1"></i>Edit Project
                        </button>
                    </div>
                </div>
                
                <div class="row mt-4">
                    <div class="col-md-3">
                        <div class="stat-box">
                            <div class="stat-value">${project.totalTasks || 0}</div>
                            <div class="stat-label">Total Tasks</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-box">
                            <div class="stat-value">${project.completedTasks || 0}</div>
                            <div class="stat-label">Completed</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-box">
                            <div class="stat-value">${project.collaborators?.length || 0}</div>
                            <div class="stat-label">Collaborators</div>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="stat-box">
                            <div class="stat-value">${project.documents?.length || 0}</div>
                            <div class="stat-label">Documents</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        container.html(detailsHtml);
        
        // Handle back button
        $('.back-to-projects').on('click', () => {
            this.showProjectsList();
        });
    }

    /**
     * Load project tasks
     */
    async loadProjectTasks(projectId) {
        try {
            const response = await $.ajax({
                url: `/api/research/projects/${projectId}/tasks`,
                method: 'GET'
            });

            this.renderTasks(response.data);

        } catch (error) {
            console.error('Tasks loading error:', error);
            this.showError('Failed to load tasks');
        }
    }

    /**
     * Render tasks list
     */
    renderTasks(tasks) {
        const container = $('.tasks-list');
        
        if (!tasks || tasks.length === 0) {
            container.html(`
                <div class="empty-state text-center py-4">
                    <i class="fas fa-tasks fa-2x text-muted mb-3"></i>
                    <h6 class="text-muted">No Tasks</h6>
                    <p class="text-muted mb-3">Add tasks to track your project progress</p>
                    <button class="btn btn-primary btn-sm add-task-btn">
                        <i class="fas fa-plus me-1"></i>Add Task
                    </button>
                </div>
            `);
            return;
        }

        const tasksHtml = tasks.map(task => this.createTaskItem(task)).join('');
        container.html(tasksHtml);
        
        // Setup task interactions
        this.setupTaskDragAndDrop();
    }

    /**
     * Create task item HTML
     */
    createTaskItem(task) {
        const priorityClass = this.getTaskPriorityClass(task.priority);
        const statusClass = this.getTaskStatusClass(task.status);
        const dueDate = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '';
        const assignee = task.assignee ? task.assignee.name : 'Unassigned';

        return `
            <div class="task-item card mb-2" data-task-id="${task.id}" draggable="true">
                <div class="card-body py-2">
                    <div class="row align-items-center">
                        <div class="col-auto">
                            <input type="checkbox" class="task-checkbox" 
                                   ${task.completed ? 'checked' : ''}>
                        </div>
                        <div class="col">
                            <div class="task-content">
                                <h6 class="mb-1 ${task.completed ? 'text-muted text-decoration-line-through' : ''}">
                                    ${task.title}
                                </h6>
                                <div class="task-meta">
                                    <span class="badge badge-${priorityClass} badge-sm me-1">
                                        ${task.priority}
                                    </span>
                                    <span class="badge badge-outline-${statusClass} badge-sm me-1">
                                        ${task.status}
                                    </span>
                                    ${dueDate ? `<span class="text-muted small me-2">
                                        <i class="fas fa-calendar me-1"></i>${dueDate}
                                    </span>` : ''}
                                    <span class="text-muted small">
                                        <i class="fas fa-user me-1"></i>${assignee}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div class="col-auto">
                            <div class="task-actions">
                                <button class="btn btn-sm btn-outline-secondary edit-task-btn">
                                    <i class="fas fa-edit"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-danger delete-task-btn">
                                    <i class="fas fa-trash"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Update task status
     */
    async updateTaskStatus(taskId, completed) {
        try {
            await $.ajax({
                url: `/api/research/tasks/${taskId}`,
                method: 'PUT',
                data: JSON.stringify({ completed: completed }),
                contentType: 'application/json'
            });

            // Update UI
            const taskItem = $(`.task-item[data-task-id="${taskId}"]`);
            const title = taskItem.find('h6');
            
            if (completed) {
                title.addClass('text-muted text-decoration-line-through');
                this.showSuccess('Task completed!');
            } else {
                title.removeClass('text-muted text-decoration-line-through');
                this.showSuccess('Task status updated');
            }

            // Track task completion
            if (this.xapi) {
                this.xapi.track(completed ? 'completed' : 'resumed', 
                    `http://adlnet.gov/expapi/verbs/${completed ? 'completed' : 'resumed'}`, {
                    type: 'task',
                    taskId: taskId,
                    projectId: this.currentProject?.id
                });
            }

            // Update project stats
            if (this.currentProject) {
                this.updateProjectStats();
            }

        } catch (error) {
            console.error('Task status update error:', error);
            this.showError('Failed to update task status');
            
            // Revert checkbox state
            $(`.task-item[data-task-id="${taskId}"] .task-checkbox`).prop('checked', !completed);
        }
    }

    /**
     * Setup WebSocket connection
     */
    setupSocketConnection() {
        if (typeof io !== 'undefined') {
            this.socket = io();
            
            this.socket.on('connect', () => {
                console.log('Research socket connected');
            });
            
            this.socket.on('project-update', (data) => {
                this.handleProjectUpdate(data);
            });
            
            this.socket.on('task-update', (data) => {
                this.handleTaskUpdate(data);
            });
            
            this.socket.on('document-upload', (data) => {
                this.handleDocumentUpload(data);
            });
            
            this.socket.on('collaboration-update', (data) => {
                this.handleCollaborationUpdate(data);
            });
        }
    }

    /**
     * Setup drag and drop for file uploads
     */
    setupDragAndDrop() {
        const dropZone = $('.document-drop-zone, .project-details-view');
        
        dropZone.on('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            $(e.currentTarget).addClass('drag-over');
        });
        
        dropZone.on('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            $(e.currentTarget).removeClass('drag-over');
        });
        
        dropZone.on('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            $(e.currentTarget).removeClass('drag-over');
            
            const files = e.originalEvent.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileUpload(files);
            }
        });
    }

    /**
     * Handle file upload
     */
    async handleFileUpload(files) {
        if (!this.currentProject) {
            this.showError('Please select a project first');
            return;
        }

        const formData = new FormData();
        
        for (let i = 0; i < files.length; i++) {
            formData.append('documents', files[i]);
        }
        
        formData.append('projectId', this.currentProject.id);

        try {
            this.showLoadingState('.documents-section');
            
            const response = await $.ajax({
                url: `/api/research/projects/${this.currentProject.id}/documents`,
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false,
                xhr: function() {
                    const xhr = new window.XMLHttpRequest();
                    xhr.upload.addEventListener('progress', (e) => {
                        if (e.lengthComputable) {
                            const percentComplete = (e.loaded / e.total) * 100;
                            // Update progress bar if needed
                        }
                    }, false);
                    return xhr;
                }
            });

            this.showSuccess(`${files.length} document(s) uploaded successfully`);
            this.loadProjectDocuments(this.currentProject.id);
            
            // Track file upload
            if (this.xapi) {
                this.xapi.track('uploaded', 'http://adlnet.gov/expapi/verbs/uploaded', {
                    type: 'documents',
                    count: files.length,
                    projectId: this.currentProject.id
                });
            }

        } catch (error) {
            console.error('File upload error:', error);
            this.showError('Failed to upload documents');
        } finally {
            this.hideLoadingState('.documents-section');
        }
    }

    /**
     * Show projects list view
     */
    showProjectsList() {
        $('.project-details-view').hide();
        $('.projects-view').show();
        this.currentProject = null;
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
     * Get task priority class
     */
    getTaskPriorityClass(priority) {
        const priorityClasses = {
            'high': 'danger',
            'medium': 'warning',
            'low': 'info'
        };
        return priorityClasses[priority] || 'secondary';
    }

    /**
     * Get task status class
     */
    getTaskStatusClass(status) {
        const statusClasses = {
            'todo': 'secondary',
            'in_progress': 'warning',
            'completed': 'success',
            'blocked': 'danger'
        };
        return statusClasses[status] || 'secondary';
    }

    /**
     * Track page access
     */
    trackPageAccess() {
        if (this.xapi) {
            this.xapi.track('accessed', 'http://adlnet.gov/expapi/verbs/accessed', {
                type: 'research-page',
                url: window.location.href
            });
        }
    }

    /**
     * Setup auto-save functionality
     */
    setupAutoSave() {
        let autoSaveTimeout;
        
        $(document).on('input', '.auto-save', function() {
            clearTimeout(autoSaveTimeout);
            autoSaveTimeout = setTimeout(() => {
                // Auto-save logic here
                console.log('Auto-saving...');
            }, 2000);
        });
    }

    /**
     * Show loading state
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
        
        $('.notification-container, .research-header').first().after(alert);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            alert.fadeOut(() => alert.remove());
        }, 5000);
    }
}

// Initialize research manager when DOM is ready
$(document).ready(() => {
    // Only initialize on research page
    if (window.location.pathname === '/research') {
        window.researchManager = new ResearchManager();
    }
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ResearchManager;
}