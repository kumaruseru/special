// Shared JavaScript functions for all pages

// Load user info from localStorage
function loadUserInfo() {
    console.log('🔍 Loading user info...');
    
    // Try all possible user data sources
    let userInfo = localStorage.getItem('userInfo') || localStorage.getItem('userData');
    let userName = localStorage.getItem('userName') || localStorage.getItem('fullName');
    let userEmail = localStorage.getItem('userEmail') || localStorage.getItem('email');
    
    console.log('Available user data:', {
        userInfo: !!userInfo,
        userName: userName,
        userEmail: userEmail,
        localStorage_keys: Object.keys(localStorage)
    });
    
    if (userInfo) {
        try {
            const user = JSON.parse(userInfo);
            console.log('Parsed user object:', user);
            
            // Update user name with better fallbacks
            const userNameEl = document.getElementById('user-name');
            if (userNameEl) {
                let displayName = 'Loading...';
                if (user.fullName) {
                    displayName = user.fullName;
                } else if (user.firstName && user.lastName) {
                    displayName = `${user.firstName} ${user.lastName}`;
                } else if (user.name) {
                    displayName = user.name;
                } else if (user.username) {
                    displayName = user.username;
                } else if (userName) {
                    displayName = userName;
                } else if (user.email) {
                    displayName = user.email.split('@')[0];
                } else if (userEmail) {
                    displayName = userEmail.split('@')[0];
                }
                userNameEl.textContent = displayName;
                console.log('✅ Updated user name to:', displayName);
            }
            
            // Update user email with better fallbacks
            const userEmailEl = document.getElementById('user-email');
            if (userEmailEl) {
                let displayEmail = '@user';
                if (user.username) {
                    displayEmail = `@${user.username}`;
                } else if (user.email) {
                    displayEmail = `@${user.email.split('@')[0]}`;
                } else if (userEmail) {
                    displayEmail = `@${userEmail.split('@')[0]}`;
                } else if (user.fullName) {
                    displayEmail = `@${user.fullName.toLowerCase().replace(/\s+/g, '')}`;
                } else if (userName) {
                    displayEmail = `@${userName.toLowerCase().replace(/\s+/g, '')}`;
                }
                userEmailEl.textContent = displayEmail;
                console.log('✅ Updated user email to:', displayEmail);
            }
            
            // Update user avatar with first letter
            const userAvatarEl = document.getElementById('user-avatar');
            if (userAvatarEl) {
                let firstLetter = 'U';
                if (user.fullName) {
                    firstLetter = user.fullName.charAt(0).toUpperCase();
                } else if (user.firstName) {
                    firstLetter = user.firstName.charAt(0).toUpperCase();
                } else if (user.name) {
                    firstLetter = user.name.charAt(0).toUpperCase();
                } else if (user.username) {
                    firstLetter = user.username.charAt(0).toUpperCase();
                } else if (userName) {
                    firstLetter = userName.charAt(0).toUpperCase();
                } else if (user.email) {
                    firstLetter = user.email.charAt(0).toUpperCase();
                } else if (userEmail) {
                    firstLetter = userEmail.charAt(0).toUpperCase();
                }
                userAvatarEl.src = `https://placehold.co/48x48/4F46E5/FFFFFF?text=${firstLetter}`;
                console.log('✅ Updated avatar with letter:', firstLetter);
            }
            
        } catch (error) {
            console.error('❌ Error parsing user info:', error);
        }
    } else {
        console.warn('⚠️ No user info found in localStorage');
        // Still try to use individual fields if available
        const userNameEl = document.getElementById('user-name');
        const userEmailEl = document.getElementById('user-email');
        const userAvatarEl = document.getElementById('user-avatar');
        
        if (userNameEl && userName) {
            userNameEl.textContent = userName;
            console.log('✅ Fallback: Updated user name to:', userName);
        }
        
        if (userEmailEl && userEmail) {
            userEmailEl.textContent = `@${userEmail.split('@')[0]}`;
            console.log('✅ Fallback: Updated user email');
        }
        
        if (userAvatarEl && (userName || userEmail)) {
            const firstLetter = userName ? userName.charAt(0).toUpperCase() : userEmail.charAt(0).toUpperCase();
            userAvatarEl.src = `https://placehold.co/48x48/4F46E5/FFFFFF?text=${firstLetter}`;
            console.log('✅ Fallback: Updated avatar with letter:', firstLetter);
        }
    }
}

