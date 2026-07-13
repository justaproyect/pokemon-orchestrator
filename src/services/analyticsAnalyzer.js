const { getDb } = require('../mongo');

async function getDailyAnalytics(date) {
  const db = getDb();
  const dateStr = date || new Date().toISOString().split('T')[0];

  const deliveries = await db.collection('delivery_log')
    .find({ date: dateStr })
    .toArray();

  const analytics = await db.collection('analytics')
    .find({ date: dateStr })
    .toArray();

  const plan = await db.collection('plans')
    .findOne({ date: dateStr });

  return {
    date: dateStr,
    planStatus: plan?.status || 'no_plan',
    totalPosts: plan?.posts?.length || 0,
    postsDelivered: deliveries.filter(d => d.status === 'sent').length,
    postsFailed: deliveries.filter(d => d.status === 'failed').length,
    groupsReached: [...new Set(deliveries.filter(d => d.status === 'sent').map(d => d.groupType))],
    totalMessages: analytics.reduce((sum, a) => sum + (a.messagesReceived || 0), 0),
    activeUsers: analytics.reduce((sum, a) => sum + (a.activeUsers || 0), 0),
    commandsUsed: analytics.reduce((sum, a) => sum + (a.commandsUsed || 0), 0),
    topUsers: analytics.flatMap(a => a.topUsers || []).slice(0, 5),
  };
}

async function getWeeklyReport() {
  const db = getDb();
  const today = new Date();
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekAgo);
    d.setDate(d.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }

  const deliveries = await db.collection('delivery_log')
    .find({ date: { $in: dates } })
    .toArray();

  const analytics = await db.collection('analytics')
    .find({ date: { $in: dates } })
    .toArray();

  const plans = await db.collection('plans')
    .find({ date: { $in: dates } })
    .toArray();

  const sent = deliveries.filter(d => d.status === 'sent').length;
  const failed = deliveries.filter(d => d.status === 'failed').length;
  const totalMessages = analytics.reduce((sum, a) => sum + (a.messagesReceived || 0), 0);
  const totalUsers = analytics.reduce((sum, a) => sum + (a.activeUsers || 0), 0);

  const byGroupType = {};
  for (const d of deliveries) {
    if (!byGroupType[d.groupType]) byGroupType[d.groupType] = { sent: 0, failed: 0 };
    if (d.status === 'sent') byGroupType[d.groupType].sent++;
    else byGroupType[d.groupType].failed++;
  }

  return {
    period: `${dates[0]} a ${dates[dates.length - 1]}`,
    totalPlans: plans.length,
    plansCompleted: plans.filter(p => p.status === 'completed').length,
    postsSent: sent,
    postsFailed: failed,
    successRate: sent + failed > 0 ? Math.round((sent / (sent + failed)) * 100) : 0,
    totalMessages,
    uniqueUsers: totalUsers,
    byGroupType,
  };
}

function formatReport(report) {
  let msg = `*REPORTE SEMANAL*\n`;
  msg += `Periodo: ${report.period}\n\n`;
  msg += `*Resumen:*\n`;
  msg += `- Planes: ${report.plansCompleted}/${report.totalPlans} completados\n`;
  msg += `- Posts enviados: ${report.postsSent}\n`;
  msg += `- Posts fallidos: ${report.postsFailed}\n`;
  msg += `- Tasa de exito: ${report.successRate}%\n`;
  msg += `- Mensajes totales: ${report.totalMessages}\n`;
  msg += `- Usuarios activos: ${report.uniqueUsers}\n\n`;

  msg += `*Por grupo:*\n`;
  for (const [group, stats] of Object.entries(report.byGroupType)) {
    msg += `- ${group}: ${stats.sent} enviados, ${stats.failed} fallidos\n`;
  }

  return msg;
}

module.exports = { getDailyAnalytics, getWeeklyReport, formatReport };
