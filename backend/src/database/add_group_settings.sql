-- Migration: Add group settings columns
-- Run this script to add the new settings columns to existing databases

ALTER TABLE groups 
ADD COLUMN IF NOT EXISTS only_admins_change_picture BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS only_admins_send_messages BOOLEAN DEFAULT FALSE;

-- Verify columns were added
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'groups' 
AND column_name IN ('only_admins_change_picture', 'only_admins_send_messages');

