const { ObjectId } = require('mongodb');
const {
  connectToDatabase,
  handleCORS,
  validateAdminKey,
  formatDoc,
  formatDocs,
  successResponse,
  errorResponse,
  unauthorizedResponse
} = require('./utils/mongodb');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleCORS();

  try {
    const { db } = await connectToDatabase();
    const productsCol  = db.collection('vault_products');
    const interestsCol = db.collection('purchase_interests');

    // ─── GET: Fetch products or interests ───────────────────────
    if (event.httpMethod === 'GET') {
      const { type } = event.queryStringParameters || {};

      // Get purchase interests — admin only
      if (type === 'interests') {
        if (!validateAdminKey(event.headers.authorization)) {
          return unauthorizedResponse();
        }
        const interests = await interestsCol
          .find({})
          .sort({ createdAt: -1 })
          .toArray();
        return successResponse({ interests: formatDocs(interests) });
      }

      // Get all products — public
      const isAdmin = validateAdminKey(event.headers.authorization);
      const filter  = isAdmin ? {} : { visible: true };

      const products = await productsCol
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      return successResponse({ products: formatDocs(products) });
    }

    // ─── POST: Register purchase interest (public) ───────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      if (!body.productId || !body.email) {
        return errorResponse('Product ID and email are required', 400);
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return errorResponse('Invalid email format', 400);
      }

      // Check for duplicate interest
      const existing = await interestsCol.findOne({
        productId: body.productId,
        email: body.email.toLowerCase()
      });

      if (existing) {
        return successResponse({
          message: "You're already on the list! Pavit will email you 📬"
        });
      }

      const interest = {
        productId:   body.productId,
        productName: (body.productName || 'Unknown Product').slice(0, 200),
        email:       body.email.trim().toLowerCase().slice(0, 200),
        name:        (body.name || 'Anonymous').trim().slice(0, 100),
        message:     (body.message || '').trim().slice(0, 500),
        status:      'interested',
        createdAt:   new Date()
      };

      const result = await interestsCol.insertOne(interest);

      // Increment interest count on product
      try {
        await productsCol.updateOne(
          { _id: new ObjectId(body.productId) },
          { $inc: { interests: 1 } }
        );
      } catch (e) { /* Product may not have ObjectId format */ }

      return successResponse({
        message: "🚀 You're on the list! Pavit will email you when it's ready.",
        id: result.insertedId.toString()
      }, 201);
    }

    // ─── PUT: Create or update vault product (admin only) ────────
    if (event.httpMethod === 'PUT') {
      if (!validateAdminKey(event.headers.authorization)) {
        return unauthorizedResponse();
      }

      const body = JSON.parse(event.body || '{}');

      if (body.id) {
        // Update existing product
        const { id, ...updateFields } = body;
        delete updateFields._id;
        updateFields.updatedAt = new Date();

        await productsCol.updateOne(
          { _id: new ObjectId(id) },
          { $set: updateFields }
        );

        const updated = await productsCol.findOne({ _id: new ObjectId(id) });
        return successResponse({ product: formatDoc(updated) });
      }

      // Create new product
      if (!body.title) return errorResponse('Product title is required', 400);

      const product = {
        title:       body.title.slice(0, 200),
        description: (body.description || '').slice(0, 1000),
        icon:        body.icon || '📦',
        price:       parseFloat(body.price) || 0,
        badge:       (body.badge || 'New').slice(0, 50),
        features:    Array.isArray(body.features) ? body.features : [],
        interests:   0,
        available:   Boolean(body.available),
        visible:     Boolean(body.visible !== false),
        createdAt:   new Date(),
        updatedAt:   new Date()
      };

      const result = await productsCol.insertOne(product);
      const inserted = await productsCol.findOne({ _id: result.insertedId });

      return successResponse({ product: formatDoc(inserted) }, 201);
    }

    // ─── DELETE: Remove product (admin only) ─────────────────────
    if (event.httpMethod === 'DELETE') {
      if (!validateAdminKey(event.headers.authorization)) {
        return unauthorizedResponse();
      }

      const body = JSON.parse(event.body || '{}');
      if (!body.id) return errorResponse('Product ID is required', 400);

      await productsCol.deleteOne({ _id: new ObjectId(body.id) });
      return successResponse({ message: 'Product deleted' });
    }

    return errorResponse('Method not allowed', 405);

  } catch (err) {
    console.error('Vault function error:', err);
    return errorResponse(err.message);
  }
};
