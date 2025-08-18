// Production Server with Security and Performance Optimizations
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const { ObjectId } = mongoose.Types;
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Import utilities
const logger = require('./utils/logger');
const { validateEnvironment, getConfig } = require('./utils/config');
const { securityHeaders, authRateLimit, apiRateLimit } = require('./utils/security');
const { sendPasswordResetEmail, testEmailConnection } = require('./config/email');

// Validate environment and get config
try {
    console.log('Starting environment validation...');
    validateEnvironment();
    console.log('Environment validation passed');
    logger.info('Environment validation passed');
} catch (error) {
    console.error('Environment validation failed:', error.message);
    logger.error('Environment validation failed', { error: error.message });
    process.exit(1);
}

console.log('Getting configuration...');
const config = getConfig();
console.log('Configuration loaded:', {
    port: config.port,
    nodeEnv: config.nodeEnv,
    hasMongoUri: !!config.mongoUri
});

console.log('Creating Express app...');
const app = express();

// Trust proxy for production deployment (fixes rate limiting with reverse proxy)
app.set('trust proxy', 1);

console.log('Creating HTTP server...');
const server = http.createServer(app);

console.log('Setting up Socket.IO...');
// Enhanced Socket.IO configuration for production
let io;
try {
    io = socketIo(server, {
        cors: {
            origin: config.corsOrigin,
            methods: ["GET", "POST"],
            credentials: true
        },
        transports: ['websocket', 'polling'],
        allowEIO3: true,
        pingTimeout: 120000,
        pingInterval: 30000,
        connectTimeout: 45000,
        upgradeTimeout: 30000,
        maxHttpBufferSize: 1e6, // 1MB limit
        compression: true,
        perMessageDeflate: true
    });
    console.log('Socket.IO setup completed');
} catch (error) {
    console.error('Socket.IO setup failed:', error.message);
    process.exit(1);
}

console.log('Setting up global error handlers...');
// Global error handlers
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error.message);
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    logger.error('Unhandled Rejection', { reason, promise });
    process.exit(1);
});

console.log('Setting up graceful shutdown...');

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
        mongoose.connection.close();
        process.exit(0);
    });
});

console.log('Setting up security middleware...');
console.log('Rate limiting config:', config.rateLimiting);
// Security middleware
if (config.rateLimiting && config.rateLimiting.enabled) {
    console.log('Applying rate limiting...');
    app.use('/api/auth', authRateLimit);
    app.use('/api', apiRateLimit);
}

console.log('Setting up headers and CORS...');
console.log('CORS origin:', config.corsOrigin);
app.use(securityHeaders());
app.use(cors({
    origin: config.corsOrigin || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

console.log('Setting up body parsers...');
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

console.log('Setting up database connection...');

// Database Connection
async function connectDatabase() {
    console.log('Inside connectDatabase function...');
    try {
        console.log('Attempting MongoDB connection...');
        const mongoOptions = {
            maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE) || 10,
            serverSelectionTimeoutMS: parseInt(process.env.MONGODB_TIMEOUT) || 5000,
            socketTimeoutMS: 45000,
            bufferCommands: false
        };

        await mongoose.connect(config.mongoUri, mongoOptions);
        console.log('MongoDB connected successfully!');
        logger.info('MongoDB connected successfully', { 
            uri: config.mongoUri.replace(/:[^:@]*@/, ':***@') 
        });
        
        return true;
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        logger.error('MongoDB connection failed', { 
            error: error.message,
            uri: config.mongoUri ? config.mongoUri.replace(/:[^:@]*@/, ':***@') : 'undefined'
        });
        
        // Retry connection after 5 seconds
        setTimeout(connectDatabase, 5000);
        return false;
    }
}

// Start database connection and then server
console.log('Calling connectDatabase()...');

// Start server after database connection
async function startServer() {
    try {
        const dbConnected = await connectDatabase();
        if (!dbConnected) {
            console.error('❌ Failed to connect to database, cannot start server');
            process.exit(1);
        }

        console.log('✅ Database connected, proceeding with server startup...');

console.log('Creating database models...');
// Database Models
const UserSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    salt: { type: String }, // For custom password hashing
    fullName: { type: String, required: true },
    username: { type: String, unique: true, sparse: true },
    avatar: { type: String },
    bio: { type: String },
    location: { type: String },
    isVerified: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    blockedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    verificationToken: { type: String },
    passwordResetToken: { type: String },
    passwordResetExpires: { type: Date },
    lastActive: { type: Date, default: Date.now },
    settings: {
        notifications: { type: Boolean, default: true },
        privacy: { type: String, default: 'public' },
        language: { type: String, default: 'vi' }
    }
}, {
    timestamps: true
});

// Create User model
const User = mongoose.model('User', UserSchema);

// Post Schema
const PostSchema = new mongoose.Schema({
    content: { type: String, required: true },
    author: {
        id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        username: { type: String, required: true },
        email: { type: String, required: true },
        fullName: { type: String },
        avatar: { type: String }
    },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{
        author: {
            id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
            username: { type: String },
            fullName: { type: String },
            avatar: { type: String }
        },
        content: { type: String, required: true },
        createdAt: { type: Date, default: Date.now }
    }],
    images: [{ type: String }],
    visibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
    tags: [{ type: String }],
    shares: { type: Number, default: 0 }
}, {
    timestamps: true
});

// Create Post model
const Post = mongoose.model('Post', PostSchema);

// Message Schema
const MessageSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    messageType: { 
        type: String, 
        enum: ['text', 'image', 'video', 'audio', 'file', 'voice'], 
        default: 'text' 
    },
    readAt: { type: Date, default: null },
    editedAt: { type: Date },
    deletedAt: { type: Date },
    attachments: [{
        type: { type: String, enum: ['image', 'video', 'audio', 'file'] },
        url: String,
        name: String,
        size: Number
    }],
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    reactions: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        emoji: String,
        createdAt: { type: Date, default: Date.now }
    }]
}, { 
    timestamps: true,
    indexes: [
        { senderId: 1, receiverId: 1, createdAt: -1 },
        { receiverId: 1, readAt: 1 }
    ]
});

