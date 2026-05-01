// Run this ONCE to set up your FaunaDB collections and indexes
// Visit: /.netlify/functions/setup?init=true&key=YOUR_ADMIN_KEY

const faunadb = require('faunadb');
const q = faunadb.query;

exports.handler = async (event) => {
  const { init, key } = event.queryStringParameters || {};
  const headers = { 'Content-Type': 'application/json' };

  if (!init || key !== process.env.ADMIN_SECRET_KEY) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: 'Forbidden. Provide ?init=true&key=YOUR_ADMIN_KEY' })
    };
  }

  const client = new faunadb.Client({
    secret: process.env.FAUNA_SECRET_KEY
  });

  const results = [];
  const errors = [];

  // Helper to safely create
  async function safeCreate(name, query) {
    try {
      await client.query(query);
      results.push(`✅ Created: ${name}`);
    } catch (e) {
      if (e.message?.includes('already exists') || e.description?.includes('already exists')) {
        results.push(`⏭️ Already exists: ${name}`);
      } else {
        errors.push(`❌ Failed: ${name} — ${e.message}`);
      }
    }
  }

  // Create Collections
  await safeCreate('Collection: projects',
    q.CreateCollection({ name: 'projects' }));

  await safeCreate('Collection: messages',
    q.CreateCollection({ name: 'messages' }));

  await safeCreate('Collection: analytics',
    q.CreateCollection({ name: 'analytics' }));

  await safeCreate('Collection: vault_products',
    q.CreateCollection({ name: 'vault_products' }));

  await safeCreate('Collection: purchase_interests',
    q.CreateCollection({ name: 'purchase_interests' }));

  await safeCreate('Collection: testimonials',
    q.CreateCollection({ name: 'testimonials' }));

  // Wait for collections to be ready
  await new Promise(r => setTimeout(r, 2000));

  // Create Indexes
  await safeCreate('Index: messages_by_status',
    q.CreateIndex({
      name: 'messages_by_status',
      source: q.Collection('messages'),
      terms: [{ field: ['data', 'status'] }]
    }));

  await safeCreate('Index: analytics_by_date',
    q.CreateIndex({
      name: 'analytics_by_date',
      source: q.Collection('analytics'),
      terms: [{ field: ['data', 'date'] }],
      unique: true
    }));

  await safeCreate('Index: testimonials_by_status',
    q.CreateIndex({
      name: 'testimonials_by_status',
      source: q.Collection('testimonials'),
      terms: [{ field: ['data', 'status'] }]
    }));

  await safeCreate('Index: vault_by_available',
    q.CreateIndex({
      name: 'vault_by_available',
      source: q.Collection('vault_products'),
      terms: [{ field: ['data', 'available'] }]
    }));

  // Seed initial data
  try {
    // Seed a default project
    await client.query(
      q.Create(q.Collection('projects'), {
        data: {
          title: 'Smart Calculator',
          description: 'A sleek retro-futuristic calculator with full math support',
          icon: '🧮',
          techStack: ['JavaScript', 'CSS Grid'],
          status: 'live',
          featured: true,
          views: 0,
          likes: 0,
          createdAt: new Date().toISOString()
        }
      })
    );
    results.push('🌱 Seeded: Default project');
  } catch (e) {
    errors.push('Could not seed project: ' + e.message);
  }

  // Seed vault products
  try {
    await client.query(
      q.Create(q.Collection('vault_products'), {
        data: {
          title: 'Neural-Flow UI Kit',
          description: 'The exact 3D framework powering this website',
          icon: '🧠',
          price: 49,
          badge: 'Popular 🔥',
          features: [
            '50+ Pre-built 3D components',
            'Three.js & GSAP integration',
            'Responsive mobile-first',
            'Neon glow effects system',
            'Dark theme engine'
          ],
          interests: 0,
          available: false,
          createdAt: new Date().toISOString()
        }
      })
    );
    results.push('🌱 Seeded: Neural-Flow UI Kit');
  } catch (e) {
    errors.push('Could not seed vault: ' + e.message);
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      success: errors.length === 0,
      message: '🚀 Database setup complete!',
      results,
      errors
    }, null, 2)
  };
};
