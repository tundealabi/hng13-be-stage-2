import express from 'express';
import dotenv from 'dotenv';
import countriesRouter from './routes/countries.route.mjs';
import pool from './db/db.mjs';
import initDB from './db/init.mjs';

dotenv.config();

const app = express();
app.use(express.json());

// Mount countries router at /countries
app.use('/countries', countriesRouter);

// GET /status
app.get('/status', async (req, res) => {
  try {
    const [[{ total = 0 }]] = await pool.query(
      'SELECT COUNT(*) as total FROM countries'
    );
    const [rows] = await pool.query(
      'SELECT MAX(last_refreshed_at) as last_refreshed_at FROM countries'
    );
    const last =
      rows && rows[0] && rows[0].last_refreshed_at
        ? new Date(rows[0].last_refreshed_at).toISOString()
        : null;
    return res.json({ total_countries: total, last_refreshed_at: last });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Handle unknown routes (404)
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler (optional)
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// -------------------- Start server --------------------
// ✅ Ensure DB schema is initialized before starting server
initDB()
  .then(() => {
    console.log('✅ Database schema initialized');

    // Only start the server after DB is ready
    const PORT = process.env.PORT || 4300;
    app.listen(PORT, () =>
      console.log(
        `🚀 Country Currency & Exchange API running on http://localhost:${PORT}`
      )
    );
  })
  .catch((err) => {
    console.error('❌ Failed to initialize database schema:', err);
    process.exit(1); // prevent server from running if DB setup fails
  });
