/**
 * Shared JavaScript functionality for Hu Lab @ PolyU
 * Contains common utilities, WebSocket handlers, and UI interactions
 */

// Global variables
let wsConnection = null;
let notificationQueue = [];
let activeToasts = 0;

// Configuration
const CONFIG = {
    WEBSOCKET_URL: 'wss://api.hulab.polyu.edu.hk/ws',
    API_BASE_URL: '/api',
    MAX_RECONNECT_ATTEMPTS: 5,
    RECONNECT_DELAY: 3000,
    NOTIFICATION_DURATION: 5000,
    AUTO_SAVE_INTERVAL: 30000
};

// WebSocket Management
class WebSocketManager {
    constructor() {
        this.connection = null;
        this.reconnectAttempts = 0;
        this.isConnected = false;
        this.messageHandlers = new Map();
        this.heartbeatInterval = null;
    }

    connect() {
        try {
            const token = localStorage.getItem('token');
            if (!token) {
                console.warn('No authentication token found');
                return;
            }

            this.connection = new WebSocket(`${CONFIG.WEBSOCKET_URL}?token=${token}`);
            
            this.connection.onopen = this.handleOpen.bind(this);
            this.connection.onmessage = this.handleMessage.bind(this);
            this.connection.onclose = this.handleClose.bind(this);
            this.connection.onerror = this.handleError.bind(this);
            
        } catch (error) {
            console.error('WebSocket connection failed:', error);
            this.scheduleReconnect();
        }
    }

    handleOpen() {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Start heartbeat
        this.startHeartbeat();
        
        // Notify application
        this.emit('connected');
        
        // Send authentication message
        this.send({
            type: 'auth',
            token: localStorage.getItem('token')
        });
    }

    handleMessage(event) {
        try {
            const message = JSON.parse(event.data);
            console.log('WebSocket message received:', message);
            
            // Handle system messages
            if (message.type === 'heartbeat') {
                this.send({ type: 'heartbeat_response' });
                return;
            }
            
            // Route message to registered handlers
            const handler = this.messageHandlers.get(message.type);
            if (handler) {
                handler(message);
            } else {
                // Emit generic message event
                this.emit('message', message);
            }
            
        } catch (error) {
            console.error('Error parsing WebSocket message:', error);
        }
    }

    handleClose(event) {
        console.log('WebSocket disconnected:', event.code, event.reason);
        this.isConnected = false;
        this.stopHeartbeat();
        
        // Notify application
        this.emit('disconnected');
        
        // Schedule reconnection if not a normal closure
        if (event.code !== 1000) {
            this.scheduleReconnect();
        }
    }

    handleError(error) {
        console.error('WebSocket error:', error);
        this.emit('error', error);
    }

    send(message) {
        if (this.isConnected && this.connection.readyState === WebSocket.OPEN) {
            this.connection.send(JSON.stringify(message));
        } else {
            console.warn('Cannot send message: WebSocket not connected');
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts < CONFIG.MAX_RECONNECT_ATTEMPTS) {
            this.reconnectAttempts++;
            console.log(`Scheduling reconnection attempt ${this.reconnectAttempts}`);
            
            setTimeout(() => {
                this.connect();
            }, CONFIG.RECONNECT_DELAY * this.reconnectAttempts);
        } else {
            console.error('Max reconnection attempts reached');
            this.emit('reconnect_failed');
        }
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.send({ type: 'heartbeat' });
        }, 30000); // Send heartbeat every 30 seconds
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    registerHandler(messageType, handler) {
        this.messageHandlers.set(messageType, handler);
    }

    unregisterHandler(messageType) {
        this.messageHandlers.delete(messageType);
    }

    emit(eventType, data = null) {
        const event = new CustomEvent(`ws_${eventType}`, { detail: data });
        document.dispatchEvent(event);
    }

    disconnect() {
        if (this.connection) {
            this.connection.close(1000, 'Normal closure');
        }
        this.stopHeartbeat();
        this.isConnected = false;
    }
}

// Initialize WebSocket manager
const wsManager = new WebSocketManager();

// Authentication utilities
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = localStorage.getItem('user');
    
    if (!token || !user) {
        return false;
    }
    
    try {
        // Check if token is expired (basic check)
        const payload = JSON.parse(atob(token.split('.')[1]));
        const now = Date.now() / 1000;
        
        if (payload.exp && payload.exp < now) {
            // Token expired
            logout();
            return false;
        }
        
        return true;
    } catch (error) {
        console.error('Error checking authentication:', error);
        return false;
    }
}