// Force update user display with specific data
function updateUserDisplay(userData) {
    console.log('🔄 Force updating user display with:', userData);
    
    if (userData.fullName || userData.name) {
        const userNameEl = document.getElementById('user-name');
        if (userNameEl) {
            const displayName = userData.fullName || userData.name;
            userNameEl.textContent = displayName;
            localStorage.setItem('userName', displayName);
        }
    }
    
    if (userData.username || userData.email) {
        const userEmailEl = document.getElementById('user-email');
        if (userEmailEl) {
            const displayEmail = userData.username ? `@${userData.username}` : `@${userData.email.split('@')[0]}`;
            userEmailEl.textContent = displayEmail;
        }
    }
    
    // Update avatar
    const userAvatarEl = document.getElementById('user-avatar');
    if (userAvatarEl && (userData.fullName || userData.name || userData.username)) {
        const name = userData.fullName || userData.name || userData.username;
        const firstLetter = name.charAt(0).toUpperCase();
        userAvatarEl.src = `https://placehold.co/48x48/4F46E5/FFFFFF?text=${firstLetter}`;
    }
    
    // Store complete user data
    localStorage.setItem('userInfo', JSON.stringify(userData));
}

// Check authentication
function checkAuth() {
    // Try all possible token names
    const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('cosmic_token');
    const isLoggedIn = localStorage.getItem('isLoggedIn');
    const userName = localStorage.getItem('userName');
    const userEmail = localStorage.getItem('userEmail');
    
    console.log('Auth check:', { 
        token: !!token, 
        isLoggedIn,
        userName,
        userEmail,
        hasUserData: !!(userName && userEmail)
    });
    
    // Sync token to standard 'token' key if found under different name
    if (token && !localStorage.getItem('token')) {
        localStorage.setItem('token', token);
        console.log('Token synced to standard key');
    }
    
    // If we have user data but no token, try to refresh token
    if (!token && (userName || userEmail)) {
        console.log('🔄 User has data but no token - attempting token refresh...');
        
        // Try to refresh token in background
        tryRefreshToken(userEmail, userName).then(success => {
            if (success) {
                console.log('✅ Token refresh successful, reloading page...');
                // Reload page to reinitialize with new token
                setTimeout(() => window.location.reload(), 1000);
            } else {
                console.log('⚠️ Token refresh failed, continuing in demo mode');
            }
        });
        
        return true; // Allow access for demo/guest users
    }
    
    // Check if token exists and is valid
    if (!token) {
        // Only redirect if we also don't have user data AND we're not on allowed pages
        const currentPath = window.location.pathname;
        const allowedPaths = ['login.html', 'register.html', 'discovery.html'];
        const isAllowedPage = allowedPaths.some(page => currentPath.includes(page));
        
        if (!userName && !userEmail && !isAllowedPage) {
            console.log('No token or user data found, current path:', currentPath);
            console.log('Redirecting to login...');
            window.location.href = '/pages/login.html';
        }
        return false;
    }
    
    // If we have a token, check if it's expired
    try {
        const tokenData = JSON.parse(atob(token.split('.')[1]));
        const isExpired = tokenData.exp && (tokenData.exp * 1000 < Date.now());
        
        if (isExpired) {
            console.log('Token expired, but checking if we have user data for demo mode...');
            if (userName || userEmail) {
                console.log('🔄 Keeping user in demo mode despite expired token');
                return true;
            } else {
                console.log('Token expired and no user data, clearing and redirecting...');
                localStorage.removeItem('authToken');
                localStorage.removeItem('token');
                localStorage.removeItem('cosmic_token');
                localStorage.removeItem('isLoggedIn');
                const currentPath = window.location.pathname;
                const allowedPaths = ['login.html', 'register.html', 'discovery.html'];
                const isAllowedPage = allowedPaths.some(page => currentPath.includes(page));
                
                if (!isAllowedPage) {
                    window.location.href = '/pages/login.html';
                }
                return false;
            }
        }
    } catch (e) {
        console.warn('Token validation failed:', e.message, '- allowing access anyway');
        // Don't redirect on token parse error - might be a non-JWT token
    }
    
    console.log('Authentication successful');
    return true;
}