// Create Message model
const Message = mongoose.model('Message', MessageSchema);

console.log('Setting up request logging middleware...');
// Request logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.info('HTTP Request', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
    });
    
    next();
});

console.log('Setting up authentication routes...');
// Health check endpoint
app.get('/health', (req, res) => {
    const healthData = {
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
        version: require('./package.json').version,
        database: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
        features: config.features
    };
    
    logger.debug('Health check accessed', healthData);
    res.json(healthData);
});

// Static file serving with caching
const staticOptions = {
    maxAge: config.nodeEnv === 'production' ? '1d' : '0',
    etag: true,
    lastModified: true
};

app.use('/assets', express.static(path.join(__dirname, 'assets'), staticOptions));
app.use('/pages', express.static(path.join(__dirname, 'pages'), staticOptions));
app.use('/components', express.static(path.join(__dirname, 'components'), staticOptions));
app.use(express.static(path.join(__dirname), staticOptions));

// Database connection with retry logic
let mongoConnection = null;

const connectToDatabase = async (retries = 5) => {
    try {
        const conn = await mongoose.connect(config.mongoUri, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000
        });
        
        mongoConnection = conn;
        logger.info('Database connected successfully', {
            host: conn.connection.host,
            name: conn.connection.name
        });
        
        return conn;
    } catch (error) {
        logger.error('Database connection failed', { 
            error: error.message, 
            retries: retries - 1 
        });
        
        if (retries > 1) {
            logger.info('Retrying database connection in 5 seconds...');
            await new Promise(resolve => setTimeout(resolve, 5000));
            return connectToDatabase(retries - 1);
        } else {
            throw error;
        }
    }
};

// Initialize database connection
connectToDatabase().catch(error => {
    logger.error('Failed to connect to database after all retries', { error: error.message });
    process.exit(1);
});

// === AUTHENTICATION ROUTES ===

// Get salt for password hashing
app.post('/api/get-salt', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }
        
        // Find user by email
        const user = await User.findOne({ email });
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Return salt (first part of hashed password)
        const salt = user.password.split('$')[0] + '$' + user.password.split('$')[1] + '$' + user.password.split('$')[2] + '$';
        
        res.json({
            success: true,
            salt: salt
        });
        
    } catch (error) {
        console.error('Error getting salt:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Debug login endpoint with multiple hash testing
app.post('/api/debug-login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        console.log('🐛 Debug login attempt:', { email, passwordLength: password?.length });
        
        if (!email || !password) {
            return res.json({
                success: false,
                message: 'Email and password required',
                debug: { email: !!email, password: !!password }
            });
        }
        
        // Find user
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            return res.json({
                success: false,
                message: 'User not found',
                debug: { 
                    email: email,
                    userExists: false
                }
            });
        }
        
        // Test multiple password hashing scenarios
        const crypto = require('crypto');
        const tests = {
            direct: await bcrypt.compare(password, user.password),
            sha256: false,
            sha256Salt: false,
            sha256SaltReverse: false,
            doubleBcrypt: false,
            sha256ThenBcrypt: false,
            sha256SaltThenSha256: false,
            md5Salt: false,
            pbkdf2: false
        };
        
        // Test SHA256 hash
        const sha256Hash = crypto.createHash('sha256').update(password).digest('hex');
        tests.sha256 = await bcrypt.compare(sha256Hash, user.password);
        
        // Test SHA256 with salt (if salt exists)
        if (user.salt) {
            const sha256WithSalt = crypto.createHash('sha256').update(password + user.salt).digest('hex');
            tests.sha256Salt = await bcrypt.compare(sha256WithSalt, user.password);
            
            // Test salt + password (reverse order)
            const sha256SaltReverse = crypto.createHash('sha256').update(user.salt + password).digest('hex');
            tests.sha256SaltReverse = await bcrypt.compare(sha256SaltReverse, user.password);
            
            // Test SHA256 + salt, then SHA256 again, then bcrypt
            const doubleSha256 = crypto.createHash('sha256').update(sha256WithSalt).digest('hex');
            tests.sha256ThenBcrypt = await bcrypt.compare(doubleSha256, user.password);
            
            // Test SHA256(password + salt) then SHA256 again
            const sha256SaltThenSha256 = crypto.createHash('sha256').update(sha256WithSalt).digest('hex');
            tests.sha256SaltThenSha256 = await bcrypt.compare(sha256SaltThenSha256, user.password);
            
            // Test MD5 with salt
            const md5WithSalt = crypto.createHash('md5').update(password + user.salt).digest('hex');
            tests.md5Salt = await bcrypt.compare(md5WithSalt, user.password);
            
            // Test PBKDF2
            try {
                const pbkdf2Hash = crypto.pbkdf2Sync(password, user.salt, 1000, 32, 'sha256').toString('hex');
                tests.pbkdf2 = await bcrypt.compare(pbkdf2Hash, user.password);
            } catch (e) {
                tests.pbkdf2 = 'error';
            }
        }
        
        // Test if password is double bcrypt
        try {
            const bcryptFirst = await bcrypt.hash(password, 10);
            tests.doubleBcrypt = await bcrypt.compare(bcryptFirst, user.password);
        } catch (e) {
            tests.doubleBcrypt = 'error';
        }
        
        const anySuccess = Object.values(tests).some(t => t === true);
        
        res.json({
            success: anySuccess,
            message: anySuccess ? 'Found working hash method' : 'No hash method worked',
            debug: {
                email: user.email,
                userExists: true,
                tests,
                hasSalt: !!user.salt,
                saltValue: user.salt || 'none',
                storedPasswordType: user.password.startsWith('$2') ? 'bcrypt' : 'other',
                inputPasswordLength: password.length,
                storedPasswordLength: user.password.length,
                passwordPrefix: user.password.substring(0, 15)
            }
        });
        
    } catch (error) {
        console.error('❌ Debug login error:', error);
        res.status(500).json({
            success: false,
            message: 'Debug error',
            error: error.message
        });
    }
});

