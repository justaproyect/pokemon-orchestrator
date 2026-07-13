const { MongoClient } = require('mongodb');
const config = require('./config');

let client = null;
let db = null;

async function connect() {
  if (db) return db;

  try {
    client = new MongoClient(config.MONGO_URI);
    await client.connect();
    db = client.db(config.MONGO_DB);
    console.log('[MONGO] Conectado a', config.MONGO_DB);

    await db.collection('plans').createIndex({ date: 1, status: 1 });
    await db.collection('generated_content').createIndex({ date: 1, status: 1 });
    await db.collection('generated_content').createIndex({ postId: 1 });
    await db.collection('delivery_log').createIndex({ date: 1, groupType: 1 });
    await db.collection('delivery_log').createIndex({ sentAt: -1 });
    await db.collection('analytics').createIndex({ date: 1, groupType: 1 });
    await db.collection('trends').createIndex({ fetchedAt: -1 });

    return db;
  } catch (e) {
    console.error('[MONGO] Error:', e.message);
    throw e;
  }
}

function getDb() {
  if (!db) throw new Error('MongoDB no conectado');
  return db;
}

async function close() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = { connect, getDb, close };