// Try to refresh token using available user data
async function tryRefreshToken(email, userName) {
    try {
        console.log('🔄 tryRefreshToken called with:', { email, userName });
        
        // If no email provided, try to get from localStorage
        if (!email) {
            email = localStorage.getItem('userEmail') || localStorage.getItem('email');
            console.log('🔍 Getting email from localStorage:', email);
            console.log('🔍 All localStorage keys:', Object.keys(localStorage));
        }
        
        // Also try to get userId for backup
        const userId = localStorage.getItem('userId');
        
        if (!email && !userId) {
            console.log('No email or userId available for token refresh');
            return false;
        }

        console.log('🔄 Attempting token refresh for:', email || `userId: ${userId}`);
        
        const response = await fetch('/api/refresh-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                email: email,
                userId: userId 
            })
        });

        if (!response.ok) {
            console.warn('Token refresh request failed:', response.status);
            return false;
        }

        const data = await response.json();
        
        if (data.success && data.token) {
            console.log('✅ Token refresh successful');
            
            // Store new token
            localStorage.setItem('token', data.token);
            localStorage.setItem('authToken', data.token);
            localStorage.setItem('isLoggedIn', 'true');
            
            return true;
        } else {
            console.warn('Token refresh failed:', data.message);
            return false;
        }
        
    } catch (error) {
        console.error('Token refresh error:', error);
        return false;
    }
}

// Logout function
function logout() {
    // Clear all auth-related items
    localStorage.removeItem('token');
    localStorage.removeItem('authToken');
    localStorage.removeItem('cosmic_token');
    localStorage.removeItem('userInfo');
    localStorage.removeItem('userData');
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('rememberMe');
    localStorage.removeItem('view_profile');
    localStorage.removeItem('chat_with_user');
    
    window.location.href = '/pages/login.html';
}

// Initialize shared functionality when DOM loads
document.addEventListener('DOMContentLoaded', function() {
    // Debug localStorage contents
    console.log('localStorage contents:', {
        token: localStorage.getItem('token'),
        authToken: localStorage.getItem('authToken'),
        cosmic_token: localStorage.getItem('cosmic_token'),
        isLoggedIn: localStorage.getItem('isLoggedIn'),
        userInfo: localStorage.getItem('userInfo'),
        userData: localStorage.getItem('userData')
    });
    
    // Check if we should skip auth check for certain pages
    const currentPath = window.location.pathname;
    const skipAuthPages = ['discovery.html'];
    const shouldSkipAuth = skipAuthPages.some(page => currentPath.includes(page));
    
    if (!shouldSkipAuth) {
        // Check authentication for protected pages
        if (checkAuth()) {
            // Load user info
            loadUserInfo();
        }
    } else {
        console.log('Skipping auth check for:', currentPath);
        // Still load user info if available for guest mode
        if (window.userManager) {
            window.userManager.forceRefresh().catch(console.warn);
        } else {
            loadUserInfo();
        }
    }
    
    // Add logout event listener
    const logoutButton = document.querySelector('.logout-button');
    if (logoutButton) {
        logoutButton.addEventListener('click', logout);
    }
    
    // Make tryRefreshToken globally available
    window.tryRefreshToken = tryRefreshToken;
});
