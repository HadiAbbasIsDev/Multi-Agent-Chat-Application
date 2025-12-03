const { Pool } = require('pg');
require('dotenv').config();

let pool = null;
let connectionAttempts = 0;
const MAX_CONNECTION_ATTEMPTS = 10;
const INITIAL_RETRY_DELAY = 2000; // 2 seconds

const createPool = () => {
  return new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });
};

pool = createPool();

pool.on('connect', () => {
  connectionAttempts = 0;
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client:', err.message);
  // Don't exit - let fault tolerance handle this
});

const retryWithBackoff = async (fn, maxAttempts = 3) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxAttempts && (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT')) {
        const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s, 8s
        console.warn(`⚠️  Database connection attempt ${attempt}/${maxAttempts} failed. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        break;
      }
    }
  }
  
  throw lastError;
};

const query = async (text, params) => {
  const start = Date.now();
  
  return retryWithBackoff(async () => {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('✅ Query executed', { duration, rows: res.rowCount });
    return res;
  }, 3);
};

const getClient = async () => {
  const client = await pool.connect();
  const query = client.query;
  const release = client.release;
  
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!');
  }, 5000);
  
  client.query = (...args) => {
    return query.apply(client, args);
  };
  
  client.release = () => {
    clearTimeout(timeout);
    client.query = query;
    client.release = release;
    return release.apply(client);
  };
  
  return client;
};

module.exports = {
  query,
  getClient,
  pool
};