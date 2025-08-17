// === TELEGRAM RELIABILITY SYSTEM ===

/**
 * Message reliability and retry system inspired by Telegram's MTProto
 * Handles network failures, message queuing, and automatic recovery
 */
class TelegramReliability {
    constructor() {
        // Message queues
        this.sendQueue = new Map();          // messageId -> QueuedMessage
        this.retryQueue = new Map();         // messageId -> RetryMessage
        this.acknowledgmentQueue = new Map(); // messageId -> AckMessage
        
        // Connection state
        this.isOnline = navigator.onLine;
        this.connectionQuality = 'good'; // good, poor, offline
        
        // Retry configuration (like Telegram's)
        this.retryConfig = {
            maxRetries: 5,
            baseDelay: 1000,
            maxDelay: 30000,
            backoffFactor: 2,
            jitterFactor: 0.1
        };
        
        // Statistics
        this.stats = {
            messagesSent: 0,
            messagesRetried: 0,
            messagesFailed: 0,
            averageLatency: 0,
            connectionDrops: 0
        };
        
        this.init();
    }
    
    init() {
        console.log('🛡️ TelegramReliability: Initializing...');
        
        // Setup network monitoring
        this.setupNetworkMonitoring();
        
        // Setup queue processing
        this.startQueueProcessor();
        
        // Setup connection quality monitoring
        this.startConnectionQualityMonitoring();
        
        // Setup periodic cleanup
        this.startPeriodicCleanup();
        
        console.log('✅ TelegramReliability: Initialized');
    }
    
    // === NETWORK MONITORING ===
    setupNetworkMonitoring() {
        window.addEventListener('online', () => {
            console.log('🟢 TelegramReliability: Connection restored');
            this.isOnline = true;
            this.connectionQuality = 'good';
            this.stats.connectionDrops++;
            
            // Resume sending queued messages
            this.processAllQueues();
            
            // Emit event
            this.emit('connectionRestored');
        });
        
        window.addEventListener('offline', () => {
            console.log('🔴 TelegramReliability: Connection lost');
            this.isOnline = false;
            this.connectionQuality = 'offline';
            
            // Emit event
            this.emit('connectionLost');
        });
    }
    
    startConnectionQualityMonitoring() {
        setInterval(() => {
            this.checkConnectionQuality();
        }, 5000);
    }
    
    async checkConnectionQuality() {
        if (!this.isOnline) {
            this.connectionQuality = 'offline';
            return;
        }
        
        try {
            const start = Date.now();
            
            // Test connection with a small request
            const response = await fetch('/api/ping', {
                method: 'HEAD',
                cache: 'no-cache'
            });
            
            const latency = Date.now() - start;
            
            // Update average latency
            this.stats.averageLatency = (this.stats.averageLatency + latency) / 2;
            
            // Determine connection quality
            if (response.ok) {
                if (latency < 500) {
                    this.connectionQuality = 'good';
                } else if (latency < 2000) {
                    this.connectionQuality = 'poor';
                } else {
                    this.connectionQuality = 'very-poor';
                }
            } else {
                this.connectionQuality = 'poor';
            }
            
        } catch (error) {
            this.connectionQuality = 'offline';
            console.warn('⚠️ TelegramReliability: Connection quality check failed:', error);
        }
    }
    
    // === QUEUE MANAGEMENT ===
    startQueueProcessor() {
        // Process send queue every 100ms
        setInterval(() => {
            this.processSendQueue();
        }, 100);
        
        // Process retry queue every 1s
        setInterval(() => {
            this.processRetryQueue();
        }, 1000);
        
        // Process acknowledgment queue every 5s
        setInterval(() => {
            this.processAcknowledmentQueue();
        }, 5000);
    }
    
    // === MESSAGE SENDING WITH RELIABILITY ===
    async sendReliableMessage(message, options = {}) {
        const messageId = message.id || message.tempId;
        
        console.log(`📤 TelegramReliability: Queuing message ${messageId}`);
        
        const queuedMessage = {
            ...message,
            id: messageId,
            attempts: 0,
            queuedAt: Date.now(),
            lastAttempt: null,
            options: {
                priority: options.priority || 'normal', // high, normal, low
                timeout: options.timeout || 10000,
                retryEnabled: options.retryEnabled !== false
            }
        };
        
        // Add to send queue
        this.sendQueue.set(messageId, queuedMessage);
        
        // If connection is good, try to send immediately
        if (this.connectionQuality === 'good') {
            await this.processSendQueue();
        }
        
        return messageId;
    }
    
