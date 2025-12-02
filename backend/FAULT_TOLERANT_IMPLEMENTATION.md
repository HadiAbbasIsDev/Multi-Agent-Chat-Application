# Fault-Tolerant Messaging System Implementation

## Overview

This implementation adds comprehensive fault-tolerant features to your chat application backend:

1. **Message Retry Mechanism** - Automatic retry with exponential backoff
2. **Redundant Communication Paths** - WebSocket → HTTP Fallback → Database persistence
3. **Offline Handling** - Prevent offline users from sending messages and queue messages for them

---

## 🚀 Installation Steps

### 1. Run Database Migration

Execute the SQL migration to add the required tables:

```bash
psql -U your_username -d your_database -f src/database/add_fault_tolerant.sql
```

Or manually run the migration:

```bash
cd backend
node -e "
const { query } = require('./src/config/database');
const fs = require('fs');
const sql = fs.readFileSync('./src/database/add_fault_tolerant.sql', 'utf8');
query(sql).then(() => console.log('Migration complete')).catch(console.error);
"
```

### 2. Create Required Files

Create the message queue service file:

```bash
mkdir -p src/services
# Copy the MessageQueueService code to src/services/messageQueue.js
```

### 3. Update Environment Variables

Add these optional configuration variables to your `.env`:

```env
# Message Delivery Configuration
MESSAGE_MAX_RETRIES=5
MESSAGE_SOCKET_TIMEOUT=5000
ENABLE_HTTP_FALLBACK=true
QUEUE_PROCESSOR_INTERVAL=2000
MESSAGE_QUEUE_BATCH_SIZE=50
DELIVERY_LOG_RETENTION_DAYS=30
CONNECTION_CHECK_INTERVAL=10000
USER_OFFLINE_THRESHOLD=30000

# WebSocket Configuration
WS_PING_TIMEOUT=60000
WS_PING_INTERVAL=25000
WS_ENABLE_COMPRESSION=true
WS_MAX_PAYLOAD=1048576
```

### 4. Update Existing Files

Replace the following files with the updated versions:

- `src/server.js` → Updated Server
- `src/sockets/index.js` → Updated Socket Handler
- `src/routes/messages.js` → Updated Messages Route
- `src/config/index.js` → Updated Config

### 5. Restart Your Server

```bash
npm run start
# or
npm run dev
```

---

## 📋 New Database Tables

### `message_queue`
Tracks message delivery attempts with retry mechanism.

**Key Fields:**
- `status`: PENDING, PROCESSING, DELIVERED, FAILED, CANCELLED
- `retry_count`: Number of delivery attempts
- `next_retry_at`: When to retry next
- `delivery_method`: WEBSOCKET, HTTP_FALLBACK, DATABASE_ONLY

### `user_connections`
Real-time tracking of user online/offline status.

**Key Fields:**
- `is_online`: Boolean status
- `socket_id`: Current socket connection ID
- `connection_quality`: GOOD, POOR, DISCONNECTED
- `last_seen`: Last activity timestamp

### `message_delivery_logs`
Audit trail of all delivery attempts for monitoring.

**Key Fields:**
- `status`: SUCCESS, FAILED, TIMEOUT, REJECTED
- `attempt_number`: Retry attempt number
- `latency_ms`: Delivery latency
- `error_message`: Failure reason

### `message_delivery_stats` (View)
Aggregated statistics for message delivery performance.

---

## 🎯 How It Works

### 1. Message Sending Flow

```
User sends message (must be online)
    ↓
Message saved to database
    ↓
Message added to queue for each recipient
    ↓
Delivery attempts:
    1. WebSocket (primary) → 5s timeout
    2. HTTP Fallback (secondary) → User polls
    3. Database (tertiary) → Delivered when user comes online
    ↓
Retry with exponential backoff if failed
    ↓
Max 5 retries: 1s → 2s → 5s → 10s → 30s
```

### 2. Offline User Protection

```javascript
// Users must be online to send messages
if (!user.is_online) {
  return 403 Forbidden: "You must be online to send messages"
}
```

