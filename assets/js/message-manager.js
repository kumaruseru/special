// Modern Message Manager - Inspired by Telegram's architecture
class MessageManager {
    constructor() {
        this.conversations = new Map();
        this.messages = new Map();
        this.listeners = new Map();
        this.encryptionKeys = new Map();
        this.isInitialized = false;
        
        this.init();
    }
    
    async init() {
        console.log('🚀 MessageManager: Initializing...');
        
        // Initialize encryption if available
        this.initEncryption();
        
        this.isInitialized = true;
        console.log('✅ MessageManager: Initialized');
    }
    
    // Initialize encryption system
    initEncryption() {
        if (typeof E2EEncryption !== 'undefined') {
            console.log('🔐 MessageManager: E2E Encryption available');
        } else {
            console.warn('⚠️ MessageManager: E2E Encryption not available');
        }
    }
    
    // Get or generate encryption key for conversation
    getEncryptionKey(userId1, userId2) {
        const conversationId = this.getConversationId(userId1, userId2);
        
        if (!this.encryptionKeys.has(conversationId)) {
            if (typeof E2EEncryption !== 'undefined') {
                const key = E2EEncryption.generateRoomKey(userId1, userId2);
                this.encryptionKeys.set(conversationId, key);
                console.log('🔑 Generated encryption key for conversation:', conversationId);
            }
        }
        
        return this.encryptionKeys.get(conversationId);
    }
    
    // Generate consistent conversation ID
    getConversationId(userId1, userId2) {
        return [userId1, userId2].sort().join('_');
    }
    
    // Decrypt message content
    decryptMessage(encryptedText, userId1, userId2) {
        try {
            // Check if message appears encrypted
            if (!encryptedText || !encryptedText.includes(':')) {
                return encryptedText; // Not encrypted
            }
            
            if (typeof E2EEncryption === 'undefined') {
                console.warn('MessageManager: E2E Encryption not available for decryption');
                return encryptedText;
            }
            
            const key = this.getEncryptionKey(userId1, userId2);
            if (!key) {
                console.warn('MessageManager: No encryption key available');
                return encryptedText;
            }
            
            const decrypted = E2EEncryption.decryptMessage(encryptedText, key);
            
            // Validate decryption
            if (decrypted && decrypted !== encryptedText && decrypted.trim()) {
                console.log('✅ MessageManager: Message decrypted successfully');
                return decrypted;
            } else {
                console.warn('MessageManager: Decryption failed or returned empty');
                return encryptedText;
            }
            
        } catch (error) {
            console.error('❌ MessageManager: Decryption error:', error);
            return encryptedText;
        }
    }
    
    // Encrypt message content
    encryptMessage(plainText, userId1, userId2) {
        try {
            if (typeof E2EEncryption === 'undefined') {
                console.warn('MessageManager: E2E Encryption not available');
                return plainText;
            }
            
            const key = this.getEncryptionKey(userId1, userId2);
            if (!key) {
                console.warn('MessageManager: No encryption key available');
                return plainText;
            }
            
            const encrypted = E2EEncryption.encryptMessage(plainText, key);
            console.log('🔐 MessageManager: Message encrypted');
            return encrypted;
            
        } catch (error) {
            console.error('❌ MessageManager: Encryption error:', error);
            return plainText;
        }
    }
    
    // Fetch conversations with proper user name handling
    async fetchConversations() {
        try {
            console.log('📡 MessageManager: Fetching conversations...');
            
            const token = window.userManager?.getAuthToken();
            if (!token) {
                throw new Error('No authentication token');
            }
            
            const response = await fetch('/api/conversations', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.conversations) {
                console.log('✅ MessageManager: Conversations fetched:', data.conversations.length);
                
                // Process and cache conversations
                this.processConversations(data.conversations);
                
                return data.conversations;
            } else {
                throw new Error(data.message || 'Failed to fetch conversations');
            }
            
        } catch (error) {
            console.error('❌ MessageManager: Fetch conversations failed:', error);
            throw error;
        }
    }
    
