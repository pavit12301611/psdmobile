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
    const collection = db.collection('testimonials');

    // ─── GET: Fetch testimonials ─────────────────────────────────
    if (event.httpMethod === 'GET') {
      const isAdmin = validateAdminKey(event.headers.authorization);

      // Admin sees all, public sees only approved
      const filter = isAdmin ? {} : { status: 'approved' };

      const testimonials = await collection
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      return successResponse({ testimonials: formatDocs(testimonials) });
    }

    // ─── POST: Submit a testimonial (public) ────────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');

      if (!body.name?.trim()) return errorResponse('Name is required', 400);
      if (!body.text?.trim()) return errorResponse('Testimonial text is required', 400);
      if (body.text.trim().length < 15) {
        return errorResponse('Testimonial is too short (min 15 characters)', 400);
      }

      const testimonial = {
        name:      body.name.trim().slice(0, 100),
        role:      (body.role || 'Developer').trim().slice(0, 100),
        text:      body.text.trim().slice(0, 600),
        avatar:    (body.avatar || '👤').slice(0, 10),
        rating:    Math.min(5, Math.max(1, parseInt(body.rating) || 5)),
        status:    'pending',
        createdAt: new Date()
      };

      const result = await collection.insertOne(testimonial);

      return successResponse({
        message: '🙌 Testimonial submitted! Awaiting approval from Pavit.',
        id: result.insertedId.toString()
      }, 201);
    }

    // ─── PATCH: Approve or reject testimonial (admin only) ───────
    if (event.httpMethod === 'PATCH') {
      if (!validateAdminKey(event.headers.authorization)) {
        return unauthorizedResponse();
      }

      const body = JSON.parse(event.body || '{}');
      if (!body.id) return errorResponse('Testimonial ID is required', 400);

      const validStatuses = ['approved', 'rejected', 'pending'];
      const status = validStatuses.includes(body.status) ? body.status : 'approved';

      await collection.updateOne(
        { _id: new ObjectId(body.id) },
        {
          $set: {
            status,
            reviewedAt: new Date()
          }
        }
      );

      return successResponse({ message: `Testimonial ${status} successfully` });
    }

    // ─── DELETE: Remove testimonial (admin only) ─────────────────
    if (event.httpMethod === 'DELETE') {
      if (!validateAdminKey(event.headers.authorization)) {
        return unauthorizedResponse();
      }

      const body = JSON.parse(event.body || '{}');
      if (!body.id) return errorResponse('Testimonial ID is required', 400);

      await collection.deleteOne({ _id: new ObjectId(body.id) });
      return successResponse({ message: 'Testimonial deleted' });
    }

    return errorResponse('Method not allowed', 405);

  } catch (err) {
    console.error('Testimonials function error:', err);
    return errorResponse(err.message);
  }
};
