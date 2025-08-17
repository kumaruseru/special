// This function sets up and runs the entire Three.js animation.
function initThreeJSAnimation() {
    const canvas = document.getElementById('bg-canvas');
    if (!canvas) {
        console.error("Canvas element not found!");
        return;
    }

    // Scene, Camera, and Renderer setup
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.position.z = 10;

    // Central Star and Corona effect
    const starGeometry = new THREE.SphereGeometry(1.5, 64, 64);
    const starMaterial = new THREE.MeshBasicMaterial({ color: 0xADD8E6, transparent: true, opacity: 0.9 });
    const star = new THREE.Mesh(starGeometry, starMaterial);
    
    const coronaGeometry = new THREE.SphereGeometry(1.7, 64, 64);
    const coronaMaterial = new THREE.MeshBasicMaterial({ color: 0x00BFFF, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending });
    const corona = new THREE.Mesh(coronaGeometry, coronaMaterial);
    
    const starGroup = new THREE.Group();
    starGroup.add(star);
    starGroup.add(corona);
    scene.add(starGroup);

    // Function to create a radial gradient texture for points
    function createPointTexture(size, gradientStops) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const context = canvas.getContext('2d');
        const center = size / 2;
        const gradient = context.createRadialGradient(center, center, 0, center, center, center);
        gradientStops.forEach(stop => gradient.addColorStop(stop.offset, stop.color));
        context.fillStyle = gradient;
        context.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(canvas);
    }

    // Starfield background
    const starfieldGeometry = new THREE.BufferGeometry();
    const starfieldCount = 8000;
    const starfieldPos = new Float32Array(starfieldCount * 3);
    for(let i = 0; i < starfieldCount * 3; i++) {
        starfieldPos[i] = (Math.random() - 0.5) * 100;
    }
    starfieldGeometry.setAttribute('position', new THREE.BufferAttribute(starfieldPos, 3));
    
    const starfieldMaterial = new THREE.PointsMaterial({
        size: 0.25,
        map: createPointTexture(64, [
            { offset: 0, color: 'rgba(255,255,255,1)' },
            { offset: 0.2, color: 'rgba(255,255,255,0.8)' },
            { offset: 1, color: 'rgba(255,255,255,0)' }
        ]),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const starfield = new THREE.Points(starfieldGeometry, starfieldMaterial);
    scene.add(starfield);

    // Nebula clouds
    const nebulaGeometry = new THREE.BufferGeometry();
    const nebulaCount = 200;
    const nebulaPos = new Float32Array(nebulaCount * 3);
    const nebulaColors = new Float32Array(nebulaCount * 3);
    const nebulaColor = new THREE.Color();
    for(let i = 0; i < nebulaCount; i++) {
        const i3 = i * 3;
        nebulaPos[i3] = (Math.random() - 0.5) * 50;
        nebulaPos[i3 + 1] = (Math.random() - 0.5) * 30;
        nebulaPos[i3 + 2] = (Math.random() - 0.5) * 30 - 20;
        nebulaColor.set(Math.random() > 0.5 ? 0x8A2BE2 : 0x00BFFF); // Purple or Deep Sky Blue
        nebulaColor.toArray(nebulaColors, i3);
    }
    nebulaGeometry.setAttribute('position', new THREE.BufferAttribute(nebulaPos, 3));
    nebulaGeometry.setAttribute('color', new THREE.BufferAttribute(nebulaColors, 3));

    const nebulaMaterial = new THREE.PointsMaterial({
        size: 15,
        map: createPointTexture(128, [
            { offset: 0, color: 'rgba(255,255,255,1)' },
            { offset: 0.2, color: 'rgba(255,255,255,0.7)' },
            { offset: 0.5, color: 'rgba(255,255,255,0.2)' },
            { offset: 1, color: 'rgba(255,255,255,0)' }
        ]),
        transparent: true,
        blending: THREE.AdditiveBlending,
        opacity: 0.2,
        vertexColors: true,
        depthWrite: false,
    });
    const nebula = new THREE.Points(nebulaGeometry, nebulaMaterial);
    scene.add(nebula);

    // Mouse movement interaction
    let mouseX = 0, mouseY = 0;
    function onDocumentMouseMove(event) {
        mouseX = (event.clientX - window.innerWidth / 2) / 100;
        mouseY = (event.clientY - window.innerHeight / 2) / 100;
    }
    document.addEventListener('mousemove', onDocumentMouseMove);

    // Animation loop
    const clock = new THREE.Clock();
    function animate() {
        requestAnimationFrame(animate);
        const elapsedTime = clock.getElapsedTime();
        
        // Animate objects
        starGroup.rotation.y = elapsedTime * 0.1;
        starGroup.rotation.x = elapsedTime * 0.05;
        nebula.rotation.y = elapsedTime * 0.02;

        // Move camera based on mouse position for a parallax effect
        camera.position.x += (mouseX - camera.position.x) * 0.02;
        camera.position.y += (-mouseY - camera.position.y) * 0.02;
        camera.lookAt(scene.position);
        
        renderer.render(scene, camera);
    }
    animate();

    // Handle window resize
    function handleResize() {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', handleResize);
}

// Run the animation once the page is fully loaded
window.onload = function() {
    initThreeJSAnimation();
    initLoginForm();
};

// Login form functionality
function initLoginForm() {
    const loginButton = document.querySelector('.form-button');
    const emailInput = document.querySelector('input[type="email"]');
    const passwordInput = document.querySelector('input[type="password"]');
    const rememberCheckbox = document.querySelector('input[type="checkbox"]');

    if (loginButton) {
        loginButton.addEventListener('click', function(e) {
            e.preventDefault();
            
            const email = emailInput.value.trim();
            const password = passwordInput.value.trim();
            
            // Simple validation
            if (!email || !password) {
                alert('Vui lòng nhập đầy đủ email và mật khẩu!');
                return;
            }
            
            if (!isValidEmail(email)) {
                alert('Vui lòng nhập email hợp lệ!');
                return;
            }
            
            // Simulate login process
            loginButton.textContent = 'Đang đăng nhập...';
            loginButton.disabled = true;
            
            // Simple login without hashing (server will handle password verification)
            fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    email: email,
                    password: password // Send plaintext password
                })
            })
            .then(response => response.json())
            .then(data => {
                if (data.success) {
                    // Store login state
                    localStorage.setItem('isLoggedIn', 'true');
                    localStorage.setItem('userEmail', data.user.email);
                    localStorage.setItem('userName', data.user.fullName);
                    localStorage.setItem('token', data.token); // Use consistent key 'token'
                    localStorage.setItem('authToken', data.token); // Keep for backward compatibility
                    localStorage.setItem('userData', JSON.stringify(data.user));
                    
                    if (rememberCheckbox.checked) {
                        localStorage.setItem('rememberMe', 'true');
                    }
                    
                    // Show success message
                    alert('✅ ' + data.message);
                    
                    // Redirect to home page
                    window.location.href = '/index.html';
                } else {
                    // Show error message
                    alert('❌ ' + data.message);
                    
                    // Reset button state
                    loginButton.textContent = 'Đăng Nhập';
                    loginButton.disabled = false;
                }
            })
            .catch(error => {
                console.error('Login error:', error);
                alert('❌ Có lỗi xảy ra. Vui lòng thử lại sau!');
                
                // Reset button state
                loginButton.textContent = 'Đăng Nhập';
                loginButton.disabled = false;
            });
        });
    }

    // Handle Enter key press
    [emailInput, passwordInput].forEach(input => {
        if (input) {
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    loginButton.click();
                }
            });
        }
    });

    // Handle social login buttons
    const googleButton = document.querySelector('.google-button');
    const facebookButton = document.querySelector('.facebook-button');

    if (googleButton) {
        googleButton.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Đăng nhập Google sẽ được tích hợp sớm!');
        });
    }

    if (facebookButton) {
        facebookButton.addEventListener('click', function(e) {
            e.preventDefault();
            alert('Đăng nhập Facebook sẽ được tích hợp sớm!');
        });
    }
}

// Helper function to validate email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Helper function to extract name from email
function getUserNameFromEmail(email) {
    const username = email.split('@')[0];
    return username.charAt(0).toUpperCase() + username.slice(1);
}
