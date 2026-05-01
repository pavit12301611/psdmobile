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
    // GET - Fetch approved testimonials
    if (event.httpMethod === 'GET') {
      const authHeader = event.headers.authorization;
      const isAdmin = validateAdminKey(authHeader);

      let result;
      if (isAdmin) {
        result = await client.query(
          q.Map(
            q.Paginate(q.Documents(q.Collection('testimonials'))),
            q.Lambda('ref', q.Get(q.Var('ref')))
          )
        );
      } else {
        result = await client.query(
          q.Map(
            q.Paginate(q.Match(q.Index('testimonials_by_status'), 'approved')),
            q.Lambda('ref', q.Get(q.Var('ref')))
          )
        );
      }

      const testimonials = result.data.map(doc => ({
        id: doc.ref.id,
        ...doc.data
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, testimonials })
      };
    }

    // POST - Submit testimonial
    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body);

      if (!data.name || !data.text) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Name and testimonial text required' })
        };
      }

      const testimonial = {
        name: data.name.slice(0, 100),
        role: (data.role || 'Developer').slice(0, 100),
        text: data.text.slice(0, 500),
        avatar: data.avatar || '👤',
        rating: Math.min(5, Math.max(1, parseInt(data.rating) || 5)),
        status: 'pending', // pending, approved, rejected
        createdAt: new Date().toISOString()
      };

      const result = await client.query(
        q.Create(q.Collection('testimonials'), { data: testimonial })
      );

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          message: 'Testimonial submitted! Awaiting approval 🙌',
          id: result.ref.id
        })
      };
    }

    // PATCH - Approve/reject testimonial (admin)
    if (event.httpMethod === 'PATCH') {
      const authHeader = event.headers.authorization;
      if (!validateAdminKey(authHeader)) {
        return { statusCode: 401, headers, body: JSON.stringify({ success: false }) };
      }

      const { id, status } = JSON.parse(event.body);
      await client.query(
        q.Update(q.Ref(q.Collection('testimonials'), id), {
          data: { status, reviewedAt: new Date().toISOString() }
        })
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: `Testimonial ${status}` })
      };
    }

    // DELETE - Remove testimonial (admin)
    if (event.httpMethod === 'DELETE') {
      const authHeader = event.headers.authorization;
      if (!validateAdminKey(authHeader)) {
        return { statusCode: 401, headers, body: JSON.stringify({ success: false }) };
      }

      const { id } = JSON.parse(event.body);
      await client.query(q.Delete(q.Ref(q.Collection('testimonials'), id)));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

  } catch (error) {
    console.error('Testimonials function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
