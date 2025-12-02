// src/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');
const config = require('./config');
const { pool } = require('./config/database');
const MessageQueueService = require('./services/messageQueue');

console.log('Environment loaded:', {
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_NAME: process.env.DB_NAME,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD ? '***' : 'UNDEFINED'
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: config.cors.origins,
    methods: ['GET', 'POST']
  },
  pingTimeout: config.websocket.pingTimeout,
  pingInterval: config.websocket.pingInterval,
  maxHttpBufferSize: config.websocket.maxPayload,
  transports: ['websocket', 'polling'], // Support both for redundancy
  allowEIO3: true // Backward compatibility
});

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({ origin: config.cors.origins }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(config.env === 'development' ? 'dev' : 'combined'));

// Serve static files from uploads directory
const backendRoot = path.resolve(__dirname, '..');
const uploadsPath = path.isAbsolute(config.upload.uploadDir) 
  ? config.upload.uploadDir 
  : path.resolve(backendRoot, config.upload.uploadDir.replace(/^\.\//, ''));

console.log('📁 Serving static files from:', uploadsPath);

app.use('/uploads', express.static(uploadsPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.gif')) {
      res.setHeader('Content-Type', 'image/gif');
    } else if (filePath.endsWith('.webp')) {
      res.setHeader('Content-Type', 'image/webp');
    }
  }
}));

// Rate limiting
const getLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max * 3,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

const postLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/', (req, res, next) => {
  if (req.method === 'GET') {
    return getLimiter(req, res, next);
  } else {
    return postLimiter(req, res, next);
  }
});

// Initialize Message Queue Service
const messageQueueService = new MessageQueueService(io);
io.messageQueueService = messageQueueService;

// Make io and messageQueueService accessible to routes
app.set('io', io);
app.set('messageQueueService', messageQueueService);

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/contacts', require('./routes/contacts'));
app.use('/api/threads', require('./routes/threads'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/groups', require('./routes/groups'));
app.use('/api/ai', require('./routes/ai'));

// Health check with system status
app.get('/health', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT 1');
    
    const queueStats = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
        COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
        COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered
      FROM message_queue
      WHERE created_at > NOW() - INTERVAL '1 hour'
    `);

    const onlineUsers = await pool.query(
      'SELECT COUNT(*) as count FROM user_connections WHERE is_online = true'
    );

    res.json({ 
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: 'connected',
      messageQueue: {
        pending: parseInt(queueStats.rows[0].pending || 0),
        processing: parseInt(queueStats.rows[0].processing || 0),
        failed: parseInt(queueStats.rows[0].failed || 0),
        delivered: parseInt(queueStats.rows[0].delivered || 0)
      },
      onlineUsers: parseInt(onlineUsers.rows[0].count || 0)
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({ 
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

// Queue statistics endpoint (protected)
app.get('/api/admin/queue-stats', async (req, res) => {
  try {
    const stats = await messageQueueService.getQueueStats();
    res.json({ stats });
  } catch (error) {
    console.error('Queue stats error:', error);
    res.status(500).json({ error: 'Failed to fetch queue statistics' });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(config.env === 'development' && { stack: err.stack })
  });
});

// Socket.IO connection handling
require('./sockets')(io);

// Start Message Queue Service
messageQueueService.start();

// Schedule periodic cleanup of old delivery logs
setInterval(() => {
  messageQueueService.cleanupOldLogs();
}, 24 * 60 * 60 * 1000); // Run daily

// Start server
const PORT = config.port;
server.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   🚀 Server Started Successfully          ║
╠════════════════════════════════════════════╣
║   Port: ${PORT.toString().padEnd(34)} ║
║   Environment: ${config.env.padEnd(27)} ║
║   Message Queue: Active                   ║
║   WebSocket: Active                       ║
║   Fault Tolerance: Enabled                ║
║   Max Retries: ${config.messageDelivery.maxRetries.toString().padEnd(27)} ║
║   Queue Interval: ${config.messageDelivery.queueProcessorInterval}ms${' '.repeat(18)} ║
╚════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Stop accepting new connections
  server.close(() => {
    console.log('✅ HTTP server closed');
    
    // Stop message queue service
    messageQueueService.stop();
    
    // Close database pool
    pool.end(() => {
      console.log('✅ Database pool closed');
      process.exit(0);
    });
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { app, io, messageQueueService };