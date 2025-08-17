// === TELEGRAM UI MANAGER (Inspired by Telegram Desktop) ===

/**
 * UI Manager for Telegram-like interface
 * Handles all DOM manipulation and user interactions
 */
class TelegramUI {
    constructor() {
        // UI state
        this.currentConversation = null;
        this.messageContainer = null;
        this.conversationsList = null;
        this.messageInput = null;
        this.sendButton = null;
        
        // UI elements cache
        this.elements = new Map();
        
        // Message rendering queue
        this.renderQueue = [];
        this.isRendering = false;
        
        this.init();
    }
    
    init() {
        console.log('🎨 TelegramUI: Initializing...');
        
        // Find UI elements
        this.findUIElements();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup core integration
        this.setupCoreIntegration();
        
        console.log('✅ TelegramUI: Initialized');
    }
    
    findUIElements() {
        this.messageContainer = document.getElementById('messages-container');
        this.conversationsList = document.getElementById('conversations-list');
        this.messageInput = document.getElementById('message-input');
        this.sendButton = document.getElementById('send-button');
        
        // Cache elements for performance
        this.elements.set('messageContainer', this.messageContainer);
        this.elements.set('conversationsList', this.conversationsList);
        this.elements.set('messageInput', this.messageInput);
        this.elements.set('sendButton', this.sendButton);
        
        console.log('🔍 TelegramUI: UI elements found:', {
            messageContainer: !!this.messageContainer,
            conversationsList: !!this.conversationsList,
            messageInput: !!this.messageInput,
            sendButton: !!this.sendButton
        });
    }
    
