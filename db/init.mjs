import fs from 'fs';
import mysql from 'mysql2/promise';

const initDB = async () => {
  const connection = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD,
    database: process.env.MYSQL_DATABASE,
  });

  // Create database if not exists
  await connection.query(
    `CREATE DATABASE IF NOT EXISTS \`${process.env.MYSQL_DATABASE}\`;`
  );
  await connection.query(`USE \`${process.env.MYSQL_DATABASE}\`;`);

  const schema = fs.readFileSync('./db/schema.sql', 'utf-8');
  await connection.query(schema);
  await connection.end();
};

export default initDB;
