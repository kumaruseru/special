// === Real WebRTC Call Interface ===
let callInfo = null;
let audioSystem = null;

// Initialize call info from localStorage
const initializeCallInfo = () => {
    const storedCallInfo = localStorage.getItem('currentCall');
    if (storedCallInfo) {
        callInfo = JSON.parse(storedCallInfo);
        console.log('📞 Loaded call info:', callInfo);
    } else {
        // Fallback for testing
        callInfo = {
            type: 'video',
            contact: 'Cosmic User',
            state: 'incoming'
        };
        console.log('📞 Using fallback call info');
    }
    
    // Set page title
    document.title = `${callInfo.type === 'video' ? 'Video' : 'Voice'} Call - ${callInfo.contact}`;
    
    // Initialize audio system
    initializeAudioSystem();
};

// Audio system for call notifications
const initializeAudioSystem = () => {
    audioSystem = {
        ringtone: new Audio(),
        callConnected: new Audio(),
        callEnded: new Audio()
    };
    
    // Set up ringtone (simple beep pattern)
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    // Simple ringtone using Web Audio API
    audioSystem.ringtone.addEventListener('canplaythrough', () => {
        console.log('🔊 Audio system ready');
    });
    
    // Set volumes
    audioSystem.ringtone.volume = 0.7;
    audioSystem.callConnected.volume = 0.5;
    audioSystem.callEnded.volume = 0.5;
    
    // Simple beep sounds using data URLs
    audioSystem.ringtone.src = 'data:audio/wav;base64,UklGRsABAABXQVZFZm10IAAAAAABAAABBACJAQABBQAAAAVAEAAAE=';
    audioSystem.callConnected.src = 'data:audio/wav;base64,UklGRvIBAABXQVZFZm10IAAAAAABAAABBACJAQABBQAAAAVAEAAAE=';
    audioSystem.callEnded.src = 'data:audio/wav;base64,UklGRsACAABXQVZFZm10IAAAAAABAAABBACJAQABBQAAAAVAEAAAE=';
    
    // Enable looping for ringtone
    audioSystem.ringtone.loop = true;
};

// Global callbacks for WebRTC client
window.onLocalStreamReady = (stream) => {
    console.log('📹 Local stream ready');
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
        localVideo.srcObject = stream;
    }
};

window.onRemoteStreamReady = (stream) => {
    console.log('📹 Remote stream ready');
    const remoteVideo = document.getElementById('remoteVideo');
    if (remoteVideo) {
        remoteVideo.srcObject = stream;
    }
};

window.onCallConnected = () => {
    console.log('✅ Call connected');
    // Stop ringtone
    if (audioSystem && audioSystem.ringtone) {
        audioSystem.ringtone.pause();
        audioSystem.ringtone.currentTime = 0;
    }
    
    // Play connected sound
    if (audioSystem && audioSystem.callConnected) {
        audioSystem.callConnected.play().catch(e => console.log('Audio play failed:', e));
    }
    
    // Update UI to active state
    if (window.updateCallState) {
        window.updateCallState('active');
    }
};

window.onCallEnded = () => {
    console.log('📞 Call ended');
    // Stop all audio
    if (audioSystem) {
        if (audioSystem.ringtone) {
            audioSystem.ringtone.pause();
            audioSystem.ringtone.currentTime = 0;
        }
        if (audioSystem.callEnded) {
            audioSystem.callEnded.play().catch(e => console.log('Audio play failed:', e));
        }
    }
    
    // Close window after delay
    setTimeout(() => {
        if (window.opener) {
            window.close();
        } else {
            window.location.href = '../pages/messages.html';
        }
    }, 2000);
};

window.onCallDeclined = () => {
    console.log('❌ Call declined');
    window.onCallEnded();
};

window.onCallError = (error) => {
    console.error('📞 Call error:', error);
    alert(`Call Error: ${error.error || 'Unknown error occurred'}`);
    window.onCallEnded();
};

