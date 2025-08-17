#!/bin/bash

# Production deployment script for Render
echo "🚀 Starting production deployment..."

# Set production environment
export NODE_ENV=production

# Install dependencies
echo "📦 Installing dependencies..."
npm ci --only=production

# Run any necessary build steps
echo "🔨 Building application..."
npm run build

# Start the application
echo "🌟 Starting Cosmic Social Network..."
npm start
