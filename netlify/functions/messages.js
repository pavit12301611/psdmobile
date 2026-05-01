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
    const collection = db.collection('messages');

    // ─── POST: Submit a contact message (public) ────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      // Validation
      const errors = [];
      if (!body.name?.trim()) errors.push('Name is required');
      if (!body.email?.trim()) errors.push('Email is required');
      if (!body.message?.trim()) errors.push('Message is required');

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (body.email && !emailRegex.test(body.email)) {
        errors.push('Invalid email format');
      }

      if (errors.length > 0) {
        return errorResponse(errors.join(', '), 400);
      }

      // Simple spam check — block messages under 10 chars
      if (body.message.trim().length < 10) {
        return errorResponse('Message is too short', 400);
      }

      const message = {
        name:      body.name.trim().slice(0, 100),
        email:     body.email.trim().toLowerCase().slice(0, 200),
        subject:   (body.subject || 'No Subject').trim().slice(0, 200),
        message:   body.message.trim().slice(0, 3000),
        type:      ['contact', 'collab', 'hire', 'feedback'].includes(body.type)
                     ? body.type : 'contact',
        status:    'unread',
        ip:        event.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown',
        userAgent: (event.headers['user-agent'] || 'unknown').slice(0, 300),
        createdAt: new Date()
      };

      const result = await collection.insertOne(message);

      return successResponse({
        message: "Message sent! Pavit will get back to you soon 🚀",
        id: result.insertedId.toString()
      }, 201);
    }

    // ─── GET: Fetch messages (admin only) ───────────────────────
    if (event.httpMethod === 'GET') {
      if (!validateAdminKey(event.headers.authorization)) {
        return unauthorizedResponse();
      }

      const { status, type, limit = '100', skip = '0' } = event.queryStringParameters || {};

      const filter = {};
      if (status) filter.status = status;
      if (type) filter.type = type;

      const [messages, total, unreadCount] = await Promise.all([
        collection
          .find(filter)
          .sort({ createdAt: -1 })
          .skip(parseInt(skip))
          .limit(parseInt(limit))
          .toArray(),
        collection.countDocuments(filter),
        collection.countDocuments({ status: 'unread' })
      ]);

      return successResponse({
        messages: formatDocs(messages),
        total,
        unreadCount
      });
    }

    // ─── PATCH: Update message status (admin only) ──────────────
    if (event.httpMethod === 'PATCH') {
      if (!validateAdminKey(event.headers.authorization)) {
        return unauthorizedResponse();
      }

      const body = JSON.parse(event.body || '{}');
      if (!body.id) return errorResponse('Message ID is required', 400);

      const validStatuses = ['unread', 'read', 'replied', 'archived'];
      const status = validStatuses.includes(body.status) ? body.status : 'read';

      await collection.updateOne(
        { _id: new ObjectId(body.id) },
        {
          $set: {
            status,
            updatedAt: new Date(),
            ...(status === 'read' ? { readAt: new Date() } : {}),
            ...(status === 'replied' ? { repliedAt: new Date() } : {})
          }
        }
      );

      return successResponse({ message: `Message marked as ${status}` });
    }

    // ─── DELETE: Delete message (admin only) ────────────────────
    if (event.httpMethod === 'DELETE') {
      if (!validateAdminKey(event.headers.authorization)) {
        return unauthorizedResponse();
      }

      const body = JSON.parse(event.body || '{}');
      if (!body.id) return errorResponse('Message ID is required', 400);

      await collection.deleteOne({ _id: new ObjectId(body.id) });
      return successResponse({ message: 'Message deleted' });
    }

    return errorResponse('Method not allowed', 405);

  } catch (err) {
    console.error('Messages function error:', err);
    return errorResponse(err.message);
  }
};
