// === TELEGRAM-INSPIRED MESSAGING SYSTEM ===
class TelegramMessaging {
    constructor() {
        console.log('🚀 Initializing Telegram-style messaging system');
        
        // Core Telegram-like properties
        this.socket = null;
        this.currentUser = null; // Will be loaded from UserManager
        this.currentChat = null;
        this.messages = new Map(); // Message storage like Telegram
        this.chats = new Map(); // Chat storage
        this.messageQueue = []; // Pending messages
        this.typingUsers = new Set();
        this.isOnline = false;
        this.isAuthenticated = false; // Socket.IO authentication status
        
        // Initialize with modern managers
        this.initWithManagers();
    }
    
    // Initialize with modern user and message managers
    async initWithManagers() {
        console.log('🔄 Setting up with modern managers...');
        
        // Setup user manager integration
        if (window.userManager) {
            console.log('👤 UserManager detected, integrating...');
            
            // Subscribe to user changes
            window.userManager.subscribe((userData) => {
                if (userData) {
                    this.currentUser = userData;
                    console.log('👤 User updated from UserManager:', userData);
                    this.updateUserElements();
                }
            });
            
            // Force refresh to get latest user data
            await window.userManager.forceRefresh();
        } else {
            console.warn('⚠️ UserManager not available, using fallback');
            this.currentUser = this.loadUserProfile();
        }
        
        // Initialize subsystems
        this.initSocket();
        this.initUI();
        this.initMessageHandlers();
        this.requestNotificationPermission();
        this.restoreSession();
        
        console.log('✅ Telegram messaging system ready');
    }

    // === USER PROFILE MANAGEMENT ===
    loadUserProfile() {
        try {
            // Try multiple sources like Telegram
            const sources = [
                () => JSON.parse(localStorage.getItem('user') || '{}'),
                () => JSON.parse(localStorage.getItem('userInfo') || '{}'),
                () => window.loadUserInfo?.() || {}
            ];
            
            for (const source of sources) {
                const user = source();
                if (user && user.id && user.name) {
                    console.log('👤 User profile loaded from source:', user);
                    return user;
                }
            }
            
            // Try to extract from userName/userEmail in localStorage
            const userName = localStorage.getItem('userName');
            const userEmail = localStorage.getItem('userEmail');
            if (userName && userEmail) {
                // Try to get user ID from token
                const token = localStorage.getItem('token') || localStorage.getItem('authToken');
                if (token) {
                    try {
                        const payload = JSON.parse(atob(token.split('.')[1]));
                        if (payload.userId) {
                            const userFromToken = {
                                id: payload.userId,
                                name: userName,
                                email: userEmail,
                                username: userEmail.replace('@', '').replace('.', '_')
                            };
                            console.log('👤 User profile loaded from token:', userFromToken);
                            return userFromToken;
                        }
                    } catch (e) {
                        console.warn('⚠️ Failed to parse token:', e);
                    }
                }
            }
            
            throw new Error('No valid user profile found');
        } catch (error) {
            console.error('❌ User profile load failed:', error);
            return null;
        }
    }

    // === SOCKET CONNECTION ===
    initSocket() {
        try {
            // Check if Socket.IO is available
            if (typeof io === 'undefined') {
                console.warn('⚠️ Socket.IO not yet loaded, will retry...');
                // Wait for Socket.IO to load
                if (window.socketIOLoaded) {
                    this.initSocket();
                    return;
                }
                
                // Listen for Socket.IO ready event
                window.addEventListener('socketio-ready', () => {
                    console.log('🔄 Socket.IO ready, initializing connection...');
                    this.initSocket();
                });
                return;
            }

            this.socket = io({
                transports: ['websocket', 'polling'],
                reconnection: true,
                reconnectionAttempts: 5,
                reconnectionDelay: 1000,
                timeout: 20000
            });

            this.socket.on('connect', () => {
                console.log('🔌 Connected to Telegram-style server');
                this.isOnline = true;
                this.updateConnectionStatus();
                this.authenticateUser();
                this.joinUserRoom();
            });

            this.socket.on('disconnect', () => {
                console.log('💔 Disconnected from server');
                this.isOnline = false;
                this.updateConnectionStatus();
            });

            this.socket.on('reconnect', () => {
                console.log('🔄 Reconnected to server');
                this.isOnline = true;
                this.updateConnectionStatus();
                this.restoreSession();
            });

        } catch (error) {
            console.error('❌ Socket initialization failed:', error);
        }
    }

    authenticateUser() {
        if (this.currentUser && this.socket?.connected) {
            const token = localStorage.getItem('token') || localStorage.getItem('authToken');
            if (token) {
                this.socket.emit('authenticate', {
                    token: token
                });
                console.log('🔐 User authentication sent with JWT token');
            } else {
                console.error('❌ No JWT token found for authentication');
            }
        }
    }

    joinUserRoom() {
        if (this.currentUser && this.socket?.connected) {
            this.socket.emit('join_user_room', {
                userId: this.currentUser.id
            });
        }
    }

    // === MESSAGE HANDLERS ===
    initMessageHandlers() {
        if (!this.socket) return;

        // Authentication events
        this.socket.on('authenticated', (data) => this.handleAuthenticated(data));
        this.socket.on('authentication_failed', (data) => this.handleAuthenticationFailed(data));

        // Telegram-style message events
        this.socket.on('new_message', (message, ack) => {
            console.log('🔔 Socket received new_message event:', message);
            this.handleIncomingMessage(message);
            // Send acknowledgment that message was received
            if (ack) ack({ received: true, timestamp: Date.now() });
        });
        this.socket.on('message', (message) => {
            console.log('🔔 Socket received message event:', message);
            this.handleIncomingMessage(message);
        });
        this.socket.on('broadcast_message', (message) => {
            console.log('🔔 Socket received broadcast_message event:', message);
            this.handleIncomingMessage(message);
        });
        this.socket.on('message_sent', (data) => this.handleMessageSent(data));
        this.socket.on('message_delivered', (data) => this.handleMessageDelivered(data));
        this.socket.on('typing_start', (data) => this.handleTypingStart(data));
        this.socket.on('typing_stop', (data) => this.handleTypingStop(data));
        this.socket.on('room_joined', (data) => this.handleRoomJoined(data));
        this.socket.on('join_room_error', (data) => this.handleJoinRoomError(data));
    }

    handleAuthenticated(data) {
        console.log('✅ Socket.IO authentication successful:', data);
        console.log('🔗 Socket ID:', this.socket.id);
        console.log('👤 Authenticated user:', data.user);
        this.isAuthenticated = true;
        
        // Store current user info for debugging
        this.currentUser = data.user;
        
        // Join current chat room if we have one
        if (this.currentChat) {
            console.log('📱 Joining chat room:', this.currentChat.id);
            this.socket.emit('join_room', { roomId: this.currentChat.id });
        }
    }

    handleAuthenticationFailed(data) {
        console.error('❌ Socket.IO authentication failed:', data);
        this.isAuthenticated = false;
        // Try to refresh the token or redirect to login
    }

