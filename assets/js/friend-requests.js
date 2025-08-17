// Friend Requests Page Manager
class FriendRequestsManager {
    constructor() {
        this.friendRequests = [];
        this.allRequests = [];
        // Use environment config for API URL
        this.apiBaseUrl = window.ENV_CONFIG ? window.ENV_CONFIG.apiBaseUrl : 'http://localhost:3000/api';
        this.currentUser = null;
        this.currentFilter = 'all';
        
        // Initialize page
        this.init();
    }

    async init() {
        console.log('=== FRIEND REQUESTS PAGE INITIALIZING ===');
        
        // Always setup user info first (from storage if needed)
        this.setupUserInfo();
        
        // Check authentication
        await this.checkAuth();
        
        if (!this.currentUser) {
            console.log('No authenticated user, showing login prompt instead of redirect');
            this.showLoginPrompt();
            return;
        }
        
        // Re-setup user info with fresh data from API
        this.setupUserInfo();
        
        // Load friend requests
        await this.loadFriendRequests();
        
        // Load sidebar suggestions
        await this.loadSuggestions();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Setup 3D background
        this.setup3DBackground();
        
        // Setup periodic refresh
        this.setupAutoRefresh();
    }

    async checkAuth() {
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('authToken');
            console.log('=== AUTH CHECK DEBUG ===');
            console.log('Token found:', !!token);
            
            if (!token) {
                console.log('No token, user not authenticated');
                return;
            }

            const response = await fetch(`${this.apiBaseUrl}/profile/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('Auth response status:', response.status);

            if (response.ok) {
                const result = await response.json();
                this.currentUser = result.user || result;
                console.log('Current user:', this.currentUser);
                
                // Update localStorage with fresh data from server
                if (this.currentUser) {
                    localStorage.setItem('userInfo', JSON.stringify(this.currentUser));
                    localStorage.setItem('userData', JSON.stringify(this.currentUser));
                    localStorage.setItem('userName', this.currentUser.fullName || this.currentUser.name);
                    localStorage.setItem('fullName', this.currentUser.fullName || this.currentUser.name);
                    localStorage.setItem('userEmail', this.currentUser.email);
                    console.log('✅ Updated localStorage with fresh user data');
                }
                
            } else if (response.status === 401 || response.status === 403) {
                // Only clear tokens for actual authentication errors
                console.log('Auth failed with 401/403, clearing tokens');
                localStorage.removeItem('token');
                localStorage.removeItem('authToken');
            } else {
                // For other errors (like 404, 500), don't clear tokens
                console.log('API error but not auth related:', response.status);
            }
        } catch (error) {
            console.error('Auth check error:', error);
            // Don't clear tokens on network errors
        }
    }

    setupUserInfo() {
        if (!this.currentUser) {
            console.log('No current user, trying to load from localStorage');
            // Try to get user info from localStorage as fallback
            this.loadUserFromStorage();
            return;
        }

        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('user-name');
        const userEmail = document.getElementById('user-email');

        console.log('Setting up user info with:', this.currentUser);

        // Determine display name with proper priority
        let displayName = 'User';
        if (this.currentUser.fullName) {
            displayName = this.currentUser.fullName;
        } else if (this.currentUser.firstName && this.currentUser.lastName) {
            displayName = `${this.currentUser.firstName} ${this.currentUser.lastName}`;
        } else if (this.currentUser.firstName) {
            displayName = this.currentUser.firstName;
        } else if (this.currentUser.name) {
            displayName = this.currentUser.name;
        } else if (this.currentUser.username) {
            displayName = this.currentUser.username;
        } else if (this.currentUser.email) {
            displayName = this.currentUser.email.split('@')[0];
        }

        // Also try localStorage fallback
        if (displayName === 'User') {
            const storedName = localStorage.getItem('userName') || localStorage.getItem('fullName');
            if (storedName) {
                displayName = storedName;
            }
        }

        if (userName) {
            userName.textContent = displayName;
            console.log('Set username to:', displayName);
        }

        if (userEmail) {
            let emailDisplay = '@user';
            if (this.currentUser.username) {
                emailDisplay = `@${this.currentUser.username}`;
            } else if (this.currentUser.email) {
                emailDisplay = `@${this.currentUser.email.split('@')[0]}`;
            }
            userEmail.textContent = emailDisplay;
        }

        if (userAvatar) {
            const firstLetter = displayName.charAt(0).toUpperCase();
            userAvatar.src = this.currentUser.avatar || `https://placehold.co/48x48/4F46E5/FFFFFF?text=${firstLetter}`;
        }
    }

