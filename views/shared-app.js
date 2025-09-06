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

// Component loader utility for DRY approach
async function loadComponent(selector, componentPath) {
    try {
        const response = await fetch(componentPath);
        const html = await response.text();
        const element = document.querySelector(selector);
        if (element) {
            element.innerHTML = html;
        }
    } catch (error) {
        console.error(`Failed to load component: ${componentPath}`, error);
    }
}

// Set active navigation state based on current page
function setActiveNavigation() {
    const currentPage = window.location.pathname.split('/').pop().replace('.html', '') || 'index';
    const navItems = document.querySelectorAll('.nav-item');
    
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-page') === currentPage) {
            item.classList.add('active');
        }
    });
}

// Initialize common components for DRY approach
async function initializeSharedComponents() {
    // Load navigation if container exists
    const navContainer = document.querySelector('#navigation-container');
    if (navContainer) {
        await loadComponent('#navigation-container', 'components/navigation.html');
        setActiveNavigation();
    }
    
    // Load footer if container exists
    const footerContainer = document.querySelector('#footer-container');
    if (footerContainer) {
        await loadComponent('#footer-container', 'components/footer.html');
    }
    
    // Load floating elements if container exists
    const floatingContainer = document.querySelector('#floating-elements-container');
    if (floatingContainer) {
        await loadComponent('#floating-elements-container', 'components/floating-elements.html');
    }
}