    handleIncomingMessage(message) {
        console.log('📨 Incoming Telegram message:', message);
        console.log('📨 Raw message structure:', JSON.stringify(message, null, 2));
        
        if (!message || !message.id) {
            console.warn('⚠️ Invalid message received');
            return;
        }

        // Store message in Telegram-style storage
        const telegramMessage = {
            id: message.id,
            text: message.text || message.content || '',
            senderId: message.senderId,
            senderName: message.senderName || 'Unknown',
            chatId: message.chatId || message.conversationId || message.senderId,
            timestamp: new Date(message.timestamp),
            type: message.type || 'text',
            status: 'received'
        };

        this.messages.set(message.id, telegramMessage);
        
        console.log('🎯 Processing incoming message for chat:', telegramMessage.chatId);
        console.log('🎯 Current chat ID:', this.currentChat?.id);
        console.log('🎯 Message senderId:', telegramMessage.senderId);
        console.log('🎯 Current user ID:', this.currentUser?.id);

        // ALWAYS update the conversations list first (like Telegram)
        this.updateConversationsList(telegramMessage);
        
        // Improved matching: Check if message belongs to current chat
        // For 1-on-1 chats, message belongs to current chat if:
        // 1. chatId matches current chat ID, OR
        // 2. senderId matches current chat ID (message from the person we're chatting with), OR  
        // 3. message is from current user to current chat partner
        const belongsToCurrentChat = this.currentChat && (
            telegramMessage.chatId === this.currentChat.id ||
            telegramMessage.senderId === this.currentChat.id ||
            (telegramMessage.senderId === this.currentUser?.id && this.currentChat.id)
        );
        
        console.log('🎯 Message belongs to current chat:', belongsToCurrentChat);
        
        // If we're currently viewing this chat, show the message immediately
        if (belongsToCurrentChat) {
            console.log('✅ Adding message to current chat view');
            this.renderMessage(telegramMessage);
            this.scrollToBottom();
        } else {
            console.log('📱 Message for different chat, updated conversations list only');
            // Show notification/badge for other chats
            this.showNotificationBadge(telegramMessage.chatId);
        }
    }

    handleMessageSent(data) {
        console.log('✅ Message sent confirmation:', data);
        this.updateMessageStatus(data.messageId, 'sent');
    }

    handleMessageDelivered(data) {
        console.log('📨 Message delivered:', data);
        this.updateMessageStatus(data.messageId, 'delivered');
    }

    handleRoomJoined(data) {
        console.log('🏠 Room joined successfully:', data);
        console.log('🏠 Connected users in room:', data.users || 'Not provided');
        console.log('🏠 Room ID:', data.roomId || data.room);
    }

    handleJoinRoomError(data) {
        console.error('❌ Failed to join room:', data);
    }

    handleTypingStart(data) {
        this.typingUsers.add(data.username);
        this.updateTypingIndicator();
    }

    handleTypingStop(data) {
        this.typingUsers.delete(data.username);
        this.updateTypingIndicator();
    }

    // === CHAT MANAGEMENT ===
    async loadChat(chatId) {
        console.log('💬 Loading Telegram chat:', chatId);
        
        // Validate chat ID
        if (!chatId || chatId === 'undefined' || chatId === 'null') {
            console.error('❌ Invalid chat ID for loadChat:', chatId);
            this.showError('Không thể tải cuộc trò chuyện: ID không hợp lệ');
            return;
        }
        
        try {
            // Store current chat
            this.currentChat = { id: chatId };
            localStorage.setItem('currentChatId', chatId);
            
            // Remove unread badge when opening chat (like Telegram)
            this.clearNotificationBadge(chatId);
            
            // Show chat window and hide placeholder
            const chatWindow = document.getElementById('chat-window');
            const placeholder = document.getElementById('empty-chat-placeholder');
            
            if (chatWindow) {
                chatWindow.classList.remove('hidden');
                chatWindow.style.display = 'flex';
                console.log('✅ Chat window shown');
            }
            
            if (placeholder) {
                placeholder.classList.add('hidden');
                placeholder.style.display = 'none';
                console.log('✅ Placeholder hidden');
            }
            
            // Update chat header with saved user info
            const savedChatUser = localStorage.getItem('currentChatUser');
            if (savedChatUser) {
                try {
                    const chatUser = JSON.parse(savedChatUser);
                    updateChatHeader(chatUser.name, chatUser.avatar);
                } catch (e) {
                    console.warn('Failed to parse saved chat user:', e);
                }
            }
            
            // Join chat room
            if (this.socket?.connected) {
                console.log('📱 Emitting join_room for chatId:', chatId);
                console.log('📱 Socket connected status:', this.socket.connected);
                console.log('📱 Socket authenticated status:', this.isAuthenticated);
                this.socket.emit('join_room', { roomId: chatId });
            } else {
                console.warn('⚠️ Socket not connected, cannot join room');
            }
            
            // Load messages from API
            const messages = await this.fetchMessagesFromAPI(chatId);
            console.log('📥 Fetched messages:', messages.length, messages);
            
            // Clear and render messages
            this.clearMessageContainer();
            console.log('🧹 Cleared message container');
            
            messages.forEach(msg => {
                this.messages.set(msg.id, msg);
                this.renderMessage(msg);
            });
            
            console.log('🎨 Rendered all messages to DOM');
            
            this.scrollToBottom();
            this.updateUI();
            
            console.log(`✅ Loaded ${messages.length} messages for chat ${chatId}`);
            
        } catch (error) {
            console.error('❌ Chat load failed:', error);
            this.showError('Không thể tải cuộc trò chuyện');
        }
    }

