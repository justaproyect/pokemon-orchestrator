const config = require('../config');
const { getDb } = require('../mongo');
const { getLatestTrends } = require('./trendAnalyzer');

function getRotationForDay(date) {
  const d = new Date(date);
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  return config.GROUPS_ROTATION[dayOfYear % config.GROUPS_ROTATION.length];
}

function assignContentTypes(groups) {
  const assignments = {
    general: { contentType: 'pokemon-dia', theme: 'daily-pokemon' },
    tienda: { contentType: 'ofertas', theme: 'weekly-deals' },
    torneos: { contentType: 'trivia', theme: 'pokemon-trivia' },
    compra: { contentType: 'intercambios', theme: 'trades' },
    subastas: { contentType: 'subasta', theme: 'auctions' },
    rifas: { contentType: 'rifas', theme: 'raffle' },
    anuncios: { contentType: 'anuncio', theme: 'announcements' },
  };

  return groups.map((groupType, index) => {
    const base = assignments[groupType] || { contentType: 'text', theme: 'general' };
    const hours = ['08:00', '12:00', '18:00'];

    return {
      postId: `plan_${dateStr()}_${groupType}_${index}`,
      groupType,
      contentType: base.contentType,
      scheduledTime: hours[index] || '08:00',
      priority: index + 1,
      theme: base.theme,
      notes: '',
    };
  });

  function dateStr() {
    return new Date().toISOString().split('T')[0].replace(/-/g, '');
  }
}

async function generatePlan(date) {
  const db = getDb();
  const dateStr = date || new Date().toISOString().split('T')[0];

  const existing = await db.collection('plans').findOne({ date: dateStr });
  if (existing && existing.status !== 'failed') {
    console.log('[PLAN] Plan ya existe para', dateStr, '- status:', existing.status);
    return existing;
  }

  console.log('[PLAN] Generando plan para', dateStr);

  const groups = getRotationForDay(dateStr);
  const posts = assignContentTypes(groups);

  const trends = await getLatestTrends();
  if (trends?.themes) {
    for (const post of posts) {
      const relevantTheme = trends.themes.find(t =>
        t.type === 'pokemon_card' && post.contentType === 'pokemon-dia'
      );
      if (relevantTheme) {
        post.notes = relevantTheme.idea;
        post.trendReference = relevantTheme.name || null;
      }
    }
  }

  const plan = {
    date: dateStr,
    status: 'draft',
    posts,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'orchestrator',
    feedbackApplied: [],
  };

  await db.collection('plans').insertOne(plan);
  console.log('[PLAN] Plan creado:', posts.length, 'posts para', dateStr);

  return plan;
}

async function updatePlanStatus(dateStr, status) {
  const db = getDb();
  await db.collection('plans').updateOne(
    { date: dateStr },
    { $set: { status, updatedAt: new Date() } }
  );
}

async function getPlan(dateStr) {
  const db = getDb();
  return await db.collection('plans').findOne({ date: dateStr });
}

async function getUpcomingPlans(days = 7) {
  const db = getDb();
  const today = new Date();
  const dates = [];

  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  return await db.collection('plans').find({ date: { $in: dates } }).sort({ date: 1 }).toArray();
}

module.exports = { generatePlan, updatePlanStatus, getPlan, getUpcomingPlans, getRotationForDay };
