// Modern User Data Manager - Inspired by Telegram's approach
class UserManager {
    constructor() {
        this.currentUser = null;
        this.listeners = new Set();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes cache
        this.lastFetch = 0;
        
        this.init();
    }
    
    async init() {
        console.log('🚀 UserManager: Initializing...');
        
        // Load cached user data first
        this.loadFromCache();
        
        // Then fetch fresh data if needed
        await this.refreshUserData();
        
        console.log('✅ UserManager: Initialized');
    }
    
    // Load user data from localStorage cache
    loadFromCache() {
        try {
            const cachedUser = localStorage.getItem('userManager_cache');
            const cacheTime = localStorage.getItem('userManager_cacheTime');
            
            if (cachedUser && cacheTime) {
                const age = Date.now() - parseInt(cacheTime);
                if (age < this.cacheTimeout) {
                    this.currentUser = JSON.parse(cachedUser);
                    console.log('📦 UserManager: Loaded from cache:', this.currentUser);
                    this.notifyListeners();
                    return true;
                }
            }
        } catch (error) {
            console.warn('UserManager: Cache load failed:', error);
        }
        return false;
    }
    
    // Save user data to cache
    saveToCache(userData) {
        try {
            localStorage.setItem('userManager_cache', JSON.stringify(userData));
            localStorage.setItem('userManager_cacheTime', Date.now().toString());
            
            // Also update legacy storage for compatibility
            localStorage.setItem('userInfo', JSON.stringify(userData));
            localStorage.setItem('userData', JSON.stringify(userData));
            localStorage.setItem('userName', userData.fullName || userData.name || '');
            localStorage.setItem('userEmail', userData.email || '');
            localStorage.setItem('fullName', userData.fullName || '');
            
        } catch (error) {
            console.error('UserManager: Cache save failed:', error);
        }
    }
    
    // Fetch fresh user data from API
    async refreshUserData(force = false) {
        const now = Date.now();
        
        // Check if we need to fetch (respect cache timeout unless forced)
        if (!force && (now - this.lastFetch) < this.cacheTimeout) {
            console.log('📡 UserManager: Using cached data, skipping fetch');
            return this.currentUser;
        }
        
        try {
            console.log('📡 UserManager: Fetching fresh user data...');
            
            const token = this.getAuthToken();
            if (!token) {
                console.warn('UserManager: No auth token available');
                return null;
            }
            
            const response = await fetch('/api/profile/me', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.user) {
                console.log('✅ UserManager: Fresh data received:', data.user);
                
                this.currentUser = data.user;
                this.lastFetch = now;
                
                // Save to cache
                this.saveToCache(data.user);
                
                // Notify listeners
                this.notifyListeners();
                
                return data.user;
            } else {
                throw new Error(data.message || 'Invalid API response');
            }
            
        } catch (error) {
            console.error('❌ UserManager: Fetch failed:', error);
            
            // If we have cached data, continue using it
            if (this.currentUser) {
                console.log('📦 UserManager: Using cached data due to fetch failure');
                return this.currentUser;
            }
            
            return null;
        }
    }
    
    // Update user data (like profile changes)
    async updateUserData(updates) {
        try {
            console.log('📝 UserManager: Updating user data:', updates);
            
            const token = this.getAuthToken();
            if (!token) {
                throw new Error('No auth token available');
            }
            
            const response = await fetch('/api/profile/me', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(updates)
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            
            if (data.success && data.user) {
                console.log('✅ UserManager: User data updated:', data.user);
                
                // Update current user
                this.currentUser = data.user;
                this.lastFetch = Date.now();
                
                // Save to cache
                this.saveToCache(data.user);
                
                // Notify all listeners about the update
                this.notifyListeners();
                
                return data.user;
            } else {
                throw new Error(data.message || 'Update failed');
            }
            
        } catch (error) {
            console.error('❌ UserManager: Update failed:', error);
            throw error;
        }
    }
    
    // Get current user data
    getCurrentUser() {
        return this.currentUser;
    }
    
    // Get user display name (with fallbacks like Telegram)
    getUserDisplayName() {
        if (!this.currentUser) return 'User';
        
        const user = this.currentUser;
        
        // Priority order like Telegram
        return user.fullName || 
               (user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : '') ||
               user.firstName ||
               user.name ||
               user.username ||
               (user.email ? user.email.split('@')[0] : '') ||
               'User';
    }
    
    // Get user avatar with fallback
    getUserAvatar() {
        if (!this.currentUser) return this.generateDefaultAvatar('U');
        
        const user = this.currentUser;
        return user.avatar || this.generateDefaultAvatar(this.getUserDisplayName());
    }
    
    // Generate default avatar like Telegram
    generateDefaultAvatar(name) {
        const firstLetter = (name || 'U').charAt(0).toUpperCase();
        return `https://placehold.co/150x150/4F46E5/FFFFFF?text=${firstLetter}`;
    }
    
    // Get authentication token
    getAuthToken() {
        return localStorage.getItem('token') || 
               localStorage.getItem('authToken') || 
               localStorage.getItem('accessToken');
    }
    
    // Subscribe to user data changes
    subscribe(callback) {
        this.listeners.add(callback);
        
        // Immediately call with current data
        if (this.currentUser) {
            callback(this.currentUser);
        }
        
        // Return unsubscribe function
        return () => {
            this.listeners.delete(callback);
        };
    }
    
    // Notify all listeners of changes
    notifyListeners() {
        console.log(`📢 UserManager: Notifying ${this.listeners.size} listeners`);
        
        this.listeners.forEach(callback => {
            try {
                callback(this.currentUser);
            } catch (error) {
                console.error('UserManager: Listener error:', error);
            }
        });
    }
    
    // Force refresh (like Telegram's pull-to-refresh)
    async forceRefresh() {
        console.log('🔄 UserManager: Force refresh requested');
        return await this.refreshUserData(true);
    }
    
    // Clear all user data (logout)
    clearUserData() {
        console.log('🧹 UserManager: Clearing user data');
        
        this.currentUser = null;
        this.lastFetch = 0;
        
        // Clear cache
        localStorage.removeItem('userManager_cache');
        localStorage.removeItem('userManager_cacheTime');
        
        // Clear legacy storage
        localStorage.removeItem('userInfo');
        localStorage.removeItem('userData');
        localStorage.removeItem('userName');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('fullName');
        
        // Notify listeners
        this.notifyListeners();
    }
    
    // Auto-update UI elements (like Telegram)
    updateUIElements() {
        if (!this.currentUser) return;
        
        const displayName = this.getUserDisplayName();
        const avatar = this.getUserAvatar();
        const email = this.currentUser.email || '';
        
        // Update name elements
        document.querySelectorAll('[data-user="name"], #user-name').forEach(el => {
            if (el) el.textContent = displayName;
        });
        
        // Update email elements  
        document.querySelectorAll('[data-user="email"], #user-email').forEach(el => {
            if (el) el.textContent = email.includes('@') ? `@${email.split('@')[0]}` : `@${email}`;
        });
        
        // Update avatar elements
        document.querySelectorAll('[data-user="avatar"], #user-avatar').forEach(el => {
            if (el) {
                if (el.tagName === 'IMG') {
                    el.src = avatar;
                    el.alt = displayName;
                } else {
                    el.style.backgroundImage = `url(${avatar})`;
                }
            }
        });
        
        console.log('🎨 UserManager: UI elements updated');
    }
}

// Global instance (singleton like Telegram)
window.userManager = new UserManager();

// Auto-update UI when user data changes
window.userManager.subscribe((userData) => {
    if (userData) {
        window.userManager.updateUIElements();
    }
});

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UserManager;
}