    async fetchMessagesFromAPI(chatId) {
        console.log('📡 Fetching messages from Telegram API...');
        
        const response = await fetch(`/api/conversations/${chatId}/messages`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        
        if (!data.success || !data.messages) {
            throw new Error(data.message || 'Failed to load messages');
        }

        console.log(`📬 Fetched ${data.messages.length} messages from server`);
        console.log('🔍 Raw message data from server:', data.messages);

        // Convert to internal Telegram format
        return data.messages.map(msg => {
            console.log('📝 Processing message:', msg);
            
            // Be more conservative: only mark as own if user ID matches exactly
            const currentUserId = this.currentUser?.id;
            const isOwnMessage = currentUserId && msg.senderId === currentUserId;
            
            return {
                id: msg.id || msg._id,
                text: msg.text || msg.content || '', // Use text field first (decrypted), fallback to content
                senderId: msg.senderId,
                senderName: msg.senderName || 'Unknown',
                chatId: chatId,
                timestamp: new Date(msg.timestamp),
                type: msg.type || 'text',
                status: isOwnMessage ? 'sent' : 'received' // Only mark as sent if definitely from current user
            };
        });
    }

    // === MESSAGE SENDING ===
    async sendMessage(text) {
        if (!text?.trim() || !this.currentChat) {
            return;
        }

        // Ensure we have current user info
        if (!this.currentUser) {
            // Try to get user from localStorage or token
            const token = localStorage.getItem('token');
            if (token) {
                try {
                    const tokenData = JSON.parse(atob(token.split('.')[1]));
                    console.log('🔍 Token data:', tokenData);
                    this.currentUser = {
                        id: tokenData.userId,
                        name: tokenData.name || tokenData.username || tokenData.fullName || 'Unknown User',
                        email: tokenData.email
                    };
                    console.log('🔄 Retrieved user from token:', this.currentUser);
                } catch (e) {
                    console.error('❌ Failed to parse token for user info:', e);
                }
            }
        }

        if (!this.currentUser || !this.currentUser.id) {
            console.error('❌ Cannot send message: currentUser not available');
            this.showError('Không thể gửi tin nhắn: Thông tin người dùng không có');
            return;
        }

        const message = {
            id: this.generateMessageId(),
            text: text.trim(),
            senderId: this.currentUser.id,
            senderName: this.currentUser.name,
            chatId: this.currentChat.id,
            timestamp: new Date(),
            type: 'text',
            status: 'sending'
        };

        console.log('📤 Sending Telegram message:', message);

        // Add to local storage
        this.messages.set(message.id, message);
        this.renderMessage(message);
        this.scrollToBottom();

        try {
            // Send via Socket.IO if connected and authenticated
            if (this.socket?.connected && this.isAuthenticated) {
                this.socket.emit('send_message', {
                    messageId: message.id,
                    text: message.text,
                    chatId: this.currentChat.id,
                    senderId: this.currentUser.id,
                    senderName: this.currentUser.name,
                    timestamp: message.timestamp.toISOString()
                });
                
                console.log('📡 Message sent via Socket.IO (authenticated)');
            } else {
                // Fallback to API
                console.log('🔄 Using API fallback (Socket.IO not available/authenticated)');
                await this.sendMessageViaAPI(message);
                console.log('📡 Message sent via API fallback');
            }

            // Update status
            message.status = 'sent';
            this.updateMessageStatus(message.id, 'sent');
            
            // Real-time messaging should handle persistence automatically
            // No need to reload messages manually

        } catch (error) {
            console.error('❌ Send failed:', error);
            message.status = 'failed';
            this.updateMessageStatus(message.id, 'failed');
        }
    }

    async sendMessageViaAPI(message) {
        console.log('📤 Sending message via API:', message);
        
        const response = await fetch(`/api/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
            },
            body: JSON.stringify({
                receiverId: message.chatId,
                content: message.text,
                isEncrypted: false
            })
        });

        console.log('📡 API Response status:', response.status);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API Error:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const result = await response.json();
        console.log('✅ API Response:', result);
        
        if (!result.success) {
            throw new Error(result.message || 'Send failed');
        }
        
        return result;
    }
    
    async loadMessagesForCurrentChat() {
        if (!this.currentChat || !this.currentChat.id) {
            console.log('❌ No current chat to reload messages for');
            return;
        }
        
        console.log('🔄 Reloading messages for chat:', this.currentChat.id);
        await this.loadChat(this.currentChat.id);
    }

    // === UI RENDERING ===
    renderMessage(message) {
        const container = document.querySelector('#messages-container');
        if (!container) {
            console.error('❌ Messages container not found! Looking for #messages-container');
            return;
        }

        // Determine other user ID for decryption
        const currentUserId = this.currentUser?.id;
        const otherUserId = this.currentChat; // currentChat contains the ID of the other user
        
        // Decrypt message if it's encrypted
        const decryptedText = this.decryptMessageText(message.text, otherUserId);
        const displayText = decryptedText || message.text; // Fallback to original if decryption fails

        // Simplified logic: Only use reliable criteria to determine if message is from current user
        const currentUserName = this.currentUser?.name || localStorage.getItem('userName');
        
        // Primary check: Compare user IDs (most reliable)
        let isOwn = false;
        
        if (currentUserId && message.senderId) {
            isOwn = message.senderId === currentUserId;
        } else if (currentUserName && message.senderName) {
            // Fallback: Compare names, but be more specific
            isOwn = message.senderName === currentUserName;
        } else {
            // Last resort: Check if this is a message we just sent (has generating ID or sending status)
            isOwn = message.status === 'sending' || 
                   (message.id && message.id.startsWith('mee')); // Our generated message IDs start with 'mee'
        }
        
        const timeStr = message.timestamp.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        console.log('🎨 Rendering Telegram message:', {
            text: message.text,
            isOwn,
            senderId: message.senderId,
            currentUserId: currentUserId,
            senderName: message.senderName,
            currentUserName: currentUserName,
            container: !!container
        });
        
        // DEBUG: Enhanced debugging for message positioning
        console.log('🔍 Enhanced Message positioning debug:', {
            'message.senderId': message.senderId,
            'currentUserId': currentUserId,
            'message.senderName': message.senderName,
            'currentUserName': currentUserName,
            'message.status': message.status,
            'message.id': message.id,
            'isOwn FINAL': isOwn,
            'currentUser object': this.currentUser
        });

        const messageEl = document.createElement('div');
        messageEl.className = `message-item ${isOwn ? 'own' : 'other'}`;
        messageEl.setAttribute('data-message-id', message.id);

        // Check if message is long (hash-like or very long text)
        const isLongMessage = displayText.length > 50;
        const isHashLike = /^[a-f0-9]{32,}/.test(displayText) || displayText.includes(':');
        const maxWidthClass = isLongMessage ? 'max-w-md lg:max-w-lg' : 'max-w-xs lg:max-w-md';
        
        // Special styling for hash-like messages
        const messageTextClass = isHashLike ? 
            'message-text break-words font-mono text-xs leading-tight' : 
            'message-text break-words';

        messageEl.innerHTML = `
            <div class="${maxWidthClass} px-4 py-2 rounded-lg ${
                isOwn 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-700 text-gray-100'
            } ${isLongMessage ? 'message-long' : ''}">
                ${!isOwn ? `<div class="text-xs text-gray-400 mb-1">${message.senderName}</div>` : ''}
                <div class="${messageTextClass}">${this.escapeHtml(displayText)}</div>
                <div class="text-xs ${isOwn ? 'text-blue-200' : 'text-gray-500'} mt-1 flex items-center ${isOwn ? 'justify-end' : 'justify-start'}">
                    <span>${timeStr}</span>
                    ${isOwn ? `<span class="ml-1">${this.getStatusIcon(message.status)}</span>` : ''}
                </div>
            </div>
        `;

        container.appendChild(messageEl);
        console.log('✅ Message element added to container:', messageEl);
    }

    getStatusIcon(status) {
        switch (status) {
            case 'sending': return '<span class="ml-1">⏳</span>';
            case 'sent': return '<span class="ml-1">✓</span>';
            case 'delivered': return '<span class="ml-1">✓✓</span>';
            case 'failed': return '<span class="ml-1 text-red-400">❌</span>';
            default: return '';
        }
    }

    updateMessageStatus(messageId, status) {
        const message = this.messages.get(messageId);
        if (message) {
            message.status = status;
            const messageEl = document.querySelector(`[data-message-id="${messageId}"]`);
            const statusEl = messageEl?.querySelector('.text-xs span:last-child');
            if (statusEl) {
                statusEl.innerHTML = this.getStatusIcon(status);
            }
        }
    }

    clearMessageContainer() {
        const container = document.querySelector('#messages-container');
        if (container) {
            container.innerHTML = '';
        }
    }

    scrollToBottom() {
        const container = document.querySelector('#messages-container');
        if (container) {
            container.scrollTop = container.scrollHeight;
        }
    }

    updateConnectionStatus() {
        const statusIndicator = document.getElementById('connection-status');
        if (statusIndicator) {
            if (this.isOnline) {
                statusIndicator.className = 'flex items-center space-x-2 text-green-400 text-sm';
                statusIndicator.innerHTML = `
                    <div class="w-2 h-2 bg-green-400 rounded-full"></div>
                    <span>Đã kết nối</span>
                `;
            } else {
                statusIndicator.className = 'flex items-center space-x-2 text-red-400 text-sm';
                statusIndicator.innerHTML = `
                    <div class="w-2 h-2 bg-red-400 rounded-full"></div>
                    <span>Mất kết nối</span>
                `;
            }
        }
    }

    updateUI() {
        // Update chat layout
        const chatWindow = document.getElementById('chat-window');
        const emptyPlaceholder = document.getElementById('empty-chat-placeholder');
        
        console.log('🔄 Updating UI state:', {
            hasCurrentChat: !!this.currentChat,
            chatWindow: !!chatWindow,
            emptyPlaceholder: !!emptyPlaceholder
        });
        
        if (this.currentChat) {
            if (chatWindow) {
                chatWindow.classList.remove('hidden');
                chatWindow.style.setProperty('display', 'flex');
                console.log('✅ Chat window shown');
            }
            if (emptyPlaceholder) {
                emptyPlaceholder.classList.add('hidden');
                emptyPlaceholder.style.setProperty('display', 'none');
                console.log('✅ Empty placeholder hidden');
            }
        } else {
            if (chatWindow) {
                chatWindow.classList.add('hidden');
                chatWindow.style.setProperty('display', 'none');
                console.log('❌ Chat window hidden');
            }
            if (emptyPlaceholder) {
                emptyPlaceholder.classList.remove('hidden');
                emptyPlaceholder.style.setProperty('display', 'flex');
                console.log('❌ Empty placeholder shown');
            }
        }
    }

    updateChatLastMessage(message) {
        // Update conversation list last message
        try {
            const conversationItem = document.querySelector(`[data-conversation-id="${message.chatId}"]`);
            if (conversationItem) {
                // Update last message text
                const lastMessageEl = conversationItem.querySelector('.last-message');
                if (lastMessageEl) {
                    const truncatedText = message.text.length > 30 
                        ? message.text.substring(0, 30) + '...' 
                        : message.text;
                    lastMessageEl.textContent = truncatedText;
                }
                
                // Update timestamp
                const timestampEl = conversationItem.querySelector('.timestamp');
                if (timestampEl) {
                    timestampEl.textContent = message.timestamp.toLocaleTimeString('vi-VN', {
                        hour: '2-digit',
                        minute: '2-digit'
                    });
                }
                
                // Move to top of conversation list
                const conversationsList = conversationItem.parentElement;
                if (conversationsList) {
                    conversationsList.insertBefore(conversationItem, conversationsList.firstChild);
                }
                
                console.log('📋 Updated conversation list for:', message.chatId);
            }
        } catch (error) {
            console.error('❌ Failed to update conversation list:', error);
        }
    }

    updateTypingIndicator() {
        // Implement typing indicator like Telegram
        const typingContainer = document.getElementById('typing-indicator');
        
        if (this.typingUsers.size === 0) {
            // Hide typing indicator
            if (typingContainer) {
                typingContainer.classList.add('hidden');
                typingContainer.innerHTML = '';
            }
            return;
        }
        
        // Show typing indicator
        if (typingContainer) {
            typingContainer.classList.remove('hidden');
            
            const typingArray = Array.from(this.typingUsers);
            let typingText = '';
            
            if (typingArray.length === 1) {
                typingText = `${typingArray[0]} đang nhập...`;
            } else if (typingArray.length === 2) {
                typingText = `${typingArray[0]} và ${typingArray[1]} đang nhập...`;
            } else {
                typingText = `${typingArray[0]} và ${typingArray.length - 1} người khác đang nhập...`;
            }
            
            typingContainer.innerHTML = `
                <div class="flex items-center space-x-2 px-4 py-2 text-sm text-gray-400">
                    <div class="flex space-x-1">
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: 0.2s"></div>
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style="animation-delay: 0.4s"></div>
                    </div>
                    <span>${typingText}</span>
                </div>
            `;
            
            console.log('⌨️ Updated typing indicator:', typingText);
        } else {
            console.warn('⚠️ Typing indicator container not found');
        }
    }

    // === SESSION MANAGEMENT ===
    requestNotificationPermission() {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                console.log('🔔 Notification permission:', permission);
            });
        }
    }

    restoreSession() {
        const savedChatId = localStorage.getItem('currentChatId');
        if (savedChatId) {
            console.log('🔄 Restoring Telegram session for chat:', savedChatId);
            setTimeout(() => {
                this.loadChat(savedChatId);
            }, 1000);
        }
    }

    // === UTILITIES ===
    generateMessageId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }

    // Decrypt message text if it's encrypted
    decryptMessageText(encryptedText, otherUserId) {
        try {
            // Check if message appears to be encrypted (format: hash1:hash2)
            if (!encryptedText || !encryptedText.includes(':')) {
                return encryptedText; // Not encrypted, return as-is
            }

            // Check if E2EEncryption is available (from messages.html)
            if (typeof E2EEncryption === 'undefined') {
                console.warn('E2EEncryption not available, returning encrypted text');
                return encryptedText;
            }

            const currentUserId = this.currentUser?.id;
            if (!currentUserId || !otherUserId) {
                console.warn('Missing user IDs for decryption');
                return encryptedText;
            }

            // Generate room key for this conversation
            const roomKey = E2EEncryption.generateRoomKey(currentUserId, otherUserId);
            
            // Try to decrypt the message
            const decryptedText = E2EEncryption.decryptMessage(encryptedText, roomKey);
            
            // If decryption succeeds and returns valid text, use it
            if (decryptedText && decryptedText !== encryptedText && decryptedText.trim()) {
                console.log('✅ Message decrypted successfully');
                return decryptedText;
            } else {
                console.warn('Decryption failed or returned empty, using encrypted text');
                return encryptedText;
            }
        } catch (error) {
            console.error('Error during message decryption:', error);
            return encryptedText; // Fallback to encrypted text
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Update conversations list in real-time (like Telegram)
    updateConversationsList(message) {
        console.log('🔄 Updating conversations list with new message:', message);
        
        const conversationsList = document.getElementById('conversations-list');
        if (!conversationsList) {
            console.warn('⚠️ Conversations list not found');
            return;
        }

        // Find existing conversation item
        const conversationItem = conversationsList.querySelector(`[data-user-id="${message.chatId}"]`);
        
        if (conversationItem) {
            // Update existing conversation
            console.log('📝 Updating existing conversation preview');
            
            // Update last message preview
            const lastMessageEl = conversationItem.querySelector('.text-sm.text-gray-400');
            if (lastMessageEl) {
                lastMessageEl.textContent = message.text.length > 30 ? 
                    message.text.substring(0, 30) + '...' : message.text;
            }
            
            // Update timestamp
            const timeEl = conversationItem.querySelector('.text-xs.text-gray-500');
            if (timeEl) {
                timeEl.textContent = this.formatTime(message.timestamp);
            }
            
            // Move to top of list (like Telegram)
            conversationsList.insertBefore(conversationItem, conversationsList.firstChild);
        } else {
            // Create new conversation item if not exists
            console.log('➕ Creating new conversation item');
            window.loadRealConversations(); // Reload conversations to get the new one
        }
    }

    // Show notification badge (like Telegram's unread count)
    showNotificationBadge(chatId) {
        console.log('🔴 Adding notification badge for chat:', chatId);
        
        const conversationItem = document.querySelector(`[data-user-id="${chatId}"]`);
        if (conversationItem) {
            // Add unread badge
            let badge = conversationItem.querySelector('.unread-badge');
            if (!badge) {
                badge = document.createElement('div');
                badge.className = 'unread-badge bg-blue-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center ml-auto';
                badge.textContent = '1';
                
                // Add to conversation item
                const contentDiv = conversationItem.querySelector('.flex.items-center.gap-4');
                if (contentDiv) {
                    contentDiv.appendChild(badge);
                }
            } else {
                // Increment badge count
                const count = parseInt(badge.textContent) || 0;
                badge.textContent = count + 1;
            }
        }
    }

    formatTime(timestamp) {
        const now = new Date();
        const messageTime = new Date(timestamp);
        const diff = now - messageTime;
        
        if (diff < 60000) { // Less than 1 minute
            return 'now';
        } else if (diff < 3600000) { // Less than 1 hour
            return Math.floor(diff / 60000) + 'm';
        } else if (diff < 86400000) { // Less than 1 day
            return Math.floor(diff / 3600000) + 'h';
        } else {
            return messageTime.toLocaleDateString();
        }
    }

    // Clear notification badge when user opens chat
    clearNotificationBadge(chatId) {
        console.log('🧹 Clearing notification badge for chat:', chatId);
        
        const conversationItem = document.querySelector(`[data-user-id="${chatId}"]`);
        if (conversationItem) {
            const badge = conversationItem.querySelector('.unread-badge');
            if (badge) {
                badge.remove();
            }
        }
    }

    showNotification(message) {
        console.log('🔔 Telegram notification:', message.text);
        
        // Check if notifications are supported and permitted
        if (!('Notification' in window)) {
            console.warn('⚠️ Browser does not support notifications');
            return;
        }
        
        // Request permission if needed
        if (Notification.permission === 'default') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    this.displayNotification(message);
                }
            });
        } else if (Notification.permission === 'granted') {
            this.displayNotification(message);
        }
        
        // Also show in-page notification
        this.showInPageNotification(message);
    }
    
    displayNotification(message) {
        try {
            const notification = new Notification(`Tin nhắn từ ${message.senderName}`, {
                body: message.text.length > 100 ? message.text.substring(0, 100) + '...' : message.text,
                icon: '/assets/images/logo.png',
                badge: '/assets/images/badge.png',
                tag: `message-${message.chatId}`,
                requireInteraction: false,
                silent: false
            });
            
            notification.onclick = () => {
                window.focus();
                this.loadChat(message.chatId);
                notification.close();
            };
            
            // Auto close after 5 seconds
            setTimeout(() => {
                notification.close();
            }, 5000);
            
            console.log('🔔 Push notification sent');
        } catch (error) {
            console.error('❌ Failed to show push notification:', error);
        }
    }
    
    showInPageNotification(message) {
        // Create in-page notification toast
        const toast = document.createElement('div');
        toast.className = 'fixed top-4 right-4 bg-gray-800 text-white px-4 py-3 rounded-lg shadow-lg z-50 max-w-sm';
        toast.innerHTML = `
            <div class="flex items-start space-x-3">
                <div class="flex-shrink-0">
                    <div class="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center text-sm font-medium">
                        ${message.senderName.charAt(0).toUpperCase()}
                    </div>
                </div>
                <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm">${message.senderName}</p>
                    <p class="text-sm text-gray-300 truncate">${message.text}</p>
                </div>
                <button class="text-gray-400 hover:text-white" onclick="this.parentElement.parentElement.remove()">
                    ✕
                </button>
            </div>
        `;
        
        // Add click handler to open chat
        toast.addEventListener('click', (e) => {
            if (e.target.tagName !== 'BUTTON') {
                this.loadChat(message.chatId);
                toast.remove();
            }
        });
        
        document.body.appendChild(toast);
        
        // Auto remove after 4 seconds
        setTimeout(() => {
            if (toast.parentElement) {
                toast.remove();
            }
        }, 4000);
    }

    showError(error) {
        console.error('❌ Telegram error:', error);
        
        // Create user-friendly error toast
        const errorToast = document.createElement('div');
        errorToast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-md';
        
        // Determine user-friendly message
        let userMessage = 'Đã xảy ra lỗi không xác định';
        
        if (typeof error === 'string') {
            if (error.includes('Không thể tải')) {
                userMessage = 'Không thể tải tin nhắn. Vui lòng thử lại.';
            } else if (error.includes('Failed to load')) {
                userMessage = 'Mất kết nối với máy chủ. Vui lòng kiểm tra internet.';
            } else if (error.includes('Send failed')) {
                userMessage = 'Không thể gửi tin nhắn. Vui lòng thử lại.';
            } else if (error.includes('HTTP 401')) {
                userMessage = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
            } else if (error.includes('HTTP 403')) {
                userMessage = 'Bạn không có quyền thực hiện thao tác này.';
            } else if (error.includes('HTTP 500')) {
                userMessage = 'Lỗi máy chủ. Vui lòng thử lại sau.';
            } else {
                userMessage = error;
            }
        } else if (error?.message) {
            userMessage = error.message;
        }
        
        errorToast.innerHTML = `
            <div class="flex items-center space-x-3">
                <div class="flex-shrink-0">
                    <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                </div>
                <div class="flex-1">
                    <p class="font-medium text-sm">Lỗi</p>
                    <p class="text-sm text-red-100">${userMessage}</p>
                </div>
                <button class="text-red-200 hover:text-white ml-2" onclick="this.parentElement.parentElement.remove()">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;
        
        document.body.appendChild(errorToast);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (errorToast.parentElement) {
                errorToast.remove();
            }
        }, 5000);
        
