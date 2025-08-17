// === TELEGRAM INTEGRATION MANAGER ===

/**
 * Integration layer that replaces the old telegram-messages.js
 * Provides backward compatibility while using new architecture
 */
class TelegramIntegration {
    constructor() {
        this.core = null;
        this.ui = null;
        this.isReady = false;
        
        this.init();
    }
    
    async init() {
        console.log('🔗 TelegramIntegration: Initializing...');
        
        // Wait for dependencies
        await this.waitForDependencies();
        
        // Setup core and UI references
        this.core = window.telegramCore;
        this.ui = window.telegramUI;
        
        // Setup integration
        this.setupIntegration();
        
        // Setup backward compatibility
        this.setupLegacyAPI();
        
        this.isReady = true;
        console.log('✅ TelegramIntegration: Ready');
        
        // Auto-load conversations
        this.autoLoadConversations();
    }
    
    async waitForDependencies() {
        const maxWait = 10000; // 10 seconds
        const interval = 100;
        let waited = 0;
        
        while (waited < maxWait) {
            if (window.telegramCore && window.telegramUI && window.userManager) {
                console.log('✅ TelegramIntegration: All dependencies loaded');
                return;
            }
            
            await new Promise(resolve => setTimeout(resolve, interval));
            waited += interval;
        }
        
        throw new Error('TelegramIntegration: Dependencies not loaded in time');
    }
    
    setupIntegration() {
        // Forward core events to legacy handlers
        this.core.on('ready', () => {
            console.log('🚀 TelegramIntegration: Core ready, loading conversations...');
            this.loadConversations();
        });
        
        this.core.on('error', (error) => {
            console.error('❌ TelegramIntegration: Core error:', error);
        });
        
        this.core.on('messageNotification', (message) => {
            this.showMessageNotification(message);
        });
    }
    
    setupLegacyAPI() {
        // Provide backward-compatible API
        window.telegramMessaging = {
            // Legacy properties
            currentUser: () => this.core?.currentUser,
            currentChat: () => this.core?.currentConversation,
            isAuthenticated: () => this.core?.state.authState === 'authenticated',
            
            // Legacy methods
            sendMessage: (text) => this.core?.sendMessage(text),
            selectChat: (conversationId) => this.core?.selectConversation(conversationId),
            
            // State getters
            getConnectionState: () => this.core?.state.connectionState,
            getAuthState: () => this.core?.state.authState,
            getSyncState: () => this.core?.state.syncState
        };
        
        // Global legacy functions
        window.loadRealConversations = () => this.loadConversations();
        window.realTimeMessaging = window.telegramMessaging;
    }
    
    async loadConversations() {
        if (!this.core) {
            console.warn('⚠️ TelegramIntegration: Core not ready');
            return;
        }
        
        try {
            console.log('📋 TelegramIntegration: Loading conversations...');
            
            // Trigger conversation sync through core
            await this.core.syncConversations();
            
        } catch (error) {
            console.error('❌ TelegramIntegration: Load conversations failed:', error);
            
            // Show user-friendly error
            if (this.ui) {
                this.ui.showError('Không thể tải danh sách trò chuyện. Vui lòng thử lại.');
            }
        }
    }
    
    async autoLoadConversations() {
        // Auto-load conversations when everything is ready
        if (this.isReady) {
            setTimeout(() => {
                this.loadConversations();
            }, 1000);
        }
    }
    
    showMessageNotification(message) {
        // Show browser notification if permission granted
        if (Notification.permission === 'granted') {
            const notification = new Notification(message.senderName || 'Tin nhắn mới', {
                body: message.text,
                icon: '/assets/images/logo.png',
                tag: `message-${message.id}`
            });
            
            notification.onclick = () => {
                window.focus();
                if (this.core) {
                    this.core.selectConversation(message.conversationId);
                }
                notification.close();
            };
            
            // Auto close after 5 seconds
            setTimeout(() => notification.close(), 5000);
        }
    }
    
    // === UTILITY METHODS ===
    getStats() {
        if (!this.core) return null;
        
        return {
            messagesCount: this.core.messages.size,
            conversationsCount: this.core.conversations.size,
            pendingMessagesCount: this.core.pendingMessages.size,
            connectionState: this.core.state.connectionState,
            authState: this.core.state.authState,
            syncState: this.core.state.syncState
        };
    }
    
    // Debug methods
    debugInfo() {
        console.log('🔍 TelegramIntegration Debug Info:', {
            isReady: this.isReady,
            core: !!this.core,
            ui: !!this.ui,
            stats: this.getStats()
        });
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Small delay to ensure all scripts are loaded
    setTimeout(() => {
        window.telegramIntegration = new TelegramIntegration();
    }, 500);
});

console.log('🔗 TelegramIntegration: Loaded');
