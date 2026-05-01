const { initFaunaClient, handleCORS, validateAdminKey } = require('./utils/fauna');
const faunadb = require('faunadb');
const q = faunadb.query;

exports.handler = async (event, context) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return handleCORS();
  }

  const client = initFaunaClient();
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  try {
    // GET - Fetch all projects
    if (event.httpMethod === 'GET') {
      const result = await client.query(
        q.Map(
          q.Paginate(q.Documents(q.Collection('projects'))),
          q.Lambda('ref', q.Get(q.Var('ref')))
        )
      );

      const projects = result.data.map(doc => ({
        id: doc.ref.id,
        ...doc.data
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, projects })
      };
    }

    // POST - Create new project (admin only)
    if (event.httpMethod === 'POST') {
      const authHeader = event.headers.authorization;
      if (!validateAdminKey(authHeader)) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ success: false, error: 'Unauthorized' })
        };
      }

      const data = JSON.parse(event.body);
      const project = {
        title: data.title || 'Untitled Project',
        description: data.description || '',
        icon: data.icon || '🚀',
        techStack: data.techStack || [],
        status: data.status || 'live',
        featured: data.featured || false,
        githubUrl: data.githubUrl || '',
        liveUrl: data.liveUrl || '',
        views: 0,
        likes: 0,
        createdAt: new Date().toISOString()
      };

      const result = await client.query(
        q.Create(q.Collection('projects'), { data: project })
      );

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          project: { id: result.ref.id, ...result.data }
        })
      };
    }

    // PUT - Update project
    if (event.httpMethod === 'PUT') {
      const authHeader = event.headers.authorization;
      if (!validateAdminKey(authHeader)) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ success: false, error: 'Unauthorized' })
        };
      }

      const { id, ...updateData } = JSON.parse(event.body);
      updateData.updatedAt = new Date().toISOString();

      const result = await client.query(
        q.Update(q.Ref(q.Collection('projects'), id), { data: updateData })
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          project: { id: result.ref.id, ...result.data }
        })
      };
    }

    // DELETE - Remove project
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
      await client.query(q.Delete(q.Ref(q.Collection('projects'), id)));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Project deleted' })
      };
    }

    // PATCH - Increment views/likes
    if (event.httpMethod === 'PATCH') {
      const { id, action } = JSON.parse(event.body);
      const doc = await client.query(q.Get(q.Ref(q.Collection('projects'), id)));

      const updateField = action === 'like' ? 'likes' : 'views';
      const newValue = (doc.data[updateField] || 0) + 1;

      const result = await client.query(
        q.Update(q.Ref(q.Collection('projects'), id), {
          data: { [updateField]: newValue }
        })
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          [updateField]: result.data[updateField]
        })
      };
    }

  } catch (error) {
    console.error('Projects function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