// Initialize WebSocket connection when authenticated
document.addEventListener('DOMContentLoaded', function() {
    // Initialize shared components first
    initializeSharedComponents();
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
    AutoSaver,
    loadComponent,
    setActiveNavigation,
    initializeSharedComponents
};

// ===== AMAZING NEW INTERACTIVE FEATURES =====

// Particle System for Background Animation
class ParticleSystem {
    constructor(containerSelector = 'body', particleCount = 50) {
        this.container = document.querySelector(containerSelector);
        this.particles = [];
        this.particleCount = particleCount;
        this.isRunning = false;
        this.init();
    }

    init() {
        // Create particle container
        const particleContainer = document.createElement('div');
        particleContainer.className = 'particle-container';
        this.container.appendChild(particleContainer);
        this.particleContainer = particleContainer;

        // Create particles
        for (let i = 0; i < this.particleCount; i++) {
            this.createParticle();
        }

        this.start();
    }

    createParticle() {
        const particle = document.createElement('div');
        particle.className = 'particle';
        
        // Random properties
        const size = Math.random() * 4 + 2;
        const x = Math.random() * window.innerWidth;
        const speed = Math.random() * 2 + 0.5;
        const delay = Math.random() * 20;

        particle.style.cssText = `
            left: ${x}px;
            width: ${size}px;
            height: ${size}px;
            animation-duration: ${speed + 15}s;
            animation-delay: ${delay}s;
        `;

        this.particleContainer.appendChild(particle);
        this.particles.push(particle);

        // Remove and recreate when animation ends
        particle.addEventListener('animationend', () => {
            if (this.isRunning) {
                particle.remove();
                this.createParticle();
            }
        });
    }

    start() {
        this.isRunning = true;
    }

    stop() {
        this.isRunning = false;
    }

    destroy() {
        this.stop();
        if (this.particleContainer) {
            this.particleContainer.remove();
        }
        this.particles = [];
    }
}

// Mouse Trail Effect
class MouseTrail {
    constructor() {
        this.trail = [];
        this.maxTrailLength = 20;
        this.init();
    }

    init() {
        document.addEventListener('mousemove', (e) => {
            this.addTrailPoint(e.clientX, e.clientY);
        });

        this.animate();
    }

    addTrailPoint(x, y) {
        const point = document.createElement('div');
        point.className = 'mouse-trail-point';
        point.style.cssText = `
            position: fixed;
            left: ${x}px;
            top: ${y}px;
            width: 6px;
            height: 6px;
            background: radial-gradient(circle, rgba(102, 126, 234, 0.8), transparent);
            border-radius: 50%;
            pointer-events: none;
            z-index: 9999;
            transform: translate(-50%, -50%);
        `;

        document.body.appendChild(point);
        this.trail.push(point);

        // Limit trail length
        if (this.trail.length > this.maxTrailLength) {
            const oldPoint = this.trail.shift();
            oldPoint.remove();
        }
    }

    animate() {
        this.trail.forEach((point, index) => {
            const age = index / this.trail.length;
            const opacity = Math.max(0, 1 - age);
            const scale = Math.max(0.1, 1 - age);
            
            point.style.opacity = opacity;
            point.style.transform = `translate(-50%, -50%) scale(${scale})`;
        });

        requestAnimationFrame(() => this.animate());
    }
}

// Enhanced Glass Card Hover Effects
function initializeEnhancedGlassEffects() {
    document.querySelectorAll('.glass-card').forEach(card => {
        // Add magnetic effect
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            
            const moveX = x * 0.05;
            const moveY = y * 0.05;
            
            card.style.transform = `translate(${moveX}px, ${moveY}px) scale(1.02)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'translate(0px, 0px) scale(1)';
        });

        // Add ripple effect on click
        card.addEventListener('click', function(e) {
            const rect = this.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            const ripple = document.createElement('span');
            ripple.className = 'ripple';
            ripple.style.cssText = `
                position: absolute;
                left: ${x}px;
                top: ${y}px;
                width: 0;
                height: 0;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.3);
                transform: translate(-50%, -50%);
                animation: ripple 0.6s linear;
                pointer-events: none;
            `;

            this.style.position = 'relative';
            this.appendChild(ripple);

            setTimeout(() => ripple.remove(), 600);
        });
    });

    // Add ripple animation to CSS
    if (!document.getElementById('ripple-styles')) {
        const style = document.createElement('style');
        style.id = 'ripple-styles';
        style.textContent = `
            @keyframes ripple {
                to {
                    width: 200px;
                    height: 200px;
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
}

// Text Animation Effects
class TextAnimator {
    static typeWriter(element, text, speed = 50) {
        element.innerHTML = '';
        let i = 0;
        
        function type() {
            if (i < text.length) {
                element.innerHTML += text.charAt(i);
                i++;
                setTimeout(type, speed);
            }
        }
        
        type();
    }

    static fadeInWords(element, delay = 200) {
        const text = element.textContent;
        const words = text.split(' ');
        element.innerHTML = '';

        words.forEach((word, index) => {
            const span = document.createElement('span');
            span.textContent = word + ' ';
            span.style.opacity = '0';
            span.style.transform = 'translateY(20px)';
            span.style.transition = 'all 0.6s ease';
            element.appendChild(span);

            setTimeout(() => {
                span.style.opacity = '1';
                span.style.transform = 'translateY(0)';
            }, index * delay);
        });
    }

    static glitchEffect(element, duration = 2000) {
        const originalText = element.textContent;
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()';
        
        let iterations = 0;
        const maxIterations = 10;
        
        const interval = setInterval(() => {
            element.textContent = originalText
                .split('')
                .map((char, index) => {
                    if (index < iterations || char === ' ') {
                        return originalText[index];
                    }
                    return chars[Math.floor(Math.random() * chars.length)];
                })
                .join('');
                
            if (iterations >= originalText.length) {
                clearInterval(interval);
                element.textContent = originalText;
            }
            
            iterations += 1/3;
        }, 30);
    }
}

// Enhanced Loading Animations
class LoadingAnimations {
    static createPulseLoader(container) {
        const loader = document.createElement('div');
        loader.className = 'pulse-loader';
        loader.innerHTML = `
            <div class="pulse-dot"></div>
            <div class="pulse-dot"></div>
            <div class="pulse-dot"></div>
        `;
        
        if (!document.getElementById('pulse-loader-styles')) {
            const style = document.createElement('style');
            style.id = 'pulse-loader-styles';
            style.textContent = `
                .pulse-loader {
                    display: flex;
                    gap: 8px;
                    justify-content: center;
                    align-items: center;
                }
                .pulse-dot {
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: var(--accent-gradient);
                    animation: pulse-wave 1.4s ease-in-out infinite both;
                }
                .pulse-dot:nth-child(1) { animation-delay: -0.32s; }
                .pulse-dot:nth-child(2) { animation-delay: -0.16s; }
                @keyframes pulse-wave {
                    0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
                    40% { transform: scale(1.2); opacity: 1; }
                }
            `;
            document.head.appendChild(style);
        }
        
        container.appendChild(loader);
        return loader;
    }

    static createSkeletonLoader(container, lines = 3) {
        const skeleton = document.createElement('div');
        skeleton.className = 'skeleton-loader';
        
        for (let i = 0; i < lines; i++) {
            const line = document.createElement('div');
            line.className = 'skeleton-line';
            line.style.width = Math.random() * 40 + 60 + '%';
            skeleton.appendChild(line);
        }
        
        if (!document.getElementById('skeleton-loader-styles')) {
            const style = document.createElement('style');
            style.id = 'skeleton-loader-styles';
            style.textContent = `
                .skeleton-loader {
                    padding: 20px;
                }
                .skeleton-line {
                    height: 16px;
                    background: linear-gradient(90deg, 
                        rgba(255,255,255,0.1) 25%, 
                        rgba(255,255,255,0.2) 50%, 
                        rgba(255,255,255,0.1) 75%);
                    background-size: 200% 100%;
                    animation: skeleton-loading 1.5s infinite;
                    margin-bottom: 12px;
                    border-radius: 4px;
                }
                @keyframes skeleton-loading {
                    0% { background-position: 200% 0; }
                    100% { background-position: -200% 0; }
                }
            `;
            document.head.appendChild(style);
        }
        
        container.appendChild(skeleton);
        return skeleton;
    }
}

// Interactive Dashboard Components
class InteractiveDashboard {
    static createMetricCard(title, value, change, icon) {
        const card = document.createElement('div');
        card.className = 'glass-card metric-card tilt-card';
        
        const changeColor = change >= 0 ? '#22c55e' : '#ef4444';
        const changeIcon = change >= 0 ? '↗' : '↘';
        
        card.innerHTML = `
            <div class="metric-header">
                <span class="metric-icon">${icon}</span>
                <span class="metric-change" style="color: ${changeColor}">
                    ${changeIcon} ${Math.abs(change)}%
                </span>
            </div>
            <div class="metric-title">${title}</div>
            <div class="metric-value pulse">${value}</div>
            <div class="metric-progress">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${Math.abs(change)}%"></div>
                </div>
            </div>
        `;
        
        // Add styles
        if (!document.getElementById('metric-card-styles')) {
            const style = document.createElement('style');
            style.id = 'metric-card-styles';
            style.textContent = `
                .metric-card {
                    padding: 24px;
                    min-height: 140px;
                    position: relative;
                    overflow: hidden;
                }
                .metric-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                }
                .metric-icon {
                    font-size: 24px;
                }
                .metric-change {
                    font-weight: 600;
                    font-size: 14px;
                }
                .metric-title {
                    color: var(--text-secondary);
                    font-size: 14px;
                    margin-bottom: 8px;
                }
                .metric-value {
                    font-size: 32px;
                    font-weight: 700;
                    background: var(--accent-gradient);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    margin-bottom: 16px;
                }
                .metric-progress {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                }
            `;
            document.head.appendChild(style);
        }
        
        return card;
    }

    static createNotificationBell(count = 0) {
        const bell = document.createElement('div');
        bell.className = 'notification-bell tooltip magnetic';
        bell.setAttribute('data-tooltip', `${count} notifications`);
        
        bell.innerHTML = `
            <span class="bell-icon">🔔</span>
            ${count > 0 ? `<span class="notification-badge pulse">${count}</span>` : ''}
        `;
        
        // Add styles
        if (!document.getElementById('notification-bell-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-bell-styles';
            style.textContent = `
                .notification-bell {
                    position: relative;
                    cursor: pointer;
                    padding: 8px;
                    border-radius: 50%;
                    transition: all 0.3s ease;
                }
                .notification-bell:hover {
                    background: var(--glass-hover);
                }
                .bell-icon {
                    font-size: 24px;
                    display: block;
                }
                .notification-badge {
                    position: absolute;
                    top: 0;
                    right: 0;
                    background: #ef4444;
                    color: white;
                    border-radius: 50%;
                    width: 20px;
                    height: 20px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                }
            `;
            document.head.appendChild(style);
        }
        
        return bell;
    }
}

// Initialize all enhanced features
function initializeAmazingFeatures() {
    // Initialize particle system
    if (!window.particleSystem) {
        window.particleSystem = new ParticleSystem();
    }
    
    // Initialize mouse trail
    if (!window.mouseTrail) {
        window.mouseTrail = new MouseTrail();
    }
    
    // Initialize enhanced glass effects
    initializeEnhancedGlassEffects();
    
    // Add text animation to titles
    document.querySelectorAll('h1, h2, h3').forEach((title, index) => {
        setTimeout(() => {
            if (title.classList.contains('typewriter')) {
                const text = title.textContent;
                TextAnimator.typeWriter(title, text, 100);
            } else if (!title.classList.contains('vision-title')) {
                TextAnimator.fadeInWords(title, 150);
            }
            // vision-title will display normally without animation
        }, index * 300);
    });
    
    // Enhanced navigation hover effects
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-2px)';
            this.style.boxShadow = '0 8px 25px rgba(102, 126, 234, 0.3)';
        });
        
        item.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = 'none';
        });
    });
    
    // Add glow effect to important buttons
    document.querySelectorAll('.btn-primary').forEach(btn => {
        btn.classList.add('glow');
    });
    
    // Initialize intersection observer for staggered animations
    const staggerObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.classList.add('slide-in-up');
                }, index * 100);
                staggerObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    
    document.querySelectorAll('.glass-card, .feature-card').forEach(card => {
        staggerObserver.observe(card);
    });
}

// Update the original initialization
const originalInitialize = initializeAnimations;
initializeAnimations = function() {
    originalInitialize();
    setTimeout(initializeAmazingFeatures, 200);
};

// Enhanced utility exports
window.HuLabUtils = {
    ...window.HuLabUtils,
    ParticleSystem,
    MouseTrail,
    TextAnimator,
    LoadingAnimations,
    InteractiveDashboard,
    initializeAmazingFeatures
};

console.log('🚀 Hu Lab amazing interactive features loaded successfully!');
console.log('✨ Features include: Particles, Mouse trails, Enhanced glass effects, Text animations, and more!');