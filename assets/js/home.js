// Global error handler for catching unhandled promise rejections and errors
window.addEventListener('error', (event) => {
    console.error('🚨 Global error caught:', event.error);
    // Don't throw to console for third-party library errors
    if (event.filename && event.filename.includes('index.global.js')) {
        console.warn('⚠️ TailwindCSS library error (non-critical):', event.error);
        return true; // Prevent default error handling
    }
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('🚨 Unhandled promise rejection:', event.reason);
    // Prevent error from being logged to console for known third-party errors
    if (event.reason && event.reason.stack && event.reason.stack.includes('index.global.js')) {
        console.warn('⚠️ TailwindCSS promise rejection (non-critical):', event.reason);
        event.preventDefault();
    }
});

// --- Page Navigation and Popup Logic ---
document.addEventListener('DOMContentLoaded', () => {
    const mainNav = document.getElementById('main-nav');
    const navLinks = mainNav.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page-content');
    const mainContent = document.getElementById('main-content');
    const rightSidebar = document.getElementById('right-sidebar');

    // --- Navigation Logic ---
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            // Only prevent default if it's an internal page transition (data-page exists but no href)
            if (link.getAttribute('href') === '#' && link.dataset.page) {
                e.preventDefault();
                const targetPageId = link.dataset.page;

                // Hide all pages
                pages.forEach(page => page.classList.add('hidden'));

                // Show the target page
                const targetPage = document.getElementById(`page-${targetPageId}`);
                if (targetPage) {
                    targetPage.classList.remove('hidden');
                }

                // Update active link style
                navLinks.forEach(navLink => {
                    navLink.classList.remove('text-white', 'bg-gray-500/20');
                    navLink.classList.add('hover:bg-gray-800/50');
                });
                link.classList.add('text-white', 'bg-gray-500/20');
                link.classList.remove('hover:bg-gray-800/50');
                
                // Adjust layout for Maps page
                if (targetPageId === 'maps') {
                    mainContent.classList.remove('lg:col-span-5');
                    mainContent.classList.add('lg:col-span-9');
                    rightSidebar.classList.add('hidden');
                } else {
                    mainContent.classList.remove('lg:col-span-9');
                    mainContent.classList.add('lg:col-span-5');
                    rightSidebar.classList.remove('hidden');
                }

                // Load profile data when switching to profile page
                if (targetPageId === 'profile') {
                    console.log('🔄 Navigation: Switching to profile page, loading profile...');
                    loadUserProfile();
                }
            }
            // If href is set to a real URL, let the default navigation happen
        });
    });

    // --- Popup Logic ---
    const popup = document.getElementById('create-post-popup');
    const openPopupInput = document.getElementById('open-popup-input');
    const closePopupButton = document.getElementById('close-popup-button');
    const postTextarea = document.getElementById('post-textarea');
    const submitPostButton = document.getElementById('submit-post-button');
    const charCounter = document.getElementById('char-counter');
    const MAX_CHARS = 500;

    // New feature elements
    const addImageBtn = document.getElementById('add-image-btn');
    const imageInput = document.getElementById('image-input');
    const imagePreviewArea = document.getElementById('image-preview-area');
    const imagePreviewContainer = document.getElementById('image-preview-container');
    const removeImagesBtn = document.getElementById('remove-images');
    
    const tagFriendsBtn = document.getElementById('tag-friends-btn');
    const tagFriendsModal = document.getElementById('tag-friends-modal');
    const closeTagModal = document.getElementById('close-tag-modal');
    const friendSearch = document.getElementById('friend-search');
    const friendsList = document.getElementById('friends-list');
    const taggedFriendsArea = document.getElementById('tagged-friends-area');
    const taggedFriendsList = document.getElementById('tagged-friends-list');
    const clearTagsBtn = document.getElementById('clear-tags');
    
    const addLocationBtn = document.getElementById('add-location-btn');
    const locationModal = document.getElementById('location-modal');
    const closeLocationModal = document.getElementById('close-location-modal');
    const locationSearch = document.getElementById('location-search');
    const currentLocationBtn = document.getElementById('current-location-btn');
    const locationSuggestions = document.getElementById('location-suggestions');
    const locationArea = document.getElementById('location-area');
    const locationText = document.getElementById('location-text');
    const removeLocationBtn = document.getElementById('remove-location');

    // Data storage
    let selectedImages = [];
    let taggedFriends = [];
    let selectedLocation = null;

    // Check if all elements exist before adding event listeners
    if (popup && openPopupInput && closePopupButton && postTextarea && submitPostButton) {
        try {
            const openPopup = () => {
            popup.classList.remove('hidden');
            // Update user info in popup
            updatePopupUserInfo();
            // Reset textarea height to minimum
            postTextarea.style.height = '120px';
            // Focus on textarea when popup opens
            setTimeout(() => {
                postTextarea.focus();
            }, 100);
        };
        
        const closePopup = () => {
            popup.classList.add('hidden');
            // Clear textarea when closing
            postTextarea.value = '';
            submitPostButton.disabled = true;
            updateCharCounter();
            // Reset textarea height
            postTextarea.style.height = '120px';
            
            // Clear all attachments
            clearImages();
            clearTags();
            clearLocation();
        };

        const updateCharCounter = () => {
            if (charCounter) {
                const currentLength = postTextarea.value.length;
                charCounter.textContent = `${currentLength}/${MAX_CHARS}`;
                
                // Change color based on character count
                if (currentLength > MAX_CHARS * 0.9) {
                    charCounter.className = 'text-red-400';
                } else if (currentLength > MAX_CHARS * 0.7) {
                    charCounter.className = 'text-yellow-400';
                } else {
                    charCounter.className = 'text-gray-400';
                }
            }
        };

        const autoResizeTextarea = () => {
            // Reset height to auto to get the correct scrollHeight
            postTextarea.style.height = 'auto';
            
            // Calculate new height based on content
            const newHeight = Math.min(Math.max(postTextarea.scrollHeight, 120), 300);
            postTextarea.style.height = newHeight + 'px';
        };

        const updatePopupUserInfo = () => {
            const userName = localStorage.getItem('userName') || 'Phi Hành Gia';
            const userEmail = localStorage.getItem('userEmail') || 'astronaut';
            
            const popupUserName = document.getElementById('popup-user-name');
            const popupUserEmail = document.getElementById('popup-user-email');
            const popupUserAvatar = document.getElementById('popup-user-avatar');
            
            if (popupUserName) popupUserName.textContent = userName;
            if (popupUserEmail) popupUserEmail.textContent = '@' + userEmail.replace('@', '');
            if (popupUserAvatar) {
                // Update avatar with first letter of name
                const firstLetter = userName.charAt(0).toUpperCase();
                popupUserAvatar.src = `https://placehold.co/48x48/4F46E5/FFFFFF?text=${firstLetter}`;
            }
        };

        // === IMAGE FUNCTIONS ===
        const handleImageSelect = (event) => {
            const files = Array.from(event.target.files);
            files.forEach(file => {
                if (file.type.startsWith('image/') && selectedImages.length < 4) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const imageData = {
                            file: file,
                            url: e.target.result,
                            id: Date.now() + Math.random()
                        };
                        selectedImages.push(imageData);
                        updateImagePreview();
                    };
                    reader.readAsDataURL(file);
                }
            });
            // Clear input to allow selecting same file again
            event.target.value = '';
        };

        const updateImagePreview = () => {
            if (selectedImages.length > 0) {
                imagePreviewArea.classList.remove('hidden');
                imagePreviewContainer.innerHTML = selectedImages.map(image => `
                    <div class="image-preview-item">
                        <img src="${image.url}" alt="Preview">
                        <button class="remove-image" onclick="removeImage('${image.id}')">×</button>
                    </div>
                `).join('');
            } else {
                imagePreviewArea.classList.add('hidden');
            }
        };

        window.removeImage = (imageId) => {
            selectedImages = selectedImages.filter(img => img.id != imageId);
            updateImagePreview();
        };

        const clearImages = () => {
            selectedImages = [];
            updateImagePreview();
        };

        // === TAG FRIENDS FUNCTIONS ===
        const loadFriends = async () => {
            try {
                const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('cosmic_token');
                if (!token) {
                    friendsList.innerHTML = '<div class="text-center text-gray-400 py-4">Vui lòng đăng nhập để tag bạn bè</div>';
                    return;
                }

                friendsList.innerHTML = '<div class="text-center text-gray-400 py-4">Đang tải...</div>';

                // Fetch actual friends data from API
                try {
                    const response = await fetch('/api/friends', {
                        method: 'GET',
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const data = await response.json();
                    const friends = data.friends || data || [];

                    if (friends.length === 0) {
                        friendsList.innerHTML = '<div class="text-center text-gray-400 py-4">Chưa có bạn bè nào</div>';
                        return;
                    }

                    displayFriends(friends);

                } catch (error) {
                    console.error('Error fetching friends:', error);
                    
                    // Fallback: Show empty state or retry option
                    friendsList.innerHTML = `
                        <div class="text-center py-4">
                            <div class="text-red-400 mb-2">Không thể tải danh sách bạn bè</div>
                            <button onclick="loadFriends()" class="text-blue-400 hover:text-blue-300 text-sm underline">
                                Thử lại
                            </button>
                        </div>
                    `;
                }
            } catch (error) {
                console.error('Error loading friends:', error);
                friendsList.innerHTML = '<div class="text-center text-red-400 py-4">Lỗi khi tải danh sách bạn bè</div>';
            }
        };

        const searchFriendsAPI = async (query) => {
            const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('cosmic_token');
            if (!token) {
                friendsList.innerHTML = '<div class="text-center text-gray-400 py-4">Vui lòng đăng nhập để tìm kiếm bạn bè</div>';
                return;
            }

            friendsList.innerHTML = '<div class="text-center text-gray-400 py-4">Đang tìm kiếm...</div>';

            try {
                const response = await fetch(`/api/friends/search?q=${encodeURIComponent(query)}`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                const data = await response.json();
                const friends = data.friends || data || [];

                if (friends.length === 0) {
                    friendsList.innerHTML = `
                        <div class="text-center text-gray-400 py-4">
                            <div class="mb-2">Không tìm thấy bạn bè nào với từ khóa "${query}"</div>
                            <button onclick="loadFriends()" class="text-blue-400 hover:text-blue-300 text-sm underline">
                                Xem tất cả bạn bè
                            </button>
                        </div>
                    `;
                    return;
                }

                displayFriends(friends);

            } catch (error) {
                console.error('Error searching friends:', error);
                friendsList.innerHTML = `
                    <div class="text-center py-4">
                        <div class="text-red-400 mb-2">Lỗi khi tìm kiếm bạn bè</div>
                        <button onclick="loadFriends()" class="text-blue-400 hover:text-blue-300 text-sm underline">
                            Quay lại danh sách bạn bè
                        </button>
                    </div>
                `;
            }
        };

        const displayFriends = (friends) => {
            friendsList.innerHTML = friends.map(friend => `
                <div class="friend-item ${taggedFriends.find(f => f.id === friend.id) ? 'selected' : ''}" data-friend-id="${friend.id}">
                    <img src="${friend.avatar}" alt="${friend.name}">
                    <div>
                        <div class="font-semibold text-white">${friend.name}</div>
                        <div class="text-sm text-gray-400">@${friend.username}</div>
                    </div>
                </div>
            `).join('');

            // Add click event listeners
            document.querySelectorAll('.friend-item').forEach(item => {
                item.addEventListener('click', () => toggleFriendTag(item));
            });
        };

        const toggleFriendTag = (friendElement) => {
            const friendId = parseInt(friendElement.dataset.friendId);
            const friendData = {
                id: friendId,
                name: friendElement.querySelector('.font-semibold').textContent,
                username: friendElement.querySelector('.text-gray-400').textContent.replace('@', ''),
                avatar: friendElement.querySelector('img').src
            };

            const existingIndex = taggedFriends.findIndex(f => f.id === friendId);
            
            if (existingIndex > -1) {
                // Remove tag
                taggedFriends.splice(existingIndex, 1);
                friendElement.classList.remove('selected');
            } else {
                // Add tag
                taggedFriends.push(friendData);
                friendElement.classList.add('selected');
            }
            
            updateTaggedFriendsDisplay();
        };

        const updateTaggedFriendsDisplay = () => {
            if (taggedFriends.length > 0) {
                taggedFriendsArea.classList.remove('hidden');
                taggedFriendsList.innerHTML = taggedFriends.map(friend => `
                    <div class="friend-tag">
                        <img src="${friend.avatar}" alt="${friend.name}" style="width: 20px; height: 20px; border-radius: 50%;">
                        ${friend.name}
                        <button class="remove-tag" onclick="removeTag(${friend.id})">×</button>
                    </div>
                `).join('');
            } else {
                taggedFriendsArea.classList.add('hidden');
            }
        };

        window.removeTag = (friendId) => {
            taggedFriends = taggedFriends.filter(f => f.id !== friendId);
            updateTaggedFriendsDisplay();
            // Update friend item selection in modal
            const friendItem = document.querySelector(`[data-friend-id="${friendId}"]`);
            if (friendItem) friendItem.classList.remove('selected');
        };

        const clearTags = () => {
            taggedFriends = [];
            updateTaggedFriendsDisplay();
        };

        // === LOCATION FUNCTIONS ===
        const getCurrentLocation = () => {
            currentLocationBtn.innerHTML = `
                <div class="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full mr-2"></div>
                Đang lấy vị trí...
            `;
            currentLocationBtn.disabled = true;
            
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    async (position) => {
                        const { latitude, longitude } = position.coords;
                        
                        try {
                            // Use OpenStreetMap Nominatim API for reverse geocoding
                            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1&accept-language=vi`, {
                                headers: {
                                    'User-Agent': 'CosmicSocialNetwork/1.0'
                                }
                            });
                            
                            if (!response.ok) {
                                throw new Error('Reverse geocoding failed');
                            }
                            
                            const data = await response.json();
                            
                            let locationName = 'Vị trí hiện tại';
                            let locationAddress = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
                            
                            if (data && data.display_name) {
                                // Extract meaningful location name
                                const addressParts = data.display_name.split(',');
                                locationName = addressParts.slice(0, 3).join(', ').trim();
                                locationAddress = data.display_name;
                            }
                            
                            const currentLocation = {
                                name: locationName,
                                address: locationAddress,
                                coordinates: { 
                                    lat: parseFloat(latitude.toFixed(6)), 
                                    lng: parseFloat(longitude.toFixed(6)) 
                                },
                                isCurrentLocation: true,
                                osm_data: data
                            };
                            
                            setLocation(currentLocation);
                            locationModal.classList.add('hidden');
                            showNotification(`Đã lấy vị trí: ${locationName}`, 'success');
                            
                        } catch (error) {
                            console.error('Error getting location name:', error);
                            // Fallback to coordinates only
                            const fallbackLocation = {
                                name: 'Vị trí hiện tại',
                                address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
                                coordinates: { 
                                    lat: parseFloat(latitude.toFixed(6)), 
                                    lng: parseFloat(longitude.toFixed(6)) 
                                },
                                isCurrentLocation: true,
                                isError: true
                            };
                            
                            setLocation(fallbackLocation);
                            locationModal.classList.add('hidden');
                            showNotification('Đã lấy vị trí hiện tại (không thể xác định tên)', 'success');
                        } finally {
                            // Reset button
                            currentLocationBtn.innerHTML = `
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="12" r="10"/>
                                    <path d="m4.93 4.93 4.24 4.24"/>
                                    <path d="m14.83 9.17 4.24-4.24"/>
                                    <path d="m14.83 14.83 4.24 4.24"/>
                                    <path d="m9.17 14.83-4.24 4.24"/>
                                </svg>
                                Sử dụng vị trí hiện tại
                            `;
                            currentLocationBtn.disabled = false;
                        }
                    },
                    (error) => {
                        console.error('Geolocation error:', error);
                        let errorMessage = 'Không thể lấy vị trí hiện tại';
                        
                        switch(error.code) {
                            case error.PERMISSION_DENIED:
                                errorMessage = 'Bạn đã từ chối quyền truy cập vị trí. Vui lòng cho phép truy cập vị trí trong cài đặt trình duyệt.';
                                break;
                            case error.POSITION_UNAVAILABLE:
                                errorMessage = 'Thông tin vị trí không khả dụng';
                                break;
                            case error.TIMEOUT:
                                errorMessage = 'Timeout khi lấy vị trí. Vui lòng thử lại.';
                                break;
                        }
                        
                        showNotification(errorMessage, 'error');
                        
                        // Reset button
                        currentLocationBtn.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <path d="m4.93 4.93 4.24 4.24"/>
                                <path d="m14.83 9.17 4.24-4.24"/>
                                <path d="m14.83 14.83 4.24 4.24"/>
                                <path d="m9.17 14.83-4.24 4.24"/>
                            </svg>
                            Thử lại
                        `;
                        currentLocationBtn.disabled = false;
                    },
                    {
                        enableHighAccuracy: true,
                        timeout: 15000,
                        maximumAge: 300000 // 5 minutes
                    }
                );
            } else {
                showNotification('Trình duyệt không hỗ trợ định vị', 'error');
                
                // Reset button
                currentLocationBtn.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/>
                        <path d="m4.93 4.93 4.24 4.24"/>
                        <path d="m14.83 9.17 4.24-4.24"/>
                        <path d="m14.83 14.83 4.24 4.24"/>
                        <path d="m9.17 14.83-4.24 4.24"/>
                    </svg>
                    Không hỗ trợ
                `;
                currentLocationBtn.disabled = true;
            }
        };

        const searchLocations = async (query) => {
            if (query.length < 2) {
                displayLocationSuggestions([]);
                return;
            }

            try {
                // Show loading state
                locationSuggestions.innerHTML = '<div class="text-center text-gray-400 py-4"><div class="animate-spin w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2"></div>Đang tìm kiếm...</div>';
                
                // Use Nominatim API from OpenStreetMap
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=10&addressdetails=1&accept-language=vi`, {
                    headers: {
                        'User-Agent': 'CosmicSocialNetwork/1.0'
                    }
                });
                
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                
                const data = await response.json();
                
                // Transform OpenStreetMap data to our format
                const locations = data.map(item => ({
                    name: item.display_name.split(',').slice(0, 2).join(','), // Take first 2 parts for cleaner display
                    address: item.display_name,
                    coordinates: {
                        lat: parseFloat(item.lat),
                        lng: parseFloat(item.lon)
                    },
                    osm_id: item.osm_id,
                    osm_type: item.osm_type,
                    importance: item.importance || 0
                }));
                
                // Sort by importance (higher is better)
                locations.sort((a, b) => b.importance - a.importance);
                
                displayLocationSuggestions(locations);
                
            } catch (error) {
                console.error('Error searching locations:', error);
                
                // Show error message and fallback option
                const errorSuggestions = [{
                    name: query,
                    address: 'Địa điểm tùy chỉnh (Lỗi kết nối)',
                    isCustom: true,
                    isError: true
                }];
                
                displayLocationSuggestions(errorSuggestions);
            }
        };

        const displayLocationSuggestions = (locations) => {
            if (locations.length === 0) {
                locationSuggestions.innerHTML = '<div class="text-center text-gray-400 py-4 text-sm">Không tìm thấy địa điểm phù hợp</div>';
                return;
            }

            locationSuggestions.innerHTML = locations.map(location => `
                <div class="location-item" data-location='${JSON.stringify(location)}'>
                    <div class="location-icon">
                        ${location.isCustom ? 
                            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="16"/>
                                <line x1="8" y1="12" x2="16" y2="12"/>
                            </svg>` :
                            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                                <circle cx="12" cy="10" r="3"></circle>
                            </svg>`
                        }
                    </div>
                    <div>
                        <div class="font-semibold text-white">${location.name}</div>
                        <div class="text-sm text-gray-400">${location.address}</div>
                    </div>
                    ${location.isCustom ? '<div class="text-xs text-green-400 ml-auto">Tùy chỉnh</div>' : ''}
                </div>
            `).join('');

            // Add click event listeners
            document.querySelectorAll('.location-item').forEach(item => {
                item.addEventListener('click', () => {
                    const locationData = JSON.parse(item.dataset.location);
                    setLocation(locationData);
                    locationModal.classList.add('hidden');
                    locationSearch.value = '';
                });
            });
        };

        const setLocation = (location) => {
            selectedLocation = location;
            locationText.textContent = location.name;
            locationArea.classList.remove('hidden');
        };

        const clearLocation = () => {
            selectedLocation = null;
            locationArea.classList.add('hidden');
        };

        // Event listeners
        openPopupInput.addEventListener('click', openPopup);
        closePopupButton.addEventListener('click', closePopup);
        
        // === IMAGE EVENT LISTENERS ===
        if (addImageBtn && imageInput) {
            addImageBtn.addEventListener('click', () => imageInput.click());
            imageInput.addEventListener('change', handleImageSelect);
        }
        if (removeImagesBtn) {
            removeImagesBtn.addEventListener('click', clearImages);
        }

        // === TAG FRIENDS EVENT LISTENERS ===
        if (tagFriendsBtn && tagFriendsModal && closeTagModal) {
            tagFriendsBtn.addEventListener('click', () => {
                tagFriendsModal.classList.remove('hidden');
                loadFriends();
            });
            closeTagModal.addEventListener('click', () => {
                tagFriendsModal.classList.add('hidden');
            });
            tagFriendsModal.addEventListener('click', (e) => {
                if (e.target === tagFriendsModal) {
                    tagFriendsModal.classList.add('hidden');
                }
            });
        }
        if (friendSearch) {
            let searchTimeout;
            friendSearch.addEventListener('input', (e) => {
                const query = e.target.value.toLowerCase().trim();
                
                // Clear previous timeout
                if (searchTimeout) {
                    clearTimeout(searchTimeout);
                }
                
                // If query is empty, reload all friends
                if (!query) {
                    loadFriends();
                    return;
                }
                
                // Debounce search to avoid too many API calls
                searchTimeout = setTimeout(async () => {
                    await searchFriendsAPI(query);
                }, 300);
            });
        }
        if (clearTagsBtn) {
            clearTagsBtn.addEventListener('click', clearTags);
        }

        // === LOCATION EVENT LISTENERS ===
        if (addLocationBtn && locationModal && closeLocationModal) {
            addLocationBtn.addEventListener('click', () => {
                locationModal.classList.remove('hidden');
                locationSearch.value = '';
                // Show popular locations by default
                const popularLocations = [
                    { name: 'Hà Nội, Việt Nam', address: 'Thủ đô Việt Nam' },
                    { name: 'TP. Hồ Chí Minh, Việt Nam', address: 'Thành phố lớn nhất Việt Nam' },
                    { name: 'Đà Nẵng, Việt Nam', address: 'Thành phố trực thuộc Trung ương' },
                    { name: 'Hải Phòng, Việt Nam', address: 'Thành phố cảng' },
                    { name: 'Cần Thơ, Việt Nam', address: 'Thành phố miền Tây' }
                ];
                displayLocationSuggestions(popularLocations);
            });
            closeLocationModal.addEventListener('click', () => {
                locationModal.classList.add('hidden');
            });
            locationModal.addEventListener('click', (e) => {
                if (e.target === locationModal) {
                    locationModal.classList.add('hidden');
                }
            });
        }
        if (currentLocationBtn) {
            currentLocationBtn.addEventListener('click', getCurrentLocation);
        }
        if (locationSearch) {
            let locationSearchTimeout;
            locationSearch.addEventListener('input', (e) => {
                const query = e.target.value.trim();
                
                clearTimeout(locationSearchTimeout);
                locationSearchTimeout = setTimeout(() => {
                    if (query.length === 0) {
                        // Show popular locations when search is empty
                        const popularLocations = [
                            { name: 'Hà Nội, Việt Nam', address: 'Thủ đô Việt Nam' },
                            { name: 'TP. Hồ Chí Minh, Việt Nam', address: 'Thành phố lớn nhất Việt Nam' },
                            { name: 'Đà Nẵng, Việt Nam', address: 'Thành phố trực thuộc Trung ương' },
                            { name: 'Hải Phòng, Việt Nam', address: 'Thành phố cảng' },
                            { name: 'Cần Thơ, Việt Nam', address: 'Thành phố miền Tây' }
                        ];
                        displayLocationSuggestions(popularLocations);
                    } else {
                        searchLocations(query);
                    }
                }, 300);
            });
        }
        if (removeLocationBtn) {
            removeLocationBtn.addEventListener('click', clearLocation);
        }
        
        popup.addEventListener('click', (e) => {
            // Close popup if clicking on the overlay, but not on the content
            if (e.target === popup) {
                closePopup();
            }
        });

        // Handle textarea input
        postTextarea.addEventListener('input', () => {
            const content = postTextarea.value.trim();
            const charCount = postTextarea.value.length;
            
            // Update character counter
            updateCharCounter();
            
            // Auto-resize textarea
            autoResizeTextarea();
            
            // Enable or disable the post button based on content and character limit
            submitPostButton.disabled = !content || charCount > MAX_CHARS;
        });

        // Handle Ctrl+Enter for quick posting
        postTextarea.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                if (!submitPostButton.disabled) {
                    submitPostButton.click();
                }
            }
        });

        // Handle paste event to trigger auto-resize
        postTextarea.addEventListener('paste', () => {
            // Use setTimeout to wait for paste content to be inserted
            setTimeout(() => {
                autoResizeTextarea();
                updateCharCounter();
                const content = postTextarea.value.trim();
                const charCount = postTextarea.value.length;
                submitPostButton.disabled = !content || charCount > MAX_CHARS;
            }, 10);
        });

        // Handle post submission
        submitPostButton.addEventListener('click', async () => {
            const content = postTextarea.value.trim();
            if (!content || content.length > MAX_CHARS) return;

            // Prepare post data
            const postData = {
                content: content,
                images: selectedImages.map(img => ({
                    file: img.file,
                    preview: img.url
                })),
                taggedFriends: taggedFriends.map(friend => ({
                    id: friend.id,
                    name: friend.name,
                    username: friend.username
                })),
                location: selectedLocation ? {
                    name: selectedLocation.name,
                    address: selectedLocation.address,
                    coordinates: selectedLocation.coordinates
                } : null
            };

            // Show loading state
            const originalText = submitPostButton.innerHTML;
            submitPostButton.innerHTML = `
                <svg class="animate-spin w-5 h-5 mr-2" viewBox="0 0 24 24" fill="none">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
                </svg>
                Đang đăng...
            `;
            submitPostButton.disabled = true;

            try {
                // Create FormData for API call
                const formData = new FormData();
                formData.append('content', content);
                
                // Add images (for now, we'll send image data as JSON since we don't have file upload implemented yet)
                formData.append('images', JSON.stringify(postData.images.map(img => ({
                    filename: `image_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    originalName: img.file?.name || 'image.jpg',
                    url: img.preview
                }))));
                
                formData.append('taggedFriends', JSON.stringify(postData.taggedFriends));
                formData.append('location', JSON.stringify(postData.location));

                // Get auth token - try all possible token names
                const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('cosmic_token');
                console.log('Submitting post with token:', !!token);
                
                if (!token) {
                    throw new Error('Not authenticated');
                }

                console.log('Preparing API request...');

                // Send to API
                const response = await fetch('/api/posts', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        content: content,
                        images: postData.images.map((img, index) => ({
                            filename: `image_${Date.now()}_${index}`,
                            originalName: img.file?.name || `image_${index}.jpg`,
                            mimetype: img.file?.type || 'image/jpeg',
                            size: img.file?.size || 0,
                            // Placeholder URL - actual file upload will be implemented later
                            url: `https://placehold.co/400x300/4F46E5/FFFFFF?text=Image+${index + 1}`
                        })),
                        taggedFriends: postData.taggedFriends,
                        location: postData.location
                    })
                });

                console.log('API response status:', response.status);

                if (!response.ok) {
                    const errorData = await response.json();
                    console.log('API error response:', errorData);
                    throw new Error(errorData.message || 'Lỗi khi đăng bài viết');
                }

                const result = await response.json();
                console.log('API success response:', result);
                
                // Show success message
                let successMessage = 'Đã đăng bài viết thành công! 🚀';
                if (postData.images.length > 0) successMessage += ` với ${postData.images.length} hình ảnh`;
                if (postData.taggedFriends.length > 0) successMessage += ` và ${postData.taggedFriends.length} bạn bè được tag`;
                if (postData.location) successMessage += ` tại ${postData.location.name}`;
                
                showNotification(successMessage, 'success');
                
                // Close popup and reset
                closePopup();
                
                // Refresh feed to show new post
                await refreshFeed();
                
            } catch (error) {
                console.error('Error posting:', error);
                showNotification('Có lỗi xảy ra khi đăng bài. Vui lòng thử lại!', 'error');
            } finally {
                // Always reset button state
                submitPostButton.innerHTML = originalText;
                submitPostButton.disabled = false;
            }
        });

        // Handle Escape key to close popup
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !popup.classList.contains('hidden')) {
                closePopup();
            }
        });

        // Initialize character counter
        updateCharCounter();
        } catch (error) {
            console.error('Error initializing popup:', error);
        }
    } else {
        console.error('Some popup elements are missing:', {
            popup: !!popup,
            openPopupInput: !!openPopupInput,
            closePopupButton: !!closePopupButton,
            postTextarea: !!postTextarea,
            submitPostButton: !!submitPostButton
        });
    }

    // Notification function
    function showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-[1100] px-6 py-4 rounded-lg shadow-lg transform translate-x-full transition-transform duration-300 ${
            type === 'success' ? 'bg-green-600 text-white' :
            type === 'error' ? 'bg-red-600 text-white' :
            'bg-indigo-600 text-white'
        }`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Show notification
        setTimeout(() => {
            notification.classList.remove('translate-x-full');
        }, 100);

        // Hide notification after 4 seconds
        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 4000);
    }

    // --- Logout Logic ---
    const logoutButton = document.querySelector('.logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', (e) => {
            e.preventDefault();
            
            if (confirm('Bạn có chắc chắn muốn đăng xuất?')) {
                // Clear login state
                localStorage.removeItem('isLoggedIn');
                localStorage.removeItem('userEmail');
                localStorage.removeItem('userName');
                localStorage.removeItem('rememberMe');
                
                // Show logout message
                alert('Đã đăng xuất thành công. Hẹn gặp lại bạn trong vũ trụ!');
                
                // Redirect to login page
                window.location.href = 'pages/login.html';
            }
        });
    }

    // --- Update user info from localStorage ---
    updateUserInfo();
});

// Function to update user info display
function updateUserInfo() {
    const userName = localStorage.getItem('userName') || 'Phi Hành Gia';
    const userEmail = localStorage.getItem('userEmail') || '@astronaut';
    
    // Update user name and email in sidebar
    const userNameElements = document.querySelectorAll('h3');
    const userEmailElements = document.querySelectorAll('p');
    
    userNameElements.forEach(element => {
        if (element.textContent.includes('Alex Starr')) {
            element.textContent = userName;
        }
    });
    
    userEmailElements.forEach(element => {
        if (element.textContent.includes('@alexstarr') && userEmail && userEmail.includes('@')) {
            element.textContent = '@' + userEmail.split('@')[0];
        }
    });
}

// === FEED MANAGEMENT ===
const loadFeed = async () => {
    const feedContainer = document.getElementById('posts-container');
    if (!feedContainer) return;

    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('cosmic_token');
    if (!token) return;

    try {
        feedContainer.innerHTML = '<div class="text-center py-8 text-gray-400">Đang tải feed...</div>';

        const response = await fetch('/api/posts?page=1&limit=10', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load feed');
        }

        const data = await response.json();
        const posts = data.posts || [];

        if (posts.length === 0) {
            feedContainer.innerHTML = `
                <div class="text-center py-12">
                    <div class="text-gray-400 mb-4">Chưa có bài viết nào trong feed của bạn</div>
                    <p class="text-gray-500 text-sm">Hãy kết bạn và bắt đầu chia sẻ những khoảnh khắc đẹp!</p>
                </div>
            `;
            return;
        }

        renderPosts(posts, feedContainer);

    } catch (error) {
        console.error('Error loading feed:', error);
        feedContainer.innerHTML = `
            <div class="text-center py-8">
                <div class="text-red-400 mb-2">Không thể tải feed</div>
                <button onclick="loadFeed()" class="text-blue-400 hover:text-blue-300 underline">
                    Thử lại
                </button>
            </div>
        `;
    }
};

const renderPosts = (posts, container) => {
    container.innerHTML = posts.map(post => `
        <div class="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-6 mb-6">
            <!-- Post Header -->
            <div class="flex items-center mb-4">
                <img src="${post.author.avatar}" alt="${post.author.name}" class="w-12 h-12 rounded-full mr-3">
                <div class="flex-1">
                    <h3 class="text-white font-semibold">${post.author.name}</h3>
                    <p class="text-gray-400 text-sm">${formatTime(post.createdAt)}</p>
                </div>
            </div>
            
            <!-- Post Content -->
            <div class="text-white mb-4 leading-relaxed">${post.content}</div>
            
            <!-- Tagged Friends -->
            ${post.taggedFriends && post.taggedFriends.length > 0 ? `
                <div class="mb-4">
                    <div class="text-gray-400 text-sm mb-2">Với ${post.taggedFriends.map(friend => friend.name).join(', ')}</div>
                </div>
            ` : ''}
            
            <!-- Location -->
            ${post.location ? `
                <div class="mb-4">
                    <div class="text-gray-400 text-sm">📍 ${post.location.name}</div>
                </div>
            ` : ''}
            
            <!-- Images -->
            ${post.images && post.images.length > 0 ? `
                <div class="mb-4 grid ${post.images.length === 1 ? 'grid-cols-1' : post.images.length === 2 ? 'grid-cols-2' : 'grid-cols-2'} gap-2">
                    ${post.images.slice(0, 4).map((img, index) => `
                        <div class="relative ${post.images.length === 3 && index === 0 ? 'col-span-2' : ''} ${post.images.length > 4 && index === 3 ? 'relative' : ''}">
                            <img src="${img.url}" alt="Post image" class="w-full h-48 object-cover rounded-lg">
                            ${post.images.length > 4 && index === 3 ? `
                                <div class="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                                    <span class="text-white text-2xl font-bold">+${post.images.length - 4}</span>
                                </div>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            ` : ''}
            
            <!-- Post Actions -->
            <div class="flex items-center gap-6 pt-4 border-t border-white/10">
                <button class="flex items-center gap-2 text-gray-400 hover:text-red-400 transition-colors">
                    <svg class="w-5 h-5" fill="${post.isLiked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                    </svg>
                    <span>${post.likesCount || 0}</span>
                </button>
                <button class="flex items-center gap-2 text-gray-400 hover:text-blue-400 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
                    </svg>
                    <span>${post.commentsCount || 0}</span>
                </button>
                <button class="flex items-center gap-2 text-gray-400 hover:text-green-400 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
};

