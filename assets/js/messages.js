// --- Telegram-Inspired Real-Time Messaging System ---

// === CORE MESSAGING CLASSES ===

class TelegramRealtimeMessaging {
    constructor() {
        this.socket = null;
        this.currentUser = null;
        this.currentChat = null;
        this.messages = new Map();
        this.conversations = new Map();
        this.typingUsers = new Set();
        this.connectionState = 'disconnected';
        this.messageQueue = [];
        this.retry = {
            attempts: 0,
            maxAttempts: 5,
            delay: 1000
        };
        
        this.initializeEventListeners();
    }

    // Initialize Socket Connection with Telegram-style reliability
    async initializeConnection() {
        try {
            // Check authentication
            const token = localStorage.getItem('token');
            if (!token) {
                throw new Error('No authentication token found');
            }

            // Parse user from token
            const payload = JSON.parse(atob(token.split('.')[1]));
            this.currentUser = {
                id: payload.userId,
                username: payload.username,
                name: payload.name || payload.username
            };

            // Initialize Socket.IO with Telegram-style configuration
            this.socket = io('/', {
                auth: { token },
                transports: ['websocket', 'polling'],
                timeout: 20000,
                forceNew: false,
                reconnection: true,
                reconnectionAttempts: 10,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                maxHttpBufferSize: 1e8
            });

            this.setupSocketEvents();
            
            console.log('🚀 Telegram-style messaging initialized for:', this.currentUser.username);
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize messaging:', error);
            this.handleConnectionError(error);
            return false;
        }
    }

    // Setup Socket Event Handlers (Telegram-style)
    setupSocketEvents() {
        // Connection Events
        this.socket.on('connect', () => {
            this.connectionState = 'connected';
            this.retry.attempts = 0;
            this.updateConnectionStatus('Connected', '#10B981');
            this.flushMessageQueue();
            this.loadConversations();
            console.log('✅ Connected to messaging server');
        });

        this.socket.on('disconnect', (reason) => {
            this.connectionState = 'disconnected';
            this.updateConnectionStatus('Disconnected', '#EF4444');
            console.warn('⚠️ Disconnected:', reason);
            
            if (reason === 'io server disconnect') {
                this.socket.connect();
            }
        });

        this.socket.on('connect_error', (error) => {
            this.handleConnectionError(error);
        });

        // Message Events
        this.socket.on('newMessage', (data) => {
            this.handleIncomingMessage(data);
        });

        this.socket.on('messageDelivered', (data) => {
            this.updateMessageStatus(data.messageId, 'delivered');
        });

        this.socket.on('messageRead', (data) => {
            this.updateMessageStatus(data.messageId, 'read');
        });

        // Typing Events
        this.socket.on('userTyping', (data) => {
            this.handleTypingIndicator(data, true);
        });

        this.socket.on('userStoppedTyping', (data) => {
            this.handleTypingIndicator(data, false);
        });

        // Conversation Events
        this.socket.on('conversationUpdated', (data) => {
            this.updateConversation(data);
        });

        // User Presence
        this.socket.on('userOnline', (data) => {
            this.updateUserPresence(data.userId, 'online');
        });

        this.socket.on('userOffline', (data) => {
            this.updateUserPresence(data.userId, 'offline');
        });
    }

