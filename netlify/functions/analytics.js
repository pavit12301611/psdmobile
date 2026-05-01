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
    const collection = db.collection('analytics');

    // ─── POST: Track a page visit (public) ──────────────────────
    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}');
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      const section  = (body.section || 'home').slice(0, 50);
      const device   = (body.device || 'unknown').slice(0, 20);
      const referrer = (body.referrer || 'direct').slice(0, 200);

      await collection.updateOne(
        { date: today },
        {
          $inc: {
            totalVisits: 1,
            [`sections.${section}`]: 1,
            [`devices.${device}`]: 1
          },
          $set: {
            lastUpdated: new Date()
          },
          $setOnInsert: {
            date: today,
            createdAt: new Date(),
            funZoneInteractions: 0,
            projectDemoClicks:   0,
            vaultViews:          0,
            contactClicks:       0
          },
          $addToSet: {
            referrers: referrer
          }
        },
        { upsert: true }
      );

      return successResponse({ tracked: true });
    }

    // ─── PATCH: Track specific interaction (public) ──────────────
    if (event.httpMethod === 'PATCH') {
      const body = JSON.parse(event.body || '{}');
      const today = new Date().toISOString().split('T')[0];

      const allowedFields = [
        'funZoneInteractions',
        'projectDemoClicks',
        'vaultViews',
        'contactClicks',
        'passwordGenerated',
        'colorPaletteGenerated',
        'pixelArtCreated',
        'markdownPreviewed'
      ];

      const field = allowedFields.includes(body.interaction)
        ? body.interaction : null;

      if (!field) {
        return errorResponse('Invalid interaction type', 400);
      }

      await collection.updateOne(
        { date: today },
        {
          $inc: { [field]: 1 },
          $set: { lastUpdated: new Date() },
          $setOnInsert: { date: today, createdAt: new Date(), totalVisits: 0 }
        },
        { upsert: true }
      );

      return successResponse({ tracked: true });
    }

    // ─── GET: Fetch analytics data (admin only) ──────────────────
    if (event.httpMethod === 'GET') {
      if (!validateAdminKey(event.headers.authorization)) {
        return unauthorizedResponse();
      }

      const { days = '30' } = event.queryStringParameters || {};
      const daysNum = Math.min(parseInt(days), 90);

      const analytics = await collection
        .find({})
        .sort({ date: -1 })
        .limit(daysNum)
        .toArray();

      // Aggregate totals
      const totals = analytics.reduce((acc, day) => ({
        totalVisits:          acc.totalVisits + (day.totalVisits || 0),
        funZoneInteractions:  acc.funZoneInteractions + (day.funZoneInteractions || 0),
        projectDemoClicks:    acc.projectDemoClicks + (day.projectDemoClicks || 0),
        vaultViews:           acc.vaultViews + (day.vaultViews || 0),
        contactClicks:        acc.contactClicks + (day.contactClicks || 0)
      }), {
        totalVisits: 0,
        funZoneInteractions: 0,
        projectDemoClicks: 0,
        vaultViews: 0,
        contactClicks: 0
      });

      // Most visited sections
      const sectionTotals = {};
      analytics.forEach(day => {
        if (day.sections) {
          Object.entries(day.sections).forEach(([section, count]) => {
            sectionTotals[section] = (sectionTotals[section] || 0) + count;
          });
        }
      });

      // Device breakdown
      const deviceTotals = {};
      analytics.forEach(day => {
        if (day.devices) {
          Object.entries(day.devices).forEach(([device, count]) => {
            deviceTotals[device] = (deviceTotals[device] || 0) + count;
          });
        }
      });

      return successResponse({
        analytics: formatDocs(analytics),
        totals,
        topSections: Object.entries(sectionTotals)
          .sort(([,a], [,b]) => b - a)
          .slice(0, 10),
        deviceBreakdown: deviceTotals,
        period: `Last ${daysNum} days`
      });
    }

    return errorResponse('Method not allowed', 405);

  } catch (err) {
    console.error('Analytics function error:', err);
    return errorResponse(err.message);
  }
};