    async processSendQueue() {
        if (!this.isOnline || this.sendQueue.size === 0) {
            return;
        }
        
        // Sort by priority and queue time
        const messages = Array.from(this.sendQueue.values())
            .sort((a, b) => {
                const priorityOrder = { high: 3, normal: 2, low: 1 };
                const aPriority = priorityOrder[a.options.priority] || 2;
                const bPriority = priorityOrder[b.options.priority] || 2;
                
                if (aPriority !== bPriority) {
                    return bPriority - aPriority; // Higher priority first
                }
                
                return a.queuedAt - b.queuedAt; // Earlier messages first
            });
        
        // Process up to 3 messages simultaneously
        const batch = messages.slice(0, 3);
        
        for (const message of batch) {
            try {
                await this.attemptSendMessage(message);
            } catch (error) {
                console.error(`❌ TelegramReliability: Send failed for ${message.id}:`, error);
                this.handleSendFailure(message, error);
            }
        }
    }
    
    async attemptSendMessage(queuedMessage) {
        const messageId = queuedMessage.id;
        
        console.log(`📤 TelegramReliability: Attempting to send ${messageId}`);
        
        queuedMessage.attempts++;
        queuedMessage.lastAttempt = Date.now();
        
        const start = Date.now();
        
        try {
            // Use appropriate sending method
            let result;
            
            if (window.telegramCore && window.telegramCore.isConnectedAndAuthenticated()) {
                // Try Socket.IO first
                result = await this.sendViaSocket(queuedMessage);
            } else {
                // Fallback to API
                result = await this.sendViaAPI(queuedMessage);
            }
            
            const latency = Date.now() - start;
            console.log(`✅ TelegramReliability: Message ${messageId} sent (${latency}ms)`);
            
            // Remove from send queue
            this.sendQueue.delete(messageId);
            
            // Add to acknowledgment queue for confirmation
            this.acknowledgmentQueue.set(messageId, {
                messageId: messageId,
                sentAt: Date.now(),
                method: result.method || 'unknown',
                latency: latency
            });
            
            // Update stats
            this.stats.messagesSent++;
            
            // Emit success event
            this.emit('messageSent', { messageId, latency, result });
            
            return result;
            
        } catch (error) {
            console.error(`❌ TelegramReliability: Send attempt failed for ${messageId}:`, error);
            throw error;
        }
    }
    
