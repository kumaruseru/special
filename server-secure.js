// Production Server with Security and Performance Optimizations
require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
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
        const hashedPassword = await bcrypt.hash(password, 12);
        const verificationToken = crypto.randomBytes(32).toString('hex');

        console.log('Creating user object...');
        const user = new User({
            email: email.toLowerCase(),
            password: hashedPassword,
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
        endpoints: [
            'GET /api/debug',
            'GET /api/debug-users',
            'GET /api/debug-production',
            'GET /api/debug-raw',
            'GET /api/users',
            'POST /api/fix-users',
            'GET /api/posts',
            'POST /api/register',
            'GET /health'
        ]
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