// Force password reset endpoint (development only)
app.post('/api/force-reset-password', async (req, res) => {
    try {
        const { email, newPassword } = req.body;
        
        if (!email || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Email and newPassword are required'
            });
        }
        
        console.log('🔧 Force password reset for:', email);
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        // Hash new password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
        
        // Update password
        await User.updateOne(
            { email },
            { password: hashedPassword }
        );
        
        console.log('✅ Password reset successful for:', email);
        
        res.json({
            success: true,
            message: 'Password reset successful',
            debug: {
                email: email,
                newPasswordLength: newPassword.length,
                hashedPasswordLength: hashedPassword.length
            }
        });
        
    } catch (error) {
        console.error('❌ Force password reset error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Get salt endpoint for secure password hashing
app.post('/api/get-salt', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email is required'
            });
        }
        
        // Find user to get their stored salt (if any)
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (user && user.salt) {
            // Return existing salt for this user
            res.json({
                success: true,
                salt: user.salt
            });
        } else {
            // Generate a new salt for new user or fallback
            const salt = await bcrypt.genSalt(12);
            
            res.json({
                success: true,
                salt: salt
            });
        }
        
    } catch (error) {
        console.error('❌ Error getting salt:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Login endpoint
app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }
        
        console.log('🔐 Login attempt for:', email);
        
        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            console.log('❌ User not found:', email);
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        let isValidPassword = false;
        
        // Use the correct hash method: SHA256(password + salt) then bcrypt comparison
        console.log('🔍 Using SHA256+salt then bcrypt password comparison...');
        
        if (user.salt) {
            const crypto = require('crypto');
            const sha256WithSalt = crypto.createHash('sha256').update(password + user.salt).digest('hex');
            isValidPassword = await bcrypt.compare(sha256WithSalt, user.password);
            console.log('🔍 Hash method: SHA256(password + salt) -> bcrypt compare');
        } else {
            // Fallback to direct bcrypt comparison if no salt
            isValidPassword = await bcrypt.compare(password, user.password);
            console.log('🔍 Hash method: Direct bcrypt compare (no salt)');
        }
        
        if (!isValidPassword) {
            console.log('❌ Invalid password for:', email);
            console.log('🔍 Password length:', password.length, 'Expected bcrypt hash');
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }
        
        console.log('✅ Login successful for:', email);
        
        // Generate JWT token
        const token = jwt.sign(
            { 
                userId: user._id,
                email: user.email,
                fullName: user.fullName
            },
            config.jwtSecret,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            message: 'Login successful',
            token: token,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                avatar: user.avatar
            }
        });
        
    } catch (error) {
        console.error('❌ Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Forgot password endpoint
app.post('/api/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        
        if (!email) {
            return res.status(400).json({
                success: false,
                message: 'Email là bắt buộc'
            });
        }
        
        console.log('🔐 Password reset request for:', email);
        
        // Find user by email
        const user = await User.findOne({ email: email.toLowerCase() });
        
        if (!user) {
            // Don't reveal if user exists or not for security
            return res.json({
                success: true,
                message: 'Nếu email tồn tại, chúng tôi đã gửi liên kết reset password'
            });
        }
        
        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now
        
        // Save token to user
        await User.findByIdAndUpdate(user._id, {
            passwordResetToken: resetToken,
            passwordResetExpires: resetTokenExpiry
        });
        
        console.log('✅ Reset token generated for:', email);
        
        // Send password reset email
        try {
            console.log('📧 Attempting to send password reset email...');
            const emailResult = await sendPasswordResetEmail(user.email, resetToken, user.fullName);
            
            if (emailResult.success) {
                console.log('📧 Password reset email sent successfully:', emailResult.messageId);
                
                res.json({
                    success: true,
                    message: 'Liên kết khôi phục mật khẩu đã được gửi đến email của bạn. Vui lòng kiểm tra hộp thư.'
                });
            } else {
                console.error('❌ Failed to send password reset email:', emailResult.error);
                
                // Provide fallback reset link
                const resetLink = `${req.protocol}://${req.get('host')}/pages/reset-password.html?token=${resetToken}`;
                console.log('🔗 Providing fallback reset link');
                
                res.json({
                    success: true,
                    message: 'Email service temporarily unavailable. Please try again later.',
                    // Include link for manual access
                    resetLink: resetLink
                });
            }
        } catch (emailError) {
            console.error('❌ Error sending reset email:', emailError.message);
            
            // Always provide fallback for testing
            const resetLink = `${req.protocol}://${req.get('host')}/pages/reset-password.html?token=${resetToken}`;
            console.log('🔗 Fallback reset link:', resetLink);
            
            res.json({
                success: true,
                message: 'Email service temporarily unavailable. Please try again later.',
                resetLink: resetLink
            });
        }
        
    } catch (error) {
        console.error('❌ Forgot password error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server'
        });
    }
});

// Reset password endpoint
app.post('/api/reset-password', async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        
        if (!token || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Token và mật khẩu mới là bắt buộc'
            });
        }
        
        console.log('🔐 Password reset attempt with token:', token.substring(0, 8) + '...');
        
        // Find user with valid reset token
        const user = await User.findOne({
            passwordResetToken: token,
            passwordResetExpires: { $gt: new Date() }
        });
        
        if (!user) {
            return res.status(400).json({
                success: false,
                message: 'Token không hợp lệ hoặc đã hết hạn'
            });
        }
        
        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);
        
        // Update user password and clear reset token
        await User.findByIdAndUpdate(user._id, {
            password: hashedPassword,
            passwordResetToken: undefined,
            passwordResetExpires: undefined
        });
        
        console.log('✅ Password reset successful for:', user.email);
        
        res.json({
            success: true,
            message: 'Mật khẩu đã được đặt lại thành công!'
        });
        
    } catch (error) {
        console.error('❌ Reset password error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server'
        });
    }
});