    // Process conversations with proper name handling
    processConversations(conversations) {
        conversations.forEach(conv => {
            const conversationId = conv._id || conv.partnerId;
            
            // Ensure proper user name handling
            if (conv.otherUser) {
                // Use proper name priority like Telegram
                const displayName = conv.otherUser.fullName || 
                                  conv.otherUser.name || 
                                  (conv.otherUser.firstName && conv.otherUser.lastName ? 
                                   `${conv.otherUser.firstName} ${conv.otherUser.lastName}` : '') ||
                                  conv.otherUser.username || 
                                  'Unknown User';
                
                conv.otherUser.displayName = displayName;
            }
            
            // Cache conversation
            this.conversations.set(conversationId, conv);
        });
    }
    
    // Fetch messages for a conversation
    async fetchMessages(partnerId, page = 1, limit = 50) {
        try {
            console.log(`📡 MessageManager: Fetching messages for ${partnerId}...`);
            
            const token = window.userManager?.getAuthToken();
            if (!token) {
                throw new Error('No authentication token');
            }
            
            const response = await fetch(`/api/conversations/${partnerId}/messages?page=${page}&limit=${limit}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.messages) {
                console.log('✅ MessageManager: Messages fetched:', data.messages.length);
                
                // Process messages (decrypt, etc.)
                const processedMessages = this.processMessages(data.messages, partnerId);
                
                return processedMessages;
            } else {
                throw new Error(data.message || 'Failed to fetch messages');
            }
            
        } catch (error) {
            console.error('❌ MessageManager: Fetch messages failed:', error);
            throw error;
        }
    }
    
    // Process messages with decryption and name handling
    processMessages(messages, partnerId) {
        const currentUser = window.userManager?.getCurrentUser();
        if (!currentUser) {
            console.warn('MessageManager: No current user for message processing');
            return messages;
        }
        
        return messages.map(msg => {
            // Decrypt message content
            const decryptedText = this.decryptMessage(
                msg.text || msg.content,
                currentUser.id,
                partnerId
            );
            
            // Determine if message is from current user
            const isOwn = msg.senderId === currentUser.id;
            
            // Ensure proper sender name
            let senderDisplayName = msg.senderName || 'Unknown';
            if (isOwn) {
                senderDisplayName = window.userManager?.getUserDisplayName() || currentUser.fullName || 'You';
            }
            
            return {
                ...msg,
                text: decryptedText,
                content: decryptedText,
                senderDisplayName: senderDisplayName,
                isOwn: isOwn,
                timestamp: new Date(msg.timestamp),
                status: isOwn ? (msg.readAt ? 'read' : 'sent') : 'received'
            };
        });
    }
    
    // Send message with encryption
    async sendMessage(partnerId, messageText, messageType = 'text') {
        try {
            console.log('📤 MessageManager: Sending message...');
            
            const currentUser = window.userManager?.getCurrentUser();
            if (!currentUser) {
                throw new Error('No current user');
            }
            
            const token = window.userManager?.getAuthToken();
            if (!token) {
                throw new Error('No authentication token');
            }
            
            // Encrypt message
            const encryptedText = this.encryptMessage(messageText, currentUser.id, partnerId);
            
            const response = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    receiverId: partnerId,
                    content: encryptedText,
                    messageType: messageType
                })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success) {
                console.log('✅ MessageManager: Message sent successfully');
                return data.message;
            } else {
                throw new Error(data.message || 'Failed to send message');
            }
            
        } catch (error) {
            console.error('❌ MessageManager: Send message failed:', error);
            throw error;
        }
    }
    
    // Subscribe to conversation updates
    subscribeToConversation(conversationId, callback) {
        if (!this.listeners.has(conversationId)) {
            this.listeners.set(conversationId, new Set());
        }
        
        this.listeners.get(conversationId).add(callback);
        
        // Return unsubscribe function
        return () => {
            const listeners = this.listeners.get(conversationId);
            if (listeners) {
                listeners.delete(callback);
            }
        };
    }
    
    // Notify conversation listeners
    notifyConversationListeners(conversationId, data) {
        const listeners = this.listeners.get(conversationId);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('MessageManager: Listener error:', error);
                }
            });
        }
    }
    
    // Get conversation data
    getConversation(conversationId) {
        return this.conversations.get(conversationId);
    }
    
    // Clear all data (logout)
    clearAllData() {
        console.log('🧹 MessageManager: Clearing all data');
        
        this.conversations.clear();
        this.messages.clear();
        this.listeners.clear();
        this.encryptionKeys.clear();
    }
}

// Global instance
window.messageManager = new MessageManager();

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MessageManager;
}