    // Load Conversations (Telegram-style)
    async loadConversations() {
        try {
            const response = await fetch('/api/conversations', {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const conversations = await response.json();
                this.conversations.clear();
                
                conversations.forEach(conv => {
                    this.conversations.set(conv.id, conv);
                });
                
                this.renderConversations();
                console.log(`📋 Loaded ${conversations.length} conversations`);
            }
        } catch (error) {
            console.error('❌ Failed to load conversations:', error);
        }
    }

    // Send Message (Telegram-style with queuing)
    async sendMessage(content, chatId = null) {
        if (!content?.trim()) return;

        const targetChatId = chatId || this.currentChat?.id;
        if (!targetChatId) {
            console.warn('⚠️ No active chat selected');
            return;
        }

        const tempMessage = {
            id: `temp_${Date.now()}`,
            content: content.trim(),
            senderId: this.currentUser.id,
            senderName: this.currentUser.name,
            chatId: targetChatId,
            timestamp: new Date().toISOString(),
            status: 'sending',
            isTemporary: true
        };

        // Add to UI immediately (Telegram-style optimistic updates)
        this.addMessageToUI(tempMessage);

        try {
            if (this.connectionState === 'connected') {
                // Send via Socket.IO
                this.socket.emit('sendMessage', {
                    content: content.trim(),
                    chatId: targetChatId,
                    tempId: tempMessage.id
                });
            } else {
                // Queue for later (offline support)
                this.messageQueue.push({
                    content: content.trim(),
                    chatId: targetChatId,
                    tempId: tempMessage.id
                });
                console.log('📤 Message queued for sending');
            }

            // Also send via HTTP API as backup
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    content: content.trim(),
                    conversationId: targetChatId
                })
            });

            if (response.ok) {
                const sentMessage = await response.json();
                this.replaceTemporaryMessage(tempMessage.id, sentMessage);
            }

        } catch (error) {
            console.error('❌ Failed to send message:', error);
            this.updateMessageStatus(tempMessage.id, 'failed');
        }
    }

    // Handle Incoming Messages
    handleIncomingMessage(data) {
        const message = {
            id: data.id || data._id,
            content: data.content,
            senderId: data.senderId,
            senderName: data.senderName,
            chatId: data.conversationId || data.chatId,
            timestamp: data.createdAt || data.timestamp,
            status: 'delivered'
        };

        // Add to current chat if active
        if (this.currentChat && message.chatId === this.currentChat.id) {
            this.addMessageToUI(message);
            
            // Mark as read if chat is active
            if (message.senderId !== this.currentUser.id) {
                this.markMessageAsRead(message.id);
            }
        }

        // Update conversation list
        this.updateConversationWithMessage(message);
        
        // Show notification if not in active chat
        if (!this.currentChat || message.chatId !== this.currentChat.id) {
            this.showNotification(message);
        }

        console.log('📨 New message received:', message.content.substring(0, 50));
    }

    // UI Rendering Methods
    renderConversations() {
        const container = document.getElementById('conversations-list');
        if (!container) return;

        const conversationsArray = Array.from(this.conversations.values())
            .sort((a, b) => new Date(b.lastActivity || 0) - new Date(a.lastActivity || 0));

        if (conversationsArray.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8">
                    <div class="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-comments text-gray-400 text-2xl"></i>
                    </div>
                    <h3 class="text-white text-lg font-semibold mb-2">No conversations yet</h3>
                    <p class="text-gray-400">Start a new chat to begin messaging!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = conversationsArray.map(conv => {
            const isActive = this.currentChat?.id === conv.id;
            const unreadCount = conv.unreadCount || 0;
            const lastMessage = conv.lastMessage;
            
            return `
                <div class="conversation-item ${isActive ? 'active' : ''}" onclick="telegramMessaging.selectChat('${conv.id}')">
                    <div class="flex items-center space-x-3 p-3 rounded-lg cursor-pointer transition-colors hover:bg-gray-700/30 ${isActive ? 'bg-blue-600/20 border-l-2 border-blue-400' : ''}">
                        <div class="relative">
                            <div class="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-sm font-semibold text-white">
                                ${conv.name ? conv.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div class="absolute -bottom-1 -right-1 w-3 h-3 ${conv.isOnline ? 'bg-green-500' : 'bg-gray-500'} rounded-full border-2 border-gray-800"></div>
                        </div>
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center justify-between">
                                <h4 class="text-white font-medium truncate">${conv.name || 'Unknown User'}</h4>
                                <span class="text-xs text-gray-400">${this.formatTime(lastMessage?.timestamp)}</span>
                            </div>
                            <div class="flex items-center justify-between">
                                <p class="text-gray-400 text-sm truncate">${lastMessage?.content || 'No messages yet'}</p>
                                ${unreadCount > 0 ? `<div class="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center text-xs text-white">${unreadCount}</div>` : ''}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Select Chat
    async selectChat(chatId) {
        try {
            const conversation = this.conversations.get(chatId);
            if (!conversation) return;

            this.currentChat = conversation;
            
            // Update UI
            this.updateChatHeader(conversation);
            this.renderConversations(); // Re-render to show active state
            
            // Load messages
            await this.loadMessages(chatId);
            
            // Join chat room
            if (this.socket) {
                this.socket.emit('joinChat', chatId);
            }
            
            console.log('💬 Selected chat:', conversation.name);
            
        } catch (error) {
            console.error('❌ Failed to select chat:', error);
        }
    }

    // Load Messages for Chat
    async loadMessages(chatId) {
        try {
            const response = await fetch(`/api/conversations/${chatId}/messages`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });

            if (response.ok) {
                const messages = await response.json();
                this.messages.set(chatId, messages);
                this.renderMessages(messages);
                this.scrollToBottom();
            }
        } catch (error) {
            console.error('❌ Failed to load messages:', error);
        }
    }

    // Render Messages
    renderMessages(messages) {
        const container = document.getElementById('messages-container');
        if (!container) return;

        if (messages.length === 0) {
            container.innerHTML = `
                <div class="empty-state text-center py-12">
                    <div class="w-16 h-16 bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-comments text-gray-400 text-2xl"></i>
                    </div>
                    <h3 class="text-white text-lg font-semibold mb-2">Start the conversation!</h3>
                    <p class="text-gray-400">Send the first message to get things started.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = messages.map(message => {
            const isOwn = message.senderId === this.currentUser.id;
            const statusIcon = this.getMessageStatusIcon(message.status);
            
            return `
                <div class="message-group flex ${isOwn ? 'justify-end' : 'justify-start'} mb-4">
                    <div class="max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${isOwn ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-100'}">
                        ${!isOwn ? `<div class="text-xs text-gray-400 mb-1">${message.senderName || 'Unknown'}</div>` : ''}
                        <div class="text-sm whitespace-pre-wrap">${this.escapeHtml(message.content)}</div>
                        <div class="flex items-center justify-end mt-1 space-x-1">
                            <span class="text-xs ${isOwn ? 'text-blue-200' : 'text-gray-400'}">${this.formatTime(message.timestamp)}</span>
                            ${isOwn ? `<span class="text-xs">${statusIcon}</span>` : ''}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Utility Methods
    formatTime(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp);
        const now = new Date();
        const diffInHours = (now - date) / (1000 * 60 * 60);
        
        if (diffInHours < 24) {
            return date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        } else {
            return date.toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' });
        }
    }

    getMessageStatusIcon(status) {
        switch (status) {
            case 'sending': return '⏳';
            case 'sent': return '✓';
            case 'delivered': return '✓✓';
            case 'read': return '✓✓';
            case 'failed': return '❌';
            default: return '';
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    updateConnectionStatus(status, color) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            statusElement.textContent = status;
            statusElement.style.color = color;
        }
    }

    scrollToBottom() {
        const container = document.getElementById('messages-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    // Initialize Event Listeners
    initializeEventListeners() {
        document.addEventListener('DOMContentLoaded', () => {
            this.setupMessageInput();
            this.setupSearch();
        });
    }

    setupMessageInput() {
        const messageInput = document.getElementById('message-input');
        const sendButton = document.getElementById('send-button');

        if (messageInput) {
            // Auto-resize textarea
            messageInput.addEventListener('input', (e) => {
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
                
                // Typing indicator
                if (this.currentChat && e.target.value.trim()) {
                    this.sendTypingIndicator(true);
                } else {
                    this.sendTypingIndicator(false);
                }
            });

            // Send on Enter
            messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
        }

        if (sendButton) {
            sendButton.addEventListener('click', () => {
                this.handleSendMessage();
            });
        }
    }

    handleSendMessage() {
        const messageInput = document.getElementById('message-input');
        if (!messageInput) return;

        const content = messageInput.value.trim();
        if (content) {
            this.sendMessage(content);
            messageInput.value = '';
            messageInput.style.height = 'auto';
            this.sendTypingIndicator(false);
        }
    }

    sendTypingIndicator(isTyping) {
        if (this.socket && this.currentChat) {
            if (isTyping) {
                this.socket.emit('typing', { chatId: this.currentChat.id });
            } else {
                this.socket.emit('stopTyping', { chatId: this.currentChat.id });
            }
        }
    }
}

// === INITIALIZATION ===

// Global instance
let telegramMessaging;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Initializing Telegram-style messaging...');
    
    telegramMessaging = new TelegramRealtimeMessaging();
    const success = await telegramMessaging.initializeConnection();
    
    if (success) {
        console.log('✅ Real-time messaging ready!');
    } else {
        console.error('❌ Failed to initialize messaging');
    }
    
    // Initialize page navigation and background
    initializePageNavigation();
    initializeCosmicBackground();
});

// === PAGE NAVIGATION ===
function initializePageNavigation() {
    const mainNav = document.getElementById('main-nav');
    const navLinks = mainNav?.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');

    navLinks?.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetPageId = link.dataset.page;

            pages.forEach(page => {
                page.classList.add('hidden');
            });

            const targetPage = document.getElementById(`page-${targetPageId}`);
            if (targetPage) {
                targetPage.classList.remove('hidden');
            }

            navLinks.forEach(navLink => {
                navLink.classList.remove('text-white', 'bg-gray-500/20');
                navLink.classList.add('hover:bg-gray-800/50');
            });
            link.classList.add('text-white', 'bg-gray-500/20');
            link.classList.remove('hover:bg-gray-800/50');
        });
    });
}

// === 3D COSMIC BACKGROUND ===
function initializeCosmicBackground() {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
    camera.position.z = 1;
    const renderer = new THREE.WebGLRenderer({
        canvas: document.getElementById('cosmic-bg'),
        antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    
    const starGeo = new THREE.BufferGeometry();
    const starCount = 6000;
    const posArray = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 600;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    
    const starMaterial = new THREE.PointsMaterial({
        size: 0.5,
        color: 0xaaaaaa,
        transparent: true,
    });
    
    const stars = new THREE.Points(starGeo, starMaterial);
    scene.add(stars);
    
    let mouseX = 0;
    let mouseY = 0;
    document.addEventListener('mousemove', (event) => {
        mouseX = event.clientX;
        mouseY = event.clientY;
    });
    
    const clock = new THREE.Clock();
    const animate = () => {
        requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();
        stars.rotation.y = -mouseX * 0.00005;
        stars.rotation.x = -mouseY * 0.00005;
        camera.position.z = 1 + (document.documentElement.scrollTop || document.body.scrollTop) * 0.001;
        renderer.render(scene, camera);
    };
    animate();
    
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}