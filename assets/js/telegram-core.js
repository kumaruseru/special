// === TELEGRAM CORE ARCHITECTURE (Inspired by GramJS) ===

/**
 * Core Telegram-like Message Manager
 * Based on MTProto architecture patterns from Telegram
 */
class TelegramCore {
    constructor() {
        // Core state management (like MTProto)
        this.state = {
            connectionState: 'disconnected', // disconnected, connecting, connected, reconnecting
            authState: 'unauthenticated',    // unauthenticated, authenticating, authenticated
            syncState: 'idle'                // idle, syncing, error
        };
        
        // Message management (inspired by Telegram's message handling)
        this.messages = new Map();           // messageId -> Message
        this.conversations = new Map();      // conversationId -> Conversation
        this.updates = new Map();            // updateId -> Update
        this.pendingMessages = new Map();    // tempId -> PendingMessage
        
        // Connection management
        this.socket = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        
        // User context
        this.currentUser = null;
        this.currentConversation = null;
        
        // Event system (like Telegram's updates)
        this.eventHandlers = new Map();
        
        // Initialize
        this.init();
    }
    
    async init() {
        console.log('🚀 TelegramCore: Initializing...');
        
        // Load user from UserManager
        await this.loadUser();
        
        // Setup connection
        this.initConnection();
        
        // Setup message handlers
        this.initMessageHandlers();
        
        // Setup UI integration
        this.initUIIntegration();
        
        console.log('✅ TelegramCore: Initialized');
    }
    
    // === USER MANAGEMENT ===
    async loadUser() {
        if (window.userManager) {
            this.currentUser = window.userManager.getCurrentUser();
            
            // Subscribe to user updates
            window.userManager.subscribe((userData) => {
                this.currentUser = userData;
                this.emit('userUpdated', userData);
            });
            
            console.log('👤 TelegramCore: User loaded from UserManager:', this.currentUser);
        } else {
            console.warn('⚠️ TelegramCore: UserManager not available');
        }
    }
    
    // === CONNECTION MANAGEMENT (MTProto-inspired) ===
    initConnection() {
        this.updateConnectionState('connecting');
        
        try {
            this.socket = io({
                transports: ['websocket', 'polling'],
                timeout: 10000,
                forceNew: true
            });
            
            this.setupSocketHandlers();
            
        } catch (error) {
            console.error('❌ TelegramCore: Connection failed:', error);
            this.updateConnectionState('disconnected');
            this.scheduleReconnect();
        }
    }
    
    setupSocketHandlers() {
        this.socket.on('connect', () => {
            console.log('🔗 TelegramCore: Socket connected');
            this.updateConnectionState('connected');
            this.reconnectAttempts = 0;
            this.authenticate();
        });
        
        this.socket.on('disconnect', (reason) => {
            console.log('🔌 TelegramCore: Socket disconnected:', reason);
            this.updateConnectionState('disconnected');
            this.updateAuthState('unauthenticated');
            
            if (reason === 'io server disconnect') {
                // Server disconnected, reconnect manually
                this.scheduleReconnect();
            }
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('❌ TelegramCore: Connection error:', error);
            this.updateConnectionState('disconnected');
            this.scheduleReconnect();
        });
        
        // Authentication events
        this.socket.on('authenticated', (data) => {
            console.log('✅ TelegramCore: Authenticated:', data);
            this.updateAuthState('authenticated');
            this.onAuthenticated(data);
        });
        
        this.socket.on('authentication_failed', (data) => {
            console.error('❌ TelegramCore: Authentication failed:', data);
            this.updateAuthState('unauthenticated');
        });
    }
    
    async authenticate() {
        if (!this.currentUser) {
            console.warn('⚠️ TelegramCore: No user data for authentication');
            return;
        }
        
        this.updateAuthState('authenticating');
        
        const token = window.userManager?.getAuthToken() || localStorage.getItem('token');
        
        if (token) {
            this.socket.emit('authenticate', {
                token: token,
                userId: this.currentUser.id,
                userInfo: {
                    name: this.currentUser.name,
                    email: this.currentUser.email
                }
            });
        } else {
            console.error('❌ TelegramCore: No authentication token');
            this.updateAuthState('unauthenticated');
        }
    }
    
