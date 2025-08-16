// Environment Validation
const logger = require('./logger');

const requiredEnvVars = [
    'NODE_ENV',
    'JWT_SECRET',
    'MONGODB_URI'
];

const optionalEnvVars = [
    'PORT',
    'CORS_ORIGIN',
    'EMAIL_USER',
    'EMAIL_PASSWORD',
    'ENCRYPTION_KEY'
];

function validateEnvironment() {
    const missing = [];
    const warnings = [];

    // Check required variables
    requiredEnvVars.forEach(varName => {
        if (!process.env[varName]) {
            missing.push(varName);
        }
    });

    // Check optional but recommended variables
    optionalEnvVars.forEach(varName => {
        if (!process.env[varName]) {
            warnings.push(varName);
        }
    });

    // Validate JWT secret strength
    if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
        warnings.push('JWT_SECRET should be at least 32 characters long');
    }

    // Validate production settings
    if (process.env.NODE_ENV === 'production') {
        if (process.env.JWT_SECRET === 'default-secret-key') {
            missing.push('JWT_SECRET cannot use default value in production');
        }
        
        if (!process.env.ENCRYPTION_KEY) {
            missing.push('ENCRYPTION_KEY is required in production');
        }
    }

    // Log results
    if (missing.length > 0) {
        logger.error('Missing required environment variables', { missing });
        throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    if (warnings.length > 0) {
        logger.warn('Missing optional environment variables', { warnings });
    }

    logger.info('Environment validation completed', {
        nodeEnv: process.env.NODE_ENV,
        hasJwtSecret: !!process.env.JWT_SECRET,
        hasEncryptionKey: !!process.env.ENCRYPTION_KEY,
        hasDatabaseUri: !!process.env.MONGODB_URI
    });

    return true;
}

function getConfig() {
    return {
        // Server
        port: parseInt(process.env.PORT) || 3000,
        nodeEnv: process.env.NODE_ENV || 'development',
        
        // Database
        mongoUri: process.env.MONGODB_URI,
        
        // Security
        jwtSecret: process.env.JWT_SECRET,
        encryptionKey: process.env.ENCRYPTION_KEY || 'default-key-change-in-production',
        
        // CORS
        corsOrigin: process.env.CORS_ORIGIN || '*',
        
        // Email
        email: {
            user: process.env.EMAIL_USER,
            password: process.env.EMAIL_PASSWORD,
            service: process.env.EMAIL_SERVICE || 'gmail'
        },
        
        // Features
        features: {
            realTime: process.env.REAL_TIME_ENABLED !== 'false',
            videoCalls: process.env.VIDEO_CALL_ENABLED !== 'false',
            emailVerification: process.env.EMAIL_VERIFICATION_ENABLED !== 'false'
        },
        
        // Rate limiting
        rateLimiting: {
            enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
            max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
            windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15
        },
        
        // Logging
        logging: {
            level: process.env.LOG_LEVEL || 'info',
            fileEnabled: process.env.LOG_FILE_ENABLED === 'true',
            filePath: process.env.LOG_FILE_PATH || './logs/app.log'
        }
    };
}

module.exports = {
    validateEnvironment,
    getConfig
};