function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    wsManager.disconnect();
    window.location.href = 'index.html';
}

// API utilities
function makeApiRequest(url, options = {}) {
    const token = localStorage.getItem('token');
    
    const defaultOptions = {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token ? `Bearer ${token}` : ''
        }
    };
    
    const finalOptions = {
        ...defaultOptions,
        ...options,
        headers: {
            ...defaultOptions.headers,
            ...(options.headers || {})
        }
    };
    
    return fetch(CONFIG.API_BASE_URL + url, finalOptions)
        .then(response => {
            if (response.status === 401) {
                // Unauthorized - redirect to login
                logout();
                throw new Error('Unauthorized');
            }
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            return response.json();
        })
        .catch(error => {
            console.error('API request failed:', error);
            throw error;
        });
}

// Notification system
function showNotification(message, type = 'info', duration = CONFIG.NOTIFICATION_DURATION) {
    const notificationId = Date.now();
    const notification = createNotificationElement(message, type, notificationId);
    
    // Add to DOM
    let container = document.getElementById('notificationContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'notificationContainer';
        container.style.cssText = `
            position: fixed;
            top: 100px;
            right: 20px;
            z-index: 9999;
            display: flex;
            flex-direction: column;
            gap: 10px;
            pointer-events: none;
        `;
        document.body.appendChild(container);
    }
    
    container.appendChild(notification);
    activeToasts++;
    
    // Animate in
    setTimeout(() => {
        notification.style.transform = 'translateX(0)';
        notification.style.opacity = '1';
    }, 10);
    
    // Auto remove
    setTimeout(() => {
        removeNotification(notification, notificationId);
    }, duration);
    
    return notificationId;
}

