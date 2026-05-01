const {
  connectToDatabase,
  validateAdminKey,
  successResponse,
  errorResponse
} = require('./utils/mongodb');

exports.handler = async (event) => {
  // Security check
  const { key } = event.queryStringParameters || {};
  if (!key || key !== process.env.ADMIN_SECRET_KEY) {
    return errorResponse('Forbidden — Provide ?key=YOUR_ADMIN_KEY', 403);
  }

  const results = [];
  const errors  = [];

  try {
    const { db } = await connectToDatabase();

    // ─── Create Collections with Validators ─────────────────────
    const collections = [
      {
        name: 'projects',
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['title', 'createdAt'],
            properties: {
              title:       { bsonType: 'string', maxLength: 150 },
              description: { bsonType: 'string' },
              status:      { enum: ['live', 'wip', 'archived'] },
              views:       { bsonType: 'int' },
              likes:       { bsonType: 'int' }
            }
          }
        }
      },
      {
        name: 'messages',
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['name', 'email', 'message', 'createdAt'],
            properties: {
              name:    { bsonType: 'string' },
              email:   { bsonType: 'string' },
              message: { bsonType: 'string' },
              status:  { enum: ['unread', 'read', 'replied', 'archived'] },
              type:    { enum: ['contact', 'collab', 'hire', 'feedback'] }
            }
          }
        }
      },
      { name: 'analytics' },
      { name: 'vault_products' },
      { name: 'purchase_interests' },
      { name: 'testimonials' }
    ];

    for (const col of collections) {
      try {
        const createCmd = { create: col.name };
        if (col.validator) createCmd.validator = col.validator;
        await db.createCollection(col.name, col.validator ? { validator: col.validator } : {});
        results.push(`✅ Created collection: ${col.name}`);
      } catch (e) {
        if (e.code === 48) {
          results.push(`⏭️  Already exists: ${col.name}`);
        } else {
          errors.push(`❌ Failed to create ${col.name}: ${e.message}`);
        }
      }
    }

    // ─── Create Indexes ─────────────────────────────────────────
    const indexes = [
      // Projects indexes
      {
        collection: 'projects',
        index: { status: 1, featured: -1, createdAt: -1 },
        options: { name: 'projects_status_featured' }
      },
      {
        collection: 'projects',
        index: { createdAt: -1 },
        options: { name: 'projects_createdAt' }
      },

      // Messages indexes
      {
        collection: 'messages',
        index: { status: 1, createdAt: -1 },
        options: { name: 'messages_status_date' }
      },
      {
        collection: 'messages',
        index: { email: 1 },
        options: { name: 'messages_email' }
      },
      {
        collection: 'messages',
        index: { createdAt: -1 },
        options: { name: 'messages_createdAt' }
      },

      // Analytics indexes
      {
        collection: 'analytics',
        index: { date: -1 },
        options: { name: 'analytics_date', unique: true }
      },

      // Vault indexes
      {
        collection: 'vault_products',
        index: { visible: 1, available: 1 },
        options: { name: 'vault_visible_available' }
      },
      {
        collection: 'purchase_interests',
        index: { email: 1, productId: 1 },
        options: { name: 'interests_email_product', unique: true }
      },
      {
        collection: 'purchase_interests',
        index: { createdAt: -1 },
        options: { name: 'interests_date' }
      },

      // Testimonials indexes
      {
        collection: 'testimonials',
        index: { status: 1, createdAt: -1 },
        options: { name: 'testimonials_status_date' }
      }
    ];

    for (const idx of indexes) {
      try {
        await db.collection(idx.collection).createIndex(idx.index, idx.options);
        results.push(`✅ Created index: ${idx.options.name}`);
      } catch (e) {
        if (e.code === 85 || e.code === 86) {
          results.push(`⏭️  Index exists: ${idx.options.name}`);
        } else {
          errors.push(`❌ Index failed (${idx.options.name}): ${e.message}`);
        }
      }
    }

    // ─── Seed Initial Data ───────────────────────────────────────

    // Seed Projects
    const projectsCol = db.collection('projects');
    const existingProjects = await projectsCol.countDocuments();
    if (existingProjects === 0) {
      await projectsCol.insertMany([
        {
          title:       'Smart Calculator',
          description: 'A sleek retro-futuristic calculator with full math support and beautiful neon UI',
          icon:        '🧮',
          techStack:   ['JavaScript', 'CSS Grid', 'Math API'],
          status:      'live',
          featured:    true,
          githubUrl:   '',
          liveUrl:     '',
          views:       0,
          likes:       0,
          createdAt:   new Date(),
          updatedAt:   new Date()
        },
        {
          title:       'Color Palette Generator',
          description: 'Generate beautiful random color palettes and copy hex codes instantly',
          icon:        '🎨',
          techStack:   ['JavaScript', 'Color Theory', 'CSS'],
          status:      'live',
          featured:    true,
          githubUrl:   '',
          liveUrl:     '',
          views:       0,
          likes:       0,
          createdAt:   new Date(),
          updatedAt:   new Date()
        },
        {
          title:       'Pixel Art Canvas',
          description: '16x16 pixel art canvas with touch support and preset colors',
          icon:        '🎮',
          techStack:   ['JavaScript', 'CSS Grid', 'Touch Events'],
          status:      'live',
          featured:    false,
          githubUrl:   '',
          liveUrl:     '',
          views:       0,
          likes:       0,
          createdAt:   new Date(),
          updatedAt:   new Date()
        }
      ]);
      results.push('🌱 Seeded: 3 default projects');
    } else {
      results.push(`⏭️  Projects already have ${existingProjects} document(s)`);
    }

    // Seed Vault Products
    const vaultCol = db.collection('vault_products');
    const existingVault = await vaultCol.countDocuments();
    if (existingVault === 0) {
      await vaultCol.insertMany([
        {
          title:       'Neural-Flow UI Kit',
          description: 'The exact 3D framework powering this portfolio website',
          icon:        '🧠',
          price:       49,
          badge:       'Popular 🔥',
          features:    [
            '50+ Pre-built 3D components',
            'Three.js & GSAP integration',
            'Responsive mobile-first design',
            'Neon glow effects system',
            'Dark theme engine',
            'Lifetime updates'
          ],
          interests:   0,
          available:   false,
          visible:     true,
          createdAt:   new Date(),
          updatedAt:   new Date()
        },
        {
          title:       'Python Automation Core',
          description: 'A powerful collection of Python automation scripts',
          icon:        '🐍',
          price:       29,
          badge:       'New ✨',
          features:    [
            'File system automation',
            'Web scraping toolkit',
            'Data processing pipelines',
            'Email automation suite',
            'CLI tool generator'
          ],
          interests:   0,
          available:   false,
          visible:     true,
          createdAt:   new Date(),
          updatedAt:   new Date()
        }
      ]);
      results.push('🌱 Seeded: 2 vault products');
    } else {
      results.push(`⏭️  Vault already has ${existingVault} product(s)`);
    }

    // Seed Testimonials
    const testimonialsCol = db.collection('testimonials');
    const existingTestimonials = await testimonialsCol.countDocuments();
    if (existingTestimonials === 0) {
      await testimonialsCol.insertMany([
        {
          name:      'Mom',
          role:      'Chief Worry Officer',
          text:      "He hasn't come out of his room in 3 days. I slide food under the door. At least the glowing monitor tells me he's alive.",
          avatar:    '👩',
          rating:    5,
          status:    'approved',
          createdAt: new Date()
        },
        {
          name:      'Coffee Machine',
          role:      'Overworked Employee',
          text:      'I have never been used this much in my lifecycle. This kid runs me 24/7. I am filing a complaint with the appliance union.',
          avatar:    '☕',
          rating:    4,
          status:    'approved',
          createdAt: new Date()
        },
        {
          name:      'The Bugs',
          role:      'Terrified Collective',
          text:      'We tried. We showed up in line 47, line 203, the imports. He found us every single time. We moved to someone else\'s codebase.',
          avatar:    '🐛',
          rating:    1,
          status:    'approved',
          createdAt: new Date()
        }
      ]);
      results.push('🌱 Seeded: 3 default testimonials');
    } else {
      results.push(`⏭️  Testimonials already have ${existingTestimonials} document(s)`);
    }

    return successResponse({
      message: '🚀 MongoDB database setup complete!',
      database: process.env.MONGODB_DB_NAME || 'pavit_portfolio',
      results,
      errors,
      nextSteps: [
        'Visit /admin to access your dashboard',
        'Add more projects from the admin panel',
        'Share your site and watch analytics come in!'
      ]
    });

  } catch (err) {
    console.error('Setup error:', err);
    return errorResponse(`Setup failed: ${err.message}`);
  }
};
