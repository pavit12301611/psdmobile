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
    // GET - Fetch all vault products
    if (event.httpMethod === 'GET') {
      const result = await client.query(
        q.Map(
          q.Paginate(q.Documents(q.Collection('vault_products'))),
          q.Lambda('ref', q.Get(q.Var('ref')))
        )
      );

      const products = result.data.map(doc => ({
        id: doc.ref.id,
        ...doc.data
      }));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, products })
      };
    }

    // POST - Purchase interest (not actual payment)
    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body);

      if (!data.productId || !data.email) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ success: false, error: 'Product ID and email required' })
        };
      }

      const interest = {
        productId: data.productId,
        productName: data.productName || 'Unknown',
        email: data.email,
        name: data.name || 'Anonymous',
        message: data.message || '',
        status: 'interested',
        createdAt: new Date().toISOString()
      };

      const result = await client.query(
        q.Create(q.Collection('purchase_interests'), { data: interest })
      );

      // Update product interest count
      try {
        const product = await client.query(
          q.Get(q.Ref(q.Collection('vault_products'), data.productId))
        );
        await client.query(
          q.Update(q.Ref(q.Collection('vault_products'), data.productId), {
            data: { interests: (product.data.interests || 0) + 1 }
          })
        );
      } catch (e) { /* Product might not exist yet */ }

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify({
          success: true,
          message: "Thanks for your interest! Pavit will email you when it's ready 🚀",
          id: result.ref.id
        })
      };
    }

    // PUT - Create/Update vault product (admin)
    if (event.httpMethod === 'PUT') {
      const authHeader = event.headers.authorization;
      if (!validateAdminKey(authHeader)) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ success: false, error: 'Unauthorized' })
        };
      }

      const data = JSON.parse(event.body);

      if (data.id) {
        // Update existing
        const { id, ...updateData } = data;
        const result = await client.query(
          q.Update(q.Ref(q.Collection('vault_products'), id), {
            data: { ...updateData, updatedAt: new Date().toISOString() }
          })
        );
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({
            success: true,
            product: { id: result.ref.id, ...result.data }
          })
        };
      } else {
        // Create new
        const product = {
          title: data.title,
          description: data.description,
          icon: data.icon || '📦',
          price: data.price || 0,
          badge: data.badge || 'New',
          features: data.features || [],
          interests: 0,
          available: data.available || false,
          createdAt: new Date().toISOString()
        };
        const result = await client.query(
          q.Create(q.Collection('vault_products'), { data: product })
        );
        return {
          statusCode: 201,
          headers,
          body: JSON.stringify({
            success: true,
            product: { id: result.ref.id, ...result.data }
          })
        };
      }
    }

    // GET interests (admin)
    if (event.httpMethod === 'GET' &&
        event.queryStringParameters?.type === 'interests') {
      const authHeader = event.headers.authorization;
      if (!validateAdminKey(authHeader)) {
        return { statusCode: 401, headers, body: JSON.stringify({ success: false }) };
      }

      const result = await client.query(
        q.Map(
          q.Paginate(q.Documents(q.Collection('purchase_interests'))),
          q.Lambda('ref', q.Get(q.Var('ref')))
        )
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          interests: result.data.map(d => ({ id: d.ref.id, ...d.data }))
        })
      };
    }

  } catch (error) {
    console.error('Vault function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