### 3. Automatic Retry on Reconnection

When a user comes online:
1. System detects connection
2. Fetches all pending/failed messages for that user
3. Resets retry counter
4. Immediately attempts delivery

### 4. Connection Quality Monitoring

- Ping/pong every 10 seconds
- Monitors latency
- Adjusts connection quality: GOOD (<500ms), FAIR (500-1000ms), POOR (>1000ms)
- Automatically switches to HTTP fallback for poor connections

---

## 📡 API Endpoints

### New Endpoints

#### GET `/api/messages/pending/poll`
Poll for pending messages (HTTP fallback mechanism).

**Query Parameters:**
- `since` (optional): ISO timestamp of last poll

**Response:**
```json
{
  "messages": [...],
  "count": 5,
  "polledAt": "2024-01-01T12:00:00.000Z"
}
```

#### GET `/api/messages/:messageId/delivery-status`
Get delivery statistics for a specific message (sender only).

**Response:**
```json
{
  "messageId": "uuid",
  "stats": {
    "total_recipients": 5,
    "delivered_count": 4,
    "failed_count": 0,
    "pending_count": 1,
    "avg_latency_ms": 250,
    "max_retry_count": 2
  }
}
```

### Updated Endpoints

#### POST `/api/messages/:threadId`
Now includes:
- Online status check (prevents offline sending)
- Automatic queueing for all recipients
- Delivery tracking

**Response includes:**
```json
{
  "message": "Message sent and queued for delivery",
  "data": {
    ...
    "deliveryStatus": "PENDING",
    "recipientCount": 3
  }
}
```

---

## 🔧 WebSocket Events

### New Events

#### Server → Client: `ping`
Server checks connection quality.

**Client should respond with `pong`**

#### Server → Client: `new_message` (Enhanced)
Now includes acknowledgment callback:

```javascript
socket.on('new_message', (message, ackCallback) => {
  // Process message
  ackCallback('received'); // Acknowledge receipt
});
```

---

## 📊 Monitoring & Maintenance

### Health Check Endpoint

GET `/health` now includes queue statistics:

```json
{
  "status": "OK",
  "messageQueue": {
    "pending": 12,
    "processing": 3,
    "failed": 1,
    "delivered": 1543
  },
  "onlineUsers": 45
}
```

### View Delivery Statistics

```sql
-- Get delivery stats for recent messages
SELECT * FROM message_delivery_stats
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC;

-- Check failed deliveries
SELECT m.id, m.body, mq.last_error, mq.retry_count
FROM messages m
JOIN message_queue mq ON m.id = mq.message_id
WHERE mq.status = 'FAILED'
ORDER BY mq.failed_at DESC;

-- Monitor online users
SELECT COUNT(*) as online_users
FROM user_connections
WHERE is_online = true;
```

### Automatic Cleanup

Old delivery logs are automatically cleaned up. To manually trigger:

```sql
SELECT cleanup_old_delivery_logs();
```

---

## 🧪 Testing

### Test Offline User Protection

```javascript
// User A disconnects
await fetch('/api/messages/thread-123', {
  method: 'POST',
  body: JSON.stringify({ body: 'Test' }),
  headers: { 'Authorization': 'Bearer <token>' }
});
// Expected: 403 Forbidden - "You must be online to send messages"
```

### Test Message Retry

```javascript
// Send message while recipient is offline
// Recipient comes online
// Check that queued messages are delivered
```

### Test HTTP Fallback

```javascript
// Simulate poor WebSocket connection
// Send message
// Client polls: GET /api/messages/pending/poll
// Expected: Pending messages returned
```

---

## 🛠️ Troubleshooting

### Messages Not Delivering

1. Check user connection status:
```sql
SELECT * FROM user_connections WHERE user_id = 'uuid';
```

2. Check message queue:
```sql
SELECT * FROM message_queue 
WHERE recipient_id = 'uuid' 
AND status != 'DELIVERED'
ORDER BY created_at DESC;
```

3. Check delivery logs:
```sql
SELECT * FROM message_delivery_logs
WHERE recipient_id = 'uuid'
ORDER BY created_at DESC
LIMIT 20;
```

