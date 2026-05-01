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
    // POST - Track page visit
    if (event.httpMethod === 'POST') {
      const data = JSON.parse(event.body);
      const today = new Date().toISOString().split('T')[0];

      // Try to get today's analytics doc
      try {
        const existing = await client.query(
          q.Get(q.Match(q.Index('analytics_by_date'), today))
        );

        const updates = {
          totalVisits: (existing.data.totalVisits || 0) + 1,
          uniqueSections: {
            ...existing.data.uniqueSections,
            [data.section]: (existing.data.uniqueSections?.[data.section] || 0) + 1
          },
          devices: {
            ...existing.data.devices,
            [data.device || 'unknown']: (existing.data.devices?.[data.device || 'unknown'] || 0) + 1
          },
          lastUpdated: new Date().toISOString()
        };

        await client.query(
          q.Update(existing.ref, { data: updates })
        );
      } catch (notFound) {
        // Create new analytics doc for today
        await client.query(
          q.Create(q.Collection('analytics'), {
            data: {
              date: today,
              totalVisits: 1,
              uniqueSections: { [data.section || 'home']: 1 },
              devices: { [data.device || 'unknown']: 1 },
              funZoneInteractions: 0,
              projectDemoClicks: 0,
              createdAt: new Date().toISOString(),
              lastUpdated: new Date().toISOString()
            }
          })
        );
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    // PATCH - Track specific interactions
    if (event.httpMethod === 'PATCH') {
      const data = JSON.parse(event.body);
      const today = new Date().toISOString().split('T')[0];

      try {
        const existing = await client.query(
          q.Get(q.Match(q.Index('analytics_by_date'), today))
        );

        const field = data.interaction;
        const currentValue = existing.data[field] || 0;

        await client.query(
          q.Update(existing.ref, {
            data: {
              [field]: currentValue + 1,
              lastUpdated: new Date().toISOString()
            }
          })
        );
      } catch (e) {
        // No analytics doc yet, create minimal one
        await client.query(
          q.Create(q.Collection('analytics'), {
            data: {
              date: today,
              totalVisits: 0,
              [data.interaction]: 1,
              createdAt: new Date().toISOString(),
              lastUpdated: new Date().toISOString()
            }
          })
        );
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };
    }

    // GET - Fetch analytics (admin only)
    if (event.httpMethod === 'GET') {
      const authHeader = event.headers.authorization;
      if (!validateAdminKey(authHeader)) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ success: false, error: 'Unauthorized' })
        };
      }

      const result = await client.query(
        q.Map(
          q.Paginate(q.Documents(q.Collection('analytics')), { size: 30 }),
          q.Lambda('ref', q.Get(q.Var('ref')))
        )
      );

      const analytics = result.data.map(doc => ({
        id: doc.ref.id,
        ...doc.data
      }));

      // Calculate totals
      const totals = analytics.reduce((acc, day) => ({
        totalVisits: acc.totalVisits + (day.totalVisits || 0),
        funZoneInteractions: acc.funZoneInteractions + (day.funZoneInteractions || 0),
        projectDemoClicks: acc.projectDemoClicks + (day.projectDemoClicks || 0)
      }), { totalVisits: 0, funZoneInteractions: 0, projectDemoClicks: 0 });

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          analytics: analytics.sort((a, b) => b.date.localeCompare(a.date)),
          totals
        })
      };
    }

  } catch (error) {
    console.error('Analytics function error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: error.message })
    };
  }
};
