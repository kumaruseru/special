// Debug environment before loading dotenv
console.log('🔍 NODE_ENV before dotenv:', process.env.NODE_ENV);

// Load environment variables only in development
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
    console.log('🔧 Loaded .env file for development');
} else {
    console.log('🚀 Production mode - using environment variables from deployment platform');
}

console.log('🔍 NODE_ENV after dotenv:', process.env.NODE_ENV);
const express = require('express');
const mongoose = require('mongoose');
const { ObjectId } = require('mongodb');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');

// Production logging
const logger = require('./utils/logger');

// Email functionality
const { 
    sendWelcomeEmail, 
    sendPasswordResetEmail, 
    sendVerificationEmail, 
    sendNotificationEmail,
    testEmailConnection 
} = require('./config/email');

// Multi-database clients
const Redis = require('redis');
const { Pool } = require('pg');
const neo4j = require('neo4j-driver');
const { MongoClient } = require('mongodb');

// Global database connections
let mongoConnection = null;

// Critical security validation
if (!process.env.JWT_SECRET || process.env.JWT_SECRET === 'default_secret') {
    console.error('❌ CRITICAL SECURITY ERROR: JWT_SECRET must be set in environment variables');
    console.error('This is a CRITICAL security vulnerability!');
    console.error('Add a strong JWT_SECRET to your .env file:');
    console.error('JWT_SECRET=your-super-secret-jwt-key-minimum-32-characters-long');
    process.exit(1);
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
    console.error('❌ SECURITY WARNING: JWT_SECRET should be at least 32 characters long');
    console.error('Current length:', process.env.JWT_SECRET.length);
    process.exit(1);
}

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "*",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    allowEIO3: true,
    pingTimeout: 120000,
    pingInterval: 30000,
    connectTimeout: 45000,
    upgradeTimeout: 30000,
    maxHttpBufferSize: 1e6,
    compression: true,
    perMessageDeflate: false
});

// Security and performance middleware
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const morgan = require('morgan');

// Security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 
                       "cdnjs.cloudflare.com", "cdn.tailwindcss.com", 
                       "cdn.socket.io", "unpkg.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", 
                      "cdnjs.cloudflare.com", "cdn.tailwindcss.com"],
            fontSrc: ["'self'", "fonts.gstatic.com", "cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "placehold.co"],
            connectSrc: ["'self'", "ws:", "wss:"],
            mediaSrc: ["'self'"],
            objectSrc: ["'none'"],
            frameSrc: ["'none'"]
        },
    },
    crossOriginEmbedderPolicy: false
}));

// Compression
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // limit each IP
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later'
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/api/status';
    }
});

app.use('/api/', limiter);

// Request logging
if (process.env.NODE_ENV === 'production') {
    app.use(morgan('combined', {
        stream: { 
            write: (message) => logger.info(message.trim(), { type: 'http-request' })
        },
        skip: (req) => {
            // Skip logging for health checks to reduce noise
            return req.path === '/health' || req.path === '/api/status';
        }
    }));
} else {
    app.use(morgan('dev'));
}

// Enhanced CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = process.env.NODE_ENV === 'production' 
            ? (process.env.CORS_ORIGIN || '').split(',').map(o => o.trim()).filter(Boolean)
            : ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://localhost:8080'];
        
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin) return callback(null, true);
        
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            logger.warn('CORS blocked request', { origin, allowedOrigins });
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    exposedHeaders: ['X-Total-Count', 'X-Rate-Limit-Remaining']
};

app.use(cors(corsOptions));

