
require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function testConnection() {
  try {
    const result = await pool.query(
      'SELECT NOW() AS current_time'
    );

    console.log('Successfully connected to PostgreSQL!');
    console.log('Database time:', result.rows[0].current_time);
  } catch (error) {
    console.error('Database connection failed.');
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

testConnection();
