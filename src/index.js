const express = require('express');
const cron = require('node-cron');
const config = require('./config');
const mongo = require('./mongo');
const telegramBot = require('./telegramBot');
const { generatePlan } = require('./services/planGenerator');
const { analyzeTrends } = require('./services/trendAnalyzer');
const { generateFullContent } = require('./services/contentGenerator');
const animator = require('./services/animator');

const app = express();
app.use(express.json());

let planTask = null;
let trendsTask = null;

app.get('/health', (req, res) => {
  const hasAI = !!(config.GROQ_API_KEY || config.GOOGLE_AI_KEY || config.OPENROUTER_API_KEY);
  res.json({
    status: 'ok',
    service: 'pokemon-orchestrator',
    telegram: !!config.TELEGRAM_BOT_TOKEN,
    ai: hasAI,
    mongo: !!config.MONGO_URI,
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

app.post('/api/probar', async (req, res) => {
  try {
    const { contentType, groupId } = req.body;

    const types = ['pokemon-dia', 'trivia', 'ofertas', 'intercambios', 'subasta', 'rifas', 'anuncio', 'meme', 'quiz', 'dato-curioso'];
    const randomType = contentType || types[Math.floor(Math.random() * types.length)];

    const pokemonData = {
      name: 'Pikachu',
      id: 25,
      types: ['electric'],
      sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
    };

    console.log(`[API] Generando post de prueba: ${randomType}`);
    const content = await generateFullContent(randomType, '', pokemonData);

    if (!content) {
      return res.status(500).json({ success: false, error: 'Error generando contenido' });
    }

    console.log(`[API] Post generado: ${content.message?.substring(0, 50)}...`);

    res.json({
      success: true,
      message: content.message,
      imageUrl: content.imageUrl,
      contentType: randomType,
      groupId: groupId,
    });
  } catch (e) {
    console.error('[API] Error en /api/probar:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/pendientes', async (req, res) => {
  try {
    const db = mongo.getDb();
    const pending = await db.collection('generated_content')
      .find({ status: 'approved' })
      .sort({ reviewedAt: 1 })
      .toArray();

    console.log(`[API] Consultando posts aprobados: ${pending.length}`);
    res.json({ success: true, posts: pending });
  } catch (e) {
    console.error('[API] Error en /api/pendientes:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/marcar-enviado', async (req, res) => {
  try {
    const { postId, groupType } = req.body;
    const db = mongo.getDb();

    await db.collection('generated_content').updateOne(
      { postId },
      {
        $set: {
          status: 'sent',
          sentAt: new Date(),
        },
        $push: {
          sentToGroups: { groupType, sentAt: new Date() },
        },
      }
    );

    console.log(`[API] Post ${postId} marcado como enviado a ${groupType}`);
    res.json({ success: true });
  } catch (e) {
    console.error('[API] Error en /api/marcar-enviado:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
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

  cron.schedule('0 10,14,18,21,22 * * *', async () => {
    console.log('[CRON] Ejecutando animaciones programadas...');
    try {
      await animator.runScheduledAnimations();
    } catch (e) {
      console.error('[CRON] Error en animaciones:', e.message);
    }
  }, { timezone: tz });

  console.log('[CRON] Tareas programadas:');
  console.log(`  - Plan diario: ${config.PLAN_HOUR}:${config.PLAN_MINUTE.toString().padStart(2, '0')} (${tz})`);
  console.log(`  - Tendencias: 6:00 AM y 6:00 PM (${tz})`);
  console.log(`  - Animaciones: 10:00, 14:00, 18:00, 21:00, 22:00 (${tz})`);
}

async function start() {
  try {
    await mongo.connect();
    console.log('[MAIN] MongoDB conectado');

    telegramBot.init();
    const tgBot = telegramBot.getBot();
    if (tgBot) {
      tgBot.start({
        onStart: () => console.log('[TELEGRAM] Bot conectado y escuchando mensajes'),
      });
    }
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
