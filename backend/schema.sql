-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_blocked BOOLEAN DEFAULT FALSE,
    CONSTRAINT email_domain_check CHECK (email LIKE '%@nu.edu.pk')
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_last_active ON users(last_active_at);

-- Contact Requests Table
CREATE TABLE contact_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_user_id UUID NOT NULL,
    to_user_id UUID NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    responded_at TIMESTAMP,
    FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT status_check CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    CONSTRAINT no_self_request CHECK (from_user_id != to_user_id),
    UNIQUE(from_user_id, to_user_id)
);

CREATE INDEX idx_contact_requests_from ON contact_requests(from_user_id);
CREATE INDEX idx_contact_requests_to ON contact_requests(to_user_id);
CREATE INDEX idx_contact_requests_status ON contact_requests(status);

-- Chat Threads Table
CREATE TABLE chat_threads (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT type_check CHECK (type IN ('DIRECT', 'GROUP'))
);

CREATE INDEX idx_chat_threads_type ON chat_threads(type);
CREATE INDEX idx_chat_threads_last_message ON chat_threads(last_message_at);

-- Direct Threads Table
CREATE TABLE direct_threads (
    thread_id UUID PRIMARY KEY,
    user_a_id UUID NOT NULL,
    user_b_id UUID NOT NULL,
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
    FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT ordered_users CHECK (user_a_id < user_b_id),
    UNIQUE(user_a_id, user_b_id)
);

CREATE INDEX idx_direct_threads_users ON direct_threads(user_a_id, user_b_id);

-- Groups Table
CREATE TABLE groups (
    thread_id UUID PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    owner_id UUID NOT NULL,
    member_count INT DEFAULT 1,
    picture_url TEXT,
    max_members INT DEFAULT 200,
    only_admins_change_picture BOOLEAN DEFAULT FALSE,
    only_admins_send_messages BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_groups_owner ON groups(owner_id);

-- Group Members Table
CREATE TABLE group_members (
    group_id UUID NOT NULL,
    user_id UUID NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'MEMBER',
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (group_id, user_id),
    FOREIGN KEY (group_id) REFERENCES groups(thread_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT role_check CHECK (role IN ('ADMIN', 'MEMBER'))
);

CREATE INDEX idx_group_members_user ON group_members(user_id);
CREATE INDEX idx_group_members_role ON group_members(group_id, role);

-- Messages Table
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    thread_id UUID NOT NULL,
    sender_id UUID NOT NULL,
    body TEXT,
    status VARCHAR(20) DEFAULT 'SENT',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    edited_at TIMESTAMP,
    deleted_at TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT status_check CHECK (status IN ('SENT', 'DELIVERED', 'READ'))
);

CREATE INDEX idx_messages_thread ON messages(thread_id, created_at DESC);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_created ON messages(created_at);

-- Attachments Table
CREATE TABLE attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID NOT NULL,
    type VARCHAR(20) NOT NULL DEFAULT 'IMAGE',
    mime_type VARCHAR(50) NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_url TEXT NOT NULL,
    width INT,
    height INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    CONSTRAINT type_check CHECK (type = 'IMAGE'),
    CONSTRAINT mime_type_check CHECK (mime_type IN ('image/png', 'image/jpg', 'image/jpeg', 'image/gif', 'image/webp'))
);

CREATE INDEX idx_attachments_message ON attachments(message_id);

-- Read Receipts Table
CREATE TABLE read_receipts (
    message_id UUID NOT NULL,
    user_id UUID NOT NULL,
    delivered_at TIMESTAMP,
    read_at TIMESTAMP,
    PRIMARY KEY (message_id, user_id),
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_read_receipts_user ON read_receipts(user_id);
CREATE INDEX idx_read_receipts_message ON read_receipts(message_id);

-- AI Queries Table
CREATE TABLE ai_queries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    prompt TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_queries_user ON ai_queries(user_id, created_at DESC);

-- AI Results Table
CREATE TABLE ai_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    query_id UUID NOT NULL,
    answer_text TEXT NOT NULL,
    citations JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (query_id) REFERENCES ai_queries(id) ON DELETE CASCADE
);

CREATE INDEX idx_ai_results_query ON ai_results(query_id);
CREATE INDEX idx_ai_results_citations ON ai_results USING GIN (citations);

-- Migration: Add fault-tolerant messaging tables
-- Run this with: psql -U your_user -d your_db -f src/database/add_fault_tolerant.sql

-- Message Queue Table (for retry mechanism and offline users)
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

CREATE INDEX idx_message_queue_status ON message_queue(status);
CREATE INDEX idx_message_queue_recipient ON message_queue(recipient_id);
CREATE INDEX idx_message_queue_retry ON message_queue(next_retry_at) WHERE status = 'PENDING';
CREATE INDEX idx_message_queue_message ON message_queue(message_id);

-- User Connection Status Table (track online/offline status accurately)
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

CREATE INDEX idx_user_connections_online ON user_connections(is_online);
CREATE INDEX idx_user_connections_last_seen ON user_connections(last_seen);

-- Message Delivery Attempts Log (for monitoring and debugging)
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

CREATE INDEX idx_delivery_logs_message ON message_delivery_logs(message_id);
CREATE INDEX idx_delivery_logs_recipient ON message_delivery_logs(recipient_id, created_at DESC);
CREATE INDEX idx_delivery_logs_created ON message_delivery_logs(created_at);

-- Add delivery_status column to messages table for quick status checks
ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'PENDING';
ALTER TABLE messages ADD CONSTRAINT delivery_status_check CHECK (delivery_status IN ('PENDING', 'DELIVERED', 'FAILED', 'PARTIAL'));

-- Function to automatically update user connection status
CREATE OR REPLACE FUNCTION update_user_connection_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_user_connection_timestamp
    BEFORE UPDATE ON user_connections
    FOR EACH ROW
    EXECUTE FUNCTION update_user_connection_timestamp();

-- Function to clean up old delivery logs (keep last 30 days)
CREATE OR REPLACE FUNCTION cleanup_old_delivery_logs()
RETURNS void AS $$
BEGIN
    DELETE FROM message_delivery_logs
    WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- View for message delivery statistics
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

COMMENT ON TABLE message_queue IS 'Queue for managing message delivery with retry mechanism';
COMMENT ON TABLE user_connections IS 'Real-time tracking of user online/offline status';
COMMENT ON TABLE message_delivery_logs IS 'Audit log of all message delivery attempts';
COMMENT ON VIEW message_delivery_stats IS 'Statistics view for message delivery performance';