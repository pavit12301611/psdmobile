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
    const collection = db.collection('projects');

    // ─── GET: Fetch all projects (public) ───────────────────────
    if (event.httpMethod === 'GET') {
      const { featured, status } = event.queryStringParameters || {};

      const filter = {};
      if (featured === 'true') filter.featured = true;
      if (status) filter.status = status;

      const projects = await collection
        .find(filter)
        .sort({ createdAt: -1 })
        .toArray();

      return successResponse({ projects: formatDocs(projects) });
    }

    // ─── POST: Create new project (admin only) ──────────────────
    if (event.httpMethod === 'POST') {
      if (!validateAdminKey(event.headers.authorization)) {
        return unauthorizedResponse();
      }

      const body = JSON.parse(event.body || '{}');

      if (!body.title) {
        return errorResponse('Project title is required', 400);
      }

      const project = {
        title:       body.title.slice(0, 150),
        description: (body.description || '').slice(0, 1000),
        icon:        body.icon || '🚀',
        techStack:   Array.isArray(body.techStack) ? body.techStack : [],
        status:      ['live', 'wip', 'archived'].includes(body.status) ? body.status : 'live',
        featured:    Boolean(body.featured),
        githubUrl:   body.githubUrl || '',
        liveUrl:     body.liveUrl || '',
        views:       0,
        likes:       0,
        createdAt:   new Date(),
        updatedAt:   new Date()
      };

      const result = await collection.insertOne(project);
      const inserted = await collection.findOne({ _id: result.insertedId });

      return successResponse({ project: formatDoc(inserted) }, 201);
    }

    // ─── PUT: Update project (admin only) ───────────────────────
    if (event.httpMethod === 'PUT') {
      if (!validateAdminKey(event.headers.authorization)) {
        return unauthorizedResponse();
      }

      const body = JSON.parse(event.body || '{}');
      if (!body.id) return errorResponse('Project ID is required', 400);

      const { id, ...updateFields } = body;
      updateFields.updatedAt = new Date();

      // Remove protected fields
      delete updateFields._id;
      delete updateFields.views;
      delete updateFields.likes;
      delete updateFields.createdAt;

      await collection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateFields }
      );

      const updated = await collection.findOne({ _id: new ObjectId(id) });
      return successResponse({ project: formatDoc(updated) });
    }

    // ─── DELETE: Remove project (admin only) ────────────────────
    if (event.httpMethod === 'DELETE') {
      if (!validateAdminKey(event.headers.authorization)) {
        return unauthorizedResponse();
      }

      const body = JSON.parse(event.body || '{}');
      if (!body.id) return errorResponse('Project ID is required', 400);

      await collection.deleteOne({ _id: new ObjectId(body.id) });
      return successResponse({ message: 'Project deleted successfully' });
    }

    // ─── PATCH: Increment views or likes (public) ───────────────
    if (event.httpMethod === 'PATCH') {
      const body = JSON.parse(event.body || '{}');
      if (!body.id) return errorResponse('Project ID is required', 400);

      const field = body.action === 'like' ? 'likes' : 'views';

      const result = await collection.findOneAndUpdate(
        { _id: new ObjectId(body.id) },
        { $inc: { [field]: 1 } },
        { returnDocument: 'after' }
      );

      return successResponse({
        [field]: result[field],
        project: formatDoc(result)
      });
    }

    return errorResponse('Method not allowed', 405);

  } catch (err) {
    console.error('Projects function error:', err);
    return errorResponse(err.message);
  }
};
