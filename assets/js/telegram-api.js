// === TELEGRAM API INTEGRATION WRAPPER ===

/**
 * Telegram API integration using official libraries
 * Provides unified interface for Telegram functionality
 */
class TelegramAPIWrapper {
    constructor() {
        this.isAvailable = false;
        this.clientType = null; // 'mtproto', 'bot', 'web-app'
        this.client = null;
        this.session = null;
        
        this.init();
    }
    
    async init() {
        console.log('📱 TelegramAPI: Initializing...');
        
        try {
            // Detect environment and available APIs
            await this.detectEnvironment();
            
            // Initialize appropriate client
            await this.initializeClient();
            
            console.log(`✅ TelegramAPI: Initialized with ${this.clientType}`);
            
        } catch (error) {
            console.warn('⚠️ TelegramAPI: Initialization failed:', error);
            console.log('📱 TelegramAPI: Falling back to custom implementation');
        }
    }
    
    async detectEnvironment() {
        // Check if we're in Telegram Web App
        if (typeof window !== 'undefined' && window.Telegram?.WebApp) {
            this.clientType = 'web-app';
            console.log('📱 TelegramAPI: Detected Telegram Web App environment');
            return;
        }
        
        // Check for Node.js environment (server-side)
        if (typeof window === 'undefined' && typeof require !== 'undefined') {
            try {
                const telegram = require('telegram');
                if (telegram) {
                    this.clientType = 'mtproto';
                    console.log('📱 TelegramAPI: Detected Node.js MTProto environment');
                    return;
                }
            } catch (error) {
                console.log('📱 TelegramAPI: MTProto not available');
            }
        }
        
        // Default to custom implementation
        this.clientType = 'custom';
        console.log('📱 TelegramAPI: Using custom implementation');
    }
    
    async initializeClient() {
        switch (this.clientType) {
            case 'web-app':
                await this.initWebApp();
                break;
            case 'mtproto':
                await this.initMTProto();
                break;
            case 'custom':
            default:
                await this.initCustom();
                break;
        }
    }
    
    // === TELEGRAM WEB APP INTEGRATION ===
    async initWebApp() {
        try {
            if (window.Telegram?.WebApp) {
                const webApp = window.Telegram.WebApp;
                
                // Initialize web app
                webApp.ready();
                webApp.expand();
                
                // Get user data
                const user = webApp.initDataUnsafe?.user;
                if (user) {
                    console.log('👤 TelegramAPI: Web App user data:', user);
                    
                    // Integrate with UserManager
                    if (window.userManager) {
                        const userData = {
                            id: user.id.toString(),
                            name: `${user.first_name} ${user.last_name || ''}`.trim(),
                            username: user.username,
                            avatar: user.photo_url,
                            telegramId: user.id,
                            languageCode: user.language_code
                        };
                        
                        window.userManager.cacheUserData(userData.id, userData);
                    }
                }
                
                // Setup theme
                this.setupWebAppTheme(webApp);
                
                // Setup haptic feedback
                this.setupHapticFeedback(webApp);
                
                this.client = webApp;
                this.isAvailable = true;
                
                console.log('✅ TelegramAPI: Web App initialized');
            }
        } catch (error) {
            console.error('❌ TelegramAPI: Web App init failed:', error);
            throw error;
        }
    }
    
    setupWebAppTheme(webApp) {
        try {
            const themeParams = webApp.themeParams;
            
            if (themeParams) {
                // Apply Telegram theme to our app
                const root = document.documentElement;
                
                if (themeParams.bg_color) {
                    root.style.setProperty('--telegram-bg', themeParams.bg_color);
                }
                
                if (themeParams.text_color) {
                    root.style.setProperty('--telegram-text', themeParams.text_color);
                }
                
                if (themeParams.button_color) {
                    root.style.setProperty('--telegram-button', themeParams.button_color);
                }
                
                if (themeParams.button_text_color) {
                    root.style.setProperty('--telegram-button-text', themeParams.button_text_color);
                }
                
                console.log('🎨 TelegramAPI: Theme applied');
            }
        } catch (error) {
            console.warn('⚠️ TelegramAPI: Theme setup failed:', error);
        }
    }
    
    setupHapticFeedback(webApp) {
        if (webApp.HapticFeedback) {
            // Add haptic feedback to interactions
            this.hapticFeedback = {
                light: () => webApp.HapticFeedback.impactOccurred('light'),
                medium: () => webApp.HapticFeedback.impactOccurred('medium'),
                heavy: () => webApp.HapticFeedback.impactOccurred('heavy'),
                success: () => webApp.HapticFeedback.notificationOccurred('success'),
                warning: () => webApp.HapticFeedback.notificationOccurred('warning'),
                error: () => webApp.HapticFeedback.notificationOccurred('error')
            };
            
            console.log('📳 TelegramAPI: Haptic feedback enabled');
        }
    }
    
    // === MTPROTO INTEGRATION (Server-side) ===
    async initMTProto() {
        // This would be used for server-side Telegram integration
        // For security reasons, we don't implement full MTProto in browser
        console.log('📱 TelegramAPI: MTProto init (server-side only)');
        this.isAvailable = false;
    }
    
    // === CUSTOM IMPLEMENTATION ===
    async initCustom() {
        // Fallback to our custom messaging system
        this.isAvailable = true;
        console.log('📱 TelegramAPI: Custom implementation ready');
    }
    
    // === PUBLIC API METHODS ===
    