// Test email connection endpoint
app.get('/api/test-email', async (req, res) => {
    try {
        console.log('🧪 Testing email connection...');
        
        // Check if email config exists
        console.log('📧 Email config check:');
        console.log('- EMAIL_USER:', process.env.EMAIL_USER ? '✅ Set' : '❌ Missing');
        console.log('- EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '✅ Set' : '❌ Missing');
        console.log('- SMTP_HOST:', process.env.SMTP_HOST || 'Using default');
        console.log('- SMTP_PORT:', process.env.SMTP_PORT || 'Using default');
        
        const result = await testEmailConnection();
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Email connection successful! ✅',
                details: result.message,
                config: {
                    emailUser: process.env.EMAIL_USER ? 'Set' : 'Missing',
                    emailPassword: process.env.EMAIL_PASSWORD ? 'Set' : 'Missing',
                    smtpHost: process.env.SMTP_HOST || 'smtp.cown.name.vn',
                    smtpPort: process.env.SMTP_PORT || '587'
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Email connection failed ❌',
                error: result.error,
                config: {
                    emailUser: process.env.EMAIL_USER ? 'Set' : 'Missing',
                    emailPassword: process.env.EMAIL_PASSWORD ? 'Set' : 'Missing',
                    smtpHost: process.env.SMTP_HOST || 'smtp.cown.name.vn',
                    smtpPort: process.env.SMTP_PORT || '587'
                }
            });
        }
        
    } catch (error) {
        console.error('❌ Email test error:', error);
        res.status(500).json({
            success: false,
            message: 'Email test failed',
            error: error.message
        });
    }
});

// Debug endpoint to get reset link (for testing)
app.get('/api/debug-reset-link/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
        const user = await User.findOne({ 
            email: email.toLowerCase(),
            passwordResetToken: { $exists: true },
            passwordResetExpires: { $gt: new Date() }
        });
        
        if (!user) {
            return res.json({
                success: false,
                message: 'No valid reset token found for this email'
            });
        }
        
        const resetLink = `${req.protocol}://${req.get('host')}/pages/reset-password.html?token=${user.passwordResetToken}`;
        
        res.json({
            success: true,
            email: user.email,
            resetLink: resetLink,
            expiresAt: user.passwordResetExpires
        });
        
    } catch (error) {
        console.error('❌ Debug reset link error:', error);
        res.status(500).json({
            success: false,
            message: 'Server error'
        });
    }
});

app.post('/api/register', async (req, res) => {
    console.log('Registration API called');
    console.log('Request body:', req.body);
    
    try {
        const { email, password, fullName, username } = req.body;

        // Debug checks
        console.log('MongoDB connection state:', mongoose.connection.readyState);
        console.log('User model available:', !!User);

        if (!email || !password || !fullName) {
            console.log('Missing required fields');
            return res.status(400).json({
                success: false,
                message: 'Email, password, and full name are required'
            });
        }

        console.log('Checking for existing user...');
        const existingUser = await User.findOne({
            $or: [
                { email: email.toLowerCase() },
                ...(username ? [{ username: username.toLowerCase() }] : [])
            ]
        });

        if (existingUser) {
            console.log('User already exists:', existingUser.email);
            return res.status(400).json({
                success: false,
                message: existingUser.email === email.toLowerCase() ? 'Email already exists' : 'Username already exists'
            });
        }

        console.log('Hashing password...');
        // Generate salt for password hashing
        const salt = crypto.randomBytes(16).toString('hex');
        // Create SHA256 hash of password + salt
        const sha256WithSalt = crypto.createHash('sha256').update(password + salt).digest('hex');
        // Then hash with bcrypt
        const hashedPassword = await bcrypt.hash(sha256WithSalt, 12);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        console.log('Creating user object...');
        const user = new User({
            email: email.toLowerCase(),
            password: hashedPassword,
            salt: salt, // Store the salt for login verification
            fullName,
            username: username ? username.toLowerCase() : null,
            verificationToken,
            avatar: `https://placehold.co/150x150/4F46E5/FFFFFF?text=${fullName.charAt(0).toUpperCase()}`
        });

        console.log('Saving user to database...');
        await user.save();
        console.log('User saved successfully:', user._id);

        console.log('Generating JWT token...');
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            config.jwtSecret,
            { expiresIn: '7d' }
        );

        res.status(201).json({
            success: true,
            message: 'User registered successfully',
            token,
            user: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                username: user.username,
                avatar: user.avatar,
                isVerified: user.isVerified
            }
        });

    } catch (error) {
        console.error('Registration error details:');
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        console.error('Error name:', error.name);
        
        logger.error('Registration error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            debug: {
                error: error.message,
                name: error.name
            }
        });
    }
});

// Debug endpoint to check API status
app.get('/api/debug', (req, res) => {
    res.json({
        success: true,
        message: 'API is working',
        timestamp: new Date().toISOString(),
        version: '2.0', // Updated version to confirm deployment
        endpoints: [
            'GET /api/debug',
            'GET /api/ping',
            'GET /api/debug-users',
            'GET /api/debug-production',
            'GET /api/debug-raw',
            'GET /api/debug-reset-link/:email',
            'GET /api/test-email',
            'GET /api/users',
            'POST /api/get-salt',
            'POST /api/login',
            'POST /api/forgot-password',
            'POST /api/reset-password',
            'GET /api/test-restore',
            'POST /api/restore-name',
            'POST /api/fix-users',
            'GET /api/posts',
            'POST /api/register',
            'GET /health'
        ]
    });
});

// Ping endpoint for connection quality testing
app.all('/api/ping', (req, res) => {
    const startTime = Date.now();
    res.json({
        success: true,
        timestamp: new Date().toISOString(),
        latency: Date.now() - startTime,
        method: req.method,
        userAgent: req.get('User-Agent')?.substring(0, 50) + '...'
    });
});

