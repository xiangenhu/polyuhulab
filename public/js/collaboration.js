/**
 * Real-time Collaboration Features for Hu Lab Portal
 * Handles collaborative editing, real-time chat, video calls, screen sharing, and team coordination
 * Integrates with WebSocket, WebRTC, and xAPI tracking
 */

class CollaborationManager {
    constructor() {
        this.socket = null;
        this.xapi = window.XAPIClient || null;
        this.peer = null;
        this.localStream = null;
        this.remoteStreams = new Map();
        this.currentRoom = null;
        this.currentDocument = null;
        this.isTyping = false;
        this.typingTimeout = null;
        this.onlineUsers = new Map();
        this.documentVersion = 0;
        this.pendingOperations = [];
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupSocketConnection();
        this.setupWebRTC();
        this.loadCollaborationData();
        this.trackPageAccess();
    }

    /**
     * Bind UI event handlers
     */
    bindEvents() {
        // Room management
        $(document).on('click', '.join-room-btn', (e) => {
            e.preventDefault();
            const roomId = $(e.target).data('room-id');
            this.joinRoom(roomId);
        });

        $(document).on('click', '.create-room-btn', (e) => {
            e.preventDefault();
            this.showCreateRoomModal();
        });

        $(document).on('click', '.leave-room-btn', (e) => {
            e.preventDefault();
            this.leaveRoom();
        });

        // Document collaboration
        $(document).on('input', '.collaborative-editor', (e) => {
            this.handleDocumentEdit($(e.target));
        });

        $(document).on('focus', '.collaborative-editor', (e) => {
            this.startTypingIndicator();
        });

        $(document).on('blur', '.collaborative-editor', (e) => {
            this.stopTypingIndicator();
        });

        $(document).on('click', '.document-version-btn', (e) => {
            e.preventDefault();
            const version = $(e.target).data('version');
            this.loadDocumentVersion(version);
        });

        // Chat functionality
        $(document).on('submit', '.chat-form', (e) => {
            e.preventDefault();
            this.sendChatMessage($(e.target));
        });

        $(document).on('click', '.emoji-picker-btn', (e) => {
            e.preventDefault();
            this.showEmojiPicker($(e.target));
        });

        $(document).on('keydown', '.chat-input', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                $(e.target).closest('.chat-form').submit();
            }
        });

        // Video/Audio controls
        $(document).on('click', '.start-video-call-btn', (e) => {
            e.preventDefault();
            this.startVideoCall();
        });

        $(document).on('click', '.end-video-call-btn', (e) => {
            e.preventDefault();
            this.endVideoCall();
        });

        $(document).on('click', '.toggle-camera-btn', (e) => {
            e.preventDefault();
            this.toggleCamera();
        });

        $(document).on('click', '.toggle-microphone-btn', (e) => {
            e.preventDefault();
            this.toggleMicrophone();
        });

        $(document).on('click', '.share-screen-btn', (e) => {
            e.preventDefault();
            this.startScreenShare();
        });

        $(document).on('click', '.stop-screen-share-btn', (e) => {
            e.preventDefault();
            this.stopScreenShare();
        });

        // Whiteboard functionality
        $(document).on('mousedown', '.whiteboard-canvas', (e) => {
            this.startDrawing(e);
        });

        $(document).on('mousemove', '.whiteboard-canvas', (e) => {
            this.draw(e);
        });

        $(document).on('mouseup', '.whiteboard-canvas', (e) => {
            this.stopDrawing(e);
        });

        $(document).on('click', '.whiteboard-tool', (e) => {
            e.preventDefault();
            this.selectWhiteboardTool($(e.target));
        });

        $(document).on('click', '.clear-whiteboard-btn', (e) => {
            e.preventDefault();
            this.clearWhiteboard();
        });

        // File sharing
        $(document).on('change', '.file-share-input', (e) => {
            this.handleFileShare(e.target.files);
        });

        $(document).on('click', '.download-shared-file', (e) => {
            e.preventDefault();
            const fileId = $(e.target).data('file-id');
            this.downloadSharedFile(fileId);
        });

        // User interactions
        $(document).on('click', '.user-avatar', (e) => {
            e.preventDefault();
            const userId = $(e.target).data('user-id');
            this.showUserProfile(userId);
        });

        $(document).on('click', '.mention-user', (e) => {
            e.preventDefault();
            const username = $(e.target).data('username');
            this.insertMention(username);
        });

        // Notifications
        $(document).on('click', '.enable-notifications-btn', (e) => {
            e.preventDefault();
            this.requestNotificationPermission();
        });

        // Form submissions
        $(document).on('submit', '.create-room-form', (e) => {
            e.preventDefault();
            this.createRoom($(e.target));
        });
    }

    /**
     * Setup WebSocket connection for real-time features
     */
    setupSocketConnection() {
        if (typeof io !== 'undefined') {
            this.socket = io('/collaboration', {
                transports: ['websocket']
            });
            
            this.socket.on('connect', () => {
                console.log('Collaboration socket connected');
                this.handleSocketConnect();
            });

            this.socket.on('disconnect', () => {
                console.log('Collaboration socket disconnected');
                this.handleSocketDisconnect();
            });

            // Room events
            this.socket.on('room-joined', (data) => {
                this.handleRoomJoined(data);
            });

            this.socket.on('user-joined-room', (data) => {
                this.handleUserJoinedRoom(data);
            });

            this.socket.on('user-left-room', (data) => {
                this.handleUserLeftRoom(data);
            });

            // Document collaboration events
            this.socket.on('document-change', (data) => {
                this.handleRemoteDocumentChange(data);
            });

            this.socket.on('cursor-position', (data) => {
                this.handleRemoteCursorPosition(data);
            });

            this.socket.on('typing-indicator', (data) => {
                this.handleTypingIndicator(data);
            });

            // Chat events
            this.socket.on('chat-message', (data) => {
                this.handleIncomingChatMessage(data);
            });

            this.socket.on('message-reaction', (data) => {
                this.handleMessageReaction(data);
            });

            // Video call events
            this.socket.on('call-invitation', (data) => {
                this.handleCallInvitation(data);
            });

            this.socket.on('call-accepted', (data) => {
                this.handleCallAccepted(data);
            });

            this.socket.on('call-rejected', (data) => {
                this.handleCallRejected(data);
            });

            this.socket.on('call-ended', (data) => {
                this.handleCallEnded(data);
            });

            // Whiteboard events
            this.socket.on('whiteboard-draw', (data) => {
                this.handleRemoteWhiteboardDraw(data);
            });

            this.socket.on('whiteboard-clear', (data) => {
                this.handleRemoteWhiteboardClear(data);
            });

            // File sharing events
            this.socket.on('file-shared', (data) => {
                this.handleFileShared(data);
            });

            // Presence events
            this.socket.on('user-presence-update', (data) => {
                this.handleUserPresenceUpdate(data);
            });
        }
    }

    /**
     * Setup WebRTC for video/audio communication
     */
    setupWebRTC() {
        if (typeof RTCPeerConnection !== 'undefined') {
            this.peer = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' }
                ]
            });

            this.peer.onicecandidate = (event) => {
                if (event.candidate && this.currentRoom) {
                    this.socket.emit('ice-candidate', {
                        candidate: event.candidate,
                        room: this.currentRoom
                    });
                }
            };

            this.peer.ontrack = (event) => {
                this.handleRemoteStream(event.streams[0]);
            };
        }
    }

    /**
     * Load collaboration data
     */
    async loadCollaborationData() {
        try {
            const [rooms, activeUsers, recentFiles] = await Promise.all([
                this.fetchActiveRooms(),
                this.fetchActiveUsers(),
                this.fetchRecentSharedFiles()
            ]);

            this.renderActiveRooms(rooms);
            this.renderActiveUsers(activeUsers);
            this.renderRecentSharedFiles(recentFiles);

        } catch (error) {
            console.error('Collaboration data loading error:', error);
            this.showError('Failed to load collaboration data');
            
            if (this.xapi) {
                this.xapi.track('failed', 'http://adlnet.gov/expapi/verbs/failed', {
                    type: 'collaboration',
                    action: 'load_data',
                    error: error.message
                });
            }
        }
    }

    /**
     * Fetch active collaboration rooms
     */
    async fetchActiveRooms() {
        const response = await $.ajax({
            url: '/api/collaboration/rooms',
            method: 'GET'
        });
        return response.data;
    }

    /**
     * Fetch active users
     */
    async fetchActiveUsers() {
        const response = await $.ajax({
            url: '/api/collaboration/users',
            method: 'GET'
        });
        return response.data;
    }

    /**
     * Fetch recent shared files
     */
    async fetchRecentSharedFiles() {
        const response = await $.ajax({
            url: '/api/collaboration/shared-files',
            method: 'GET'
        });
        return response.data;
    }

    /**
     * Join collaboration room
     */
    async joinRoom(roomId) {
        if (this.currentRoom === roomId) return;

        try {
            // Leave current room if any
            if (this.currentRoom) {
                await this.leaveRoom();
            }

            this.socket.emit('join-room', { roomId });
            this.currentRoom = roomId;

            // Update UI
            $('.collaboration-room-info').show();
            $('.room-id-display').text(roomId);
            $('.join-room-section').hide();
            $('.room-controls').show();

            // Track room join
            if (this.xapi) {
                this.xapi.track('joined', 'http://adlnet.gov/expapi/verbs/joined', {
                    type: 'collaboration-room',
                    roomId: roomId
                });
            }

        } catch (error) {
            console.error('Room join error:', error);
            this.showError('Failed to join room');
        }
    }

    /**
     * Create new collaboration room
     */
    async createRoom(formData) {
        try {
            const roomData = {
                name: formData.find('[name="roomName"]').val(),
                description: formData.find('[name="roomDescription"]').val(),
                isPublic: formData.find('[name="isPublic"]').is(':checked'),
                maxParticipants: parseInt(formData.find('[name="maxParticipants"]').val()) || 10
            };

            const response = await $.ajax({
                url: '/api/collaboration/rooms',
                method: 'POST',
                data: JSON.stringify(roomData),
                contentType: 'application/json'
            });

            if (response.success) {
                this.joinRoom(response.data.id);
                this.showSuccess('Room created successfully');
                $('.create-room-modal').modal('hide');
            }

        } catch (error) {
            console.error('Room creation error:', error);
            this.showError('Failed to create room');
        }
    }

    /**
     * Leave current room
     */
    async leaveRoom() {
        if (!this.currentRoom) return;

        try {
            this.socket.emit('leave-room', { roomId: this.currentRoom });
            
            // Track room leave
            if (this.xapi) {
                this.xapi.track('exited', 'http://adlnet.gov/expapi/verbs/exited', {
                    type: 'collaboration-room',
                    roomId: this.currentRoom
                });
            }

            this.currentRoom = null;
            this.onlineUsers.clear();

            // Update UI
            $('.collaboration-room-info').hide();
            $('.join-room-section').show();
            $('.room-controls').hide();
            $('.online-users-list').empty();

            // End any ongoing calls
            await this.endVideoCall();

        } catch (error) {
            console.error('Room leave error:', error);
        }
    }

    /**
     * Handle document editing
     */
    handleDocumentEdit(editorElement) {
        if (!this.currentRoom || !editorElement.length) return;

        const content = editorElement.val() || editorElement.text();
        const cursorPosition = editorElement[0].selectionStart;

        // Debounce document changes
        clearTimeout(this.documentChangeTimeout);
        this.documentChangeTimeout = setTimeout(() => {
            this.broadcastDocumentChange({
                content: content,
                cursorPosition: cursorPosition,
                timestamp: Date.now(),
                version: ++this.documentVersion
            });
        }, 300);

        // Start typing indicator
        this.startTypingIndicator();
    }

    /**
     * Broadcast document change to other users
     */
    broadcastDocumentChange(changeData) {
        if (this.socket && this.currentRoom) {
            this.socket.emit('document-change', {
                room: this.currentRoom,
                ...changeData
            });

            // Track document edit
            if (this.xapi) {
                this.xapi.track('edited', 'http://adlnet.gov/expapi/verbs/edited', {
                    type: 'collaborative-document',
                    roomId: this.currentRoom,
                    version: changeData.version
                });
            }
        }
    }

    /**
     * Handle remote document changes
     */
    handleRemoteDocumentChange(data) {
        const editor = $('.collaborative-editor');
        if (!editor.length || data.userId === this.getCurrentUserId()) return;

        // Apply operational transformation
        const transformedChange = this.applyOperationalTransform(data);
        
        // Update document content
        editor.val(transformedChange.content);
        
        // Show change indicator
        this.showChangeIndicator(data.userId);
    }

    /**
     * Start typing indicator
     */
    startTypingIndicator() {
        if (this.isTyping || !this.socket || !this.currentRoom) return;

        this.isTyping = true;
        this.socket.emit('typing-start', { room: this.currentRoom });

        // Auto-stop typing indicator after 3 seconds
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
            this.stopTypingIndicator();
        }, 3000);
    }

    /**
     * Stop typing indicator
     */
    stopTypingIndicator() {
        if (!this.isTyping || !this.socket || !this.currentRoom) return;

        this.isTyping = false;
        this.socket.emit('typing-stop', { room: this.currentRoom });
        clearTimeout(this.typingTimeout);
    }

    /**
     * Send chat message
     */
    sendChatMessage(formElement) {
        const messageInput = formElement.find('.chat-input');
        const message = messageInput.val().trim();

        if (!message || !this.currentRoom) return;

        const messageData = {
            room: this.currentRoom,
            message: message,
            timestamp: Date.now(),
            type: 'text'
        };

        this.socket.emit('chat-message', messageData);
        
        // Clear input
        messageInput.val('').focus();

        // Add to local chat
        this.addChatMessage({
            ...messageData,
            userId: this.getCurrentUserId(),
            username: this.getCurrentUsername(),
            isSelf: true
        });

        // Track chat message
        if (this.xapi) {
            this.xapi.track('commented', 'http://adlnet.gov/expapi/verbs/commented', {
                type: 'collaboration-chat',
                roomId: this.currentRoom,
                messageLength: message.length
            });
        }
    }

    /**
     * Handle incoming chat message
     */
    handleIncomingChatMessage(data) {
        if (data.userId === this.getCurrentUserId()) return;

        this.addChatMessage({
            ...data,
            isSelf: false
        });

        // Show notification if tab is not active
        if (document.hidden) {
            this.showChatNotification(data);
        }
    }

    /**
     * Add chat message to UI
     */
    addChatMessage(messageData) {
        const chatContainer = $('.chat-messages');
        const messageElement = this.createChatMessageElement(messageData);
        
        chatContainer.append(messageElement);
        chatContainer.scrollTop(chatContainer[0].scrollHeight);

        // Animate new message
        messageElement.hide().fadeIn(300);
    }

    /**
     * Create chat message element
     */
    createChatMessageElement(messageData) {
        const timestamp = new Date(messageData.timestamp).toLocaleTimeString();
        const messageClass = messageData.isSelf ? 'message-self' : 'message-other';
        
        return $(`
            <div class="chat-message ${messageClass}">
                <div class="message-avatar">
                    <img src="${messageData.avatar || '/images/default-avatar.png'}" 
                         alt="${messageData.username}" class="avatar-sm">
                </div>
                <div class="message-content">
                    <div class="message-header">
                        <span class="message-username">${messageData.username}</span>
                        <span class="message-timestamp">${timestamp}</span>
                    </div>
                    <div class="message-text">${this.formatChatMessage(messageData.message)}</div>
                </div>
            </div>
        `);
    }

    /**
     * Start video call
     */
    async startVideoCall() {
        if (!this.currentRoom) {
            this.showError('Please join a room first');
            return;
        }

        try {
            // Get user media
            this.localStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });

            // Display local video
            const localVideo = $('.local-video')[0];
            if (localVideo) {
                localVideo.srcObject = this.localStream;
            }

            // Add stream to peer connection
            if (this.peer) {
                this.localStream.getTracks().forEach(track => {
                    this.peer.addTrack(track, this.localStream);
                });
            }

            // Notify other users
            this.socket.emit('start-video-call', { room: this.currentRoom });

            // Update UI
            $('.video-call-controls').show();
            $('.start-video-call-btn').hide();

            // Track video call start
            if (this.xapi) {
                this.xapi.track('started', 'http://adlnet.gov/expapi/verbs/started', {
                    type: 'video-call',
                    roomId: this.currentRoom
                });
            }

        } catch (error) {
            console.error('Video call start error:', error);
            this.showError('Failed to start video call. Please check your camera and microphone permissions.');
        }
    }

    /**
     * End video call
     */
    async endVideoCall() {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                track.stop();
            });
            this.localStream = null;
        }

        // Clear remote streams
        this.remoteStreams.forEach(stream => {
            stream.getTracks().forEach(track => track.stop());
        });
        this.remoteStreams.clear();

        // Notify other users
        if (this.socket && this.currentRoom) {
            this.socket.emit('end-video-call', { room: this.currentRoom });
        }

        // Update UI
        $('.video-call-controls').hide();
        $('.start-video-call-btn').show();
        $('.local-video')[0].srcObject = null;
        $('.remote-videos').empty();

        // Track video call end
        if (this.xapi) {
            this.xapi.track('terminated', 'http://adlnet.gov/expapi/verbs/terminated', {
                type: 'video-call',
                roomId: this.currentRoom
            });
        }
    }

    /**
     * Toggle camera on/off
     */
    toggleCamera() {
        if (!this.localStream) return;

        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.enabled = !videoTrack.enabled;
            const button = $('.toggle-camera-btn');
            button.toggleClass('btn-danger btn-secondary');
            button.find('i').toggleClass('fa-video fa-video-slash');
        }
    }

    /**
     * Toggle microphone on/off
     */
    toggleMicrophone() {
        if (!this.localStream) return;

        const audioTrack = this.localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            const button = $('.toggle-microphone-btn');
            button.toggleClass('btn-danger btn-secondary');
            button.find('i').toggleClass('fa-microphone fa-microphone-slash');
        }
    }

    /**
     * Handle file sharing
     */
    async handleFileShare(files) {
        if (!this.currentRoom || !files.length) return;

        const formData = new FormData();
        Array.from(files).forEach(file => {
            formData.append('files', file);
        });
        formData.append('roomId', this.currentRoom);

        try {
            const response = await $.ajax({
                url: '/api/collaboration/share-files',
                method: 'POST',
                data: formData,
                processData: false,
                contentType: false
            });

            this.showSuccess(`${files.length} file(s) shared successfully`);

            // Track file sharing
            if (this.xapi) {
                this.xapi.track('shared', 'http://adlnet.gov/expapi/verbs/shared', {
                    type: 'files',
                    count: files.length,
                    roomId: this.currentRoom
                });
            }

        } catch (error) {
            console.error('File sharing error:', error);
            this.showError('Failed to share files');
        }
    }

    /**
     * Get current user ID
     */
    getCurrentUserId() {
        return window.authManager?.currentUser?.id || 'anonymous';
    }

    /**
     * Get current username
     */
    getCurrentUsername() {
        return window.authManager?.currentUser?.name || 'Anonymous';
    }

    /**
     * Format chat message (handle mentions, links, etc.)
     */
    formatChatMessage(message) {
        // Handle @mentions
        message = message.replace(/@(\w+)/g, '<span class="mention">@$1</span>');
        
        // Handle URLs
        const urlRegex = /(https?:\/\/[^\s]+)/g;
        message = message.replace(urlRegex, '<a href="$1" target="_blank">$1</a>');
        
        // Handle basic markdown
        message = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        message = message.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        return message;
    }

    /**
     * Track page access
     */
    trackPageAccess() {
        if (this.xapi) {
            this.xapi.track('accessed', 'http://adlnet.gov/expapi/verbs/accessed', {
                type: 'collaboration-page',
                url: window.location.href
            });
        }
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
        
        $('.notification-container, .collaboration-header').first().after(alert);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            alert.fadeOut(() => alert.remove());
        }, 5000);
    }

    /**
     * Cleanup resources
     */
    destroy() {
        // End video call
        this.endVideoCall();
        
        // Leave room
        this.leaveRoom();
        
        // Clear timeouts
        clearTimeout(this.typingTimeout);
        clearTimeout(this.documentChangeTimeout);
        
        // Disconnect socket
        if (this.socket) {
            this.socket.disconnect();
        }
        
        // Close peer connection
        if (this.peer) {
            this.peer.close();
        }
    }
}

// Initialize collaboration manager when DOM is ready
$(document).ready(() => {
    // Only initialize on collaboration page
    if (window.location.pathname === '/collaboration') {
        window.collaborationManager = new CollaborationManager();
    }
});

// Cleanup on page unload
$(window).on('beforeunload', () => {
    if (window.collaborationManager) {
        window.collaborationManager.destroy();
    }
});

// Export for module use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = CollaborationManager;
}