    async sendViaSocket(message) {
        if (!window.telegramCore || !window.telegramCore.socket) {
            throw new Error('Socket not available');
        }
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Socket send timeout'));
            }, message.options.timeout);
            
            window.telegramCore.socket.emit('send_message', {
                tempId: message.tempId,
                messageId: message.id,
                text: message.text,
                conversationId: message.conversationId,
                timestamp: message.timestamp?.toISOString() || new Date().toISOString()
            }, (response) => {
                clearTimeout(timeout);
                
                if (response && response.success) {
                    resolve({ ...response, method: 'socket' });
                } else {
                    reject(new Error(response?.message || 'Socket send failed'));
                }
            });
        });
    }
    
    async sendViaAPI(message) {
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
                timestamp: message.timestamp?.toISOString() || new Date().toISOString()
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
        
        return { ...result, method: 'api' };
    }
    
    // === RETRY LOGIC ===
    handleSendFailure(queuedMessage, error) {
        const messageId = queuedMessage.id;
        
        // Remove from send queue
        this.sendQueue.delete(messageId);
        
        // Check if we should retry
        if (queuedMessage.options.retryEnabled && 
            queuedMessage.attempts < this.retryConfig.maxRetries) {
            
            console.log(`🔄 TelegramReliability: Scheduling retry for ${messageId} (attempt ${queuedMessage.attempts})`);
            
            // Calculate retry delay with exponential backoff
            const baseDelay = this.retryConfig.baseDelay * 
                Math.pow(this.retryConfig.backoffFactor, queuedMessage.attempts - 1);
            
            const jitter = baseDelay * this.retryConfig.jitterFactor * Math.random();
            const delay = Math.min(baseDelay + jitter, this.retryConfig.maxDelay);
            
            // Add to retry queue
            this.retryQueue.set(messageId, {
                ...queuedMessage,
                retryAt: Date.now() + delay,
                lastError: error.message
            });
            
            this.stats.messagesRetried++;
            
        } else {
            console.error(`❌ TelegramReliability: Message ${messageId} failed permanently`);
            
            // Mark as failed
            this.stats.messagesFailed++;
            
            // Emit failure event
            this.emit('messageFailed', { messageId, error, attempts: queuedMessage.attempts });
        }
    }
    
    async processRetryQueue() {
        if (this.retryQueue.size === 0) return;
        
        const now = Date.now();
        const readyToRetry = Array.from(this.retryQueue.values())
            .filter(message => message.retryAt <= now);
        
        for (const message of readyToRetry) {
            // Move back to send queue
            this.retryQueue.delete(message.id);
            this.sendQueue.set(message.id, message);
            
            console.log(`🔄 TelegramReliability: Retrying message ${message.id}`);
        }
    }
    
    // === ACKNOWLEDGMENT PROCESSING ===
    async processAcknowledmentQueue() {
        if (this.acknowledgmentQueue.size === 0) return;
        
        const now = Date.now();
        const timeout = 30000; // 30 seconds
        
        // Remove old acknowledgments
        for (const [messageId, ack] of this.acknowledgmentQueue.entries()) {
            if (now - ack.sentAt > timeout) {
                console.warn(`⚠️ TelegramReliability: No acknowledgment for ${messageId}`);
                this.acknowledgmentQueue.delete(messageId);
            }
        }
    }
    
    // Handle message acknowledgment from server
    handleMessageAcknowledgment(messageId, status) {
        const ack = this.acknowledgmentQueue.get(messageId);
        if (ack) {
            console.log(`✅ TelegramReliability: Message ${messageId} acknowledged as ${status}`);
            
            this.acknowledgmentQueue.delete(messageId);
            this.emit('messageAcknowledged', { messageId, status, ack });
        }
    }
    
    // === QUEUE MANAGEMENT ===
    processAllQueues() {
        this.processSendQueue();
        this.processRetryQueue();
        this.processAcknowledmentQueue();
    }
    
    startPeriodicCleanup() {
        // Clean up old queue items every minute
        setInterval(() => {
            this.cleanupQueues();
        }, 60000);
    }
    
    cleanupQueues() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // 5 minutes
        
        // Clean send queue
        for (const [messageId, message] of this.sendQueue.entries()) {
            if (now - message.queuedAt > maxAge) {
                console.warn(`🗑️ TelegramReliability: Removing stale message from send queue: ${messageId}`);
                this.sendQueue.delete(messageId);
            }
        }
        
        // Clean retry queue
        for (const [messageId, message] of this.retryQueue.entries()) {
            if (now - message.queuedAt > maxAge) {
                console.warn(`🗑️ TelegramReliability: Removing stale message from retry queue: ${messageId}`);
                this.retryQueue.delete(messageId);
            }
        }
    }
    
    // === PUBLIC API ===
    
    // Get queue statistics
    getQueueStats() {
        return {
            sendQueue: this.sendQueue.size,
            retryQueue: this.retryQueue.size,
            acknowledgmentQueue: this.acknowledgmentQueue.size,
            connectionQuality: this.connectionQuality,
            isOnline: this.isOnline,
            stats: { ...this.stats }
        };
    }
    
    // Clear all queues
    clearQueues() {
        this.sendQueue.clear();
        this.retryQueue.clear();
        this.acknowledgmentQueue.clear();
        
        console.log('🗑️ TelegramReliability: All queues cleared');
    }
    
    // Retry failed message manually
    retryMessage(messageId) {
        // Look for message in retry queue or failed messages
        const retryMessage = this.retryQueue.get(messageId);
        if (retryMessage) {
            // Move to send queue immediately
            this.retryQueue.delete(messageId);
            this.sendQueue.set(messageId, retryMessage);
            
            console.log(`🔄 TelegramReliability: Manual retry for ${messageId}`);
            return true;
        }
        
        return false;
    }
    
    // === EVENT SYSTEM ===
    eventHandlers = new Map();
    
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
    
    emit(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`❌ TelegramReliability: Event handler error for ${event}:`, error);
                }
            });
        }
    }
}

// Global instance
window.telegramReliability = new TelegramReliability();

// Integration with TelegramCore
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.telegramCore && window.telegramReliability) {
            // Override sendMessage to use reliability system
            const originalSendMessage = window.telegramCore.sendMessage.bind(window.telegramCore);
            
            window.telegramCore.sendMessage = async (text, conversationId) => {
                const tempMessage = window.telegramCore.createTempMessage(text, conversationId);
                
                // Use reliability system
                const messageId = await window.telegramReliability.sendReliableMessage(tempMessage);
                
                // Emit for immediate UI update
                window.telegramCore.emit('messageAdded', tempMessage);
                
                return tempMessage;
            };
            
            // Handle acknowledgments
            window.telegramReliability.on('messageAcknowledged', (data) => {
                if (window.telegramCore) {
                    window.telegramCore.handleMessageSent(data);
                }
            });
            
            console.log('🔗 TelegramReliability: Integrated with TelegramCore');
        }
    }, 1500);
});

console.log('🛡️ TelegramReliability: Loaded');
