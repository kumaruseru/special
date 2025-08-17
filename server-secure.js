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

// Start database connection
console.log('Calling connectDatabase()...');
connectDatabase();

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

// Posts API endpoint
app.get('/api/posts', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;

        // For now, return mock data - you can replace this with actual database queries
        const mockPosts = [
            {
                id: '1',
                content: 'Welcome to the Cosmic Social Network! 🌟',
                author: {
                    name: 'Space Explorer',
                    email: 'explorer@cosmos.space',
                    avatar: 'S'
                },
                timestamp: new Date().toISOString(),
                likes: 42,
                comments: 7
            },
            {
                id: '2',
                content: 'Just discovered a new galaxy! The universe is truly amazing. ✨🌌',
                author: {
                    name: 'Cosmic Researcher',
                    email: 'researcher@cosmos.space',
                    avatar: 'C'
                },
                timestamp: new Date(Date.now() - 3600000).toISOString(),
                likes: 128,
                comments: 23
            },
            {
                id: '3',
                content: 'Who else loves stargazing? Tonight the constellation is perfect! 🌟🔭',
                author: {
                    name: 'Star Watcher',
                    email: 'watcher@cosmos.space',
                    avatar: 'S'
                },
                timestamp: new Date(Date.now() - 7200000).toISOString(),
                likes: 89,
                comments: 15
            }
        ];

        // Simulate pagination
        const startIndex = skip;
        const endIndex = skip + limit;
        const paginatedPosts = mockPosts.slice(startIndex, endIndex);

        res.json({
            success: true,
            posts: paginatedPosts,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(mockPosts.length / limit),
                totalPosts: mockPosts.length,
                hasNextPage: endIndex < mockPosts.length,
                hasPrevPage: page > 1
            }
        });

    } catch (error) {
        logger.error('Posts API error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Failed to load posts'
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
console.log(`Attempting to listen on port ${PORT}...`);
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}!`);
    logger.info('Server started successfully', {
        port: PORT,
        environment: config.nodeEnv,
        features: config.features,
        pid: process.pid
    });
});

module.exports = { app, server, io, mongoose, logger, config };
