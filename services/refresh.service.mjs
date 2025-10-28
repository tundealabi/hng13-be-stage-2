import fetch from 'node-fetch';
import pool from '../db.mjs';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

dotenv.config();

const COUNTRIES_API = process.env.COUNTRIES_API;
const EXCHANGE_API = process.env.EXCHANGE_API;
const IMAGE_PATH =
  process.env.REFRESH_IMAGE_PATH ||
  path.join(process.cwd(), 'cache', 'summary.png');

function randMultiplier() {
  // random integer between 1000 and 2000 inclusive
  return Math.floor(Math.random() * (2000 - 1000 + 1)) + 1000;
}

// compute estimated_gdp with the rules provided
function computeEstimatedGdp(population, exchangeRate, hasCurrency) {
  if (!hasCurrency) {
    return 0; // countries without currency -> estimated_gdp = 0
  }
  if (exchangeRate === null || exchangeRate === undefined) {
    return null; // currency exists but no exchange rate found -> estimated_gdp = null
  }
  const m = randMultiplier();
  return (population * m) / exchangeRate;
}

async function fetchExternalData() {
  // fetch both endpoints in parallel
  const [countriesRes, ratesRes] = await Promise.all([
    fetch(COUNTRIES_API),
    fetch(EXCHANGE_API),
  ]);

  if (!countriesRes.ok) {
    const text = await countriesRes.text().catch(() => null);
    throw {
      which: 'countries',
      message: `countries API failed: ${countriesRes.status} ${
        countriesRes.statusText
      } ${text || ''}`,
    };
  }
  if (!ratesRes.ok) {
    const text = await ratesRes.text().catch(() => null);
    throw {
      which: 'rates',
      message: `exchange API failed: ${ratesRes.status} ${
        ratesRes.statusText
      } ${text || ''}`,
    };
  }

  const countries = await countriesRes.json();
  const ratesJson = await ratesRes.json();
  // The rates API returns an object with 'rates' property and a base of USD — see the API
  const rates = ratesJson && ratesJson.rates ? ratesJson.rates : null;

  if (!rates) {
    throw { which: 'rates', message: 'Invalid exchange rates payload' };
  }

  return { countries, rates };
}

function pickCurrencyCode(currencies) {
  if (!Array.isArray(currencies) || currencies.length === 0) return null;
  const first = currencies[0];
  if (!first || !first.code) return null;
  return first.code.toUpperCase();
}

async function generateSummaryImage(rows, lastRefreshedAt) {
  // rows: array of country objects from DB or computed items with estimated_gdp
  // Build an SVG string summarizing total count and top 5 by estimated_gdp
  const total = rows.length;
  // filter out null estimated_gdp and sort
  const top = rows
    .filter(
      (r) =>
        typeof r.estimated_gdp === 'number' && !Number.isNaN(r.estimated_gdp)
    )
    .sort((a, b) => b.estimated_gdp - a.estimated_gdp)
    .slice(0, 5);

  const lines = [
    `<text x="20" y="40" font-size="20">Total countries: ${total}</text>`,
    `<text x="20" y="70" font-size="16">Last refreshed: ${new Date(
      lastRefreshedAt
    ).toISOString()}</text>`,
    `<text x="20" y="100" font-size="16">Top ${top.length} by estimated GDP:</text>`,
  ];

  let y = 130;
  for (const t of top) {
    const est = Number(t.estimated_gdp).toFixed(2);
    const display = `${t.name} — ${t.currency_code || 'N/A'} — est_gdp: ${est}`;
    lines.push(
      `<text x="30" y="${y}" font-size="14">${escapeXml(display)}</text>`
    );
    y += 24;
  }

  const svgWidth = 900;
  const svgHeight = Math.max(200, y + 20);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}">
    <rect width="100%" height="100%" fill="#fff"/>
    ${lines.join('\n')}
  </svg>`;

  // Ensure cache directory exists
  const outDir = path.dirname(IMAGE_PATH);
  await fs.mkdir(outDir, { recursive: true });

  // Convert SVG to PNG using sharp and write to IMAGE_PATH
  const buffer = Buffer.from(svg);
  await sharp(buffer).png().toFile(IMAGE_PATH);

  return IMAGE_PATH;
}

function escapeXml(unsafe) {
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export {
  fetchExternalData,
  pickCurrencyCode,
  computeEstimatedGdp,
  generateSummaryImage,
};
