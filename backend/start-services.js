#!/usr/bin/env node
/**
 * Script to start both backend and RAG service together (if available)
 * Usage: node start-services.js
 * 
 * If SmartApp_Clone folder is not available, only backend will start.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const RAG_SERVICE_DIR = path.join(__dirname, '..', 'SmartApp_Clone', 'rag_service');
const RAG_SERVICE_EXISTS = fs.existsSync(RAG_SERVICE_DIR);

let ragService = null;

console.log('🚀 Starting Backend Server...\n');

if (RAG_SERVICE_EXISTS) {
  console.log('📦 Starting RAG Service...');
  // Try python3 first, fallback to python
  const pythonCmd = process.platform !== 'win32' ? 'python3' : 'python';
  ragService = spawn(pythonCmd, ['main.py'], {
    cwd: RAG_SERVICE_DIR,
    stdio: 'inherit',
    shell: true
  });

  ragService.on('error', (error) => {
    console.warn('⚠️  Failed to start RAG service:', error.message);
    console.warn('   Backend will continue without RAG service.');
    console.warn('   AI features will be unavailable.\n');
    ragService = null;
    startBackend();
  });

  // Wait a moment for RAG service to start
  setTimeout(() => {
    startBackend();
  }, 2000);
} else {
  console.log('⚠️  RAG Service directory not found.');
  console.log('   Backend will start without RAG service.');
  console.log('   AI features will be unavailable.\n');
  startBackend();
}

function startBackend() {
  // Start backend
  console.log('🔧 Starting Backend Server...\n');
  const backend = spawn('node', ['src/server.js'], {
    cwd: __dirname,
    stdio: 'inherit',
    shell: true
  });

  backend.on('error', (error) => {
    console.error('❌ Failed to start backend:', error.message);
    if (ragService) {
      ragService.kill();
    }
    process.exit(1);
  });

  // Handle cleanup
  const cleanup = () => {
    console.log('\n🛑 Shutting down services...');
    if (ragService) {
      ragService.kill();
    }
    backend.kill();
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Handle process exits
  if (ragService) {
    ragService.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.warn('⚠️  RAG service exited with code', code);
        console.warn('   Backend will continue running without RAG service.');
      }
    });
  }

  backend.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      console.error('❌ Backend exited with code', code);
      if (ragService) {
        ragService.kill();
      }
      process.exit(1);
    }
  });
}