### Queue Processor Not Running

Check server logs for:
```
✅ Message queue processor started
```

If missing, restart the server.

### High Retry Count

If messages are retrying excessively:
1. Check WebSocket connectivity
2. Verify user connection table is being updated
3. Check for database connection issues
4. Review delivery logs for error patterns

---

## 🔐 Security Considerations

1. **Rate Limiting**: Queue processor respects existing rate limits
2. **Authentication**: All endpoints require valid JWT token
3. **Authorization**: Users can only send to threads they're in
4. **Data Privacy**: Delivery logs don't store message content
5. **Offline Protection**: Prevents unauthorized message sending

---

## 📈 Performance Tips

1. **Database Indexes**: All key columns are indexed for fast lookups
2. **Batch Processing**: Queue processor handles 50 messages per batch
3. **Connection Pooling**: Uses existing database connection pool
4. **Async Operations**: Message indexing to RAG service is non-blocking
5. **Efficient Queries**: Uses CTEs and proper joins for complex queries

---

## 🔄 Migration Path for Existing Data

If you have existing messages, run this to initialize their delivery status:

```sql
-- Update existing messages
UPDATE messages 
SET delivery_status = 'DELIVERED' 
WHERE deleted_at IS NULL 
AND delivery_status IS NULL;

-- Create connection records for active users
INSERT INTO user_connections (user_id, is_online, last_seen)
SELECT id, false, last_active_at
FROM users
ON CONFLICT (user_id) DO NOTHING;
```

---

## 📝 Client-Side Integration

### Handling Offline State

```javascript
// Listen for connection status
socket.on('connect', () => {
  console.log('Connected - Can send messages');
  setCanSend(true);
});

socket.on('disconnect', () => {
  console.log('Disconnected - Cannot send messages');
  setCanSend(false);
});

// Disable send button when offline
<button disabled={!canSend}>Send</button>
```

### Implement HTTP Polling Fallback

```javascript
// Poll for pending messages if WebSocket is unstable
const pollForMessages = async () => {
  const response = await fetch('/api/messages/pending/poll', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();
  
  data.messages.forEach(msg => {
    // Add to message list
    addMessage(msg);
  });
};

// Poll every 30 seconds if connection is poor
if (connectionQuality === 'POOR') {
  setInterval(pollForMessages, 30000);
}
```

### Track Delivery Status

```javascript
// Check message delivery status
const checkDeliveryStatus = async (messageId) => {
  const response = await fetch(
    `/api/messages/${messageId}/delivery-status`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  const data = await response.json();
  
  console.log(`Delivered: ${data.stats.delivered_count}/${data.stats.total_recipients}`);
};
```

---

## 🎉 Benefits

1. **Reliability**: Messages are never lost, even with network issues
2. **User Experience**: Offline users can't send (preventing confusion)
3. **Scalability**: Queue system handles high message volume
4. **Monitoring**: Full audit trail of delivery attempts
5. **Flexibility**: Multiple delivery paths ensure messages arrive
6. **Performance**: Efficient retry mechanism with exponential backoff

---

## 📞 Support

For issues or questions:
1. Check server logs for error messages
2. Query database views for statistics
3. Monitor health endpoint for system status
4. Review delivery logs for failure patterns

---

## ✅ Verification Checklist

- [ ] Database migration completed successfully
- [ ] All new tables exist: `message_queue`, `user_connections`, `message_delivery_logs`
- [ ] Message queue processor starts on server boot
- [ ] Health endpoint returns queue statistics
- [ ] Offline users cannot send messages (403 error)
- [ ] Messages deliver via WebSocket for online users
- [ ] Messages retry on failure with exponential backoff
- [ ] Pending messages deliver when user comes online
- [ ] HTTP polling fallback works for poor connections
- [ ] Delivery status endpoint returns accurate statistics
- [ ] Socket events include user online/offline notifications

---

**Implementation Complete! 🎊**

Your chat application now has enterprise-grade fault-tolerant messaging with automatic retry, redundant delivery paths, and robust offline handling.