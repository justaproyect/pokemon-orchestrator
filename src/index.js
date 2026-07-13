const express = require('express');
const cron = require('node-cron');
const config = require('./config');
const mongo = require('./mongo');
const telegramBot = require('./telegramBot');
const { generatePlan } = require('./services/planGenerator');
const { analyzeTrends } = require('./services/trendAnalyzer');

const app = express();
app.use(express.json());

let planTask = null;
let trendsTask = null;

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'pokemon-orchestrator',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.json({
    name: 'Pokemon Orchestrator Bot',
    version: '1.0.0',
    description: 'Analiza tendencias, propone ideas, coordina contenido Pokemon',
    commands: ['/plan', '/generar', '/tendencias', '/status', '/reporte', '/feedback'],
  });
});

function startCronJobs() {
  const tz = config.TIMEZONE;

  planTask = cron.schedule(`0 ${config.PLAN_HOUR} * * *`, async () => {
    console.log('[CRON] Generando plan diario...');
    try {
      await generatePlan();
      const bot = telegramBot.getBot();
      if (bot && config.TELEGRAM_ALLOWED_USERS.length > 0) {
        const today = new Date().toISOString().split('T')[0];
        for (const userId of config.TELEGRAM_ALLOWED_USERS) {
          try {
            await bot.api.sendMessage(userId, `Plan del dia ${today} generado. Usa /plan para verlo.`);
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error('[CRON] Error generando plan:', e.message);
    }
  }, { timezone: tz });

  trendsTask = cron.schedule('0 6,18 * * *', async () => {
    console.log('[CRON] Analizando tendencias...');
    try {
      await analyzeTrends();
    } catch (e) {
      console.error('[CRON] Error analizando tendencias:', e.message);
    }
  }, { timezone: tz });

  console.log('[CRON] Tareas programadas:');
  console.log(`  - Plan diario: ${config.PLAN_HOUR}:${config.PLAN_MINUTE.toString().padStart(2, '0')} (${tz})`);
  console.log(`  - Tendencias: 6:00 AM y 6:00 PM (${tz})`);
}

async function start() {
  try {
    await mongo.connect();
    console.log('[MAIN] MongoDB conectado');

    telegramBot.init();
    console.log('[MAIN] Telegram bot listo');

    startCronJobs();
    console.log('[MAIN] Cron jobs activos');

    const today = new Date().toISOString().split('T')[0];
    const existingPlan = await require('./services/planGenerator').getPlan(today);
    if (!existingPlan) {
      console.log('[MAIN] No hay plan para hoy, generando...');
      await generatePlan();
    }

    app.listen(config.PORT, () => {
      console.log(`\n[EXPRESS] Orchestrator corriendo en puerto ${config.PORT}`);
      console.log(`[EXPRESS] Health: http://localhost:${config.PORT}/health\n`);
    });
  } catch (e) {
    console.error('[MAIN] Error iniciando:', e.message);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n[MAIN] Cerrando orchestrator...');
  if (planTask) planTask.stop();
  if (trendsTask) trendsTask.stop();
  await mongo.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n[MAIN] Cerrando orchestrator...');
  if (planTask) planTask.stop();
  if (trendsTask) trendsTask.stop();
  await mongo.close();
  process.exit(0);
});

start();