const OutgoingCall = ({ setCallState }) => {
    React.useEffect(() => {
        // Start ringtone for outgoing call
        if (audioSystem && audioSystem.ringtone) {
            audioSystem.ringtone.play().catch(e => console.log('Ringtone play failed:', e));
        }
        
        return () => {
            // Stop ringtone when component unmounts
            if (audioSystem && audioSystem.ringtone) {
                audioSystem.ringtone.pause();
                audioSystem.ringtone.currentTime = 0;
            }
        };
    }, []);

    const handleEndCall = () => {
        if (window.webrtcClient) {
            window.webrtcClient.endCall();
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center text-white text-center p-8">
            <img 
                src="https://placehold.co/128x128/8A2BE2/FFFFFF?text=C" 
                alt={callInfo?.contact} 
                className="w-32 h-32 rounded-full border-4 border-purple-400 pulsing-avatar mb-6"
            />
            <h1 className="text-4xl font-bold">{callInfo?.contact || 'Cosmic User'}</h1>
            <p className="text-xl text-gray-400 mt-2">Đang gọi...</p>
            <div className="absolute bottom-16">
                <button onClick={handleEndCall} className="call-button decline-button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
                    </svg>
                </button>
            </div>
        </div>
    );
};

const IncomingCall = ({ setCallState }) => {
    React.useEffect(() => {
        // Start ringtone for incoming call
        if (audioSystem && audioSystem.ringtone) {
            audioSystem.ringtone.play().catch(e => console.log('Ringtone play failed:', e));
        }
        
        return () => {
            // Stop ringtone when component unmounts
            if (audioSystem && audioSystem.ringtone) {
                audioSystem.ringtone.pause();
                audioSystem.ringtone.currentTime = 0;
            }
        };
    }, []);

    const handleAcceptCall = async () => {
        try {
            if (window.webrtcClient) {
                await window.webrtcClient.answerCall(true);
                setCallState('active');
            }
        } catch (error) {
            console.error('Error accepting call:', error);
            alert('Failed to accept call: ' + error.message);
        }
    };

    const handleDeclineCall = () => {
        if (window.webrtcClient) {
            window.webrtcClient.answerCall(false);
        }
    };

    return (
        <div className="w-full h-full flex flex-col items-center justify-center text-white text-center p-8">
            <img 
                src="https://placehold.co/128x128/8A2BE2/FFFFFF?text=C" 
                alt={callInfo?.contact} 
                className="w-32 h-32 rounded-full border-4 border-purple-400 pulsing-avatar mb-6"
            />
            <h1 className="text-4xl font-bold">{callInfo?.contact || 'Cosmic User'}</h1>
            <p className="text-xl text-gray-400 mt-2">
                {callInfo?.type === 'video' ? 'Cuộc gọi video đến...' : 'Cuộc gọi thoại đến...'}
            </p>
            <div className="absolute bottom-16 flex gap-8">
                <button onClick={handleDeclineCall} className="call-button decline-button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/>
                    </svg>
                </button>
                <button onClick={handleAcceptCall} className="call-button accept-button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
                    </svg>
                </button>
            </div>
        </div>
    );
};

const ActiveCall = ({ setCallState }) => {
    const [elapsedTime, setElapsedTime] = React.useState(0);
    const [isMuted, setIsMuted] = React.useState(false);
    const [isCameraOff, setIsCameraOff] = React.useState(false);
    const [isScreenSharing, setIsScreenSharing] = React.useState(false);
    const [isCameraFlipped, setIsCameraFlipped] = React.useState(true); // Default to flipped (mirror mode)
    const localVideoRef = React.useRef(null);
    const remoteVideoRef = React.useRef(null);

    React.useEffect(() => {
        const timer = setInterval(() => {
            setElapsedTime(prevTime => prevTime + 1);
        }, 1000);

        // Initialize media stream when component mounts
        initializeMedia();

        return () => {
            clearInterval(timer);
        };
    }, []);

    const initializeMedia = async () => {
        try {
            await webRTCManager.getUserMedia();
            if (localVideoRef.current && localStream) {
                localVideoRef.current.srcObject = localStream;
            }
            
            // Simulate remote stream for demo
            if (remoteVideoRef.current && !remoteStream) {
                // Create a placeholder remote stream
                const canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 480;
                const ctx = canvas.getContext('2d');
                
                // Animate the placeholder
                const animate = () => {
                    ctx.fillStyle = `hsl(${Date.now() * 0.01 % 360}, 70%, 50%)`;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    ctx.fillStyle = 'white';
                    ctx.font = '48px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('👤', canvas.width / 2, canvas.height / 2);
                    
                    requestAnimationFrame(animate);
                };
                animate();
                
                remoteVideoRef.current.srcObject = canvas.captureStream(30);
            }
        } catch (error) {
            console.error('Error initializing media:', error);
        }
    };

    const handleMuteToggle = () => {
        const newMutedState = webRTCManager.toggleMute();
        setIsMuted(newMutedState);
    };

    const handleCameraToggle = () => {
        if (callInfo?.type === 'video') {
            const newCameraState = webRTCManager.toggleCamera();
            setIsCameraOff(newCameraState);
        }
    };

    const handleScreenShareToggle = async () => {
        if (callInfo?.type === 'video') {
            try {
                const newScreenShareState = await webRTCManager.toggleScreenShare();
                setIsScreenSharing(newScreenShareState);
            } catch (error) {
                console.error('Error toggling screen share:', error);
            }
        }
    };

    const handleCameraFlipToggle = () => {
        setIsCameraFlipped(!isCameraFlipped);
    };

    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
    };

    const isVideoCall = callInfo?.type === 'video';

    return (
        <div className="w-full h-full relative">
            {isVideoCall ? (
                <>
                    {/* Remote Video Feed */}
                    <video 
                        ref={remoteVideoRef}
                        className="w-full h-full object-cover remote-video"
                        autoPlay
                        playsInline
                    />

                    {/* Local Video Feed */}
                    <div className="absolute bottom-32 sm:bottom-8 right-4 w-1/3 max-w-[250px] aspect-video rounded-lg overflow-hidden glass-pane border-2 border-blue-400">
                        <video 
                            ref={localVideoRef}
                            className={`w-full h-full object-cover ${isCameraFlipped ? 'local-video' : 'remote-video'}`}
                            autoPlay
                            playsInline
                            muted
                        />
                        
                        {/* Camera Flip Toggle Button */}
                        <button 
                            onClick={handleCameraFlipToggle}
                            className="absolute top-2 right-2 p-1 bg-black/50 rounded-full text-white hover:bg-black/70 transition-all"
                            title={isCameraFlipped ? "Tắt chế độ gương" : "Bật chế độ gương"}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 12h18m-9-9l9 9-9 9"/>
                            </svg>
                        </button>
                    </div>
                </>
            ) : (
                /* Voice Call UI */
                <div className="w-full h-full flex flex-col items-center justify-center text-white">
                    <img src="https://placehold.co/200x200/8A2BE2/FFFFFF?text=C" alt={callInfo?.contact} className="w-48 h-48 rounded-full border-4 border-purple-400 mb-8"/>
                    <h1 className="text-4xl font-bold mb-2">{callInfo?.contact || 'Cosmic Chat'}</h1>
                    
                    {/* Audio Visualization */}
                    <div className="flex gap-1 mb-8">
                        {[...Array(20)].map((_, i) => (
                            <div key={i} className="w-1 bg-green-400 rounded-full voice-bar" style={{height: '4px'}}></div>
                        ))}
                    </div>
                </div>
            )}

            {/* Call Info Overlay */}
            <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center text-white p-3 rounded-xl glass-pane">
                <h2 className="text-xl font-bold">{callInfo?.contact || 'Cosmic Chat'}</h2>
                <p className="text-md text-gray-300">{formatTime(elapsedTime)}</p>
            </div>
            
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 p-4 rounded-full glass-pane">
                {/* Mute Button */}
                <button 
                    onClick={handleMuteToggle}
                    className={`call-button ${isMuted ? 'bg-red-600' : 'control-button'}`}
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        {isMuted ? (
                            <>
                                <line x1="1" y1="1" x2="23" y2="23"></line>
                                <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"></path>
                                <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"></path>
                                <line x1="12" y1="19" x2="12" y2="23"></line>
                                <line x1="8" y1="23" x2="16" y2="23"></line>
                            </>
                        ) : (
                            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                        )}
                    </svg>
                </button>

                {/* Camera Button (Video calls only) */}
                {isVideoCall && (
                    <button 
                        onClick={handleCameraToggle}
                        className={`call-button ${isCameraOff ? 'bg-red-600' : 'control-button'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            {isCameraOff ? (
                                <>
                                    <line x1="1" y1="1" x2="23" y2="23"></line>
                                    <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06a4 4 0 1 1-5.56-5.56"></path>
                                </>
                            ) : (
                                <polygon points="23 7 16 12 23 17 23 7"></polygon>
                            )}
                        </svg>
                    </button>
                )}

                {/* End Call Button */}
                <button onClick={() => webRTCManager.endCall()} className="call-button decline-button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/></svg>
                </button>

                {/* Screen Share Button (Video calls only) */}
                {isVideoCall && (
                    <button 
                        onClick={handleScreenShareToggle}
                        className={`call-button ${isScreenSharing ? 'bg-blue-600' : 'control-button'}`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 18v-6M9 15l3-3 3 3"/>
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                        </svg>
                    </button>
                )}

                {/* Add Participant Button */}
                <button className="call-button control-button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>
                </button>
            </div>
        </div>
    );
};

const App = () => {
    const [callState, setCallState] = React.useState(() => {
        // Initialize based on stored call info or default to incoming
        return callInfo?.state || 'incoming';
    });

    React.useEffect(() => {
        // Initialize call info when app mounts
        initializeCallInfo();
    }, []);

    const renderCallScreen = () => {
        switch(callState) {
            case 'outgoing':
                return <OutgoingCall setCallState={setCallState} />;
            case 'active':
                return <ActiveCall setCallState={setCallState} />;
            case 'incoming':
            default:
                return <IncomingCall setCallState={setCallState} />;
        }
    }

    return (
        <div className="w-full h-full">
            {renderCallScreen()}
        </div>
    );
};

ReactDOM.render(<App />, document.getElementById('root'));

// --- 3D Cosmic Background Script ---
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1, 1000);
camera.position.z = 300;
const renderer = new THREE.WebGLRenderer({
    canvas: document.getElementById('cosmic-bg'),
    antialias: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);

const starGeo = new THREE.BufferGeometry();
const starCount = 8000;
const posArray = new Float32Array(starCount * 3);
const velArray = new Float32Array(starCount);

for (let i = 0; i < starCount * 3; i++) {
    posArray[i] = (Math.random() - 0.5) * 600;
    velArray[i] = 0;
}
starGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

function createStarTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.2, 'rgba(255,255,255,0.8)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(canvas);
}

const starMaterial = new THREE.PointsMaterial({
    size: 1,
    map: createStarTexture(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
});
const stars = new THREE.Points(starGeo, starMaterial);
scene.add(stars);

const animate = () => {
    const positions = starGeo.attributes.position.array;
    for (let i = 0; i < starCount; i++) {
        const i3 = i * 3;
        positions[i3 + 2] += 0.5; // Move stars towards camera
        if (positions[i3 + 2] > camera.position.z) {
            positions[i3 + 2] = -300; // Reset star
        }
    }
    starGeo.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
};
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log('=== CALLS PAGE LOADED ===');
    
    // Initialize call info from localStorage
    initializeCallInfo();
    
    // Update UI with call information
    updateCallUI();
    
    // Initialize WebRTC manager
    const webrtcManager = new WebRTCManager();
    
    // Setup event listeners for call controls
    setupCallControls();
    
    console.log('Calls page initialization complete');
});

// Update UI with current call information
function updateCallUI() {
    if (!callInfo) return;
    
    console.log('Updating call UI with:', callInfo);
    
    // Update contact name
    const contactElements = document.querySelectorAll('[data-contact-name]');
    contactElements.forEach(el => {
        el.textContent = callInfo.contact || 'Unknown Contact';
    });
    
    // Update call type in title
    const titleElements = document.querySelectorAll('[data-call-type]');
    titleElements.forEach(el => {
        el.textContent = callInfo.type === 'video' ? 'Video Call' : 'Voice Call';
    });
    
    // Update call state
    const stateElements = document.querySelectorAll('[data-call-state]');
    stateElements.forEach(el => {
        const states = {
            'outgoing': 'Đang gọi...',
            'incoming': 'Cuộc gọi đến',
            'active': 'Đang kết nối...',
            'connected': 'Đã kết nối'
        };
        el.textContent = states[callInfo.state] || 'Đang kết nối...';
    });
    
    // Show/hide elements based on call type
    if (callInfo.type === 'voice') {
        // Hide video elements for voice calls
        const videoElements = document.querySelectorAll('[data-video-only]');
        videoElements.forEach(el => el.style.display = 'none');
    }
}

// Setup event listeners for call controls
function setupCallControls() {
    // Mute button
    const muteButtons = document.querySelectorAll('[data-action="mute"]');
    muteButtons.forEach(button => {
        button.addEventListener('click', () => toggleMute());
    });
    
    // Camera toggle (video calls only)
    const cameraButtons = document.querySelectorAll('[data-action="camera"]');
    cameraButtons.forEach(button => {
        button.addEventListener('click', () => toggleCamera());
    });
    
    // End call button
    const endCallButtons = document.querySelectorAll('[data-action="end-call"]');
    endCallButtons.forEach(button => {
        button.addEventListener('click', () => endCall());
    });
    
    // Screen share button
    const screenShareButtons = document.querySelectorAll('[data-action="screen-share"]');
    screenShareButtons.forEach(button => {
        button.addEventListener('click', () => toggleScreenShare());
    });
}

// Call control functions
function toggleMute() {
    console.log('Toggle mute');
    // Implementation for mute/unmute
}

function toggleCamera() {
    console.log('Toggle camera');
    // Implementation for camera on/off
}

function toggleScreenShare() {
    console.log('Toggle screen share');
    // Implementation for screen sharing
}

function endCall() {
    console.log('=== ENDING CALL ===');
    
    // Play call ended sound
    if (audioSystem && audioSystem.callEnded) {
        try {
            audioSystem.callEnded.play().catch(error => {
                console.log('Could not play call ended sound:', error);
            });
        } catch (error) {
            console.log('Audio system not available');
        }
    }
    
    // Clean up WebRTC connections
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    // Stop local streams
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    // Clear call data
    localStorage.removeItem('currentCall');
    
    // Close the window after a short delay to allow sound to play
    setTimeout(() => {
        if (window.opener) {
            window.close();
        } else {
            // If not a popup, redirect back
            window.location.href = '../pages/messages.html';
        }
    }, 1000);
}