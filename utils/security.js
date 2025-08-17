// Security Middleware
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const logger = require('./logger');

// Rate limiting configuration
const createRateLimiter = (windowMs = 15 * 60 * 1000, max = 100) => {
    return rateLimit({
        windowMs, // 15 minutes default
        max, // limit each IP to max requests per windowMs
        message: {
            error: 'Too many requests from this IP, please try again later.',
            retryAfter: Math.ceil(windowMs / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            logger.warn('Rate limit exceeded', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                path: req.path
            });
            res.status(429).json({
                success: false,
                message: 'Too many requests from this IP, please try again later.'
            });
        }
    });
};

// Security headers
const securityHeaders = () => {
    return helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.tailwindcss.com", "https://cdnjs.cloudflare.com"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com", "https://cdnjs.cloudflare.com", "https://cdn.tailwindcss.com", "https://cdn.socket.io"],
                scriptSrcAttr: ["'unsafe-inline'", "'unsafe-hashes'"], // Allow inline event handlers with hashes
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                imgSrc: ["'self'", "data:", "https:"],
                connectSrc: ["'self'", "ws:", "wss:", "https://cdn.socket.io"],
                mediaSrc: ["'self'", "data:", "blob:"],
                objectSrc: ["'none'"],
                baseUri: ["'self'"],
                formAction: ["'self'"],
                frameAncestors: ["'none'"]
            }
        },
        crossOriginEmbedderPolicy: false, // Disable for compatibility
        hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true
        }
    });
};

// Input validation
const validateInput = (schema) => {
    return (req, res, next) => {
        const { error } = schema.validate(req.body);
        if (error) {
            logger.warn('Input validation failed', {
                path: req.path,
                errors: error.details.map(d => d.message),
                ip: req.ip
            });
            return res.status(400).json({
                success: false,
                message: 'Invalid input data',
                errors: error.details.map(d => d.message)
            });
        }
        next();
    };
};

// Authentication rate limiting (stricter for auth endpoints)
const authRateLimit = createRateLimiter(15 * 60 * 1000, 5); // 5 attempts per 15 minutes

// General API rate limiting
const apiRateLimit = createRateLimiter(15 * 60 * 1000, 100); // 100 requests per 15 minutes

// Real-time messaging rate limiting
const messageRateLimit = createRateLimiter(60 * 1000, 30); // 30 messages per minute

module.exports = {
    securityHeaders,
    authRateLimit,
    apiRateLimit,
    messageRateLimit,
    validateInput,
    createRateLimiter
};