// Middleware
app.use(express.json({ 
    limit: process.env.MAX_FILE_SIZE || '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

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

const MessageSchema = new mongoose.Schema({
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    isEncrypted: { type: Boolean, default: false },
    messageType: { type: String, enum: ['text', 'image', 'file', 'voice'], default: 'text' },
    attachments: [{
        type: { type: String },
        url: { type: String },
        name: { type: String },
        size: { type: Number }
    }],
    readAt: { type: Date },
    editedAt: { type: Date },
    deletedAt: { type: Date },
    replyTo: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
    reactions: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        emoji: { type: String },
        timestamp: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

const PostSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, required: true },
    images: [{ type: String }],
    videos: [{ type: String }],
    location: {
        type: { type: String, default: 'Point' },
        coordinates: [Number],
        address: String
    },
    taggedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    comments: [{
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        content: { type: String },
        timestamp: { type: Date, default: Date.now },
        likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
    }],
    shares: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    visibility: { type: String, enum: ['public', 'friends', 'private'], default: 'public' },
    isEdited: { type: Boolean, default: false },
    editHistory: [{
        content: String,
        timestamp: { type: Date, default: Date.now }
    }]
}, {
    timestamps: true
});

const FriendRequestSchema = new mongoose.Schema({
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    message: { type: String },
    responseMessage: { type: String }
}, {
    timestamps: true
});

// Models
const User = mongoose.model('User', UserSchema);
const Message = mongoose.model('Message', MessageSchema);
const Post = mongoose.model('Post', PostSchema);
const FriendRequest = mongoose.model('FriendRequest', FriendRequestSchema);

// Multi-database connection manager
class DatabaseManager {
    constructor() {
        this.mongoClient = null;
        this.redisClient = null;
        this.pgPool = null;
        this.neo4jDriver = null;
        this.isConnected = false;
    }

    async initialize() {
        try {
            await this.connectMongoDB();
            await this.connectRedis();
            await this.connectPostgreSQL();
            await this.connectNeo4j();
            this.isConnected = true;
            logger.info('All databases connected successfully');
        } catch (error) {
            logger.error('Database initialization failed', { error: error.message });
            throw error;
        }
    }

    async connectMongoDB() {
        try {
            const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/socialnetwork';
            await mongoose.connect(mongoUri);
            
            this.mongoClient = new MongoClient(mongoUri);
            await this.mongoClient.connect();
            mongoConnection = this.mongoClient.db();
            
            logger.info('MongoDB connected successfully');
        } catch (error) {
            logger.error('MongoDB connection failed', { error: error.message });
            throw error;
        }
    }

    async connectRedis() {
        try {
            this.redisClient = Redis.createClient({
                url: process.env.REDIS_URL || 'redis://localhost:6379'
            });
            
            this.redisClient.on('error', (err) => {
                logger.error('Redis error', { error: err.message });
            });
            
            await this.redisClient.connect();
            logger.info('Redis connected successfully');
        } catch (error) {
            logger.warn('Redis connection failed, continuing without cache', { error: error.message });
        }
    }

    async connectPostgreSQL() {
        try {
            this.pgPool = new Pool({
                connectionString: process.env.POSTGRES_URL || 'postgresql://localhost:5432/socialnetwork',
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });
            
            await this.pgPool.query('SELECT NOW()');
            logger.info('PostgreSQL connected successfully');
        } catch (error) {
            logger.warn('PostgreSQL connection failed, continuing without relational data', { error: error.message });
        }
    }

    async connectNeo4j() {
        try {
            this.neo4jDriver = neo4j.driver(
                process.env.NEO4J_URI || 'bolt://localhost:7687',
                neo4j.auth.basic(
                    process.env.NEO4J_USERNAME || 'neo4j',
                    process.env.NEO4J_PASSWORD || 'password'
                )
            );
            
            const session = this.neo4jDriver.session();
            await session.run('RETURN 1');
            await session.close();
            
            logger.info('Neo4j connected successfully');
        } catch (error) {
            logger.warn('Neo4j connection failed, continuing without graph data', { error: error.message });
        }
    }

    async cleanup() {
        try {
            if (this.mongoClient) await this.mongoClient.close();
            if (this.redisClient) await this.redisClient.quit();
            if (this.pgPool) await this.pgPool.end();
            if (this.neo4jDriver) await this.neo4jDriver.close();
            logger.info('All database connections closed');
        } catch (error) {
            logger.error('Error during database cleanup', { error: error.message });
        }
    }
}

// Initialize database manager
const dbManager = new DatabaseManager();

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

        try {
            if (process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
                await sendWelcomeEmail(email, fullName, verificationToken);
                console.log('Welcome email sent');
            } else {
                console.log('Email not configured, skipping welcome email');
            }
        } catch (emailError) {
            console.error('Welcome email failed:', emailError.message);
        }

        console.log('Generating JWT token...');
        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'default_secret',
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

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Invalid credentials'
            });
        }

        user.lastActive = new Date();
        await user.save();

        const token = jwt.sign(
            { userId: user._id, email: user.email },
            process.env.JWT_SECRET || 'default_secret',
            { expiresIn: '7d' }
        );

        res.json({
            success: true,
            message: 'Login successful',
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
        logger.error('Login error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// === USER ROUTES ===
app.get('/api/profile', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        res.json({
            success: true,
            user: user
        });
    } catch (error) {
        logger.error('Profile fetch error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { fullName, username, bio, location, avatar } = req.body;
        
        const updateData = {};
        if (fullName) updateData.fullName = fullName;
        if (username) updateData.username = username.toLowerCase();
        if (bio !== undefined) updateData.bio = bio;
        if (location !== undefined) updateData.location = location;
        if (avatar) updateData.avatar = avatar;

        if (username) {
            const existingUser = await User.findOne({ 
                username: username.toLowerCase(),
                _id: { $ne: req.user._id }
            });
            
            if (existingUser) {
                return res.status(400).json({
                    success: false,
                    message: 'Username already exists'
                });
            }
        }

        const user = await User.findByIdAndUpdate(
            req.user._id,
            updateData,
            { new: true }
        ).select('-password');

        res.json({
            success: true,
            message: 'Profile updated successfully',
            user: user
        });

    } catch (error) {
        logger.error('Profile update error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
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

app.post('/api/messages', authenticateToken, async (req, res) => {
    try {
        const { receiverId, content, messageType = 'text', isEncrypted = false } = req.body;

        if (!receiverId || !content) {
            return res.status(400).json({
                success: false,
                message: 'Receiver ID and content are required'
            });
        }

        const receiver = await User.findById(receiverId);
        if (!receiver) {
            return res.status(404).json({
                success: false,
                message: 'Receiver not found'
            });
        }

        const message = new Message({
            senderId: req.user._id,
            receiverId,
            content,
            messageType,
            isEncrypted
        });

        await message.save();

        const populatedMessage = await Message.findById(message._id)
            .populate('senderId', 'fullName username avatar')
            .populate('receiverId', 'fullName username avatar');

        const messageData = {
            id: populatedMessage._id,
            senderId: populatedMessage.senderId._id,
            senderName: populatedMessage.senderId.fullName,
            receiverId: populatedMessage.receiverId._id,
            content: populatedMessage.content,
            timestamp: populatedMessage.createdAt,
            messageType: populatedMessage.messageType
        };

        // Emit to receiver via Socket.IO
        const receiverSocketId = connectedUsers.get(receiverId);
        if (receiverSocketId) {
            io.to(receiverSocketId).emit('new_message', messageData);
        }

        res.status(201).json({
            success: true,
            message: 'Message sent successfully',
            data: messageData
        });

    } catch (error) {
        logger.error('Message send error', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// === SOCKET.IO IMPLEMENTATION ===
const connectedUsers = new Map();
const activeRooms = new Map();
const activeCalls = new Map();

io.on('connection', (socket) => {
    socket.on('authenticate', async (data) => {
        try {
            const { token } = data;
            const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
            const user = await User.findById(decoded.userId).select('-password');
            
            if (user) {
                socket.userId = user._id.toString();
                socket.userInfo = user;
                connectedUsers.set(user._id.toString(), socket.id);
                
                socket.emit('authenticated', {
                    success: true,
                    user: user
                });
                
                socket.broadcast.emit('user_online', {
                    userId: user._id,
                    username: user.fullName
                });
            } else {
                socket.emit('authentication_failed', {
                    success: false,
                    message: 'Invalid token'
                });
            }
        } catch (error) {
            socket.emit('authentication_failed', {
                success: false,
                message: 'Authentication failed'
            });
        }
    });

    socket.on('join_room', (data) => {
        const { roomId } = data;
        socket.join(roomId);
        
        if (!activeRooms.has(roomId)) {
            activeRooms.set(roomId, new Set());
        }
        activeRooms.get(roomId).add(socket.id);
        
        socket.emit('room_joined', {
            success: true,
            roomId: roomId,
            users: Array.from(activeRooms.get(roomId))
        });
    });

    socket.on('send_message', async (messageData) => {
        try {
            if (!socket.userId) {
                socket.emit('message_error', { message: 'Not authenticated' });
                return;
            }

            const { text, chatId, messageId, timestamp } = messageData;
            
            const message = new Message({
                senderId: socket.userId,
                receiverId: chatId,
                content: text
            });

            await message.save();

            const populatedMessage = await Message.findById(message._id)
                .populate('senderId', 'fullName username avatar');

            const broadcastData = {
                id: populatedMessage._id,
                text: populatedMessage.content,
                senderId: populatedMessage.senderId._id,
                senderName: populatedMessage.senderId.fullName,
                chatId: chatId,
                timestamp: populatedMessage.createdAt
            };

            socket.to(chatId).emit('new_message', broadcastData);
            socket.emit('message_sent', { messageId: messageId, serverMessageId: message._id });

            const receiverSocketId = connectedUsers.get(chatId);
            if (receiverSocketId) {
                io.to(receiverSocketId).emit('new_message', broadcastData);
            }

        } catch (error) {
            socket.emit('message_error', { message: 'Failed to send message' });
        }
    });

    // Calling system
    socket.on('initiate_call', (callData) => {
        const { callId, targetUserId, callType, callerData } = callData;
        
        activeCalls.set(callId, {
            callId,
            callerId: socket.userId,
            targetUserId,
            callType,
            status: 'ringing',
            timestamp: Date.now()
        });

        const targetSocketId = connectedUsers.get(targetUserId);
        if (targetSocketId) {
            io.to(targetSocketId).emit('incoming_call', {
                callId,
                callerId: socket.userId,
                callerUsername: callerData.name,
                callType
            });
        }

        socket.emit('call_initiated', { callId, status: 'ringing' });
    });

    socket.on('answer_call', (data) => {
        const { callId, answer } = data;
        const call = activeCalls.get(callId);
        
        if (call) {
            const callerSocketId = connectedUsers.get(call.callerId);
            
            if (answer === 'accept') {
                call.status = 'active';
                activeCalls.set(callId, call);
                
                if (callerSocketId) {
                    io.to(callerSocketId).emit('call_accepted', { callId });
                }
                socket.emit('call_accepted', { callId });
            } else {
                activeCalls.delete(callId);
                
                if (callerSocketId) {
                    io.to(callerSocketId).emit('call_rejected', { callId });
                }
            }
        }
    });

    socket.on('end_call', (data) => {
        const { callId } = data;
        const call = activeCalls.get(callId);
        
        if (call) {
            const otherUserId = call.callerId === socket.userId ? call.targetUserId : call.callerId;
            const otherSocketId = connectedUsers.get(otherUserId);
            
            if (otherSocketId) {
                io.to(otherSocketId).emit('call_ended', { callId });
            }
            
            activeCalls.delete(callId);
        }
    });

    socket.on('typing_start', (data) => {
        socket.to(data.chatId).emit('typing_start', {
            userId: socket.userId,
            username: data.username
        });
    });

    socket.on('typing_stop', (data) => {
        socket.to(data.chatId).emit('typing_stop', {
            userId: socket.userId,
            username: data.username
        });
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            connectedUsers.delete(socket.userId);
            socket.broadcast.emit('user_offline', {
                userId: socket.userId
            });
        }

        activeRooms.forEach((users, roomId) => {
            if (users.has(socket.id)) {
                users.delete(socket.id);
                if (users.size === 0) {
                    activeRooms.delete(roomId);
                }
            }
        });
    });
});

// Health check endpoints
app.get('/health', async (req, res) => {
    const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        version: '2.0.0',
        environment: process.env.NODE_ENV || 'development',
        memory: {
            used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
            total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            external: Math.round(process.memoryUsage().external / 1024 / 1024)
        },
        databases: {
            mongodb: mongoConnection ? 'connected' : 'disconnected',
            redis: dbManager.redisClient?.isReady ? 'connected' : 'disconnected'
        }
    };

    res.json(healthStatus);
});

// Simple ping endpoint for Render port detection
app.get('/ping', (req, res) => {
    res.json({ status: 'ok', message: 'Server is running' });
});

app.get('/api/status', async (req, res) => {
    try {
        const status = {
            server: 'online',
            timestamp: new Date().toISOString(),
            databases: {
                mongodb: mongoConnection ? 'connected' : 'disconnected',
                redis: dbManager.redisClient?.isReady ? 'connected' : 'disconnected',
                postgresql: dbManager.pgPool ? 'connected' : 'not configured',
                neo4j: dbManager.neo4jDriver ? 'connected' : 'not configured'
            },
            features: {
                auth: 'enabled',
                messaging: 'enabled',
                calling: 'enabled',
                email: process.env.EMAIL_USER ? 'enabled' : 'disabled'
            }
        };

        res.json({
            success: true,
            status: status
        });
    } catch (error) {
        logger.error('Status check failed', { error: error.message });
        res.status(500).json({
            success: false,
            message: 'Status check failed'
        });
    }
});

// Error handling
app.use((err, req, res, next) => {
    logger.error('Unhandled error', { 
        error: err.message, 
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// 404 handler - must be after all routes
app.use('*', (req, res) => {
    logger.warn('Route not found', { 
        url: req.originalUrl, 
        method: req.method,
        ip: req.ip 
    });
    
    res.status(404).json({
        success: false,
        message: 'Route not found',
        path: req.originalUrl
    });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully');
    await dbManager.cleanup();
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully');
    await dbManager.cleanup();
    process.exit(0);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { reason, promise });
    process.exit(1);
});

// Start server
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function startServer() {
    try {
        console.log('🚀 Starting server initialization...');
        console.log('📍 Environment:', process.env.NODE_ENV || 'development');
        console.log('📍 PORT env var:', process.env.PORT);
        console.log('📍 Computed Port:', PORT);
        console.log('📍 HOST env var:', process.env.HOST);
        console.log('📍 Computed Host:', HOST);
        
        // Start server first, then initialize databases
        server.listen(PORT, HOST, () => {
            logger.info(`Production server running on ${HOST}:${PORT}`);
            console.log(`🚀 Server listening on ${HOST}:${PORT}`);
            console.log(`🔗 Health Check: http://${HOST}:${PORT}/health`);
            console.log('✅ Server started successfully!');
        });
        
        // Add error handling for server startup
        server.on('error', (error) => {
            console.error('❌ Server error:', error);
            logger.error('Server error', { error: error.message });
        });
        
        // Initialize databases after server is listening
        console.log('🔄 Initializing databases...');
        await dbManager.initialize();
        console.log('✅ Database initialization completed');
        
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        logger.error('Failed to start server', { error: error.message });
        // Don't exit in production, let the server run without databases if needed
        if (process.env.NODE_ENV !== 'production') {
            process.exit(1);
        }
    }
}

startServer();
