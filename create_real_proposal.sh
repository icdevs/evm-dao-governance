#!/bin/bash

# Wrapper script for creating real proposals with proper SIWE signatures
# This calls the Node.js script that generates actual cryptographic proofs

set -e

echo "🚀 Starting real proposal creation with proper SIWE proof..."
echo ""

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found! Please install Node.js first."
    exit 1
fi

# Check if npm dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Run the Node.js script that creates real proposals
echo "🔧 Executing proposal creation script..."
node create_real_proposal.js

echo ""
echo "✅ Real proposal creation script completed!"