    // Get current user info
    getCurrentUser() {
        if (this.clientType === 'web-app' && this.client?.initDataUnsafe?.user) {
            const user = this.client.initDataUnsafe.user;
            return {
                id: user.id.toString(),
                name: `${user.first_name} ${user.last_name || ''}`.trim(),
                username: user.username,
                avatar: user.photo_url,
                telegramId: user.id,
                languageCode: user.language_code
            };
        }
        
        return null;
    }
    
    // Send haptic feedback
    haptic(type = 'light') {
        if (this.hapticFeedback && this.hapticFeedback[type]) {
            this.hapticFeedback[type]();
        }
    }
    
    // Show native alert
    showAlert(message) {
        if (this.clientType === 'web-app' && this.client?.showAlert) {
            this.client.showAlert(message);
            return true;
        }
        
        // Fallback to browser alert
        alert(message);
        return false;
    }
    
    // Show native confirm
    async showConfirm(message) {
        if (this.clientType === 'web-app' && this.client?.showConfirm) {
            return new Promise((resolve) => {
                this.client.showConfirm(message, resolve);
            });
        }
        
        // Fallback to browser confirm
        return confirm(message);
    }
    
    // Show native popup
    async showPopup(params) {
        if (this.clientType === 'web-app' && this.client?.showPopup) {
            return new Promise((resolve) => {
                this.client.showPopup(params, resolve);
            });
        }
        
        // Fallback to browser alert
        alert(params.message || '');
        return null;
    }
    
    // Set main button
    setMainButton(params) {
        if (this.clientType === 'web-app' && this.client?.MainButton) {
            const mainButton = this.client.MainButton;
            
            if (params.text) mainButton.setText(params.text);
            if (params.color) mainButton.setParams({ color: params.color });
            if (params.textColor) mainButton.setParams({ text_color: params.textColor });
            
            if (params.onClick) {
                mainButton.onClick(params.onClick);
            }
            
            if (params.show) {
                mainButton.show();
            } else if (params.hide) {
                mainButton.hide();
            }
            
            return true;
        }
        
        return false;
    }
    
    // Set back button
    setBackButton(params) {
        if (this.clientType === 'web-app' && this.client?.BackButton) {
            const backButton = this.client.BackButton;
            
            if (params.onClick) {
                backButton.onClick(params.onClick);
            }
            
            if (params.show) {
                backButton.show();
            } else if (params.hide) {
                backButton.hide();
            }
            
            return true;
        }
        
        return false;
    }
    
    // Close web app
    close() {
        if (this.clientType === 'web-app' && this.client?.close) {
            this.client.close();
            return true;
        }
        
        return false;
    }
    
    // Send data to Telegram
    sendData(data) {
        if (this.clientType === 'web-app' && this.client?.sendData) {
            this.client.sendData(JSON.stringify(data));
            return true;
        }
        
        return false;
    }
    
    // === INTEGRATION WITH OUR SYSTEM ===
    
    // Enhance message sending with Telegram features
    enhanceMessageSending() {
        if (!window.telegramCore) return;
        
        // Override sendMessage to add Telegram features
        const originalSendMessage = window.telegramCore.sendMessage.bind(window.telegramCore);
        
        window.telegramCore.sendMessage = async (text, conversationId) => {
            // Add haptic feedback
            this.haptic('light');
            
            try {
                const result = await originalSendMessage(text, conversationId);
                
                // Success feedback
                this.haptic('success');
                
                return result;
            } catch (error) {
                // Error feedback
                this.haptic('error');
                throw error;
            }
        };
    }
    
    // Enhance UI with Telegram styling
    enhanceUI() {
        if (this.clientType !== 'web-app') return;
        
        // Apply Telegram theme colors
        const style = document.createElement('style');
        style.textContent = `
            :root {
                --telegram-primary: var(--telegram-button, #3b82f6);
                --telegram-background: var(--telegram-bg, #0f172a);
                --telegram-text: var(--telegram-text, #ffffff);
                --telegram-button-text: var(--telegram-button-text, #ffffff);
            }
            
            .telegram-style {
                background-color: var(--telegram-background);
                color: var(--telegram-text);
            }
            
            .telegram-button {
                background-color: var(--telegram-primary);
                color: var(--telegram-button-text);
            }
        `;
        
        document.head.appendChild(style);
        
        // Add telegram-style class to body
        document.body.classList.add('telegram-style');
    }
    
    // === UTILITY METHODS ===
    
    // Check if feature is available
    isFeatureAvailable(feature) {
        const features = {
            'haptic': !!this.hapticFeedback,
            'alerts': this.clientType === 'web-app',
            'mainButton': this.clientType === 'web-app',
            'backButton': this.clientType === 'web-app',
            'theme': this.clientType === 'web-app',
            'userData': this.clientType === 'web-app'
        };
        
        return features[feature] || false;
    }
    
    // Get environment info
    getEnvironmentInfo() {
        return {
            clientType: this.clientType,
            isAvailable: this.isAvailable,
            platform: this.client?.platform,
            version: this.client?.version,
            features: {
                haptic: this.isFeatureAvailable('haptic'),
                alerts: this.isFeatureAvailable('alerts'),
                mainButton: this.isFeatureAvailable('mainButton'),
                backButton: this.isFeatureAvailable('backButton'),
                theme: this.isFeatureAvailable('theme'),
                userData: this.isFeatureAvailable('userData')
            }
        };
    }
}

// Global instance
window.telegramAPI = new TelegramAPIWrapper();

// Integration with existing system
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (window.telegramAPI && window.telegramCore) {
            // Enhance messaging with Telegram features
            window.telegramAPI.enhanceMessageSending();
            window.telegramAPI.enhanceUI();
            
            console.log('🔗 TelegramAPI: Enhanced messaging system');
        }
    }, 1000);
});

console.log('📱 TelegramAPI: Wrapper loaded');
