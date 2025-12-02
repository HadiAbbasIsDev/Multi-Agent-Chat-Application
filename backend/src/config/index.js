require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  env: process.env.NODE_ENV || 'development',
  
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  
  db: {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    name: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD
  },
  
  upload: {
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5242880, // 5MB
    uploadDir: process.env.UPLOAD_DIR || './uploads',
    allowedMimeTypes: ['image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/webp']
  },
  
  ai: {
    serviceUrl: process.env.AI_SERVICE_URL,
    apiKey: process.env.AI_SERVICE_API_KEY
  },
  
  rag: {
    serviceUrl: process.env.RAG_SERVICE_URL || 'http://localhost:8000'
  },
  
  cors: {
    origins: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000']
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  },
  
  constants: {
    MAX_GROUP_MEMBERS: 200,
    DELETE_MESSAGE_TIMEOUT: 600000, // 10 minutes in ms
    ALLOWED_EMAIL_DOMAIN: '@nu.edu.pk'
  },

  // NEW: Fault-Tolerant Message Delivery Configuration
  messageDelivery: {
    // Maximum number of retry attempts before marking as failed
    maxRetries: parseInt(process.env.MESSAGE_MAX_RETRIES) || 5,
    
    // Exponential backoff intervals in milliseconds [1s, 2s, 5s, 10s, 30s]
    retryIntervals: process.env.MESSAGE_RETRY_INTERVALS 
      ? JSON.parse(process.env.MESSAGE_RETRY_INTERVALS)
      : [1000, 2000, 5000, 10000, 30000],
    
    // WebSocket delivery timeout in milliseconds
    socketTimeout: parseInt(process.env.MESSAGE_SOCKET_TIMEOUT) || 5000,
    
    // Enable HTTP fallback for message delivery
    enableHttpFallback: process.env.ENABLE_HTTP_FALLBACK !== 'false',
    
    // Queue processor interval in milliseconds
    queueProcessorInterval: parseInt(process.env.QUEUE_PROCESSOR_INTERVAL) || 2000,
    
    // Maximum messages to process per batch
    maxBatchSize: parseInt(process.env.MESSAGE_QUEUE_BATCH_SIZE) || 50,
    
    // Auto-cleanup old delivery logs (days)
    deliveryLogRetentionDays: parseInt(process.env.DELIVERY_LOG_RETENTION_DAYS) || 30,
    
    // Connection quality check interval (milliseconds)
    connectionCheckInterval: parseInt(process.env.CONNECTION_CHECK_INTERVAL) || 10000,
    
    // Consider user offline after this many milliseconds of inactivity
    offlineThreshold: parseInt(process.env.USER_OFFLINE_THRESHOLD) || 30000
  },

  // WebSocket Configuration
  websocket: {
    // Ping timeout
    pingTimeout: parseInt(process.env.WS_PING_TIMEOUT) || 60000,
    
    // Ping interval
    pingInterval: parseInt(process.env.WS_PING_INTERVAL) || 25000,
    
    // Enable compression
    enableCompression: process.env.WS_ENABLE_COMPRESSION !== 'false',
    
    // Maximum payload size
    maxPayload: parseInt(process.env.WS_MAX_PAYLOAD) || 1048576 // 1MB
  }
};