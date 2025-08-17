#!/bin/bash

# Quick deploy script
echo "🚀 Starting deployment..."

# Add all changes
git add .

# Commit with timestamp
git commit -m "Add missing get-salt and login endpoints - $(date)"

# Push to remote
git push

echo "✅ Deployment completed!"
echo "⏳ Please wait 2-3 minutes for server restart..."