const refreshFeed = async () => {
    console.log('Refreshing feed...');
    await loadFeed();
};

const formatTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 1) return 'Vừa xong';
    if (minutes < 60) return `${minutes} phút trước`;
    if (hours < 24) return `${hours} giờ trước`;
    if (days < 7) return `${days} ngày trước`;
    
    return date.toLocaleDateString('vi-VN');
};

// Load feed when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication first
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('cosmic_token');
    if (token) {
        // Wait a bit for other initialization, then load feed
        setTimeout(() => {
            try {
                loadFeed();
            } catch (error) {
                console.error('Error loading feed on DOMContentLoaded:', error);
            }
        }, 1000);
    } else {
        console.log('No authentication token found, skipping feed load');
    }
});

// === PROFILE MANAGEMENT ===
const loadUserProfile = async () => {
    console.log('👤 Starting to load user profile...');
    
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('cosmic_token');
    console.log('👤 Profile token exists:', !!token);
    
    if (!token) {
        console.log('❌ No token for profile');
        return;
    }

    try {
        console.log('🌐 Fetching user profile from API...');
        // Get user profile info
        const profileResponse = await fetch('/api/profile/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('📡 Profile response status:', profileResponse.status);

        if (profileResponse.ok) {
            const profileData = await profileResponse.json();
            console.log('✅ Profile data received:', profileData);
            
            const user = profileData.user;

            // Update profile UI
            document.getElementById('profile-name').textContent = `${user.firstName} ${user.lastName}`;
            if (user.email && user.email.includes('@')) {
                document.getElementById('profile-email').textContent = `@${user.email.split('@')[0]}`;
            } else {
                document.getElementById('profile-email').textContent = '@user';
            }
            
            const avatar = user.avatar || `https://placehold.co/96x96/4F46E5/FFFFFF?text=${user.firstName.charAt(0)}${user.lastName.charAt(0)}`;
            document.getElementById('profile-avatar').src = avatar;

            // Update stats
            document.getElementById('profile-posts-count').textContent = user.posts || 0;
            document.getElementById('profile-friends-count').textContent = user.friendsCount || 0;
            
            console.log('✅ Profile UI updated');
        } else {
            console.error('❌ Profile API error:', profileResponse.status);
        }

        // Load user's posts
        console.log('🔄 Loading user posts from profile...');
        await loadUserPosts();
        console.log('🔄 Loading user friends...');
        await loadUserFriends();
        console.log('✅ Profile loading completed');

    } catch (error) {
        console.error('❌ Error loading user profile:', error);
    }
};

const loadUserPosts = async () => {
    console.log('🔄 Starting to load user posts...');
    
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('cosmic_token');
    console.log('📱 Token exists:', !!token);
    console.log('📱 Token value:', token?.substring(0, 20) + '...');
    
    if (!token) {
        console.log('❌ No token found');
        return;
    }

    const postsContainer = document.getElementById('profile-posts-container');
    console.log('📦 Posts container found:', !!postsContainer);
    
    if (!postsContainer) {
        console.log('❌ Posts container not found');
        return;
    }
    
    postsContainer.innerHTML = '<div class="text-center py-8 text-gray-400">Đang tải bài viết...</div>';

    try {
        console.log('🌐 Making API request to /api/posts/user/me');
        
        const response = await fetch('/api/posts/user/me', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('📡 API response status:', response.status);
        console.log('📡 API response ok:', response.ok);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ API error response:', errorText);
            throw new Error('Failed to load user posts');
        }

        const data = await response.json();
        console.log('✅ API response data:', data);
        
        const posts = data.posts || [];
        console.log('📊 Number of posts received:', posts.length);

        if (posts.length === 0) {
            console.log('📭 No posts found for user');
            postsContainer.innerHTML = `
                <div class="glass-pane p-8 rounded-2xl text-center text-gray-400">
                    <p>Bạn chưa có bài viết nào</p>
                    <p class="text-sm mt-2">Hãy chia sẻ những khoảnh khắc đầu tiên!</p>
                </div>
            `;
            return;
        }

        console.log('🎨 Rendering posts to container');
        renderPosts(posts, postsContainer);
        console.log('✅ Posts rendered successfully');

    } catch (error) {
        console.error('❌ Error loading user posts:', error);
        postsContainer.innerHTML = `
            <div class="glass-pane p-8 rounded-2xl text-center">
                <div class="text-red-400 mb-2">Không thể tải bài viết</div>
                <button onclick="loadUserPosts()" class="text-blue-400 hover:text-blue-300 underline">
                    Thử lại
                </button>
            </div>
        `;
    }
};

const loadUserFriends = async () => {
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('cosmic_token');
    if (!token) return;

    const friendsContainer = document.getElementById('profile-friends-container');
    
    try {
        const response = await fetch('/api/friends', {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Failed to load friends');
        }

        const data = await response.json();
        const friends = data.friends || [];

        if (friends.length === 0) {
            friendsContainer.innerHTML = `
                <div class="glass-pane p-8 rounded-2xl text-center text-gray-400">
                    <p>Chưa có bạn bè</p>
                </div>
            `;
            return;
        }

        friendsContainer.innerHTML = friends.map(friend => `
            <div class="glass-pane p-4 rounded-2xl">
                <div class="flex items-center gap-4">
                    <img src="${friend.avatar}" alt="${friend.name}" class="w-12 h-12 rounded-full">
                    <div class="flex-1">
                        <h4 class="text-white font-semibold">${friend.name}</h4>
                        <p class="text-gray-400 text-sm">@${friend.username}</p>
                    </div>
                    <button class="bg-indigo-600 hover:bg-indigo-700 px-3 py-1 rounded-lg text-white text-sm transition-colors">
                        Nhắn tin
                    </button>
                </div>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading friends:', error);
        friendsContainer.innerHTML = `
            <div class="glass-pane p-8 rounded-2xl text-center">
                <div class="text-red-400 mb-2">Không thể tải danh sách bạn bè</div>
            </div>
        `;
    }
};

// Profile tab switching
document.addEventListener('DOMContentLoaded', () => {
    const profilePostsTab = document.getElementById('profile-posts-tab');
    const profileAboutTab = document.getElementById('profile-about-tab');
    const profileFriendsTab = document.getElementById('profile-friends-tab');
    
    const profilePostsContent = document.getElementById('profile-posts-content');
    const profileAboutContent = document.getElementById('profile-about-content');
    const profileFriendsContent = document.getElementById('profile-friends-content');

    if (profilePostsTab && profileAboutTab && profileFriendsTab) {
        profilePostsTab.addEventListener('click', async () => {
            // Update tab styles
            profilePostsTab.classList.add('bg-indigo-600', 'text-white');
            profilePostsTab.classList.remove('text-gray-400');
            profileAboutTab.classList.remove('bg-indigo-600', 'text-white');
            profileAboutTab.classList.add('text-gray-400');
            profileFriendsTab.classList.remove('bg-indigo-600', 'text-white');
            profileFriendsTab.classList.add('text-gray-400');

            // Show/hide content
            profilePostsContent?.classList.remove('hidden');
            profileAboutContent?.classList.add('hidden');
            profileFriendsContent?.classList.add('hidden');
            
            // Load user posts when posts tab is clicked
            await loadUserPosts();
        });

        profileAboutTab.addEventListener('click', () => {
            profileAboutTab.classList.add('bg-indigo-600', 'text-white');
            profileAboutTab.classList.remove('text-gray-400');
            profilePostsTab.classList.remove('bg-indigo-600', 'text-white');
            profilePostsTab.classList.add('text-gray-400');
            profileFriendsTab.classList.remove('bg-indigo-600', 'text-white');
            profileFriendsTab.classList.add('text-gray-400');

            profileAboutContent?.classList.remove('hidden');
            profilePostsContent?.classList.add('hidden');
            profileFriendsContent?.classList.add('hidden');
        });

        profileFriendsTab.addEventListener('click', () => {
            profileFriendsTab.classList.add('bg-indigo-600', 'text-white');
            profileFriendsTab.classList.remove('text-gray-400');
            profilePostsTab.classList.remove('bg-indigo-600', 'text-white');
            profilePostsTab.classList.add('text-gray-400');
            profileAboutTab.classList.remove('bg-indigo-600', 'text-white');
            profileAboutTab.classList.add('text-gray-400');

            profileFriendsContent?.classList.remove('hidden');
            profilePostsContent?.classList.add('hidden');
            profileAboutContent?.classList.add('hidden');
        });
    }
});

// --- Three.js Background Animation ---
// Wait for Three.js to be available and DOM to be ready
document.addEventListener('DOMContentLoaded', () => {
    // Add a slight delay to ensure Three.js is fully loaded
    setTimeout(() => {
        try {
            console.log('🌟 Initializing Three.js background...');
            
            if (typeof THREE === 'undefined') {
                console.error('❌ THREE.js not loaded, using fallback background');
                document.body.style.background = 'linear-gradient(135deg, #1e1b4b 0%, #0f0f23 50%, #000000 100%)';
                return;
            }
            
            const canvasElement = document.getElementById('cosmic-bg');
            if (!canvasElement) {
                console.error('❌ Canvas element not found');
                document.body.style.background = 'linear-gradient(135deg, #1e1b4b 0%, #0f0f23 50%, #000000 100%)';
                return;
            }
            
            console.log('✅ THREE.js and canvas ready, creating scene...');

            // Use Discovery's exact Three.js setup
            const scene = new THREE.Scene();
            const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
            camera.position.z = 1;
            const renderer = new THREE.WebGLRenderer({
                canvas: canvasElement,
                antialias: true,
            });
            renderer.setSize(window.innerWidth, window.innerHeight);
            const starGeo = new THREE.BufferGeometry();
            const starCount = 6000;
            const posArray = new Float32Array(starCount * 3);
            for (let i = 0; i < starCount * 3; i++) {
                posArray[i] = (Math.random() - 0.5) * 600;
            }
            starGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
            const starMaterial = new THREE.PointsMaterial({
                size: 0.5,
                color: 0xaaaaaa,
                transparent: true,
            });
            const stars = new THREE.Points(starGeo, starMaterial);
            scene.add(stars);
            let mouseX = 0;
            let mouseY = 0;
            document.addEventListener('mousemove', (event) => {
                mouseX = event.clientX;
                mouseY = event.clientY;
            });
            const clock = new THREE.Clock();
            const animate = () => {
                requestAnimationFrame(animate);
                const elapsedTime = clock.getElapsedTime();
                stars.rotation.y = -mouseX * 0.00005;
                stars.rotation.x = -mouseY * 0.00005;
                // Adjust camera based on scroll position to create a parallax effect
                camera.position.z = 1 + window.scrollY * 0.001;
                renderer.render(scene, camera);
            };
            animate();
            window.addEventListener('resize', () => {
                camera.aspect = window.innerWidth / window.innerHeight;
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            });
            
            console.log('✅ Three.js background animation started successfully!');
        } catch (error) {
            console.error('❌ Error initializing Three.js background:', error);
            // Set fallback background
            document.body.style.background = 'linear-gradient(135deg, #1e1b4b 0%, #0f0f23 50%, #000000 100%)';
        }
    }, 500); // Wait 500ms for Three.js to fully load
});

// Make functions globally accessible (after all functions are defined)
window.loadUserPosts = loadUserPosts;
window.loadFeed = loadFeed;
window.refreshFeed = refreshFeed;
window.loadUserProfile = loadUserProfile;
window.loadUserFriends = loadUserFriends;
