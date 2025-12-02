// src/database/add_fault_tolerant.js
// Run this with: node src/database/add_fault_tolerant.js

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

async function runMigration() {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Starting fault-tolerant messaging migration...\n');

    await client.query('BEGIN');

    // 1. Create message_queue table
    console.log('📦 Creating message_queue table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_queue (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        message_id UUID NOT NULL,
        thread_id UUID NOT NULL,
        sender_id UUID NOT NULL,
        recipient_id UUID NOT NULL,
        delivery_method VARCHAR(20) NOT NULL DEFAULT 'WEBSOCKET',
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        retry_count INT DEFAULT 0,
        max_retries INT DEFAULT 5,
        next_retry_at TIMESTAMP,
        last_error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        delivered_at TIMESTAMP,
        failed_at TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT status_check CHECK (status IN ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'CANCELLED')),
        CONSTRAINT delivery_method_check CHECK (delivery_method IN ('WEBSOCKET', 'HTTP_FALLBACK', 'DATABASE_ONLY'))
      );
    `);
    console.log('✅ message_queue table created\n');

    // 2. Create indexes for message_queue
    console.log('📑 Creating indexes for message_queue...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_message_queue_status ON message_queue(status);
      CREATE INDEX IF NOT EXISTS idx_message_queue_recipient ON message_queue(recipient_id);
      CREATE INDEX IF NOT EXISTS idx_message_queue_retry ON message_queue(next_retry_at) WHERE status = 'PENDING';
      CREATE INDEX IF NOT EXISTS idx_message_queue_message ON message_queue(message_id);
    `);
    console.log('✅ Indexes created\n');

    // 3. Create user_connections table
    console.log('📱 Creating user_connections table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_connections (
        user_id UUID PRIMARY KEY,
        socket_id VARCHAR(255),
        is_online BOOLEAN DEFAULT FALSE,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        connection_quality VARCHAR(20) DEFAULT 'GOOD',
        platform VARCHAR(50),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT connection_quality_check CHECK (connection_quality IN ('GOOD', 'POOR', 'DISCONNECTED'))
      );
    `);
    console.log('✅ user_connections table created\n');

    // 4. Create indexes for user_connections
    console.log('📑 Creating indexes for user_connections...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_connections_online ON user_connections(is_online);
      CREATE INDEX IF NOT EXISTS idx_user_connections_last_seen ON user_connections(last_seen);
    `);
    console.log('✅ Indexes created\n');

    // 5. Create message_delivery_logs table
    console.log('📝 Creating message_delivery_logs table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS message_delivery_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        message_id UUID NOT NULL,
        queue_id UUID,
        recipient_id UUID NOT NULL,
        delivery_method VARCHAR(20) NOT NULL,
        attempt_number INT NOT NULL,
        status VARCHAR(20) NOT NULL,
        error_message TEXT,
        latency_ms INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
        FOREIGN KEY (queue_id) REFERENCES message_queue(id) ON DELETE SET NULL,
        FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE,
        CONSTRAINT delivery_status_check CHECK (status IN ('SUCCESS', 'FAILED', 'TIMEOUT', 'REJECTED'))
      );
    `);
    console.log('✅ message_delivery_logs table created\n');

    // 6. Create indexes for message_delivery_logs
    console.log('📑 Creating indexes for message_delivery_logs...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_delivery_logs_message ON message_delivery_logs(message_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_logs_recipient ON message_delivery_logs(recipient_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_delivery_logs_created ON message_delivery_logs(created_at);
    `);
    console.log('✅ Indexes created\n');

    // 7. Add delivery_status column to messages table
    console.log('🔧 Adding delivery_status to messages table...');
    await client.query(`
      ALTER TABLE messages 
      ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'PENDING';
    `);
    
    await client.query(`
      DO $$ BEGIN
        ALTER TABLE messages ADD CONSTRAINT delivery_status_check 
        CHECK (delivery_status IN ('PENDING', 'DELIVERED', 'FAILED', 'PARTIAL'));
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    console.log('✅ delivery_status column added\n');

    // 8. Create trigger function
    console.log('⚡ Creating trigger function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION update_user_connection_timestamp()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Trigger function created\n');

    // 9. Create trigger
    console.log('🎯 Creating trigger...');
    await client.query(`
      DROP TRIGGER IF EXISTS trigger_update_user_connection_timestamp ON user_connections;
      CREATE TRIGGER trigger_update_user_connection_timestamp
        BEFORE UPDATE ON user_connections
        FOR EACH ROW
        EXECUTE FUNCTION update_user_connection_timestamp();
    `);
    console.log('✅ Trigger created\n');

    // 10. Create cleanup function
    console.log('🧹 Creating cleanup function...');
    await client.query(`
      CREATE OR REPLACE FUNCTION cleanup_old_delivery_logs()
      RETURNS void AS $$
      BEGIN
        DELETE FROM message_delivery_logs
        WHERE created_at < NOW() - INTERVAL '30 days';
      END;
      $$ LANGUAGE plpgsql;
    `);
    console.log('✅ Cleanup function created\n');

    // 11. Create statistics view
    console.log('📊 Creating message_delivery_stats view...');
    await client.query(`
      CREATE OR REPLACE VIEW message_delivery_stats AS
      SELECT
        m.id as message_id,
        m.thread_id,
        m.sender_id,
        m.created_at,
        m.delivery_status,
        COUNT(DISTINCT mq.recipient_id) as total_recipients,
        COUNT(DISTINCT CASE WHEN mq.status = 'DELIVERED' THEN mq.recipient_id END) as delivered_count,
        COUNT(DISTINCT CASE WHEN mq.status = 'FAILED' THEN mq.recipient_id END) as failed_count,
        COUNT(DISTINCT CASE WHEN mq.status = 'PENDING' THEN mq.recipient_id END) as pending_count,
        AVG(mdl.latency_ms) as avg_latency_ms,
        MAX(mq.retry_count) as max_retry_count
      FROM messages m
      LEFT JOIN message_queue mq ON m.id = mq.message_id
      LEFT JOIN message_delivery_logs mdl ON m.id = mdl.message_id AND mdl.status = 'SUCCESS'
      WHERE m.deleted_at IS NULL
      GROUP BY m.id, m.thread_id, m.sender_id, m.created_at, m.delivery_status;
    `);
    console.log('✅ Statistics view created\n');

    // 12. Initialize existing data
    console.log('🔄 Initializing existing data...');
    
    // Update existing messages
    const messagesResult = await client.query(`
      UPDATE messages 
      SET delivery_status = 'DELIVERED' 
      WHERE deleted_at IS NULL 
      AND delivery_status IS NULL
      RETURNING COUNT(*);
    `);
    console.log(`✅ Updated ${messagesResult.rowCount} existing messages\n`);

    // Initialize user connections for all users
    const usersResult = await client.query(`
      INSERT INTO user_connections (user_id, is_online, last_seen)
      SELECT id, false, COALESCE(last_active_at, CURRENT_TIMESTAMP)
      FROM users
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id;
    `);
    console.log(`✅ Initialized ${usersResult.rowCount} user connections\n`);

    await client.query('COMMIT');

    // 13. Verify tables
    console.log('🔍 Verifying migration...');
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('message_queue', 'user_connections', 'message_delivery_logs')
      ORDER BY table_name;
    `);

    const viewsResult = await client.query(`
      SELECT table_name 
      FROM information_schema.views 
      WHERE table_schema = 'public' 
      AND table_name = 'message_delivery_stats';
    `);

    console.log('✅ Tables created:', tablesResult.rows.map(r => r.table_name).join(', '));
    console.log('✅ Views created:', viewsResult.rows.map(r => r.table_name).join(', '));

    console.log('\n' + '='.repeat(60));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY! ✅');
    console.log('='.repeat(60));
    console.log('\n📋 Summary:');
    console.log('   • 3 new tables created');
    console.log('   • 8 indexes created');
    console.log('   • 1 view created');
    console.log('   • 2 functions created');
    console.log('   • 1 trigger created');
    console.log(`   • ${messagesResult.rowCount} existing messages updated`);
    console.log(`   • ${usersResult.rowCount} user connections initialized`);
    console.log('\n🎉 Your fault-tolerant messaging system is ready!\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
runMigration();