// Simple debug endpoint to see raw user data
app.get('/api/debug-raw', async (req, res) => {
    try {
        const users = await User.find({}).lean();
        res.json({
            success: true,
            count: users.length,
            rawUsers: users.map(user => ({
                id: user._id,
                username: user.username,
                email: user.email,
                firstName: user.firstName,
                lastName: user.lastName,
                fullName: user.fullName,
                displayName: user.displayName,
                name: user.name,
                originalFields: Object.keys(user)
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Users API endpoint for discovery
// Debug endpoint to see all user fields in database
app.get('/api/debug-users', async (req, res) => {
    try {
        console.log('🔍 Debug: Getting all user data from database...');
        
        const users = await User.find({}).lean();
        
        console.log(`📊 Found ${users.length} users in database`);
        users.forEach((user, index) => {
            console.log(`\n👤 User ${index + 1}:`, {
                _id: user._id,
                email: user.email,
                username: user.username,
                fullName: user.fullName,
                firstName: user.firstName,
                lastName: user.lastName,
                name: user.name,
                displayName: user.displayName,
                // Show all fields
                allFields: Object.keys(user)
            });
        });

        res.json({
            success: true,
            users: users.map(user => ({
                _id: user._id,
                email: user.email,
                username: user.username,
                fullName: user.fullName,
                firstName: user.firstName,
                lastName: user.lastName,
                name: user.name,
                displayName: user.displayName,
                allFields: Object.keys(user)
            })),
            total: users.length
        });

    } catch (error) {
        console.error('❌ Error getting debug user data:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting debug user data',
            error: error.message
        });
    }
});

// Debug production users - show raw data
app.get('/api/debug-production', async (req, res) => {
    try {
        console.log('🔍 Debug: Getting production user data...');
        
        const users = await User.find({})
            .select('fullName email username createdAt firstName lastName name displayName')
            .lean();

        console.log(`📊 Found ${users.length} users in production`);
        
        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            console.log(`👤 Production User ${i + 1}:`, {
                _id: user._id,
                email: user.email,
                username: user.username,
                fullName: user.fullName,
                firstName: user.firstName,
                lastName: user.lastName,
                name: user.name,
                displayName: user.displayName,
                createdAt: user.createdAt,
                allFields: Object.keys(user)
            });
        }

        res.json({
            success: true,
            users: users.map(user => ({
                _id: user._id,
                email: user.email,
                username: user.username,
                fullName: user.fullName,
                firstName: user.firstName,
                lastName: user.lastName,
                name: user.name,
                displayName: user.displayName,
                createdAt: user.createdAt,
                allFields: Object.keys(user)
            })),
            total: users.length
        });

    } catch (error) {
        console.error('❌ Error getting production data:', error);
        res.status(500).json({
            success: false,
            message: 'Error getting production data',
            error: error.message
        });
    }
});

// Test endpoint
app.get('/api/test-restore', (req, res) => {
    res.json({
        success: true,
        message: 'Restore endpoint test is working',
        timestamp: new Date().toISOString()
    });
});

// Restore user real name
app.post('/api/restore-name', async (req, res) => {
    try {
        const { userId, fullName, firstName, lastName } = req.body;
        
        console.log('🔧 Restoring user name:', { userId, fullName, firstName, lastName });
        
        if (!userId || !fullName) {
            return res.status(400).json({
                success: false,
                message: 'userId and fullName are required'
            });
        }

        // Update user with real name
        const updatedUser = await User.findByIdAndUpdate(userId, {
            fullName,
            firstName: firstName || fullName.split(' ')[0],
            lastName: lastName || fullName.split(' ').slice(1).join(' '),
            avatar: `https://placehold.co/150x150/4F46E5/FFFFFF?text=${fullName.charAt(0).toUpperCase()}`
        }, { new: true });

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        console.log('✅ User name restored:', updatedUser.fullName);

        res.json({
            success: true,
            message: `Name restored to: ${fullName}`,
            user: {
                id: updatedUser._id,
                fullName: updatedUser.fullName,
                firstName: updatedUser.firstName,
                lastName: updatedUser.lastName
            }
        });

    } catch (error) {
        console.error('❌ Error restoring user name:', error);
        res.status(500).json({
            success: false,
            message: 'Error restoring user name',
            error: error.message
        });
    }
});

// Fix users with missing fullName
app.post('/api/fix-users', async (req, res) => {
    try {
        console.log('🔧 Starting user data inspection...');
        
        // Get all users to inspect their current state
        const allUsers = await User.find({}).lean();
        console.log(`📊 Found ${allUsers.length} users in database`);

        const userDetails = allUsers.map(user => {
            const fields = Object.keys(user);
            return {
                id: user._id,
                username: user.username,
                email: user.email,
                firstName: user.firstName || 'NOT_SET',
                lastName: user.lastName || 'NOT_SET', 
                fullName: user.fullName || 'NOT_SET',
                name: user.name || 'NOT_SET',
                availableFields: fields,
                createdAt: user.createdAt || 'NOT_SET',
                joinedAt: user.joinedAt || 'NOT_SET'
            };
        });

        res.json({
            success: true,
            message: 'User data inspection completed',
            totalUsers: allUsers.length,
            users: userDetails,
            note: 'Showing all available user data fields'
        });

    } catch (error) {
        console.error('❌ Error inspecting users:', error);
        res.status(500).json({
            success: false,
            message: 'Error inspecting users',
            error: error.message
        });
    }
});

app.get('/api/users', async (req, res) => {
    console.log('👥 Users API called with:', req.query);
    logger.info('Users API accessed', { query: req.query, ip: req.ip });
    
    try {
        const limit = parseInt(req.query.limit) || 10;
        const filter = req.query.filter || 'all';
        
        console.log('📊 User query params:', { limit, filter });

        // Get users from database (exclude current user if authenticated)
        let query = {};
        
        // If we have authentication, we could exclude current user
        // For now, just get public users
        
        const totalUsers = await User.countDocuments(query);
        console.log('📈 Total users found:', totalUsers);

        const users = await User.find(query)
            .select('fullName email username avatar bio location isVerified createdAt') // Don't return sensitive data
            .sort({ createdAt: -1 }) // Newest first
            .limit(limit)
            .lean();

        console.log('👥 Users fetched:', users.length);
        console.log('📊 Sample user data:', users[0]); // Debug first user

        // Format users for frontend
        const formattedUsers = users.map((user, index) => {
            console.log(`🔍 User ${index + 1}:`, {
                fullName: user.fullName,
                username: user.username,
                email: user.email,
                _id: user._id
            });
            
            return {
                id: user._id.toString(),
                name: user.fullName || user.username || `User ${user._id.toString().slice(-4)}`,
                username: user.username || user.email?.split('@')[0] || 'user',
                email: user.email || 'user@space.com',
                avatar: user.avatar || `https://placehold.co/64x64/4F46E5/FFFFFF?text=${(user.fullName || user.username || 'U').charAt(0).toUpperCase()}`,
                bio: user.bio || 'Space explorer 🚀',
                location: user.location || 'Unknown Galaxy',
                isVerified: user.isVerified || false,
                joinedAt: user.createdAt
            };
        });

        console.log('✅ Sending response with', formattedUsers.length, 'users');

        res.json({
            success: true,
            users: formattedUsers,
            total: totalUsers,
            limit: limit,
            filter: filter
        });

    } catch (error) {
        console.error('❌ Users API error:', error);
        logger.error('Users API error', { error: error.message, stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to load users',
            error: error.message
        });
    }
});

// Posts API endpoint
app.get('/api/posts', async (req, res) => {
    console.log('📝 Posts API called with:', req.query);
    logger.info('Posts API accessed', { query: req.query, ip: req.ip });
    
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        console.log('📊 Pagination:', { page, limit, skip });

        // Get total count for pagination
        const totalPosts = await Post.countDocuments({ visibility: 'public' });
        console.log('📈 Total posts found:', totalPosts);

        // Fetch posts from database with author population
        const posts = await Post.find({ visibility: 'public' })
            .sort({ createdAt: -1 }) // Newest first
            .skip(skip)
            .limit(limit)
            .populate('author.id', 'fullName email avatar username')
            .populate('likes', 'fullName username')
            .lean(); // Convert to plain JS objects for better performance

        console.log('📋 Posts fetched:', posts.length);

        // Format posts for frontend
        const formattedPosts = posts.map(post => ({
            id: post._id.toString(),
            content: post.content,
            author: {
                id: post.author.id?._id?.toString() || post.author.id,
                name: post.author.fullName || post.author.username || 'Anonymous User',
                email: post.author.email || 'user@space.com',
                avatar: post.author.avatar || post.author.fullName?.charAt(0)?.toUpperCase() || 'U'
            },
            timestamp: post.createdAt,
            likes: post.likes?.length || 0,
            comments: post.comments?.length || 0,
            images: post.images || [],
            tags: post.tags || [],
            shares: post.shares || 0
        }));

        console.log('✅ Sending response with', formattedPosts.length, 'posts');

        res.json({
            success: true,
            posts: formattedPosts,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(totalPosts / limit),
                totalPosts: totalPosts,
                hasNextPage: skip + limit < totalPosts,
                hasPrevPage: page > 1,
                limit: limit
            }
        });

    } catch (error) {
        console.error('❌ Posts API error:', error);
        logger.error('Posts API error', { error: error.message, stack: error.stack });
        res.status(500).json({
            success: false,
            message: 'Failed to load posts',
            error: error.message
        });
    }
});

// === AUTHENTICATION MIDDLEWARE ===

// Authentication middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId).select('-password');
        
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid token'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        logger.error('Authentication error', { error: error.message });
        return res.status(403).json({
            success: false,
            message: 'Invalid or expired token'
        });
    }
};

// === USER PROFILE ENDPOINTS ===

// Get current user profile (for authentication check)
app.get('/api/profile/me', authenticateToken, async (req, res) => {
    try {
        console.log('👤 Getting profile for user:', req.user._id);
        
        const user = await User.findById(req.user._id).select('-password -salt');
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                username: user.username || user.email.split('@')[0], // Generate username from email if not set
                fullName: user.fullName,
                name: user.fullName, // Use fullName as name
                avatar: user.avatar || `https://placehold.co/150x150/4F46E5/FFFFFF?text=${(user.fullName || 'U').charAt(0).toUpperCase()}`,
                bio: user.bio,
                location: user.location,
                isVerified: user.isVerified,
                createdAt: user.createdAt
            }
        });
        
    } catch (error) {
        console.error('❌ Profile fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Update current user profile
app.put('/api/profile/me', authenticateToken, async (req, res) => {
    try {
        console.log('👤 Updating profile for user:', req.user._id);
        console.log('📝 Update data:', req.body);
        
        const { fullName, firstName, lastName, bio, location } = req.body;
        
        const updateData = {};
        if (fullName !== undefined) updateData.fullName = fullName.trim();
        if (firstName !== undefined) updateData.firstName = firstName.trim();
        if (lastName !== undefined) updateData.lastName = lastName.trim();
        if (bio !== undefined) updateData.bio = bio.trim();
        if (location !== undefined) updateData.location = location.trim();
        
        // Update name field to match fullName for consistency
        if (fullName !== undefined) updateData.name = fullName.trim();
        
        const user = await User.findByIdAndUpdate(
            req.user._id,
            updateData,
            { new: true, select: '-password -salt' }
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        console.log('✅ Profile updated successfully:', user.fullName);
        
        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: {
                id: user._id,
                email: user.email,
                username: user.username,
                fullName: user.fullName,
                firstName: user.firstName,
                lastName: user.lastName,
                name: user.name,
                avatar: user.avatar || `https://placehold.co/150x150/4F46E5/FFFFFF?text=${(user.fullName || user.name || 'U').charAt(0).toUpperCase()}`,
                bio: user.bio,
                location: user.location,
                isVerified: user.isVerified,
                createdAt: user.createdAt
            }
        });
        
    } catch (error) {
        console.error('❌ Profile update error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Get user profile (legacy endpoint)
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password -salt');
        res.json({
            success: true,
            user: user
        });
    } catch (error) {
        console.error('❌ Profile fetch error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Update user profile
app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { fullName, username, bio, location, avatar } = req.body;
        
        const updateData = {};
        if (fullName) updateData.fullName = fullName;
        if (username) updateData.username = username.toLowerCase();
        if (bio !== undefined) updateData.bio = bio;
        if (location !== undefined) updateData.location = location;
        if (avatar) updateData.avatar = avatar;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password -salt');

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: user
        });
        
    } catch (error) {
        console.error('❌ Profile update error:', error);
        
        if (error.code === 11000) {
            return res.status(400).json({
                success: false,
                message: 'Username already exists'
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// === FRIEND REQUESTS ENDPOINTS ===

// Get friend requests for current user
app.get('/api/friend-requests', authenticateToken, async (req, res) => {
    try {
        console.log('📨 Getting friend requests for user:', req.user.id);
        
        // Since we don't have FriendRequest model implemented yet, 
        // let's return empty list to prevent 404 error
        const friendRequests = [];
        
        console.log('✅ Friend requests found:', friendRequests.length);
        
        res.json({
            success: true,
            friendRequests: friendRequests,
            count: friendRequests.length
        });
        
    } catch (error) {
        console.error('❌ Error getting friend requests:', error);
        res.status(500).json({
            success: false,
            message: 'Error loading friend requests',
            error: error.message
        });
    }
});

// Handle friend request (accept/reject)
app.put('/api/friend-requests/:requestId', authenticateToken, async (req, res) => {
    try {
        const { requestId } = req.params;
        const { action } = req.body; // 'accept' or 'reject'
        
        console.log('🔄 Handling friend request:', { requestId, action, userId: req.user.id });
        
        if (!['accept', 'reject'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid action. Must be "accept" or "reject"'
            });
        }
        
        // For now, just return success (implement later when needed)
        res.json({
            success: true,
            message: `Friend request ${action}ed successfully`,
            action: action
        });
        
    } catch (error) {
        console.error('❌ Error handling friend request:', error);
        res.status(500).json({
            success: false,
            message: 'Error handling friend request',
            error: error.message
        });
    }
});

// Send friend request
app.post('/api/friend-requests', authenticateToken, async (req, res) => {
    try {
        const { receiverId, message } = req.body;
        const senderId = req.user.id;
        
        console.log('📤 Sending friend request:', { senderId, receiverId, message });
        
        if (!receiverId) {
            return res.status(400).json({
                success: false,
                message: 'Receiver ID is required'
            });
        }
        
        if (senderId === receiverId) {
            return res.status(400).json({
                success: false,
                message: 'Cannot send friend request to yourself'
            });
        }
        
        // For now, just return success (implement later when needed)
        res.json({
            success: true,
            message: 'Friend request sent successfully'
        });
        
    } catch (error) {
        console.error('❌ Error sending friend request:', error);
        res.status(500).json({
            success: false,
            message: 'Error sending friend request',
            error: error.message
        });
    }
});

// === ADMIN ENDPOINTS (Temporary for name updates) ===
app.post('/api/admin/update-user', async (req, res) => {
    try {
        const { userId, fullName, name, firstName, lastName } = req.body;
        
        console.log('🔧 Admin updating user:', userId, 'to name:', fullName);
        
        if (!userId || !fullName) {
            return res.status(400).json({
                success: false,
                message: 'userId and fullName are required'
            });
        }
        
        const updateData = {
            fullName: fullName.trim(),
            name: fullName.trim(), // Keep name in sync with fullName
        };
        
        if (firstName) updateData.firstName = firstName.trim();
        if (lastName) updateData.lastName = lastName.trim();
        
        const user = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true, select: '-password -salt' }
        );
        
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }
        
        console.log('✅ Admin updated user successfully:', user.fullName);
        
        res.json({
            success: true,
            message: 'User updated successfully',
            user: {
                id: user._id,
                fullName: user.fullName,
                name: user.name,
                firstName: user.firstName,
                lastName: user.lastName
            }
        });
        
    } catch (error) {
        console.error('❌ Admin update error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// === MESSAGING ROUTES ===
app.get('/api/conversations', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;
        
        const conversations = await Message.aggregate([
            {
                $match: {
                    $or: [
                        { senderId: new ObjectId(userId) },
                        { receiverId: new ObjectId(userId) }
                    ],
                    deletedAt: { $exists: false }
                }
            },
            {
                $addFields: {
                    partnerId: {
                        $cond: {
                            if: { $eq: ['$senderId', new ObjectId(userId)] },
                            then: '$receiverId',
                            else: '$senderId'
                        }
                    }
                }
            },
            {
                $sort: { createdAt: -1 }
            },
            {
                $group: {
                    _id: '$partnerId',
                    lastMessage: { $first: '$$ROOT' },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                {
                                    $and: [
                                        { $eq: ['$receiverId', new ObjectId(userId)] },
                                        { $eq: ['$readAt', null] }
                                    ]
                                },
                                1,
                                0
                            ]
                        }
                    }
                }
            },
            {
                $lookup: {
                    from: 'users',
                    localField: '_id',
                    foreignField: '_id',
                    as: 'otherUser'
                }
            },
            {
                $unwind: '$otherUser'
            },
            {
                $project: {
                    id: '$_id', // Add id field for frontend
                    partnerId: '$_id',
                    otherUser: {
                        id: '$otherUser._id',
                        name: '$otherUser.fullName',
                        username: '$otherUser.username',
                        avatar: '$otherUser.avatar'
                    },
                    lastMessage: {
                        id: '$lastMessage._id',
                        content: '$lastMessage.content',
                        timestamp: '$lastMessage.createdAt',
                        senderId: '$lastMessage.senderId'
                    },
                    unreadCount: 1
                }
            },
            {
                $sort: { 'lastMessage.timestamp': -1 }
            }
        ]);

        res.json({
            success: true,
            conversations: conversations
        });

    } catch (error) {
        logger.error('Conversations fetch error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Create test conversation endpoint
app.post('/api/conversations/test', authenticateToken, async (req, res) => {
    try {
        const userId = req.user._id;
        
        // Find another user to create conversation with
        const otherUser = await User.findOne({ 
            _id: { $ne: userId },
            fullName: { $exists: true }
        });
        
        if (!otherUser) {
            return res.status(404).json({
                success: false,
                message: 'No other users found to create test conversation'
            });
        }
        
        // Create a test message
        const testMessage = new Message({
            senderId: otherUser._id,
            receiverId: userId,
            content: 'Hello! This is a test message.',
            messageType: 'text',
            createdAt: new Date()
        });
        
        await testMessage.save();
        
        res.json({
            success: true,
            message: 'Test conversation created',
            conversation: {
                id: otherUser._id,
                name: otherUser.fullName,
                lastMessage: {
                    content: testMessage.content,
                    timestamp: testMessage.createdAt
                }
            }
        });
        
    } catch (error) {
        logger.error('Test conversation creation error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

app.get('/api/conversations/:partnerId/messages', authenticateToken, async (req, res) => {
    try {
        const { partnerId } = req.params;
        const userId = req.user._id;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;

        const messages = await Message.find({
            $or: [
                { senderId: userId, receiverId: partnerId },
                { senderId: partnerId, receiverId: userId }
            ],
            deletedAt: { $exists: false }
        })
        .populate('senderId', 'fullName username avatar')
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip(skip);

        // Mark messages as read
        await Message.updateMany(
            {
                senderId: partnerId,
                receiverId: userId,
                readAt: { $exists: false }
            },
            { readAt: new Date() }
        );

        const formattedMessages = messages.reverse().map(msg => ({
            id: msg._id,
            text: msg.content,
            senderId: msg.senderId._id,
            senderName: msg.senderId.fullName,
            timestamp: msg.createdAt,
            readAt: msg.readAt,
            messageType: msg.messageType,
            attachments: msg.attachments
        }));

        res.json({
            success: true,
            messages: formattedMessages,
            pagination: {
                page,
                limit,
                hasMore: messages.length === limit
            }
        });

    } catch (error) {
        logger.error('Messages fetch error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Send message endpoint
app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        console.log('📤 Sending message from user:', req.user._id);
        console.log('📝 Message data:', req.body);
        
        const { receiverId, content, messageType = 'text' } = req.body;
        const senderId = req.user._id;
        
        if (!receiverId || !content) {
            return res.status(400).json({
                success: false,
                message: 'receiverId and content are required'
            });
        }
        
        // Create new message
        const newMessage = new Message({
            senderId: senderId,
            receiverId: receiverId,
            content: content.trim(),
            messageType: messageType,
            createdAt: new Date()
        });
        
        // Save message
        const savedMessage = await newMessage.save();
        
        // Populate sender info for response
        await savedMessage.populate('senderId', 'fullName username avatar');
        
        console.log('✅ Message saved successfully:', savedMessage._id);
        
        // Format response
        const formattedMessage = {
            id: savedMessage._id,
            text: savedMessage.content,
            content: savedMessage.content,
            senderId: savedMessage.senderId._id,
            senderName: savedMessage.senderId.fullName,
            receiverId: savedMessage.receiverId,
            timestamp: savedMessage.createdAt,
            messageType: savedMessage.messageType,
            status: 'sent'
        };
        
        res.json({
            success: true,
            message: formattedMessage
        });

    } catch (error) {
        console.error('❌ Send message error:', error);
        logger.error('Send message error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Health check endpoint for Render
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.nodeEnv,
        version: require('./package.json').version || '1.0.0'
    });
});

// Static files
app.use(express.static(path.join(__dirname)));

// Import and use existing routes and Socket.IO handlers
// (You would import your existing route handlers here)

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
        ip: req.ip
    });

    res.status(500).json({
        success: false,
        message: config.nodeEnv === 'production' 
            ? 'Internal server error' 
            : error.message
    });
});

// 404 handler
app.use('*', (req, res) => {
    logger.warn('404 - Route not found', {
        path: req.originalUrl,
        method: req.method,
        ip: req.ip
    });

    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

        console.log('All setup completed, starting server...');
        // Start server
        const PORT = config.port;
        console.log(`🔍 Environment Debug:`);
        console.log(`- NODE_ENV: ${process.env.NODE_ENV}`);
        console.log(`- PORT env: ${process.env.PORT}`);
        console.log(`- Computed PORT: ${PORT}`);
        console.log(`- Config port: ${config.port}`);

        console.log(`Attempting to listen on port ${PORT}...`);
        server.listen(PORT, '0.0.0.0', (error) => {
            if (error) {
                console.error('❌ Server failed to start:', error);
                logger.error('Server startup failed', { error: error.message });
                process.exit(1);
            }
            
            console.log(`✅ Server listening on port ${PORT}!`);
            console.log(`🔗 Health check: http://localhost:${PORT}/health`);
            console.log(`🔗 API debug: http://localhost:${PORT}/api/debug`);
            console.log(`🔗 Posts API: http://localhost:${PORT}/api/posts`);
            
            logger.info('Server started successfully', {
                port: PORT,
                environment: config.nodeEnv,
                features: config.features,
                pid: process.pid
            });
        });

    } catch (error) {
        console.error('❌ Failed to start server:', error);
        logger.error('Server startup error', { error: error.message });
        process.exit(1);
    }
}

// Start the application
startServer();

module.exports = { app, server, io, mongoose, logger, config };