        // Add slide-in animation
        errorToast.style.transform = 'translate(-50%, -20px)';
        errorToast.style.opacity = '0';
        requestAnimationFrame(() => {
            errorToast.style.transition = 'all 0.3s ease-out';
            errorToast.style.transform = 'translate(-50%, 0)';
            errorToast.style.opacity = '1';
        });
        
        // Provide action buttons for specific errors
        if (userMessage.includes('đăng nhập lại')) {
            this.addErrorAction(errorToast, 'Đăng nhập', () => {
                window.location.href = '/pages/login.html';
            });
        } else if (userMessage.includes('thử lại')) {
            this.addErrorAction(errorToast, 'Thử lại', () => {
                if (this.currentChat) {
                    this.loadChat(this.currentChat.id);
                }
                errorToast.remove();
            });
        }
    }
    
    addErrorAction(errorToast, buttonText, action) {
        const actionButton = document.createElement('button');
        actionButton.className = 'ml-3 bg-white bg-opacity-20 hover:bg-opacity-30 px-3 py-1 rounded text-sm font-medium transition-all';
        actionButton.textContent = buttonText;
        actionButton.onclick = action;
        
        const buttonContainer = errorToast.querySelector('.flex-1');
        buttonContainer.appendChild(actionButton);
    }

    // === UI INITIALIZATION ===
    initUI() {
        this.initMessageInput();
        this.initSendButton();
    }

    initMessageInput() {
        this.messageInput = document.getElementById('message-input');
        if (this.messageInput) {
            // Handle Enter key
            this.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
            
            // Handle typing indicator
            let typingTimer;
            this.messageInput.addEventListener('input', () => {
                if (this.currentChat && this.socket?.connected) {
                    // Send typing start
                    this.socket.emit('typing_start', {
                        chatId: this.currentChat.id,
                        username: this.currentUser?.name || 'Unknown'
                    });
                    
                    // Clear existing timer
                    clearTimeout(typingTimer);
                    
                    // Set timer to stop typing after 2 seconds of inactivity
                    typingTimer = setTimeout(() => {
                        this.socket.emit('typing_stop', {
                            chatId: this.currentChat.id,
                            username: this.currentUser?.name || 'Unknown'
                        });
                    }, 2000);
                }
            });
            
            // Handle blur (stop typing when input loses focus)
            this.messageInput.addEventListener('blur', () => {
                clearTimeout(typingTimer);
                if (this.currentChat && this.socket?.connected) {
                    this.socket.emit('typing_stop', {
                        chatId: this.currentChat.id,
                        username: this.currentUser?.name || 'Unknown'
                    });
                }
            });
        }
    }

    initSendButton() {
        this.sendButton = document.getElementById('send-button');
        if (this.sendButton) {
            this.sendButton.addEventListener('click', () => {
                this.handleSendMessage();
            });
        }
    }

    handleSendMessage() {
        const text = this.messageInput?.value?.trim();
        if (text) {
            this.sendMessage(text);
            this.messageInput.value = '';
        }
    }
}

