const sql = require('mssql');
require('dotenv').config();

const dbConfig = {
  server: process.env.DB_SERVER,
  database: process.env.DB_DATABASE,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  },
  pool: { max: 30, min: 0, idleTimeoutMillis: 30000, acquireTimeoutMillis: 60000 },
  requestTimeout: 600000,
  connectionTimeout: 30000
};

let pool = null;

async function getPool() {
  if (!pool) {
    for (let i = 1; i <= 3; i++) {
      try {
        pool = await sql.connect(dbConfig);
        console.log('✅ Mobile API: Database connected');
        break;
      } catch (err) {
        console.error(`Database connection attempt ${i} failed:`, err.message);
        if (i === 3) throw err;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }
  return pool;
}

const BIT_KEYS = [
  'isuttar','isactive','isassigned','isaccepted','isread','istextchat',
  'isyantrestyle','issendbyreceiver','checkacceptedstatus','isrefreshstatus',
  'issuperadmin','islimit','isyantrto','isselfcomm','isnextdayresult',
  'isacceptedstatus','isrejectedmsg','isviewall','viewall'
];

function isBitKey(key) { return BIT_KEYS.includes(key.toLowerCase()); }

async function executeStoredProcedure(procName, params = {}) {
  const p = await getPool();
  const req = p.request();
  req.timeout = 600000;

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      req.input(key, sql.NVarChar, null);
    } else if (value instanceof Date) {
      req.input(key, sql.DateTime, value);
    } else if (typeof value === 'boolean') {
      req.input(key, sql.Bit, value ? 1 : 0);
    } else if (isBitKey(key)) {
      const v = value === 'True' || value === 'true' || value === 1 || value === true ? 1 : 0;
      req.input(key, sql.Bit, v);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        req.input(key, sql.Int, value);
      } else {
        req.input(key, sql.Decimal(18, 4), value);
      }
    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      req.input(key, sql.Date, value);
    } else {
      req.input(key, sql.NVarChar, String(value));
    }
  }

  const result = await req.execute(procName);
  return result.recordset;
}

async function executeQuery(query, params = {}) {
  const p = await getPool();
  const req = p.request();
  req.timeout = 600000;

  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      req.input(key, sql.NVarChar, null);
    } else if (value instanceof Date) {
      req.input(key, sql.DateTime, value);
    } else if (typeof value === 'boolean') {
      req.input(key, sql.Bit, value ? 1 : 0);
    } else if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        req.input(key, sql.Int, value);
      } else {
        req.input(key, sql.Decimal(18, 4), value);
      }
    } else {
      req.input(key, sql.NVarChar, String(value));
    }
  }

  const result = await req.query(query);
  return result.recordset;
}

async function executeScalar(query, params = {}) {
  const rows = await executeQuery(query, params);
  if (rows && rows.length > 0) return Object.values(rows[0])[0];
  return null;
}

module.exports = { sql, getPool, executeStoredProcedure, executeQuery, executeScalar };
