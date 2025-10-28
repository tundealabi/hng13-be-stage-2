import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import pool from '../db/db.mjs';
import {
  fetchExternalData,
  pickCurrencyCode,
  computeEstimatedGdp,
  generateSummaryImage,
} from '../services/refresh.service.mjs';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// POST /countries/refresh
router.post('/refresh', async (req, res) => {
  let conn;
  try {
    // Fetch external data first
    const { countries, rates } = await fetchExternalData();

    // Build rows to upsert
    const items = countries.map((c) => {
      const name = c.name || null;
      const capital = c.capital || null;
      const region = c.region || null;
      const population = Number.isFinite(c.population) ? c.population : 0;
      const flag_url = c.flag || null;

      const currency_code = pickCurrencyCode(c.currencies);
      // If currency_code exists, attempt to find exchange rate in rates (rates keyed by currency code)
      const exchange_rate = currency_code ? rates[currency_code] ?? null : null;

      let estimated_gdp;
      if (!currency_code) {
        estimated_gdp = 0;
      } else if (exchange_rate === null) {
        estimated_gdp = null;
      } else {
        estimated_gdp = computeEstimatedGdp(population, exchange_rate, true);
      }

      return {
        name,
        name_lower: name ? name.toLowerCase() : null,
        capital,
        region,
        population,
        currency_code,
        exchange_rate,
        estimated_gdp,
        flag_url,
      };
    });

    // Start DB transaction
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const lastRefreshedAt = new Date();

    // Upsert each item: match by name_lower
    // We'll use INSERT ... ON DUPLICATE KEY UPDATE
    // Prepare one statement
    const upsertSql = `
      INSERT INTO countries (name, name_lower, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        capital = VALUES(capital),
        region = VALUES(region),
        population = VALUES(population),
        currency_code = VALUES(currency_code),
        exchange_rate = VALUES(exchange_rate),
        estimated_gdp = VALUES(estimated_gdp),
        flag_url = VALUES(flag_url),
        last_refreshed_at = VALUES(last_refreshed_at)
    `;

    for (const it of items) {
      // Validate required fields (name, population). currency_code may be null
      if (!it.name || it.population === null || it.population === undefined) {
        // skip invalid record, but spec wants to store countries even if currency missing; name/population are required by validation
        // If name or population missing, skip this country
        continue;
      }

      await conn.execute(upsertSql, [
        it.name,
        it.name_lower,
        it.capital,
        it.region,
        it.population,
        it.currency_code,
        it.exchange_rate,
        it.estimated_gdp,
        it.flag_url,
        lastRefreshedAt,
      ]);
    }

    // After upserting, query all countries to build summary image
    const [rows] = await conn.query(
      'SELECT name, currency_code, exchange_rate, estimated_gdp FROM countries'
    );

    // Generate image (SVG -> PNG using sharp)
    await generateSummaryImage(rows, lastRefreshedAt);

    // Commit
    await conn.commit();

    return res.status(200).json({
      message: 'Refreshed successfully',
      total: rows.length,
      last_refreshed_at: lastRefreshedAt.toISOString(),
    });
  } catch (err) {
    // Rollback if we have a connection in transaction
    if (conn) {
      try {
        await conn.rollback();
      } catch (e) {}
      conn.release();
    }

    // If err is external fetch error thrown by fetchExternalData:
    if (err && err.which) {
      return res.status(503).json({
        error: 'External data source unavailable',
        details: `Could not fetch data from ${err.which} API`,
      });
    }

    console.error('Refresh error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (conn)
      try {
        conn.release();
      } catch (e) {}
  }
});

// GET /countries  (filters & sorting)
router.get('/', async (req, res) => {
  try {
    const { region, currency, sort } = req.query;
    const params = [];
    let where = '';
    if (region) {
      where += (where ? ' AND ' : ' WHERE ') + 'region = ?';
      params.push(region);
    }
    if (currency) {
      where += (where ? ' AND ' : ' WHERE ') + 'currency_code = ?';
      params.push(currency.toUpperCase());
    }
    let orderBy = '';
    if (sort === 'gdp_desc') {
      orderBy = ' ORDER BY estimated_gdp DESC';
    } else if (sort === 'gdp_asc') {
      orderBy = ' ORDER BY estimated_gdp ASC';
    } else {
      orderBy = '';
    }

    const sql = `SELECT id, name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at FROM countries ${where} ${orderBy}`;
    const [rows] = await pool.query(sql, params);

    // Map last_refreshed_at to ISO
    const data = rows.map((r) => ({
      ...r,
      last_refreshed_at: r.last_refreshed_at
        ? new Date(r.last_refreshed_at).toISOString()
        : null,
    }));

    return res.json(data);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /countries/image
router.get('/image', async (req, res) => {
  try {
    const imagePath = process.env.REFRESH_IMAGE_PATH || './cache/summary.png';
    try {
      await fs.access(imagePath); // throws if not exists
      return res.sendFile(path.resolve(imagePath));
    } catch (e) {
      return res.status(404).json({ error: 'Summary image not found' });
    }
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /countries/:name
router.get('/:name', async (req, res) => {
  try {
    const nameParam = req.params.name;
    const nameLower = nameParam.toLowerCase();
    const [rows] = await pool.query(
      'SELECT id, name, capital, region, population, currency_code, exchange_rate, estimated_gdp, flag_url, last_refreshed_at FROM countries WHERE name_lower = ?',
      [nameLower]
    );
    if (!rows || rows.length === 0)
      return res.status(404).json({ error: 'Country not found' });

    const r = rows[0];
    r.last_refreshed_at = r.last_refreshed_at
      ? new Date(r.last_refreshed_at).toISOString()
      : null;
    return res.json(r);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /countries/:name
router.delete('/:name', async (req, res) => {
  try {
    const nameLower = req.params.name.toLowerCase();
    const [result] = await pool.query(
      'DELETE FROM countries WHERE name_lower = ?',
      [nameLower]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Country not found' });
    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