// === TELEGRAM-STYLE GLOBAL SETUP ===
window.TelegramMessaging = TelegramMessaging;

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 DOM Content Loaded - Initializing Telegram messaging');
    
    window.telegramMessaging = new TelegramMessaging();
    
    // Also set as realTimeMessaging for compatibility
    window.realTimeMessaging = window.telegramMessaging;
    
    // Force load conversations after a short delay
    setTimeout(() => {
        console.log('📋 Force loading conversations...');
        if (typeof window.loadRealConversations === 'function') {
            window.loadRealConversations();
        } else {
            console.error('❌ loadRealConversations function not found!');
        }
    }, 1000);
});

// Global conversation selection (Telegram-style)
window.selectConversation = function(conversationId, userName, userAvatar) {
    console.log('🎯 Telegram: Selecting conversation:', conversationId, userName);
    
    // Validate conversation ID
    if (!conversationId || conversationId === 'undefined' || conversationId === 'null') {
        console.error('❌ Invalid conversation ID:', conversationId);
        window.showTelegramError('Không thể chọn cuộc trò chuyện: ID không hợp lệ');
        return;
    }
    
    if (window.telegramMessaging) {
        // Save chat user info
        localStorage.setItem('currentChatUser', JSON.stringify({
            name: userName,
            avatar: userAvatar
        }));
        
        // Update chat header immediately
        updateChatHeader(userName, userAvatar);
        
        // Load the chat
        window.telegramMessaging.loadChat(conversationId);
        
        // Update UI active state
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-conversation-id="${conversationId}"]`)?.classList.add('active');
    }
};

// Function to update chat header
function updateChatHeader(userName, userAvatar) {
    console.log('📋 Updating chat header:', userName);
    
    // Find the chat header elements
    const chatTitle = document.querySelector('#chat-window h2, #chat-window h3, .chat-header h2, .chat-header h3');
    const chatAvatar = document.querySelector('#chat-window img, .chat-header img');
    const chatStatus = document.querySelector('#chat-window .text-green-400, .chat-header .text-green-400');
    
    console.log('🔍 Header elements found:', {
        title: !!chatTitle,
        avatar: !!chatAvatar,
        status: !!chatStatus
    });
    
    // Update title
    if (chatTitle) {
        chatTitle.textContent = userName;
        console.log('✅ Updated chat title to:', userName);
    }
    
    // Update avatar
    if (chatAvatar) {
        chatAvatar.src = userAvatar || `https://placehold.co/40x40/4F46E5/FFFFFF?text=${userName.charAt(0).toUpperCase()}`;
        chatAvatar.alt = userName;
        console.log('✅ Updated chat avatar');
    }
    
    // Update status
    if (chatStatus) {
        chatStatus.textContent = 'Hoạt động';
        console.log('✅ Updated chat status');
    }
}

