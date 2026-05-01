const faunadb = require('faunadb');

function initFaunaClient() {
  if (!process.env.FAUNA_SECRET_KEY) {
    throw new Error('FAUNA_SECRET_KEY environment variable not set');
  }
  return new faunadb.Client({
    secret: process.env.FAUNA_SECRET_KEY,
    timeout: 30
  });
}

function handleCORS() {
  return {
    statusCode: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
    },
    body: ''
  };
}

function validateAdminKey(authHeader) {
  if (!authHeader) return false;
  const token = authHeader.replace('Bearer ', '').trim();
  return token === process.env.ADMIN_SECRET_KEY;
}

module.exports = { initFaunaClient, handleCORS, validateAdminKey };