    loadUserFromStorage() {
        console.log('Loading user from localStorage...');
        
        // Try multiple storage keys
        const userInfo = localStorage.getItem('userInfo') || localStorage.getItem('userData');
        const userName = localStorage.getItem('userName') || localStorage.getItem('fullName');
        const userEmail = localStorage.getItem('userEmail') || localStorage.getItem('email');
        
        console.log('Available storage data:', {
            userInfo: !!userInfo,
            userName: userName,
            userEmail: userEmail
        });

        let displayName = 'User';
        let emailDisplay = '@user';

        // Try to parse userInfo first
        if (userInfo) {
            try {
                const user = JSON.parse(userInfo);
                if (user.fullName) {
                    displayName = user.fullName;
                } else if (user.name) {
                    displayName = user.name;
                } else if (user.firstName && user.lastName) {
                    displayName = `${user.firstName} ${user.lastName}`;
                }
                
                if (user.username) {
                    emailDisplay = `@${user.username}`;
                } else if (user.email) {
                    emailDisplay = `@${user.email.split('@')[0]}`;
                }
            } catch (e) {
                console.error('Error parsing userInfo:', e);
            }
        }

        // Fallback to individual fields
        if (displayName === 'User' && userName) {
            displayName = userName;
        }
        
        if (emailDisplay === '@user' && userEmail) {
            emailDisplay = `@${userEmail.split('@')[0]}`;
        }

        // Update UI
        const userNameEl = document.getElementById('user-name');
        const userEmailEl = document.getElementById('user-email');
        const userAvatarEl = document.getElementById('user-avatar');

        if (userNameEl) {
            userNameEl.textContent = displayName;
            console.log('Set username from storage to:', displayName);
        }

        if (userEmailEl) {
            userEmailEl.textContent = emailDisplay;
        }

        if (userAvatarEl) {
            const firstLetter = displayName.charAt(0).toUpperCase();
            userAvatarEl.src = `https://placehold.co/48x48/4F46E5/FFFFFF?text=${firstLetter}`;
        }
    }

    setupEventListeners() {
        // Filter buttons
        const filterAll = document.getElementById('filter-all');
        const filterRecent = document.getElementById('filter-recent');
        const filterOlder = document.getElementById('filter-older');

        filterAll?.addEventListener('click', () => this.setFilter('all'));
        filterRecent?.addEventListener('click', () => this.setFilter('recent'));
        filterOlder?.addEventListener('click', () => this.setFilter('older'));

        // Logout button
        const logoutBtn = document.querySelector('.logout-button');
        logoutBtn?.addEventListener('click', this.logout.bind(this));
    }

    setFilter(filter) {
        this.currentFilter = filter;
        
        // Update active filter button
        document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active', 'bg-indigo-600', 'text-white'));
        const activeBtn = document.getElementById(`filter-${filter}`);
        activeBtn?.classList.add('active', 'bg-indigo-600', 'text-white');
        
        // Filter and render requests
        this.filterAndRenderRequests();
    }

    filterAndRenderRequests() {
        let filteredRequests = [...this.allRequests];

        if (this.currentFilter === 'recent') {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            filteredRequests = filteredRequests.filter(req => new Date(req.createdAt) > oneDayAgo);
        } else if (this.currentFilter === 'older') {
            const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            filteredRequests = filteredRequests.filter(req => new Date(req.createdAt) <= oneDayAgo);
        }

        this.friendRequests = filteredRequests;
        this.renderFriendRequests();
    }

    redirectToLogin() {
        window.location.href = 'login.html';
    }

    showLoginPrompt() {
        const loadingState = document.getElementById('loading-state');
        const emptyState = document.getElementById('empty-state');
        const friendRequestsList = document.getElementById('friend-requests-list');
        
        // Hide loading state
        if (loadingState) loadingState.style.display = 'none';
        if (emptyState) emptyState.classList.add('hidden');
        
        // Show login prompt
        if (friendRequestsList) {
            friendRequestsList.innerHTML = `
                <div class="glass-pane p-8 rounded-2xl text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-4 text-yellow-500">
                        <path d="M9 12l2 2 4-4"/>
                        <path d="M21 12c-1 0-3-1-3-3s2-3 3-3 3 1 3 3-2 3-3 3"/>
                        <path d="M3 12c1 0 3-1 3-3s-2-3-3-3-3 1-3 3 2 3 3 3"/>
                        <path d="M15 21v-6c0-1.1-.9-2-2-2H9c-1.1 0-2 .9-2 2v6"/>
                    </svg>
                    <h3 class="text-lg font-semibold mb-2 text-white">Cần đăng nhập</h3>
                    <p class="text-gray-400 mb-4">Bạn cần đăng nhập để xem lời mời kết bạn</p>
                    <div class="flex gap-4 justify-center">
                        <a href="login.html" class="inline-block px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors">
                            Đăng nhập
                        </a>
                        <a href="register.html" class="inline-block px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition-colors">
                            Đăng ký
                        </a>
                    </div>
                </div>
            `;
        }
        
        // Setup basic user info placeholder
        const userName = document.getElementById('user-name');
        const userEmail = document.getElementById('user-email');
        const userAvatar = document.getElementById('user-avatar');
        
        if (userName) userName.textContent = 'Khách';
        if (userEmail) userEmail.textContent = '@guest';
        if (userAvatar) userAvatar.src = 'https://placehold.co/48x48/4F46E5/FFFFFF?text=K';
        
        // Setup 3D background
        this.setup3DBackground();
        
        // Setup basic event listeners  
        const logoutBtn = document.querySelector('.logout-button');
        if (logoutBtn) {
            logoutBtn.textContent = 'Đăng nhập';
            logoutBtn.addEventListener('click', () => {
                window.location.href = 'login.html';
            });
        }
    }

