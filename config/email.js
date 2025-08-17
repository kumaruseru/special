// Email configuration for Cosmic Social Network
// SMTP settings for noreply@cown.name.vn

const nodemailer = require('nodemailer');
require('dotenv').config();

const emailConfig = {
    service: 'gmail', // or your hosting provider's SMTP
    host: process.env.SMTP_HOST || 'smtp.cown.name.vn',
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true' || false,
    auth: {
        user: process.env.EMAIL_USER || process.env.SMTP_USER,
        pass: process.env.EMAIL_PASSWORD || process.env.SMTP_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
};

// Create transporter
const createEmailTransporter = () => {
    return nodemailer.createTransporter(emailConfig);
};

// Send welcome email
const sendWelcomeEmail = async (userEmail, userName) => {
    const transporter = createEmailTransporter();
    
    const mailOptions = {
        from: '"Cosmic Social Network" <noreply@cown.name.vn>',
        to: userEmail,
        subject: '🌌 Welcome to Cosmic Social Network!',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: white; padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #a855f7; font-size: 2.5em; margin: 0;">🌌</h1>
                    <h2 style="color: white; margin: 10px 0;">Welcome to Cosmic Social Network!</h2>
                </div>
                
                <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p>Hi <strong>${userName}</strong>,</p>
                    <p>Welcome to our cosmic community! 🚀</p>
                    <p>You've successfully joined the most innovative social network in the galaxy.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://cown.name.vn/pages/home" 
                           style="background: linear-gradient(45deg, #a855f7, #ec4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold;">
                            🌟 Explore Your Universe
                        </a>
                    </div>
                    
                    <h3 style="color: #a855f7;">✨ Features Available:</h3>
                    <ul style="list-style: none; padding: 0;">
                        <li>📱 Beautiful cosmic interface</li>
                        <li>💬 Messaging with real ringtones</li>
                        <li>🎥 Video & voice calls</li>
                        <li>🌍 Discover new connections</li>
                        <li>📍 Location sharing</li>
                        <li>⚙️ Customizable settings</li>
                    </ul>
                </div>
                
                <div style="text-align: center; margin-top: 30px; color: #a8a8a8; font-size: 12px;">
                    <p>This email was sent from Cosmic Social Network<br>
                    If you didn't create this account, please ignore this email.</p>
                    <p>🌐 <a href="https://cown.name.vn" style="color: #a855f7;">cown.name.vn</a></p>
                </div>
            </div>
        `
    };
    
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Welcome email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending welcome email:', error);
        return { success: false, error: error.message };
    }
};

// Send password reset email
const sendPasswordResetEmail = async (userEmail, resetToken, userName) => {
    const transporter = createEmailTransporter();
    const resetLink = `https://cown.name.vn/pages/reset-password?token=${resetToken}`;
    
    const mailOptions = {
        from: '"Cosmic Social Network" <noreply@cown.name.vn>',
        to: userEmail,
        subject: '🔒 Password Reset Request - Cosmic Social Network',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: white; padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #ef4444; font-size: 2.5em; margin: 0;">🔒</h1>
                    <h2 style="color: white; margin: 10px 0;">Password Reset Request</h2>
                </div>
                
                <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p>Hi <strong>${userName}</strong>,</p>
                    <p>We received a request to reset your password for your Cosmic Social Network account.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${resetLink}" 
                           style="background: linear-gradient(45deg, #ef4444, #f97316); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold;">
                            🔑 Reset Password
                        </a>
                    </div>
                    
                    <p style="color: #fbbf24;">⚠️ This link will expire in 1 hour for security reasons.</p>
                    <p>If you didn't request this password reset, please ignore this email and your password will remain unchanged.</p>
                    
                    <div style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 5px; margin: 20px 0; font-size: 12px;">
                        <p><strong>Security Tips:</strong></p>
                        <ul style="margin: 5px 0; padding-left: 20px;">
                            <li>Never share your password with anyone</li>
                            <li>Use a unique password for each account</li>
                            <li>Enable two-factor authentication when available</li>
                        </ul>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 30px; color: #a8a8a8; font-size: 12px;">
                    <p>This email was sent from Cosmic Social Network<br>
                    Need help? Contact support at noreply@cown.name.vn</p>
                    <p>🌐 <a href="https://cown.name.vn" style="color: #a855f7;">cown.name.vn</a></p>
                </div>
            </div>
        `
    };
    
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Password reset email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending password reset email:', error);
        return { success: false, error: error.message };
    }
};

// Send verification email
const sendVerificationEmail = async (userEmail, verificationToken, userName) => {
    const transporter = createEmailTransporter();
    const verificationLink = `https://cown.name.vn/verify-email?token=${verificationToken}`;
    
    const mailOptions = {
        from: '"Cosmic Social Network" <noreply@cown.name.vn>',
        to: userEmail,
        subject: '✨ Verify Your Email - Cosmic Social Network',
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: white; padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #10b981; font-size: 2.5em; margin: 0;">✨</h1>
                    <h2 style="color: white; margin: 10px 0;">Verify Your Email Address</h2>
                </div>
                
                <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p>Hi <strong>${userName}</strong>,</p>
                    <p>Thanks for joining Cosmic Social Network! 🚀</p>
                    <p>Please verify your email address to complete your account setup and unlock all features.</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${verificationLink}" 
                           style="background: linear-gradient(45deg, #10b981, #059669); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold;">
                            ✅ Verify Email Address
                        </a>
                    </div>
                    
                    <p style="color: #fbbf24;">⏰ This verification link will expire in 24 hours.</p>
                    <p>After verification, you'll be able to:</p>
                    <ul style="list-style: none; padding: 0; margin: 15px 0;">
                        <li>🌟 Access all premium features</li>
                        <li>💬 Send and receive messages</li>
                        <li>🎥 Make video and voice calls</li>
                        <li>🌍 Connect with other users</li>
                    </ul>
                </div>
                
                <div style="text-align: center; margin-top: 30px; color: #a8a8a8; font-size: 12px;">
                    <p>This email was sent from Cosmic Social Network<br>
                    If you didn't create this account, please ignore this email.</p>
                    <p>🌐 <a href="https://cown.name.vn" style="color: #a855f7;">cown.name.vn</a></p>
                </div>
            </div>
        `
    };
    
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Verification email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending verification email:', error);
        return { success: false, error: error.message };
    }
};

// Send notification email
const sendNotificationEmail = async (userEmail, userName, notificationType, content) => {
    const transporter = createEmailTransporter();
    
    const notifications = {
        'new_message': {
            subject: '💬 New Message - Cosmic Social Network',
            emoji: '💬',
            title: 'You have a new message!'
        },
        'friend_request': {
            subject: '👥 New Friend Request - Cosmic Social Network', 
            emoji: '👥',
            title: 'Someone wants to be your friend!'
        },
        'call_missed': {
            subject: '📞 Missed Call - Cosmic Social Network',
            emoji: '📞', 
            title: 'You missed a call!'
        }
    };
    
    const notification = notifications[notificationType] || notifications['new_message'];
    
    const mailOptions = {
        from: '"Cosmic Social Network" <noreply@cown.name.vn>',
        to: userEmail,
        subject: notification.subject,
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); color: white; padding: 20px; border-radius: 10px;">
                <div style="text-align: center; margin-bottom: 30px;">
                    <h1 style="color: #a855f7; font-size: 2.5em; margin: 0;">${notification.emoji}</h1>
                    <h2 style="color: white; margin: 10px 0;">${notification.title}</h2>
                </div>
                
                <div style="background: rgba(255,255,255,0.1); padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <p>Hi <strong>${userName}</strong>,</p>
                    <p>${content}</p>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="https://cown.name.vn/pages/home" 
                           style="background: linear-gradient(45deg, #a855f7, #ec4899); color: white; padding: 15px 30px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: bold;">
                            🌟 Check It Out
                        </a>
                    </div>
                </div>
                
                <div style="text-align: center; margin-top: 30px; color: #a8a8a8; font-size: 12px;">
                    <p>This email was sent from Cosmic Social Network<br>
                    You can manage your notification settings in your account.</p>
                    <p>🌐 <a href="https://cown.name.vn" style="color: #a855f7;">cown.name.vn</a></p>
                </div>
            </div>
        `
    };
    
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Notification email sent:', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error('Error sending notification email:', error);
        return { success: false, error: error.message };
    }
};

// Test email connection
const testEmailConnection = async () => {
    const transporter = createEmailTransporter();
    
    try {
        await transporter.verify();
        console.log('✅ Email server connection verified');
        return { success: true, message: 'Email server connection verified' };
    } catch (error) {
        console.error('❌ Email server connection failed:', error);
        return { success: false, error: error.message };
    }
};

module.exports = {
    emailConfig,
    createEmailTransporter,
    sendWelcomeEmail,
    sendPasswordResetEmail,
    sendVerificationEmail,
    sendNotificationEmail,
    testEmailConnection
};