// Load conversations function with modern MessageManager
window.loadRealConversations = async function() {
    try {
        console.log('📋 Loading Telegram conversations...');
        
        // Show loading state
        const conversationsList = document.getElementById('conversations-list');
        if (conversationsList) {
            conversationsList.innerHTML = `
                <div class="p-4 text-center text-gray-400">
                    <div class="animate-pulse">📡 Đang tải cuộc trò chuyện...</div>
                </div>
            `;
        }
        
        let conversations = [];
        
        // Try to use MessageManager first
        if (window.messageManager) {
            console.log('� Using MessageManager for conversations...');
            try {
                conversations = await window.messageManager.fetchConversations();
                console.log('✅ MessageManager loaded conversations:', conversations.length);
            } catch (error) {
                console.warn('⚠️ MessageManager failed, using fallback:', error.message);
                conversations = await loadConversationsFallback();
            }
        } else {
            console.warn('⚠️ MessageManager not available, using fallback');
            conversations = await loadConversationsFallback();
        }
        
        if (conversations && conversations.length > 0) {
            console.log(`✅ Loaded ${conversations.length} Telegram conversations`);
            console.log('📋 First conversation details:', conversations[0]);
            window.renderConversations(conversations);
        } else {
            console.warn('⚠️ No conversations loaded');
            showEmptyConversations();
        }
        
    } catch (error) {
        console.error('❌ Load Telegram conversations failed:', error);
        console.error('❌ Error details:', error.message, error.stack);
        showEmptyConversations();
    }
};

// Fallback conversation loading
async function loadConversationsFallback() {
    const token = window.userManager?.getAuthToken() || localStorage.getItem('token') || '';
    
    const response = await fetch('/api/conversations', {
        headers: {
            'Authorization': `Bearer ${token}`
        }
    });

    console.log('🔍 API Response status:', response.status);

    if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API response not ok:', response.status, response.statusText);
        console.error('❌ Error response body:', errorText);
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('🔍 API Response full data:', data);
    console.log('🔍 API Response conversations array:', data.conversations);
    
    if (data.conversations && data.conversations.length > 0) {
        console.log('🔍 First conversation raw structure:', JSON.stringify(data.conversations[0], null, 2));
    }
    
    if (data.success && data.conversations) {
        return data.conversations;
    } else {
        throw new Error('No conversations in response or success=false');
    }
}

// Show empty state
function showEmptyConversations() {
    const conversationsList = document.getElementById('conversations-list');
    if (conversationsList) {
        conversationsList.innerHTML = `
            <div class="p-4 text-center text-gray-400">
                <div class="mb-4">
                    <svg class="w-16 h-16 mx-auto text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                    </svg>
                </div>
                <p class="text-lg font-medium">Chưa có cuộc trò chuyện</p>
                <p class="text-sm mt-2">Tìm bạn bè để bắt đầu chat!</p>
                <button onclick="window.location.href='discovery.html'" class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors">
                    Tìm bạn bè
                </button>
            </div>
        `;
    }
}

// Render conversations function with proper name display
window.renderConversations = function(conversations) {
    console.log('🎨 Rendering conversations:', conversations);
    
    const conversationsList = document.getElementById('conversations-list');
    if (!conversationsList) {
        console.error('❌ Conversations list element not found');
        return;
    }

    if (!conversations || conversations.length === 0) {
        conversationsList.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <p>📭 Chưa có cuộc trò chuyện nào</p>
                <p class="text-sm mt-2">Tìm bạn bè để bắt đầu chat!</p>
            </div>
        `;
        return;
    }

    // Get current user for comparison
    const currentUser = JSON.parse(localStorage.getItem('user') || localStorage.getItem('userInfo') || '{}');
    
    conversationsList.innerHTML = conversations.map(conv => {
        console.log('📋 Processing conversation:', conv);
        console.log('📋 Conversation keys:', Object.keys(conv));
        console.log('📋 Conversation participants:', conv.participants);
        
        // Get conversation ID - fix for new server structure  
        const conversationId = conv.partnerId || conv.id || conv._id || conv.conversationId || conv.otherUserId;
        
        if (!conversationId) {
            console.error('❌ No valid conversation ID found for:', conv);
            console.log('Available conversation properties:', Object.keys(conv));
            console.log('Conv.partnerId:', conv.partnerId, 'Conv.id:', conv.id, 'Conv._id:', conv._id);
            return ''; // Skip this conversation
        }
        
        console.log('✅ Found conversation ID:', conversationId);
        
        // Find the other participant - fix for new server structure
        let otherUser = null;
        
        // New structure: otherUser is directly available
        if (conv.otherUser) {
            otherUser = conv.otherUser;
            console.log('✅ Found otherUser from conv.otherUser:', otherUser);
        }
        // Fallback: check participants array (old structure)
        else if (conv.participants && Array.isArray(conv.participants) && conv.participants.length > 0) {
            otherUser = conv.participants.find(p => 
                (p.id || p._id) !== (currentUser.id || currentUser._id)
            );
            console.log('✅ Found otherUser from participants:', otherUser);
        }
        // Additional fallback
        else if (conv.user) {
            otherUser = conv.user;
            console.log('✅ Found otherUser from conv.user:', otherUser);
        }
        
        // Extract name safely
        let displayName = 'Người dùng';
        let avatar = 'https://placehold.co/48x48/4F46E5/FFFFFF?text=U';
        
        if (otherUser) {
            console.log('🔍 Debug otherUser name data:', {
                'otherUser.name': otherUser.name,
                'otherUser.fullName': otherUser.fullName,
                'otherUser.username': otherUser.username,
                'otherUser full object': otherUser
            });
            
            displayName = otherUser.name || otherUser.fullName || otherUser.username || 'Người dùng';
            
            console.log('📝 Final displayName chosen:', displayName);
            
            if (otherUser.avatar) {
                avatar = otherUser.avatar;
            } else {
                avatar = `https://placehold.co/48x48/4F46E5/FFFFFF?text=${displayName.charAt(0).toUpperCase()}`;
            }
        }
        
        console.log('👤 Rendering conversation with:', {
            conversationId,
            displayName,
            avatar,
            otherUser,
            originalConv: conv
        });
        
        const lastMessage = conv.lastMessage || {};
        const lastMessageText = lastMessage.content || lastMessage.text || 'Chưa có tin nhắn';
        const timestamp = lastMessage.timestamp ? 
            new Date(lastMessage.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 
            '';

        return `
            <div class="conversation-item p-4 hover:bg-gray-700/30 cursor-pointer border-b border-gray-700/30 transition-colors" 
                 data-conversation-id="${conversationId}"
                 onclick="selectConversation('${conversationId}', '${displayName.replace(/'/g, "\\'")}', '${avatar}')">
                <div class="flex items-center space-x-3">
                    <img src="${avatar}" alt="${displayName}" class="w-12 h-12 rounded-full object-cover">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between">
                            <h3 class="font-semibold text-white truncate">${displayName}</h3>
                            ${timestamp ? `<span class="text-xs text-gray-400 timestamp">${timestamp}</span>` : ''}
                        </div>
                        <p class="text-sm text-gray-400 truncate last-message">${lastMessageText}</p>
                    </div>
                </div>
            </div>
        `;
    }).filter(html => html.length > 0).join(''); // Filter out empty results
    
    console.log('✅ Conversations rendered successfully');
};

