const fs = require('fs').promises;
const path = require('path');
const { pool } = require('../config/database');

async function runMigration() {
  let client;
  
  try {
    console.log('Starting database migration...');
    
    client = await pool.connect();
    
    // Read and execute schema.sql
    const schemaPath = path.join(__dirname, '../../schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');
    
    console.log('Executing schema...');
    await client.query(schema);
    
    console.log('Migration completed successfully!');
    console.log('\nDatabase schema created with the following tables:');
    console.log('- users');
    console.log('- contact_requests');
    console.log('- chat_threads');
    console.log('- direct_threads');
    console.log('- groups');
    console.log('- group_members');
    console.log('- messages');
    console.log('- attachments');
    console.log('- read_receipts');
    console.log('- ai_queries');
    console.log('- ai_results');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

runMigration();