const { MongoClient } = require('mongodb');

// Cache the client connection across function calls
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  // Return cached connection if available
  if (cachedClient && cachedDb) {
    try {
      // Ping to verify connection is still alive
      await cachedClient.db('admin').command({ ping: 1 });
      return { client: cachedClient, db: cachedDb };
    } catch (e) {
      // Connection died, reset cache
      cachedClient = null;
      cachedDb = null;
    }
  }

  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  const client = new MongoClient(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 10000,
    retryWrites: true,
    w: 'majority'
  });

  await client.connect();

  const dbName = process.env.MONGODB_DB_NAME || 'pavit_portfolio';
  const db = client.db(dbName);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}

// Standard CORS headers for all responses
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Content-Type': 'application/json'
  };
}

// Handle CORS preflight requests
function handleCORS() {
  return {
    statusCode: 204,
    headers: corsHeaders(),
    body: ''
  };
}

// Validate admin API key from Authorization header
function validateAdminKey(authHeader) {
  if (!authHeader) return false;
  if (!process.env.ADMIN_SECRET_KEY) return false;
  const token = authHeader.replace('Bearer ', '').trim();
  return token === process.env.ADMIN_SECRET_KEY;
}

// Convert MongoDB _id to string id for JSON responses
function formatDoc(doc) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  return { id: _id.toString(), ...rest };
}

// Format array of MongoDB docs
function formatDocs(docs) {
  return docs.map(formatDoc);
}

// Standard success response
function successResponse(data, statusCode = 200) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify({ success: true, ...data })
  };
}

// Standard error response
function errorResponse(message, statusCode = 500) {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify({ success: false, error: message })
  };
}

// Unauthorized response
function unauthorizedResponse() {
  return errorResponse('Unauthorized — Invalid or missing admin key', 401);
}

module.exports = {
  connectToDatabase,
  corsHeaders,
  handleCORS,
  validateAdminKey,
  formatDoc,
  formatDocs,
  successResponse,
  errorResponse,
  unauthorizedResponse
};