    async loadFriendRequests() {
        const loadingState = document.getElementById('loading-state');
        const emptyState = document.getElementById('empty-state');
        const friendRequestsList = document.getElementById('friend-requests-list');
        
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('authToken');
            console.log('=== FRIEND REQUESTS DEBUG ===');
            console.log('Token found:', !!token);
            console.log('Token value:', token ? token.substring(0, 20) + '...' : 'none');
            console.log('API URL:', `${this.apiBaseUrl}/friend-requests`);
            
            if (!token) {
                console.log('No token found, showing login prompt instead of redirect');
                this.showLoginPrompt();
                return;
            }
            
            const response = await fetch(`${this.apiBaseUrl}/friend-requests`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('Response status:', response.status);
            console.log('Response ok:', response.ok);

            if (!response.ok) {
                const errorText = await response.text();
                console.log('Error response:', errorText);
                
                // Only redirect on auth errors, not on API errors
                if (response.status === 401 || response.status === 403) {
                    console.log('Authentication error, redirecting to login');
                    this.redirectToLogin();
                    return;
                }
                
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const result = await response.json();
            console.log('Friend requests result:', result);
            this.allRequests = result.friendRequests || [];
            
            // Hide loading state
            loadingState.style.display = 'none';
            
            // Update counts
            this.updateRequestCounts(result.count || 0);
            this.updateStats();
            
            // Apply current filter
            this.filterAndRenderRequests();
            
            if (this.allRequests.length === 0) {
                emptyState.classList.remove('hidden');
            } else {
                emptyState.classList.add('hidden');
            }
            
        } catch (error) {
            console.error('Error loading friend requests:', error);
            loadingState.innerHTML = `
                <div class="glass-pane p-6 rounded-2xl text-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="mx-auto mb-4 text-red-500">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <p class="text-gray-400 mb-2">Lỗi tải dữ liệu: ${error.message}</p>
                    <button onclick="location.reload()" class="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold transition-colors">
                        Thử lại
                    </button>
                </div>
            `;
        }
    }

    updateRequestCounts(count) {
        const totalRequests = document.getElementById('total-requests');
        const requestsCount = document.getElementById('friend-requests-badge');
        
        if (totalRequests) {
            totalRequests.textContent = count;
        }
        
        if (requestsCount) {
            if (count > 0) {
                requestsCount.textContent = count;
                requestsCount.classList.remove('hidden');
            } else {
                requestsCount.classList.add('hidden');
            }
        }
    }

    updateStats() {
        const statsPending = document.getElementById('stats-pending');
        const statsAccepted = document.getElementById('stats-accepted');
        const statsFriends = document.getElementById('stats-friends');

        if (statsPending) statsPending.textContent = this.allRequests.length;

        // For now, set placeholder values - these could be loaded from API
        if (statsAccepted) statsAccepted.textContent = '0';
        if (statsFriends) statsFriends.textContent = '0';
    }

    renderFriendRequests() {
        const friendRequestsList = document.getElementById('friend-requests-list');
        
        if (this.friendRequests.length === 0) {
            friendRequestsList.innerHTML = `
                <div class="glass-pane p-6 rounded-2xl text-center">
                    <p class="text-gray-400">Không có lời mời nào trong bộ lọc này</p>
                </div>
            `;
            return;
        }

        friendRequestsList.innerHTML = this.friendRequests.map(request => `
            <div class="glass-pane user-card p-4 rounded-2xl" data-request-id="${request.id}">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="relative">
                            <img src="${request.sender.avatar}" 
                                 alt="${request.sender.name}" 
                                 class="w-12 h-12 rounded-full object-cover"
                                 onerror="this.onerror=null;this.src='https://placehold.co/48x48/4F46E5/FFFFFF?text=${request.sender.name.charAt(0)}'"
                            >
                        </div>
                        <div class="flex-1">
                            <h3 class="font-semibold text-white">${request.sender.name}</h3>
                            <p class="text-sm text-gray-400">@${request.sender.email.split('@')[0]}</p>
                            ${request.message ? `<p class="text-sm text-gray-300 mt-1 italic">"${request.message}"</p>` : ''}
                            <p class="text-xs text-gray-500 mt-1">${this.formatDate(request.createdAt)}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="friendRequestsManager.acceptRequest('${request.id}')" 
                                class="add-friend-btn px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-sm transition-all">
                            Chấp nhận
                        </button>
                        <button onclick="friendRequestsManager.rejectRequest('${request.id}')" 
                                class="secondary-button px-4 py-2 text-white rounded-lg font-semibold text-sm">
                            Từ chối
                        </button>
                        <button onclick="friendRequestsManager.openMessage('${request.sender.id}')" 
                                class="message-btn p-2 bg-gray-700/50 hover:bg-gray-600/50 text-white rounded-lg transition-all" title="Nhắn tin">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                <polyline points="22,6 12,13 2,6"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }

    async acceptRequest(requestId) {
        await this.handleRequestAction(requestId, 'accept');
    }

    async rejectRequest(requestId) {
        await this.handleRequestAction(requestId, 'reject');
    }

    async handleRequestAction(requestId, action) {
        try {
            const token = localStorage.getItem('token') || localStorage.getItem('authToken');
            
            const response = await fetch(`${this.apiBaseUrl}/friend-requests/${requestId}`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ action })
            });

            const result = await response.json();
            
            if (result.success) {
                // Remove request from UI with animation
                const requestElement = document.querySelector(`[data-request-id="${requestId}"]`);
                if (requestElement) {
                    requestElement.style.transition = 'all 0.3s ease';
                    requestElement.style.opacity = '0';
                    requestElement.style.transform = 'translateX(-100px)';
                    
                    setTimeout(() => {
                        requestElement.remove();
                        
                        // Update local data
                        this.allRequests = this.allRequests.filter(req => req.id !== requestId);
                        
                        // Update counts and stats
                        this.updateRequestCounts(this.allRequests.length);
                        this.updateStats();
                        
                        // Re-apply filter
                        this.filterAndRenderRequests();
                        
                        // Show empty state if no requests left
                        if (this.allRequests.length === 0) {
                            document.getElementById('empty-state').classList.remove('hidden');
                        }
                    }, 300);
                }
                
                const actionText = action === 'accept' ? 'chấp nhận' : 'từ chối';
                this.showNotification(`Đã ${actionText} lời mời kết bạn`, action === 'accept' ? 'success' : 'info');
                
            } else {
                throw new Error(result.message);
            }
            
        } catch (error) {
            console.error('Error handling friend request:', error);
            this.showNotification(error.message || 'Có lỗi xảy ra', 'error');
        }
    }

    openMessage(userId) {
        // Find user data from friend requests
        const request = this.allRequests.find(req => req.sender.id === userId);
        if (request) {
            localStorage.setItem('message_user', JSON.stringify({
                id: request.sender.id,
                name: request.sender.name,
                avatar: request.sender.avatar
            }));
            window.location.href = 'messages.html';
        }
    }

    async loadSuggestions() {
        const sidebarSuggestions = document.getElementById('sidebar-suggestions');
        
        try {
            // For now, show placeholder suggestions
            sidebarSuggestions.innerHTML = `
                <div class="text-center py-4">
                    <p class="text-gray-400 text-sm">Gợi ý sẽ sớm có</p>
                </div>
            `;
        } catch (error) {
            console.error('Error loading suggestions:', error);
        }
    }

    formatDate(dateString) {
        const date = new Date(dateString);
        const now = new Date();
        const diffTime = Math.abs(now - date);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
        
        if (diffHours < 1) {
            return 'Vừa xong';
        } else if (diffHours < 24) {
            return `${diffHours} giờ trước`;
        } else if (diffDays === 1) {
            return 'Hôm qua';
        } else if (diffDays < 7) {
            return `${diffDays} ngày trước`;
        } else {
            return date.toLocaleDateString('vi-VN');
        }
    }

    logout() {
        localStorage.removeItem('token');
        localStorage.removeItem('authToken');
        localStorage.removeItem('message_user');
        window.location.href = 'login.html';
    }

    setupAutoRefresh() {
        // Refresh every 30 seconds
        setInterval(() => {
            this.loadFriendRequests();
        }, 30000);
    }

    setup3DBackground() {
        // Simple 3D background similar to discovery page
        try {
            // Check if Three.js is available
            if (typeof THREE === 'undefined') {
                console.log('Three.js not available, skipping 3D background');
                return;
            }

            const canvas = document.getElementById('cosmic-bg');
            if (!canvas) {
                console.log('Canvas not found, skipping 3D background');
                return;
            }

            console.log('Setting up 3D background...');
            
            // Validate window dimensions
            if (!window.innerWidth || !window.innerHeight) {
                console.log('Invalid window dimensions, waiting...');
                setTimeout(() => this.setup3DBackground(), 1000);
                return;
            }

            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            const renderer = new THREE.WebGLRenderer({ 
                canvas, 
                alpha: true,
                antialias: false, // Disable for performance
                powerPreference: "low-power" // Prefer low power for stability
            });
            
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setClearColor(0x000011, 0.8);
            
            // Add some stars with error checking
            const starsGeometry = new THREE.BufferGeometry();
            const starsMaterial = new THREE.PointsMaterial({ 
                color: 0xFFFFFF, 
                size: 2,
                sizeAttenuation: false // Prevent size calculation errors
            });
            
            const starsVertices = [];
            const vertexCount = 500; // Reduce count for better performance
            
            for (let i = 0; i < vertexCount; i++) {
                starsVertices.push(
                    (Math.random() - 0.5) * 1000, // Reduce range
                    (Math.random() - 0.5) * 1000,
                    (Math.random() - 0.5) * 1000
                );
            }
            
            if (starsVertices.length > 0) {
                starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
                const stars = new THREE.Points(starsGeometry, starsMaterial);
                scene.add(stars);
                
                camera.position.z = 5;
                
                let animationId;
                function animate() {
                    try {
                        animationId = requestAnimationFrame(animate);
                        
                        // Add null checks
                        if (stars && stars.rotation) {
                            stars.rotation.x += 0.001;
                            stars.rotation.y += 0.002;
                        }
                        
                        if (renderer && scene && camera) {
                            renderer.render(scene, camera);
                        }
                    } catch (animError) {
                        console.error('Animation error:', animError);
                        if (animationId) {
                            cancelAnimationFrame(animationId);
                        }
                    }
                }
                
                animate();
                console.log('3D background initialized successfully');
                
                // Handle resize with error checking
                const handleResize = () => {
                    try {
                        if (camera && renderer && window.innerWidth && window.innerHeight) {
                            camera.aspect = window.innerWidth / window.innerHeight;
                            camera.updateProjectionMatrix();
                            renderer.setSize(window.innerWidth, window.innerHeight);
                        }
                    } catch (resizeError) {
                        console.error('Resize error:', resizeError);
                    }
                };
                
                window.addEventListener('resize', handleResize);
                
                // Cleanup on page unload
                window.addEventListener('beforeunload', () => {
                    try {
                        if (animationId) {
                            cancelAnimationFrame(animationId);
                        }
                        if (renderer && renderer.dispose) {
                            renderer.dispose();
                        }
                        if (starsGeometry && starsGeometry.dispose) {
                            starsGeometry.dispose();
                        }
                        if (starsMaterial && starsMaterial.dispose) {
                            starsMaterial.dispose();
                        }
                    } catch (cleanupError) {
                        console.error('Cleanup error:', cleanupError);
                    }
                });
            } else {
                console.warn('No star vertices created, skipping stars');
            }
            
        } catch (error) {
            console.error('Error setting up 3D background:', error);
            // Fallback: Just set a simple dark background
            const canvas = document.getElementById('cosmic-bg');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    canvas.width = window.innerWidth;
                    canvas.height = window.innerHeight;
                    ctx.fillStyle = '#000011';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            }
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.getElementById('notification');
        if (!notification) return;

        const bgColor = {
            success: 'bg-green-600',
            error: 'bg-red-600',
            info: 'bg-blue-600'
        }[type] || 'bg-blue-600';

        notification.innerHTML = `
            <div class="${bgColor} text-white px-6 py-3 rounded-lg shadow-lg flex items-center gap-3">
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.classList.add('hidden')" class="text-white hover:text-gray-200">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        `;

        notification.classList.remove('hidden');

        setTimeout(() => {
            notification.classList.add('hidden');
        }, 5000);
    }
}

// Initialize when page loads
let friendRequestsManager;

document.addEventListener('DOMContentLoaded', () => {
    friendRequestsManager = new FriendRequestsManager();
});