function createNotificationElement(message, type, id) {
    const notification = document.createElement('div');
    notification.id = `notification_${id}`;
    notification.style.cssText = `
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(20px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 12px;
        padding: 16px 20px;
        color: white;
        font-size: 14px;
        max-width: 300px;
        transform: translateX(100%);
        opacity: 0;
        transition: all 0.3s ease;
        pointer-events: auto;
        cursor: pointer;
        position: relative;
        overflow: hidden;
    `;
    
    // Type-specific styling
    const typeColors = {
        success: '#22c55e',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#4facfe'
    };
    
    notification.style.borderLeftColor = typeColors[type] || typeColors.info;
    notification.style.borderLeftWidth = '4px';
    
    // Add icon
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 16px;">${icons[type] || icons.info}</span>
            <span>${message}</span>
        </div>
    `;
    
    // Click to dismiss
    notification.addEventListener('click', () => {
        removeNotification(notification, id);
    });
    
    return notification;
}

function removeNotification(notification, id) {
    if (!notification || !notification.parentNode) return;
    
    notification.style.transform = 'translateX(100%)';
    notification.style.opacity = '0';
    
    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
            activeToasts--;
            
            // Clean up container if empty
            if (activeToasts === 0) {
                const container = document.getElementById('notificationContainer');
                if (container && container.children.length === 0) {
                    document.body.removeChild(container);
                }
            }
        }
    }, 300);
}

// Animation utilities
function initializeAnimations() {
    // Intersection Observer for fade-in animations
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);

    // Observe all glass elements
    document.querySelectorAll('.glass, .glass-card').forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
        observer.observe(el);
    });

    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Parallax effect for floating elements
    let ticking = false;
    function updateParallax() {
        const scrolled = window.pageYOffset;
        
        document.querySelectorAll('.floating-element').forEach((el, index) => {
            const speed = (index + 1) * 0.1;
            const yPos = -(scrolled * speed);
            el.style.transform = `translateY(${yPos}px)`;
        });
        
        ticking = false;
    }

    function requestTick() {
        if (!ticking) {
            requestAnimationFrame(updateParallax);
            ticking = true;
        }
    }

    window.addEventListener('scroll', requestTick);
}

// Modal utilities
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Focus trap
        const focusableElements = modal.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (focusableElements.length > 0) {
            focusableElements[0].focus();
        }
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Close modals on escape key
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(modal => {
            modal.classList.remove('active');
        });
        document.body.style.overflow = '';
    }
});

// Close modals on backdrop click
document.addEventListener('click', function(e) {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// Form utilities
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePassword(password) {
    // At least 8 characters, 1 uppercase, 1 lowercase, 1 number
    const re = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d@$!%*?&]{8,}$/;
    return re.test(password);
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(date, options = {}) {
    const defaultOptions = {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    
    return new Date(date).toLocaleDateString('en-US', { ...defaultOptions, ...options });
}

function formatTimeAgo(date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now - new Date(date)) / 1000);
    
    if (diffInSeconds < 60) return 'Just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} minutes ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    
    return formatDate(date, { year: 'numeric', month: 'short', day: 'numeric' });
}

// Loading state utilities
function setLoadingState(element, isLoading) {
    if (typeof element === 'string') {
        element = document.querySelector(element);
    }
    
    if (!element) return;
    
    if (isLoading) {
        element.classList.add('loading');
        element.disabled = true;
    } else {
        element.classList.remove('loading');
        element.disabled = false;
    }
}

// Debounce utility
function debounce(func, wait, immediate) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            timeout = null;
            if (!immediate) func(...args);
        };
        const callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func(...args);
    };
}

// Throttle utility
function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// Data persistence utilities
function saveToLocal(key, data) {
    try {
        localStorage.setItem(key, JSON.stringify(data));
        return true;
    } catch (error) {
        console.error('Failed to save to localStorage:', error);
        return false;
    }
}

function loadFromLocal(key, defaultValue = null) {
    try {
        const item = localStorage.getItem(key);
        return item ? JSON.parse(item) : defaultValue;
    } catch (error) {
        console.error('Failed to load from localStorage:', error);
        return defaultValue;
    }
}

function removeFromLocal(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error('Failed to remove from localStorage:', error);
        return false;
    }
}

// Error handling utilities
function handleApiError(error, context = 'API request') {
    console.error(`${context} failed:`, error);
    
    if (error.message.includes('401')) {
        showNotification('Session expired. Please login again.', 'error');
        logout();
    } else if (error.message.includes('403')) {
        showNotification('Access denied. Insufficient permissions.', 'error');
    } else if (error.message.includes('404')) {
        showNotification('Resource not found.', 'error');
    } else if (error.message.includes('500')) {
        showNotification('Server error. Please try again later.', 'error');
    } else {
        showNotification('An error occurred. Please try again.', 'error');
    }
}

// Initialize WebSocket connection when authenticated
document.addEventListener('DOMContentLoaded', function() {
    if (checkAuth()) {
        wsManager.connect();
        
        // Set up WebSocket event listeners
        document.addEventListener('ws_connected', function() {
            console.log('WebSocket connected successfully');
        });
        
        document.addEventListener('ws_disconnected', function() {
            console.log('WebSocket disconnected');
        });
        
        document.addEventListener('ws_message', function(event) {
            console.log('WebSocket message:', event.detail);
        });
    }
    
    // Initialize animations
    setTimeout(initializeAnimations, 100);
});

// Auto-save functionality
class AutoSaver {
    constructor(saveFunction, interval = CONFIG.AUTO_SAVE_INTERVAL) {
        this.saveFunction = saveFunction;
        this.interval = interval;
        this.timer = null;
        this.hasChanges = false;
    }
    
    markChanged() {
        this.hasChanges = true;
        this.startTimer();
    }
    
    startTimer() {
        if (this.timer) {
            clearTimeout(this.timer);
        }
        
        this.timer = setTimeout(() => {
            if (this.hasChanges) {
                this.save();
            }
        }, this.interval);
    }
    
    save() {
        if (this.saveFunction && this.hasChanges) {
            this.saveFunction();
            this.hasChanges = false;
        }
    }
    
    stop() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}

// Export utilities for use in other modules
window.HuLabUtils = {
    wsManager,
    checkAuth,
    logout,
    makeApiRequest,
    showNotification,
    initializeAnimations,
    openModal,
    closeModal,
    validateEmail,
    validatePassword,
    formatFileSize,
    formatDate,
    formatTimeAgo,
    setLoadingState,
    debounce,
    throttle,
    saveToLocal,
    loadFromLocal,
    removeFromLocal,
    handleApiError,
    AutoSaver
};

console.log('Hu Lab shared utilities loaded successfully');