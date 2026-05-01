const { initFaunaClient, handleCORS, validateAdminKey } = require('./utils/fauna');
const faunadb = require('faunadb');
const q = faunadb.query;

exports.handler = async (event, context) => {
  if (event.httpMethod === 'OPTIONS') return handleCORS();

  const client = initFaunaClient();
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    // POST - Submit contact message
    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body);

      // Basic validation
      if (!data.name || !data.email || !data.message) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({
            success: false,
            error: 'Name, email, and message are required'
          })
        };
      }

      // Email format validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(data.email)) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Invalid email format' })
        };
      }

      const message = {
        name: data.name.slice(0, 100),
        email: data.email.slice(0, 200),
        subject: (data.subject || 'No Subject').slice(0, 200),
        message: data.message.slice(0, 2000),
        type: data.type || 'contact', // contact, collab, hire
        status: 'unread',
        ip: event.headers['x-forwarded-for'] || 'unknown',
        userAgent: event.headers['user-agent'] || 'unknown',
        createdAt: new Date().toISOString()
      };

      const result = await client.query(
        q.Create(q.Collection('messages'), { data: message })
      );

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Message sent! Pavit will get back to you soon 🚀',
          id: result.ref.id
        })
      };
    }

    // GET - Fetch messages (admin only)
    if (event.httpMethod === 'GET') {
      const authHeader = event.headers.authorization;
      if (!validateAdminKey(authHeader)) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ success: false, error: 'Unauthorized' })
        };
      }

      const { filter } = event.queryStringParameters || {};
      let query;

      if (filter === 'unread') {
        query = q.Map(
          q.Paginate(q.Match(q.Index('messages_by_status'), 'unread')),
          q.Lambda('ref', q.Get(q.Var('ref')))
        );
      } else {
        query = q.Map(
          q.Paginate(q.Documents(q.Collection('messages')), { size: 100 }),
          q.Lambda('ref', q.Get(q.Var('ref')))
        );
      }

      const result = await client.query(query);
      const messages = result.data.map(doc => ({
        id: doc.ref.id,
        ...doc.data
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, messages, count: messages.length })
      };
    }

    // PATCH - Mark message as read
    if (event.httpMethod === 'PATCH') {
      const authHeader = event.headers.authorization;
      if (!validateAdminKey(authHeader)) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ success: false, error: 'Unauthorized' })
        };
      }

      const { id, status } = JSON.parse(event.body);
      await client.query(
        q.Update(q.Ref(q.Collection('messages'), id), {
          data: { status: status || 'read', readAt: new Date().toISOString() }
        })
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    // DELETE - Delete message
    if (event.httpMethod === 'DELETE') {
      const authHeader = event.headers.authorization;
      if (!validateAdminKey(authHeader)) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ success: false, error: 'Unauthorized' })
        };
      }

      const { id } = JSON.parse(event.body);
      await client.query(q.Delete(q.Ref(q.Collection('messages'), id)));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Message deleted' })
      };
    }

  } catch (error) {
    console.error('Messages function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
