import fs from 'fs';
import mysql from 'mysql2/promise';

const { MYSQL_HOST, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE } = process.env;

const initDB = async () => {
  //Connect without specifying a DB
  const initialConnection = await mysql.createConnection({
    host: MYSQL_HOST,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
  });

  // Create database if not exists
  await initialConnection.query(
    `CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\`;`
  );
  await initialConnection.end();

  // Connect to the specific database to set up schema
  const connection = await mysql.createConnection({
    host: MYSQL_HOST,
    user: MYSQL_USER,
    password: MYSQL_PASSWORD,
    database: MYSQL_DATABASE,
  });

  const schema = fs.readFileSync('./db/schema.sql', 'utf-8');
  await connection.query(schema);
  await connection.end();
};

export default initDB;
