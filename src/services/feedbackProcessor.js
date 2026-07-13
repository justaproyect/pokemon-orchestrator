const { getDb } = require('../mongo');

const KEYWORDS = {
  more: ['mas', 'more', 'agregar', 'añadir', 'incluir'],
  less: ['menos', 'less', 'quitar', 'eliminar', 'parar'],
  harder: ['dificil', 'dificil', 'hard', 'complicado'],
  easier: ['facil', 'easy', 'simple', 'sencillo'],
  schedule: ['hora', 'time', 'cuando', 'programar', 'schedule'],
  theme: ['tema', 'theme', 'enfocar', 'foco', 'focus'],
  stop: ['parar', 'stop', 'no mas', 'cancelar'],
};

function interpretFeedback(message) {
  const lower = message.toLowerCase();
  const result = {
    type: 'general',
    adjustments: [],
    rawMessage: message,
  };

  if (KEYWORDS.schedule.some(kw => lower.includes(kw))) {
    const timeMatch = lower.match(/(\d{1,2})\s*(am|pm|h:?\d{2})/);
    if (timeMatch) {
      result.adjustments.push({
        field: 'schedule',
        action: 'change_time',
        value: timeMatch[0],
      });
    }
    result.type = 'schedule_change';
  }

  if (KEYWORDS.more.some(kw => lower.includes(kw)) || KEYWORDS.less.some(kw => lower.includes(kw))) {
    const contentTypes = ['trivia', 'pokemon', 'tienda', 'ofertas', 'raids', 'subastas', 'rifas', 'memes', 'quiz'];
    for (const ct of contentTypes) {
      if (lower.includes(ct)) {
        const isMore = KEYWORDS.more.some(kw => lower.includes(kw));
        result.adjustments.push({
          field: 'content_frequency',
          contentType: ct,
          action: isMore ? 'increase' : 'decrease',
        });
        result.type = 'content_adjustment';
      }
    }
  }

  if (KEYWORDS.harder.some(kw => lower.includes(kw)) || KEYWORDS.easier.some(kw => lower.includes(kw))) {
    const isHarder = KEYWORDS.harder.some(kw => lower.includes(kw));
    result.adjustments.push({
      field: 'difficulty',
      action: isHarder ? 'increase' : 'decrease',
    });
    result.type = 'content_adjustment';
  }

  if (KEYWORDS.stop.some(kw => lower.includes(kw))) {
    const groups = ['general', 'tienda', 'torneos', 'compra', 'subastas', 'rifas', 'anuncios'];
    for (const g of groups) {
      if (lower.includes(g)) {
        result.adjustments.push({
          field: 'group',
          groupType: g,
          action: 'disable',
        });
        result.type = 'group_change';
      }
    }
  }

  if (KEYWORDS.theme.some(kw => lower.includes(kw))) {
    const themes = ['legendario', 'shiny', 'evolucion', 'tipo fuego', 'tipo agua', 'tipo planta', 'generacion'];
    for (const t of themes) {
      if (lower.includes(t)) {
        result.adjustments.push({
          field: 'theme',
          action: 'set_theme',
          value: t,
        });
        result.type = 'theme_change';
      }
    }
  }

  if (result.adjustments.length === 0) {
    result.type = 'general_feedback';
    result.adjustments.push({
      field: 'note',
      action: 'add_note',
      value: message,
    });
  }

  return result;
}

async function processFeedback(message, userId) {
  const db = getDb();
  const interpreted = interpretFeedback(message);

  const feedbackDoc = {
    date: new Date().toISOString().split('T')[0],
    type: interpreted.type,
    from: userId,
    message: message,
    interpretedAction: interpreted,
    appliedTo: [],
    status: 'pending',
    createdAt: new Date(),
  };

  await db.collection('feedback').insertOne(feedbackDoc);

  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];

  for (const adj of interpreted.adjustments) {
    if (adj.field === 'group' && adj.action === 'disable') {
      await db.collection('plans').updateMany(
        { date: { $in: [today, tomorrow] }, 'posts.groupType': adj.groupType },
        { $set: { status: 'failed', updatedAt: new Date() } }
      );
      feedbackDoc.appliedTo.push(today, tomorrow);
    }

    if (adj.field === 'note' && adj.action === 'add_note') {
      await db.collection('plans').updateMany(
        { date: { $in: [today, tomorrow] }, status: { $in: ['draft', 'ready'] } },
        { $push: { feedbackApplied: feedbackDoc._id.toString() } }
      );
      feedbackDoc.appliedTo.push(today, tomorrow);
    }
  }

  feedbackDoc.status = 'applied';
  await db.collection('feedback').updateOne(
    { _id: feedbackDoc._id },
    { $set: { status: feedbackDoc.status, appliedTo: feedbackDoc.appliedTo } }
  );

  console.log('[FEEDBACK] Procesado:', interpreted.type, '- Ajustes:', interpreted.adjustments.length);
  return interpreted;
}

async function getRecentFeedback(days = 7) {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400000);
  return await db.collection('feedback')
    .find({ createdAt: { $gte: since } })
    .sort({ createdAt: -1 })
    .toArray();
}

module.exports = { processFeedback, interpretFeedback, getRecentFeedback };
