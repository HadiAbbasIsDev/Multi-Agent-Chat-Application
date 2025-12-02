# 🚀 Quick Setup Guide - Fault-Tolerant Messaging

## Step-by-Step Installation (5 minutes)

### Step 1: Create the Message Queue Service

Create the file `src/services/messageQueue.js` and copy the **MessageQueueService** code from the artifacts.

```bash
mkdir -p src/services
touch src/services/messageQueue.js
# Copy the MessageQueueService code into this file
```

### Step 2: Create the Migration Script

Create the file `src/database/add_fault_tolerant.js` and copy the **migration script** code.

```bash
touch src/database/add_fault_tolerant.js
# Copy the migration script code into this file
```

### Step 3: Run the Migration

```bash
cd backend
node src/database/add_fault_tolerant.js
```

You should see:
```
✅ MIGRATION COMPLETED SUCCESSFULLY! ✅
```

### Step 4: Update Existing Files

Replace these 4 files with the updated versions from artifacts:

1. **`src/config/index.js`** → Copy updated config
2. **`src/server.js`** → Copy updated server
3. **`src/sockets/index.js`** → Copy updated socket handler
4. **`src/routes/messages.js`** → Copy updated messages route

### Step 5: Update Environment Variables (Optional)

Add to your `.env` file (all are optional, defaults are provided):

```env
# Message Delivery Settings
MESSAGE_MAX_RETRIES=5
MESSAGE_SOCKET_TIMEOUT=5000
ENABLE_HTTP_FALLBACK=true
QUEUE_PROCESSOR_INTERVAL=2000

# WebSocket Settings
WS_PING_TIMEOUT=60000
WS_PING_INTERVAL=25000
```

### Step 6: Restart Your Server

```bash
npm run start
# or for development
npm run dev
```

Look for this in the logs:
```
╔════════════════════════════════════════════╗
║   🚀 Server Started Successfully          ║
║   Message Queue: Active                   ║
║   Fault Tolerance: Enabled                ║
╚════════════════════════════════════════════╝
✅ Message queue processor started
```

### Step 7: Verify Installation

Visit the health check endpoint:
```bash
curl http://localhost:3000/health
```

You should see:
```json
{
  "status": "OK",
  "messageQueue": {
    "pending": 0,
    "processing": 0,
    "failed": 0,
    "delivered": 0
  },
  "onlineUsers": 0
}
```

---

## ✅ Verification Checklist

Test each feature:

### 1. Test Offline User Protection
```bash
# Disconnect client
# Try to send message
# Expected: 403 error "You must be online to send messages"
```

### 2. Test Message Delivery
```bash
# Send message while recipient is online
# Check message_queue table
# Expected: Status = 'DELIVERED' within 5 seconds
```

### 3. Test Retry Mechanism
```bash
# Send message while recipient is offline
# Check message_queue: Status = 'PENDING'
# Recipient comes online
# Check message_queue: Status = 'DELIVERED'
```

### 4. Test HTTP Fallback
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/messages/pending/poll
# Expected: Array of pending messages
```

---

## 🗂️ File Structure After Setup

```
backend/
├── src/
│   ├── config/
│   │   └── index.js ✏️ (UPDATED)
│   ├── database/
│   │   ├── add_fault_tolerant.js ⭐ (NEW)
│   │   └── migrate.js
│   ├── routes/
│   │   └── messages.js ✏️ (UPDATED)
│   ├── services/
│   │   └── messageQueue.js ⭐ (NEW)
│   ├── sockets/
│   │   └── index.js ✏️ (UPDATED)
│   └── server.js ✏️ (UPDATED)
└── FAULT_TOLERANT_IMPLEMENTATION.md ⭐ (NEW - Save for reference)
```

---

## 🔍 Quick Database Checks

### Check if tables were created:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('message_queue', 'user_connections', 'message_delivery_logs');
```

### Check online users:
```sql
SELECT COUNT(*) FROM user_connections WHERE is_online = true;
```

### Check pending messages:
```sql
SELECT COUNT(*) FROM message_queue WHERE status = 'PENDING';
```

### Check recent deliveries:
```sql
SELECT * FROM message_delivery_stats 
WHERE created_at > NOW() - INTERVAL '1 hour'
LIMIT 10;
```

---

## 🐛 Common Issues & Solutions

### Issue: "relation 'message_queue' does not exist"
**Solution:** Run the migration script again:
```bash
node src/database/add_fault_tolerant.js
```

### Issue: "Cannot find module './services/messageQueue'"
**Solution:** Make sure you created `src/services/messageQueue.js` with the correct code

### Issue: "Message queue processor started" not showing
**Solution:** Check that `src/server.js` was updated correctly and contains:
```javascript
const MessageQueueService = require('./services/messageQueue');
const messageQueueService = new MessageQueueService(io);
```

### Issue: Still getting "offline users can send messages"
**Solution:** Make sure `src/routes/messages.js` has the `canUserSendMessage()` check

### Issue: Messages not retrying
**Solution:** Check server logs for queue processor errors. Verify `message_queue` table exists

---

## 📊 Monitoring Commands

### View queue status:
```bash
curl http://localhost:3000/health | jq '.messageQueue'
```

### Check message delivery rate (SQL):
```sql
SELECT 
  DATE_TRUNC('minute', created_at) as minute,
  COUNT(*) as messages,
  AVG(latency_ms) as avg_latency
FROM message_delivery_logs 
WHERE status = 'SUCCESS'
  AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY minute
ORDER BY minute DESC;
```

### Find problematic messages:
```sql
SELECT m.id, m.body, mq.retry_count, mq.last_error
FROM messages m
JOIN message_queue mq ON m.id = mq.message_id
WHERE mq.status = 'FAILED'
ORDER BY mq.failed_at DESC
LIMIT 10;
```

---

## 🎯 Next Steps

1. ✅ Complete all steps above
2. ✅ Verify installation with checklist
3. ✅ Test with real users
4. 📖 Read full documentation in `FAULT_TOLERANT_IMPLEMENTATION.md`
5. 🔧 Adjust configuration in `.env` if needed
6. 📊 Monitor delivery stats regularly
7. 🚀 Deploy to production

---

## 📞 Need Help?

If you encounter issues:

1. Check server logs for errors
2. Verify all 4 files were updated
3. Check database migration ran successfully
4. Review the full documentation in `FAULT_TOLERANT_IMPLEMENTATION.md`
5. Check health endpoint for system status

---

**Setup Complete! 🎉**

Your chat application now has:
- ✅ Automatic message retry with exponential backoff
- ✅ Multiple delivery paths (WebSocket → HTTP → Database)
- ✅ Offline user protection
- ✅ Real-time connection monitoring
- ✅ Comprehensive delivery tracking
- ✅ Automatic cleanup and maintenance

**Total setup time: ~5 minutes** ⚡