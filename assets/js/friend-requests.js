// Friend Requests Page Manager
class FriendRequestsManager {
    constructor() {
        this.friendRequests = [];
        this.allRequests = [];
        this.apiBaseUrl = 'http://localhost:8080/api';
        this.currentUser = null;
        this.currentFilter = 'all';
        
        // Initialize page
        this.init();
    }

    async init() {
        console.log('=== FRIEND REQUESTS PAGE INITIALIZING ===');
        
        // Check authentication first
        await this.checkAuth();
        
        if (!this.currentUser) {
            this.redirectToLogin();
            return;
        }
        
        // Setup user info in sidebar
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
            } else {
                console.log('Auth failed, clearing tokens');
                localStorage.removeItem('token');
                localStorage.removeItem('authToken');
            }
        } catch (error) {
            console.error('Auth check error:', error);
        }
    }

    setupUserInfo() {
        if (!this.currentUser) return;

        const userAvatar = document.getElementById('user-avatar');
        const userName = document.getElementById('user-name');
        const userEmail = document.getElementById('user-email');

        if (userAvatar) {
            userAvatar.src = this.currentUser.avatar || `https://placehold.co/48x48/4F46E5/FFFFFF?text=${this.currentUser.name ? this.currentUser.name.charAt(0) : 'U'}`;
        }

        if (userName) {
            userName.textContent = this.currentUser.name || `${this.currentUser.firstName || ''} ${this.currentUser.lastName || ''}`.trim() || 'User';
        }

        if (userEmail) {
            userEmail.textContent = `@${this.currentUser.email ? this.currentUser.email.split('@')[0] : 'user'}`;
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
                console.log('No token found, redirecting to login');
                this.redirectToLogin();
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
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
            const renderer = new THREE.WebGLRenderer({ canvas, alpha: true });
            
            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setClearColor(0x000011, 0.8);
            
            // Add some stars
            const starsGeometry = new THREE.BufferGeometry();
            const starsMaterial = new THREE.PointsMaterial({ color: 0xFFFFFF, size: 2 });
            
            const starsVertices = [];
            for (let i = 0; i < 1000; i++) {
                starsVertices.push(
                    (Math.random() - 0.5) * 2000,
                    (Math.random() - 0.5) * 2000,
                    (Math.random() - 0.5) * 2000
                );
            }
            
            starsGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starsVertices, 3));
            const stars = new THREE.Points(starsGeometry, starsMaterial);
            scene.add(stars);
            
            camera.position.z = 5;
            
            function animate() {
                requestAnimationFrame(animate);
                stars.rotation.x += 0.001;
                stars.rotation.y += 0.002;
                renderer.render(scene, camera);
            }
            
            animate();
            console.log('3D background initialized successfully');
            
            // Handle resize
            window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            });
            
        } catch (error) {
            console.error('Error setting up 3D background:', error);
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