    setupEventListeners() {
        // Send message on button click
        if (this.sendButton) {
            this.sendButton.addEventListener('click', () => this.handleSendMessage());
        }
        
        // Send message on Enter key
        if (this.messageInput) {
            this.messageInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.handleSendMessage();
                }
            });
            
            // Typing indicators
            this.messageInput.addEventListener('input', () => this.handleTyping());
        }
    }
    
    setupCoreIntegration() {
        if (!window.telegramCore) {
            console.warn('⚠️ TelegramUI: TelegramCore not available');
            return;
        }
        
        // Subscribe to core events
        window.telegramCore.on('messageAdded', (message) => this.renderMessage(message));
        window.telegramCore.on('messageUpdated', (message) => this.updateMessage(message));
        window.telegramCore.on('conversationsUpdated', (conversations) => this.renderConversations(conversations));
        window.telegramCore.on('conversationChanged', (conversation) => this.showConversation(conversation));
        window.telegramCore.on('connectionStateChanged', (state) => this.updateConnectionStatus(state));
        window.telegramCore.on('syncStateChanged', (state) => this.updateSyncStatus(state));
    }
    
    // === MESSAGE RENDERING ===
    async renderMessage(message) {
        if (!this.messageContainer) {
            console.warn('⚠️ TelegramUI: Message container not found');
            return;
        }
        
        // Add to render queue to avoid race conditions
        this.renderQueue.push(message);
        
        if (!this.isRendering) {
            await this.processRenderQueue();
        }
    }
    
    async processRenderQueue() {
        this.isRendering = true;
        
        while (this.renderQueue.length > 0) {
            const message = this.renderQueue.shift();
            await this.doRenderMessage(message);
        }
        
        this.isRendering = false;
    }
    
    async doRenderMessage(message) {
        // Check if message already exists
        const existingElement = document.querySelector(`[data-message-id="${message.id || message.tempId}"]`);
        if (existingElement) {
            this.updateMessageElement(existingElement, message);
            return;
        }
        
        // Get display name from UserManager if available
        let senderDisplayName = message.senderName || 'Unknown';
        
        if (!message.isOwn && message.senderId && window.userManager) {
            try {
                const senderData = window.userManager.getCachedUserData(message.senderId);
                if (senderData && senderData.name) {
                    senderDisplayName = senderData.name;
                }
            } catch (error) {
                console.warn('⚠️ TelegramUI: Failed to get sender data:', error);
            }
        }
        
        const messageElement = this.createMessageElement(message, senderDisplayName);
        
        // Insert message in correct position (maintain chronological order)
        this.insertMessageInOrder(messageElement, message);
        
        // Scroll to bottom if this is a new message
        if (message.isOwn || this.isNearBottom()) {
            this.scrollToBottom();
        }
    }
    
    createMessageElement(message, senderDisplayName) {
        const messageEl = document.createElement('div');
        messageEl.className = `message-item ${message.isOwn ? 'own' : 'other'}`;
        messageEl.setAttribute('data-message-id', message.id || message.tempId);
        messageEl.setAttribute('data-sender-id', message.senderId || '');
        messageEl.setAttribute('data-timestamp', message.timestamp.getTime());
        
        const timeStr = message.timestamp.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Detect long messages or hash-like content
        const isLongMessage = message.text.length > 50;
        const isHashLike = /^[a-f0-9]{32,}/.test(message.text) || message.text.includes(':');
        const maxWidthClass = isLongMessage ? 'max-w-md lg:max-w-lg' : 'max-w-xs lg:max-w-md';
        const messageTextClass = isHashLike ? 
            'message-text break-words font-mono text-xs leading-tight' : 
            'message-text break-words';
        
        messageEl.innerHTML = `
            <div class="${maxWidthClass} px-4 py-2 rounded-lg transition-all duration-200 ${
                message.isOwn 
                    ? 'bg-blue-600 text-white ml-auto' 
                    : 'bg-gray-700 text-gray-100 mr-auto'
            } ${isLongMessage ? 'message-long' : ''} ${message.status === 'sending' ? 'opacity-70' : ''}">
                ${!message.isOwn ? `<div class="text-xs text-gray-400 mb-1 sender-name-display">${this.escapeHtml(senderDisplayName)}</div>` : ''}
                <div class="${messageTextClass}">${this.escapeHtml(message.text)}</div>
                <div class="text-xs ${message.isOwn ? 'text-blue-200' : 'text-gray-500'} mt-1 flex items-center ${message.isOwn ? 'justify-end' : 'justify-start'}">
                    <span>${timeStr}</span>
                    ${message.isOwn ? `<span class="ml-1 message-status">${this.getStatusIcon(message.status)}</span>` : ''}
                </div>
            </div>
        `;
        
        return messageEl;
    }
    
    insertMessageInOrder(messageElement, message) {
        const messageTimestamp = message.timestamp.getTime();
        const existingMessages = this.messageContainer.querySelectorAll('.message-item');
        
        let insertPosition = null;
        
        // Find correct position based on timestamp
        for (let i = existingMessages.length - 1; i >= 0; i--) {
            const existingTimestamp = parseInt(existingMessages[i].getAttribute('data-timestamp'));
            
            if (existingTimestamp <= messageTimestamp) {
                insertPosition = existingMessages[i].nextSibling;
                break;
            }
        }
        
        if (insertPosition) {
            this.messageContainer.insertBefore(messageElement, insertPosition);
        } else {
            this.messageContainer.appendChild(messageElement);
        }
    }
    
    updateMessage(message) {
        const messageElement = document.querySelector(`[data-message-id="${message.id || message.tempId}"]`);
        if (messageElement) {
            this.updateMessageElement(messageElement, message);
        }
    }
    
    updateMessageElement(element, message) {
        // Update message ID if it changed (temp -> real)
        if (message.id && element.getAttribute('data-message-id') !== message.id) {
            element.setAttribute('data-message-id', message.id);
        }
        
        // Update status icon
        const statusElement = element.querySelector('.message-status');
        if (statusElement) {
            statusElement.innerHTML = this.getStatusIcon(message.status);
        }
        
        // Update opacity based on status
        const messageBody = element.querySelector('div');
        if (messageBody) {
            if (message.status === 'sending') {
                messageBody.classList.add('opacity-70');
            } else {
                messageBody.classList.remove('opacity-70');
            }
            
            if (message.status === 'failed') {
                messageBody.classList.add('bg-red-600');
            } else {
                messageBody.classList.remove('bg-red-600');
            }
        }
    }
    
    getStatusIcon(status) {
        switch (status) {
            case 'sending': return '⏳';
            case 'sent': return '✓';
            case 'delivered': return '✓✓';
            case 'read': return '✓✓';
            case 'failed': return '❌';
            default: return '';
        }
    }
    
    // === CONVERSATION RENDERING ===
    renderConversations(conversations) {
        if (!this.conversationsList) {
            console.warn('⚠️ TelegramUI: Conversations list not found');
            return;
        }
        
        if (!conversations || conversations.length === 0) {
            this.showEmptyConversations();
            return;
        }
        
        // Sort conversations by last message time
        const sortedConversations = conversations.sort((a, b) => {
            const aTime = a.lastMessage ? new Date(a.lastMessage.timestamp) : new Date(a.updatedAt);
            const bTime = b.lastMessage ? new Date(b.lastMessage.timestamp) : new Date(b.updatedAt);
            return bTime - aTime;
        });
        
        this.conversationsList.innerHTML = sortedConversations.map(conv => 
            this.createConversationElement(conv)
        ).join('');
        
        console.log(`✅ TelegramUI: Rendered ${conversations.length} conversations`);
    }
    
    createConversationElement(conversation) {
        // Get partner display name from UserManager if available
        let partnerDisplayName = conversation.partnerName || 'Unknown';
        
        if (conversation.partnerId && window.userManager) {
            try {
                const partnerData = window.userManager.getCachedUserData(conversation.partnerId);
                if (partnerData && partnerData.name) {
                    partnerDisplayName = partnerData.name;
                }
            } catch (error) {
                console.warn('⚠️ TelegramUI: Failed to get partner data:', error);
            }
        }
        
        const lastMessage = conversation.lastMessage;
        const lastMessageText = lastMessage ? 
            (lastMessage.text || lastMessage.content || 'Tin nhắn mới') : 
            'Chưa có tin nhắn';
        
        const timestamp = lastMessage ? 
            new Date(lastMessage.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 
            '';
        
        const avatar = conversation.partnerAvatar || 
            `https://placehold.co/48x48/4F46E5/FFFFFF?text=${partnerDisplayName.charAt(0).toUpperCase()}`;
        
        return `
            <div class="conversation-item p-4 hover:bg-gray-700/30 cursor-pointer border-b border-gray-700/30 transition-colors" 
                 data-conversation-id="${conversation.id}"
                 data-partner-id="${conversation.partnerId || ''}"
                 onclick="selectConversation('${conversation.id}', '${partnerDisplayName.replace(/'/g, "\\'")}', '${avatar}')">
                <div class="flex items-center space-x-3">
                    <img src="${avatar}" alt="${partnerDisplayName}" class="w-12 h-12 rounded-full object-cover">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between">
                            <h3 class="font-semibold text-white truncate user-name-display">${this.escapeHtml(partnerDisplayName)}</h3>
                            ${timestamp ? `<span class="text-xs text-gray-400 timestamp">${timestamp}</span>` : ''}
                        </div>
                        <p class="text-sm text-gray-400 truncate last-message">${this.escapeHtml(lastMessageText)}</p>
                        ${conversation.unreadCount > 0 ? `<span class="inline-block bg-blue-600 text-white text-xs rounded-full px-2 py-1 mt-1">${conversation.unreadCount}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }
    
    showEmptyConversations() {
        if (this.conversationsList) {
            this.conversationsList.innerHTML = `
                <div class="text-center py-8 text-gray-400">
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
    
    // === CONVERSATION MANAGEMENT ===
    showConversation(conversation) {
        this.currentConversation = conversation;
        
        // Clear messages container
        if (this.messageContainer) {
            this.messageContainer.innerHTML = `
                <div class="text-center py-8 text-gray-400">
                    <div class="animate-pulse">📡 Đang tải tin nhắn...</div>
                </div>
            `;
        }
        
        // Update chat header
        this.updateChatHeader(conversation);
        
        // Mark conversation as active
        this.markConversationActive(conversation.id);
    }
    
    updateChatHeader(conversation) {
        const chatHeader = document.getElementById('chat-header');
        if (chatHeader && conversation) {
            const partnerName = conversation.partnerName || 'Unknown';
            const partnerAvatar = conversation.partnerAvatar || 
                `https://placehold.co/48x48/4F46E5/FFFFFF?text=${partnerName.charAt(0).toUpperCase()}`;
            
            chatHeader.innerHTML = `
                <div class="flex items-center space-x-3 p-4 border-b border-gray-700">
                    <img src="${partnerAvatar}" alt="${partnerName}" class="w-10 h-10 rounded-full object-cover">
                    <div>
                        <h3 class="font-semibold text-white">${this.escapeHtml(partnerName)}</h3>
                        <p class="text-sm text-gray-400">Online</p>
                    </div>
                </div>
            `;
        }
    }
    
    markConversationActive(conversationId) {
        // Remove active class from all conversations
        document.querySelectorAll('.conversation-item').forEach(item => {
            item.classList.remove('bg-blue-600/20');
        });
        
        // Add active class to current conversation
        const activeConversation = document.querySelector(`[data-conversation-id="${conversationId}"]`);
        if (activeConversation) {
            activeConversation.classList.add('bg-blue-600/20');
        }
    }
    
    // === MESSAGE SENDING ===
    async handleSendMessage() {
        if (!this.messageInput || !this.currentConversation) {
            return;
        }
        
        const text = this.messageInput.value.trim();
        if (!text) {
            return;
        }
        
        try {
            // Clear input immediately
            this.messageInput.value = '';
            
            // Disable send button temporarily
            if (this.sendButton) {
                this.sendButton.disabled = true;
            }
            
            // Send via core
            await window.telegramCore.sendMessage(text, this.currentConversation.id);
            
        } catch (error) {
            console.error('❌ TelegramUI: Send message failed:', error);
            this.showError('Không thể gửi tin nhắn. Vui lòng thử lại.');
            
            // Restore message text
            this.messageInput.value = text;
            
        } finally {
            // Re-enable send button
            if (this.sendButton) {
                this.sendButton.disabled = false;
            }
            
            // Focus input
            this.messageInput.focus();
        }
    }
    
    handleTyping() {
        // Implement typing indicators
        // TODO: Send typing events via telegramCore
    }
    
    // === STATUS UPDATES ===
    updateConnectionStatus(state) {
        const statusElement = document.getElementById('connection-status');
        if (statusElement) {
            const statusText = {
                'disconnected': '🔴 Mất kết nối',
                'connecting': '🟡 Đang kết nối...',
                'connected': '🟢 Đã kết nối',
                'reconnecting': '🟡 Đang kết nối lại...'
            };
            
            statusElement.textContent = statusText[state] || state;
        }
    }
    
    updateSyncStatus(state) {
        const statusElement = document.getElementById('sync-status');
        if (statusElement) {
            const statusText = {
                'idle': '',
                'syncing': '⏳ Đang đồng bộ...',
                'error': '❌ Lỗi đồng bộ'
            };
            
            statusElement.textContent = statusText[state] || '';
        }
    }
    
    // === UTILITIES ===
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    scrollToBottom() {
        if (this.messageContainer) {
            requestAnimationFrame(() => {
                this.messageContainer.scrollTop = this.messageContainer.scrollHeight;
            });
        }
    }
    
    isNearBottom() {
        if (!this.messageContainer) return true;
        
        const { scrollTop, scrollHeight, clientHeight } = this.messageContainer;
        return scrollHeight - scrollTop - clientHeight < 100;
    }
    
    showError(message) {
        // Create error toast
        const errorToast = document.createElement('div');
        errorToast.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-600 text-white px-6 py-4 rounded-lg shadow-lg z-50 max-w-md';
        errorToast.textContent = message;
        
        document.body.appendChild(errorToast);
        
        // Remove after 5 seconds
        setTimeout(() => {
            errorToast.remove();
        }, 5000);
    }
}

// Global instance
window.telegramUI = new TelegramUI();

// Global conversation selection function
window.selectConversation = function(conversationId, partnerName, partnerAvatar) {
    if (!conversationId || conversationId === 'undefined' || conversationId === 'null') {
        console.warn('⚠️ Invalid conversation ID:', conversationId);
        return;
    }
    
    console.log(`💬 Selecting conversation: ${conversationId}`);
    
    if (window.telegramCore) {
        window.telegramCore.selectConversation(conversationId);
    } else {
        console.warn('⚠️ TelegramCore not available');
    }
};

console.log('🎨 TelegramUI: Loaded');