console.log('🚀 Telegram-style messaging system loaded');

// === CALLING SYSTEM INTEGRATION ===
class TelegramCallSystem {
    constructor() {
        this.currentCall = null;
        this.socket = null;
        this.ringtone = null;
        this.initializeCallButtons();
        this.initializeCallNotifications();
        this.initializeRingtone();
    }

    initializeRingtone() {
        // Create ringtone audio
        this.ringtone = new Audio();
        this.ringtone.loop = true;
        this.ringtone.volume = 0.7;
        
        // Use a simple beep pattern for ringtone
        this.ringtone.src = 'data:audio/wav;base64,UklGRsABAABXQVZFZm10IAAAAAABAAABBACJAQABBQAAAAVAEAAAE=';
    }

    initializeCallNotifications() {
        // Listen for incoming calls from socket
        document.addEventListener('DOMContentLoaded', () => {
            const messaging = window.telegramMessaging;
            if (messaging && messaging.socket) {
                messaging.socket.on('incoming_call', (data) => {
                    console.log('📞 Client: Received incoming_call signal:', data);
                    console.log('📞 Client: Current user ID:', messaging.currentUser?.id);
                    console.log('📞 Client: Caller ID:', data.callerId);
                    
                    // Only show notification if this user is the target (receiver)
                    const currentUserId = messaging.currentUser?.id;
                    if (currentUserId && data.callerId !== currentUserId) {
                        console.log('📞 Client: Showing incoming call notification');
                        this.showIncomingCallNotification(data);
                    } else {
                        console.log('📞 Client: Not showing notification - either no current user or caller is same as current user');
                    }
                });
                
                messaging.socket.on('call_initiated', (data) => {
                    // This is for the caller - show outgoing call status
                    this.showCallNotification('Đang gọi...', 'info');
                });
                
                messaging.socket.on('call_accepted', (data) => {
                    this.handleCallAccepted(data);
                });
                
                messaging.socket.on('call_rejected', (data) => {
                    this.handleCallRejected(data);
                });
                
                messaging.socket.on('call_ended', (data) => {
                    this.handleCallEnded(data);
                });
            }
        });
    }

    initializeCallButtons() {
        document.addEventListener('DOMContentLoaded', () => {
            const voiceCallBtn = document.getElementById('voice-call-btn');
            const videoCallBtn = document.getElementById('video-call-btn');

            if (voiceCallBtn) {
                voiceCallBtn.addEventListener('click', () => this.initiateCall('voice'));
            }
            if (videoCallBtn) {
                videoCallBtn.addEventListener('click', () => this.initiateCall('video'));
            }
        });
    }

    async initiateCall(type) {
        console.log(`📞 [TELEGRAM] Initiating ${type} call...`);
        
        // Step 1: Validate chat context (like Telegram)
        const currentChat = window.telegramMessaging?.currentChat;
        if (!currentChat || !currentChat.id) {
            this.showError('Vui lòng chọn cuộc trò chuyện để bắt đầu cuộc gọi');
            return;
        }

        // Step 2: Get user info (like Telegram's user resolution)
        const chatUserName = document.getElementById('chat-user-name')?.textContent || 'Unknown User';
        const chatUserAvatar = document.getElementById('chat-user-avatar')?.src || '';
        const currentUser = window.telegramMessaging.currentUser;

        if (!currentUser) {
            this.showError('Không thể xác định người dùng hiện tại');
            return;
        }

        console.log(`📞 [TELEGRAM] Call details:`, {
            caller: currentUser.name,
            target: chatUserName,
            type: type
        });

        // Step 3: Pre-call validation (like Telegram's pre-flight checks)
        if (currentUser.id === currentChat.id) {
            this.showError('Không thể gọi cho chính mình');
            return;
        }

        // Check network connectivity
        if (!window.telegramMessaging?.socket?.connected) {
            this.showError('Mất kết nối mạng. Vui lòng kiểm tra kết nối internet.');
            return;
        }

        // Step 4: Generate unique call ID (like Telegram's call_id)
        const callId = crypto.randomUUID();
        
        // Step 5: Prepare call session (Telegram-style call object)
        const callSession = {
            callId: callId,
            type: type,
            state: 'requesting', // Telegram states: requesting -> ringing -> active -> ended
            direction: 'outgoing',
            
            // Participants
            caller: {
                id: currentUser.id,
                name: currentUser.name,
                avatar: currentUser.avatar
            },
            callee: {
                id: currentChat.id,
                name: chatUserName,
                avatar: chatUserAvatar
            },
            
            // Timing
            timestamp: Date.now(),
            requestTime: new Date().toISOString(),
            
            // Connection details
            connectionState: 'connecting',
            localStream: null,
            remoteStream: null
        };

        // Step 6: Store call session locally (like Telegram's call cache)
        localStorage.setItem('currentCall', JSON.stringify(callSession));
        localStorage.setItem('activeCallId', callId);

        // Step 7: Initialize WebRTC client with call session
        if (window.webrtcClient) {
            window.webrtcClient.currentCallId = callId;
            window.webrtcClient.callSession = callSession;
            console.log('📞 [TELEGRAM] WebRTC client prepared for call:', callId);
        }

        // Step 7.5: Update call state in UI if available
        if (window.updateCallState) {
            console.log('🎨 [TELEGRAM] Updating UI call state to: requesting');
            window.updateCallState('requesting');
        }

        // Step 8: Send call request to server (Telegram's call.request)
        try {
            const callRequest = {
                callId: callId,
                targetUserId: currentChat.id,
                callType: type,
                callerData: {
                    id: currentUser.id,
                    name: currentUser.name,
                    avatar: currentUser.avatar
                },
                timestamp: Date.now()
            };

            console.log('📞 [TELEGRAM] Sending call request:', callRequest);
            window.telegramMessaging.socket.emit('initiate_call', callRequest);

            // Step 9: Update call state to "ringing" after request sent
            callSession.state = 'ringing';
            callSession.connectionState = 'signaling';
            localStorage.setItem('currentCall', JSON.stringify(callSession));

            // Update UI state
            if (window.updateCallState) {
                console.log('🎨 [TELEGRAM] Updating UI call state to: ringing');
                window.updateCallState('ringing');
            }

        } catch (error) {
            console.error('📞 [TELEGRAM] Failed to send call request:', error);
            this.showError('Không thể khởi tạo cuộc gọi. Vui lòng thử lại.');
            return;
        }

        // Step 10: Open call interface (like Telegram's call window)
        this.openCallWindow(callSession);
        
        // Step 11: Setup call timeout (like Telegram's 30s timeout)
        this.setupCallTimeout(callId, 30000);
        
        console.log(`📞 [TELEGRAM] Call initiated successfully:`, callId);
    }

    // Telegram-style call window opening
    openCallWindow(callSession) {
        console.log('📞 [TELEGRAM] Opening call window for session:', callSession?.callId);
        
        // Open call window in new tab with proper sizing (like Telegram Desktop)
        const callWindow = window.open(
            'calls.html',
            `telegram_call_${callSession?.callId || 'unknown'}`, // Unique window name
            'width=800,height=600,resizable=yes,scrollbars=no,status=no,menubar=no,toolbar=no,location=no'
        );

        if (!callWindow) {
            this.showError('Không thể mở cửa sổ cuộc gọi. Vui lòng cho phép popup trong trình duyệt.');
            if (callSession?.callId) {
                this.endCall(callSession.callId);
            }
            return;
        }

        // Store window reference for call management
        this.currentCall = {
            window: callWindow,
            session: callSession
        };

        // Focus call window (like Telegram)
        callWindow.focus();

        console.log('📞 [TELEGRAM] Call window opened successfully');
    }

    // Telegram-style call timeout management
    setupCallTimeout(callId, timeoutMs = 30000) {
        console.log(`📞 [TELEGRAM] Setting up call timeout: ${timeoutMs}ms`);
        
        this.callTimeout = setTimeout(() => {
            const activeCallId = localStorage.getItem('activeCallId');
            if (activeCallId === callId) {
                console.log('📞 [TELEGRAM] Call timeout reached, ending call');
                this.endCall(callId, 'timeout');
            }
        }, timeoutMs);
    }