    onAuthenticated(data) {
        // Join user room for real-time updates
        this.socket.emit('join_user_room', {
            userId: this.currentUser.id
        });
        
        // Start message sync
        this.startMessageSync();
        
        this.emit('ready');
    }
    
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('❌ TelegramCore: Max reconnect attempts reached');
            this.emit('connectionFailed');
            return;
        }
        
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts);
        console.log(`🔄 TelegramCore: Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1})`);
        
        setTimeout(() => {
            this.reconnectAttempts++;
            this.updateConnectionState('reconnecting');
            this.initConnection();
        }, delay);
    }
    
    // === MESSAGE MANAGEMENT (Telegram-style) ===
    initMessageHandlers() {
        if (!this.socket) return;
        
        // Core message events
        this.socket.on('new_message', (message) => this.handleNewMessage(message));
        this.socket.on('message_sent', (data) => this.handleMessageSent(data));
        this.socket.on('message_delivered', (data) => this.handleMessageDelivered(data));
        this.socket.on('message_read', (data) => this.handleMessageRead(data));
        
        // Typing events
        this.socket.on('typing_start', (data) => this.handleTypingStart(data));
        this.socket.on('typing_stop', (data) => this.handleTypingStop(data));
        
        // Conversation events
        this.socket.on('conversation_updated', (data) => this.handleConversationUpdated(data));
    }
    
    async startMessageSync() {
        this.updateSyncState('syncing');
        
        try {
            // Sync conversations first
            await this.syncConversations();
            
            // Then sync messages for current conversation
            if (this.currentConversation) {
                await this.syncMessages(this.currentConversation.id);
            }
            
            this.updateSyncState('idle');
            this.emit('syncComplete');
            
        } catch (error) {
            console.error('❌ TelegramCore: Sync failed:', error);
            this.updateSyncState('error');
            this.emit('syncError', error);
        }
    }
    
    async syncConversations() {
        console.log('📋 TelegramCore: Syncing conversations...');
        
        try {
            const response = await fetch('/api/conversations', {
                headers: {
                    'Authorization': `Bearer ${window.userManager?.getAuthToken() || localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.conversations) {
                // Update conversations map
                data.conversations.forEach(conv => {
                    this.conversations.set(conv.id || conv._id, this.normalizeConversation(conv));
                });
                
                console.log(`✅ TelegramCore: Synced ${data.conversations.length} conversations`);
                this.emit('conversationsUpdated', Array.from(this.conversations.values()));
            }
            
        } catch (error) {
            console.error('❌ TelegramCore: Conversation sync failed:', error);
            throw error;
        }
    }
    
    async syncMessages(conversationId) {
        console.log(`💬 TelegramCore: Syncing messages for conversation ${conversationId}...`);
        
        try {
            const response = await fetch(`/api/conversations/${conversationId}/messages`, {
                headers: {
                    'Authorization': `Bearer ${window.userManager?.getAuthToken() || localStorage.getItem('token')}`
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.messages) {
                // Update messages map
                data.messages.forEach(msg => {
                    const normalizedMessage = this.normalizeMessage(msg);
                    this.messages.set(normalizedMessage.id, normalizedMessage);
                });
                
                console.log(`✅ TelegramCore: Synced ${data.messages.length} messages`);
                this.emit('messagesUpdated', conversationId, this.getConversationMessages(conversationId));
            }
            
        } catch (error) {
            console.error('❌ TelegramCore: Message sync failed:', error);
            throw error;
        }
    }
    
    // === MESSAGE SENDING (MTProto-inspired reliability) ===
    async sendMessage(text, conversationId = null) {
        if (!text?.trim()) return null;
        
        const targetConversationId = conversationId || this.currentConversation?.id;
        if (!targetConversationId) {
            throw new Error('No conversation selected');
        }
        
        // Create temporary message (like Telegram's pending messages)
        const tempMessage = this.createTempMessage(text, targetConversationId);
        
        // Add to pending messages
        this.pendingMessages.set(tempMessage.tempId, tempMessage);
        
        // Emit for immediate UI update
        this.emit('messageAdded', tempMessage);
        
        try {
            // Try Socket.IO first (real-time)
            if (this.isConnectedAndAuthenticated()) {
                await this.sendMessageViaSocket(tempMessage);
            } else {
                // Fallback to HTTP API
                await this.sendMessageViaAPI(tempMessage);
            }
            
        } catch (error) {
            console.error('❌ TelegramCore: Send message failed:', error);
            
            // Mark as failed
            tempMessage.status = 'failed';
            this.emit('messageUpdated', tempMessage);
            
            // Add to retry queue
            this.addToRetryQueue(tempMessage);
            
            throw error;
        }
        
        return tempMessage;
    }
    
    async sendMessageViaSocket(message) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Socket send timeout'));
            }, 10000);
            
            this.socket.emit('send_message', {
                tempId: message.tempId,
                text: message.text,
                conversationId: message.conversationId,
                timestamp: message.timestamp.toISOString()
            }, (response) => {
                clearTimeout(timeout);
                
                if (response && response.success) {
                    resolve(response);
                } else {
                    reject(new Error(response?.message || 'Socket send failed'));
                }
            });
        });
    }
    
    async sendMessageViaAPI(message) {
        const response = await fetch('/api/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${window.userManager?.getAuthToken() || localStorage.getItem('token')}`
            },
            body: JSON.stringify({
                receiverId: message.conversationId,
                content: message.text,
                tempId: message.tempId,
                timestamp: message.timestamp.toISOString()
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
            throw new Error(result.message || 'API send failed');
        }
        
        return result;
    }
    
    // === MESSAGE EVENT HANDLERS ===
    handleNewMessage(messageData) {
        console.log('📨 TelegramCore: New message received:', messageData);
        
        const message = this.normalizeMessage(messageData);
        this.messages.set(message.id, message);
        
        // Update conversation last message
        const conversation = this.conversations.get(message.conversationId);
        if (conversation) {
            conversation.lastMessage = message;
            this.emit('conversationUpdated', conversation);
        }
        
        this.emit('messageAdded', message);
        
        // Show notification if not in current conversation
        if (message.conversationId !== this.currentConversation?.id) {
            this.emit('messageNotification', message);
        }
    }
    
    handleMessageSent(data) {
        console.log('✅ TelegramCore: Message sent confirmed:', data);
        
        // Find pending message by tempId
        const pendingMessage = this.findPendingMessage(data.tempId);
        if (pendingMessage) {
            // Update with real message ID
            pendingMessage.id = data.messageId;
            pendingMessage.status = 'sent';
            
            // Move from pending to messages
            this.messages.set(data.messageId, pendingMessage);
            this.pendingMessages.delete(data.tempId);
            
            this.emit('messageUpdated', pendingMessage);
        }
    }
    
    handleMessageDelivered(data) {
        const message = this.messages.get(data.messageId);
        if (message) {
            message.status = 'delivered';
            this.emit('messageUpdated', message);
        }
    }
    
    handleMessageRead(data) {
        const message = this.messages.get(data.messageId);
        if (message) {
            message.status = 'read';
            this.emit('messageUpdated', message);
        }
    }
    
    // === CONVERSATION MANAGEMENT ===
    async selectConversation(conversationId) {
        console.log(`💬 TelegramCore: Selecting conversation ${conversationId}`);
        
        try {
            // Set current conversation
            this.currentConversation = this.conversations.get(conversationId) || { id: conversationId };
            
            // Clear current messages display
            this.emit('conversationChanged', this.currentConversation);
            
            // Load messages for this conversation
            await this.syncMessages(conversationId);
            
            // Join conversation room for real-time updates
            if (this.isConnectedAndAuthenticated()) {
                this.socket.emit('join_conversation', { conversationId });
            }
            
        } catch (error) {
            console.error('❌ TelegramCore: Select conversation failed:', error);
            this.emit('error', error);
        }
    }
    
    // === UTILITY METHODS ===
    createTempMessage(text, conversationId) {
        const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        return {
            id: null, // Will be set when confirmed
            tempId: tempId,
            text: text,
            conversationId: conversationId,
            senderId: this.currentUser?.id,
            senderName: this.currentUser?.name || 'You',
            timestamp: new Date(),
            status: 'sending',
            isOwn: true
        };
    }
    
    normalizeMessage(messageData) {
        return {
            id: messageData.id || messageData._id,
            text: messageData.text || messageData.content || '',
            conversationId: messageData.conversationId || messageData.chatId,
            senderId: messageData.senderId,
            senderName: messageData.senderName || 'Unknown',
            timestamp: new Date(messageData.timestamp),
            status: messageData.status || 'received',
            isOwn: this.currentUser && messageData.senderId === this.currentUser.id
        };
    }
    
    normalizeConversation(convData) {
        return {
            id: convData.id || convData._id,
            partnerId: convData.partnerId || convData.otherUserId,
            partnerName: convData.otherUser?.name || convData.partnerName || 'Unknown',
            partnerAvatar: convData.otherUser?.avatar || convData.partnerAvatar,
            lastMessage: convData.lastMessage,
            unreadCount: convData.unreadCount || 0,
            updatedAt: new Date(convData.updatedAt || Date.now())
        };
    }
    
    getConversationMessages(conversationId) {
        return Array.from(this.messages.values())
            .filter(msg => msg.conversationId === conversationId)
            .sort((a, b) => a.timestamp - b.timestamp);
    }
    
    findPendingMessage(tempId) {
        return this.pendingMessages.get(tempId);
    }
    
    isConnectedAndAuthenticated() {
        return this.state.connectionState === 'connected' && 
               this.state.authState === 'authenticated';
    }
    
    // === STATE MANAGEMENT ===
    updateConnectionState(state) {
        this.state.connectionState = state;
        this.emit('connectionStateChanged', state);
    }
    
    updateAuthState(state) {
        this.state.authState = state;
        this.emit('authStateChanged', state);
    }
    
    updateSyncState(state) {
        this.state.syncState = state;
        this.emit('syncStateChanged', state);
    }
    
    // === EVENT SYSTEM ===
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
    }
    
    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    }
    
    emit(event, ...args) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(...args);
                } catch (error) {
                    console.error(`❌ TelegramCore: Event handler error for ${event}:`, error);
                }
            });
        }
    }
    
    // === UI INTEGRATION ===
    initUIIntegration() {
        // Subscribe to core events and update UI
        this.on('messageAdded', (message) => {
            if (window.telegramUI) {
                window.telegramUI.renderMessage(message);
            }
        });
        
        this.on('messageUpdated', (message) => {
            if (window.telegramUI) {
                window.telegramUI.updateMessage(message);
            }
        });
        
        this.on('conversationsUpdated', (conversations) => {
            if (window.telegramUI) {
                window.telegramUI.renderConversations(conversations);
            }
        });
        
        this.on('conversationChanged', (conversation) => {
            if (window.telegramUI) {
                window.telegramUI.showConversation(conversation);
            }
        });
    }
}

// Global instance
window.telegramCore = new TelegramCore();

console.log('🚀 TelegramCore: Loaded');