    // Telegram-style call termination
    endCall(callId, reason = 'user') {
        console.log(`📞 [TELEGRAM] Ending call: ${callId}, reason: ${reason}`);
        
        // Clear timeout
        if (this.callTimeout) {
            clearTimeout(this.callTimeout);
            this.callTimeout = null;
        }
        
        // Clean up storage
        localStorage.removeItem('currentCall');
        localStorage.removeItem('activeCallId');
        
        // Close call window
        if (this.currentCall?.window) {
            this.currentCall.window.close();
            this.currentCall = null;
        }
        
        // Notify server
        if (window.telegramMessaging?.socket?.connected) {
            window.telegramMessaging.socket.emit('end_call', {
                callId: callId,
                reason: reason
            });
        }
        
        // Clean up WebRTC
        if (window.webrtcClient) {
            window.webrtcClient.cleanup();
        }
    }

    showIncomingCallNotification(callData) {
        const { callId, callerId, callerUsername, callType } = callData;
        
        console.log('📞 Showing incoming call notification for:', callerUsername);
        console.log('📞 Call data:', callData);
        
        // Remove any existing overlay first
        const existingOverlay = document.getElementById('incoming-call-overlay');
        if (existingOverlay) {
            console.log('📞 Removing existing call overlay');
            existingOverlay.remove();
        }
        
        // Play ringtone
        if (this.ringtone) {
            this.ringtone.play().catch(e => console.log('Could not play ringtone:', e));
        }
        
        // Create notification overlay
        const overlay = document.createElement('div');
        overlay.id = 'incoming-call-overlay';
        overlay.className = 'fixed inset-0 bg-black/80 flex items-center justify-center z-[9999]';
        overlay.innerHTML = `
            <div class="glass-pane p-8 rounded-3xl max-w-md w-full mx-4 text-center animate-pulse">
                <div class="mb-6">
                    <div class="w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            ${callType === 'video' ? 
                                '<polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect>' : 
                                '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>'
                            }
                        </svg>
                    </div>
                    <h3 class="text-2xl font-bold text-white mb-2">${callType === 'video' ? 'Video Call' : 'Voice Call'}</h3>
                    <p class="text-lg text-gray-300">${callerUsername}</p>
                    <p class="text-sm text-gray-400 mt-2">Cuộc gọi đến...</p>
                </div>
                
                <div class="flex gap-4 justify-center">
                    <button onclick="telegramCallSystem.rejectCall('${callId}')" class="p-4 bg-red-500 hover:bg-red-600 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                    </button>
                    <button onclick="telegramCallSystem.acceptCall('${callId}', '${callType}', '${callerUsername}')" class="p-4 bg-green-500 hover:bg-green-600 rounded-full transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                    </button>
                </div>
                
                <div class="mt-6">
                    <div class="flex justify-center items-center gap-2 text-gray-400">
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style="animation-delay: 0.1s"></div>
                        <div class="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style="animation-delay: 0.2s"></div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        console.log('📞 Incoming call overlay added to DOM');
        
        // Auto reject after 30 seconds
        setTimeout(() => {
            if (document.getElementById('incoming-call-overlay')) {
                console.log('📞 Auto-rejecting call after 30 seconds');
                this.rejectCall(callId);
            }
        }, 30000);
    }

    acceptCall(callId, callType, callerUsername) {
        console.log('✅ Accepting call:', callId);
        
        // Stop ringtone
        if (this.ringtone) {
            this.ringtone.pause();
            this.ringtone.currentTime = 0;
        }
        
        // Remove notification overlay
        const overlay = document.getElementById('incoming-call-overlay');
        if (overlay) {
            overlay.remove();
        }
        
        // Send accept to server
        if (window.telegramMessaging?.socket) {
            window.telegramMessaging.socket.emit('answer_call', {
                callId: callId,
                answer: 'accept'
            });
        }
        
        // Set callId in WebRTC client for proper call handling
        if (window.webrtcClient) {
            window.webrtcClient.currentCallId = callId;
            console.log('📞 Set WebRTC currentCallId:', callId);
        }
        
        // Prepare call info for incoming call
        const callInfo = {
            callId: callId,  // Add the actual callId
            type: callType,
            contact: callerUsername,
            contactId: callId,  // Keep this for backward compatibility
            state: 'incoming',
            timestamp: Date.now()
        };
        
        // Store call info
        localStorage.setItem('currentCall', JSON.stringify(callInfo));
        
        // Navigate to call page in current tab instead of opening new window
        console.log('📞 Call accepted - navigating to call interface');
        window.location.href = 'calls.html';
    }

    rejectCall(callId) {
        console.log('❌ Rejecting call:', callId);
        
        // Stop ringtone
        if (this.ringtone) {
            this.ringtone.pause();
            this.ringtone.currentTime = 0;
        }
        
        // Remove notification overlay
        const overlay = document.getElementById('incoming-call-overlay');
        if (overlay) {
            overlay.remove();
        }
        
        // Send reject to server
        if (window.telegramMessaging?.socket) {
            window.telegramMessaging.socket.emit('answer_call', {
                callId: callId,
                answer: 'reject'
            });
        }
    }

    handleCallAccepted(data) {
        console.log('✅ [TELEGRAM] Call accepted by remote user:', data);
        
        // Clear call timeout since call is now active
        if (this.callTimeout) {
            console.log('⏰ [TELEGRAM] Clearing call timeout - call accepted');
            clearTimeout(this.callTimeout);
            this.callTimeout = null;
        }
        
        // Update call session state
        const currentCall = localStorage.getItem('currentCall');
        if (currentCall) {
            try {
                const callSession = JSON.parse(currentCall);
                callSession.state = 'active';
                callSession.connectionState = 'connected';
                callSession.acceptedTime = new Date().toISOString();
                
                // Store updated session
                localStorage.setItem('currentCall', JSON.stringify(callSession));
                console.log('📞 [TELEGRAM] Call session updated to active state');
                
                // Update UI state if we're on call page (caller should already be on call page)
                if (window.updateCallState) {
                    console.log('🎨 [TELEGRAM] Updating UI call state to: active');
                    window.updateCallState('active');
                } else if (window.location.pathname.includes('home.html')) {
                    // Only handle callee side redirect if on message page
                    console.log('� [TELEGRAM] Callee received call accepted notification');
                    // Show notification instead of redirect to avoid double tabs
                }
                
            } catch (error) {
                console.error('❌ Error updating call session:', error);
            }
        }
        
        this.showCallNotification('Cuộc gọi đã được chấp nhận', 'success');
    }

    handleCallRejected(data) {
        console.log('❌ Call rejected by remote user');
        this.showCallNotification('Cuộc gọi bị từ chối', 'error');
    }

    handleCallEnded(data) {
        console.log('📞 Call ended');
        this.showCallNotification('Cuộc gọi đã kết thúc', 'info');
    }

    showCallNotification(message, type = 'info') {
        const colors = {
            success: 'bg-green-500',
            error: 'bg-red-500',
            info: 'bg-blue-500'
        };
        
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-50 animate-bounce`;
        notification.innerHTML = `
            <div class="flex items-center gap-3">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                </svg>
                <span>${message}</span>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    openCallWindow() {
        // Open call window in new tab instead of popup
        var callWindow = window.open(
            'calls.html',
            '_blank',
            'width=800,height=600'
        );

        if (!callWindow) {
            this.showError('Không thể mở cửa sổ cuộc gọi. Vui lòng cho phép popup trong trình duyệt.');
            return;
        }

        // Store reference
        this.currentCall = callWindow;

        console.log('📞 Call window opened in new tab');
    }

    showError(message) {
        // Show error notification
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg shadow-lg z-50';
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }
}

// Initialize call system
var telegramCallSystem = new TelegramCallSystem();

// Make it globally accessible
window.telegramCallSystem = telegramCallSystem;
