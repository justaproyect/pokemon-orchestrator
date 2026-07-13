const { Bot } = require('grammy');
const config = require('./config');
const { generatePlan, getPlan, getUpcomingPlans } = require('./services/planGenerator');
const { processFeedback, getRecentFeedback } = require('./services/feedbackProcessor');
const { getDailyAnalytics, getWeeklyReport, formatReport } = require('./services/analyticsAnalyzer');
const { analyzeTrends, getLatestTrends } = require('./services/trendAnalyzer');
const { generatePlanContent, generateFullContent } = require('./services/contentGenerator');
const ai = require('./services/ai');
const axios = require('axios');

let bot = null;

function isAllowed(userId) {
  if (config.TELEGRAM_ALLOWED_USERS.length === 0) return true;
  return config.TELEGRAM_ALLOWED_USERS.includes(String(userId));
}

function init() {
  if (!config.TELEGRAM_BOT_TOKEN) {
    console.log('[TELEGRAM] ERROR: No hay token configurado. Bot Telegram deshabilitado.');
    console.log('[TELEGRAM] Agrega TELEGRAM_BOT_TOKEN en Render Environment');
    return null;
  }

  console.log('[TELEGRAM] Iniciando bot con token:', config.TELEGRAM_BOT_TOKEN.substring(0, 10) + '...');
  bot = new Bot(config.TELEGRAM_BOT_TOKEN);

  bot.use(async (ctx, next) => {
    if (ctx.message?.from && !isAllowed(ctx.message.from.id)) {
      await ctx.reply('No tienes permiso para usar este bot.');
      return;
    }
    await next();
  });

  bot.command('start', async (ctx) => {
    await ctx.reply(
      '*Pokemon Orchestrator*\n\n' +
      'Comandos disponibles:\n' +
      '/plan - Ver plan de hoy\n' +
      '/plan [fecha] - Ver plan de una fecha\n' +
      '/generar - Crear plan manualmente\n' +
      '/probar [groupId] - Probar 1 post en grupo de prueba\n' +
      '/tendencias - Ver tendencias actuales\n' +
      '/status - Estado de los bots\n' +
      '/reporte - Reporte semanal\n' +
      '/feedback [mensaje] - Dar feedback\n' +
      '/chat [mensaje] - Hablar con la IA\n' +
      '/historial - Ultimos 7 dias\n' +
      '/ayuda - Ver esta ayuda'
    );
  });

  bot.command('ayuda', async (ctx) => {
    await ctx.reply(
      '*Comandos:*\n\n' +
      '/plan - Plan de hoy\n' +
      '/plan 2026-07-15 - Plan de una fecha\n' +
      '/generar - Crear plan ahora\n' +
      '/probar [groupId] - Probar 1 post en grupo\n' +
      '/tendencias - Analizar tendencias\n' +
      '/status - Estado del sistema\n' +
      '/reporte - Reporte semanal\n' +
      '/feedback [msg] - Ej: /feedback Las trivia estan muy faciles\n' +
      '/chat [msg] - Ej: /chat QuePokemon destacar esta semana?\n' +
      '/historial - Ultimos 7 dias'
    );
  });

  bot.command('plan', async (ctx) => {
    const dateStr = ctx.match || new Date().toISOString().split('T')[0];
    const plan = await getPlan(dateStr);

    if (!plan) {
      await ctx.reply(`No hay plan para ${dateStr}. Usa /generar para crear uno.`);
      return;
    }

    const statusEmoji = {
      draft: '📝', ready: '✅', executing: '🔄', completed: '✔️', failed: '❌',
    };

    let msg = `*PLAN ${dateStr}*\nEstado: ${statusEmoji[plan.status] || '?'} ${plan.status}\n\n`;

    for (const post of plan.posts) {
      msg += `*${post.scheduledTime}* → ${post.groupType}\n`;
      msg += `  Tipo: ${post.contentType}\n`;
      if (post.notes) msg += `  Nota: ${post.notes}\n`;
      msg += '\n';
    }

    await ctx.reply(msg);
  });

  bot.command('generar', async (ctx) => {
    await ctx.reply('Generando plan y contenido con imagenes...');
    try {
      const plan = await generatePlan();
      await ctx.reply(`Plan creado: ${plan.posts.length} posts. Generando contenido e imagenes...`);
      
      const results = await generatePlanContent(plan);
      
      let msg = `*CONTENIDO GENERADO*\n\n`;
      for (const content of results) {
        msg += `*${content.groupType}* (${content.contentType})\n`;
        msg += `${content.message?.substring(0, 80)}...\n`;
        msg += `Imagen: ${content.imageUrl ? '✅ Cloudinary' : '❌ Sin imagen'}\n\n`;
      }
      
      msg += `\nTotal: ${results.length} posts con contenido listo para enviar.`;
      await ctx.reply(msg);
    } catch (e) {
      await ctx.reply(`Error: ${e.message}`);
    }
  });

  bot.command('probar', async (ctx) => {
    const groupId = ctx.match;
    if (!groupId) {
      await ctx.reply('Usa: /probar [groupId]\nEjemplo: /probar 120363XXXX@g.us\n\nPrimero registra el grupo con !registrar prueba en WhatsApp');
      return;
    }

    if (!config.COMMUNITY_BOT_URL) {
      await ctx.reply('COMMUNITY_BOT_URL no configurada en Render');
      return;
    }

    await ctx.reply('Generando post de prueba con imagen...');

    try {
      const pokemonData = {
        name: 'Pikachu',
        id: 25,
        types: ['electric'],
        sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png',
      };

      const contentTypes = ['pokemon-dia', 'trivia', 'ofertas', 'intercambios', 'subasta', 'rifas', 'anuncio', 'meme', 'quiz', 'dato-curioso'];
      const randomType = contentTypes[Math.floor(Math.random() * contentTypes.length)];

      const content = await generateFullContent(randomType, '', pokemonData);

      if (!content) {
        await ctx.reply('Error generando contenido');
        return;
      }

      let msg = `*POST DE PRUEBA*\n\n`;
      msg += `Tipo: ${randomType}\n`;
      msg += `Grupo: ${groupId}\n\n`;
      msg += `${content.message.substring(0, 200)}...\n\n`;
      msg += content.imageUrl ? `Imagen: ✅ Subida a Cloudinary` : `Imagen: ❌ Sin imagen`;
      msg += `\n\nEnviando al grupo de prueba...`;
      await ctx.reply(msg);

      const response = await axios.post(`${config.COMMUNITY_BOT_URL}/probar`, {
        message: content.message,
        imageUrl: content.imageUrl,
        groupId: groupId,
      });

      if (response.data.success) {
        await ctx.reply('✅ Post enviado al grupo de prueba');
      } else {
        await ctx.reply(`❌ Error: ${response.data.error}`);
      }
    } catch (e) {
      await ctx.reply(`❌ Error: ${e.message}`);
    }
  });

  bot.command('tendencias', async (ctx) => {
    await ctx.reply('Analizando tendencias...');
    const trends = await analyzeTrends();

    let msg = '*TENDENCIAS ACTUALES*\n\n';

    if (trends.pokemon?.trendingPokemon?.length) {
      msg += '*Cartas populares:*\n';
      for (const poke of trends.pokemon.trendingPokemon) {
        msg += `- ${poke.name} (${poke.set}) - ${poke.rarity}\n`;
      }
      msg += '\n';
    }

    if (trends.news?.articles?.length) {
      msg += '*Noticias de hoy:*\n';
      for (const art of trends.news.articles.slice(0, 5)) {
        msg += `- ${art.title}\n`;
      }
      msg += '\n';
    }

    if (trends.themes?.length) {
      msg += '*Ideas sugeridas:*\n';
      for (const theme of trends.themes.slice(0, 5)) {
        msg += `- ${theme.idea}\n`;
      }
    }

    await ctx.reply(msg);
  });

  bot.command('status', async (ctx) => {
    const today = new Date().toISOString().split('T')[0];
    const plan = await getPlan(today);

    let msg = '*ESTADO DEL SISTEMA*\n\n';
    msg += `Fecha: ${today}\n`;
    msg += `Plan de hoy: ${plan ? plan.status : 'no creado'}\n`;
    msg += `Posts programados: ${plan?.posts?.length || 0}\n\n`;

    msg += '*Servicios:*\n';
    msg += `- Orchestrator: ✅ Online\n`;

    if (config.COMMUNITY_BOT_URL) {
      try {
        const res = await require('axios').get(config.COMMUNITY_BOT_URL + '/health', { timeout: 5000 });
        msg += `- Community Bot: ${res.data.botConnected ? '✅ Conectado' : '⚠️ Desconectado'}\n`;
      } catch {
        msg += `- Community Bot: ❌ No disponible\n`;
      }
    }

    if (config.TOYTSUKY_URL) {
      try {
        await require('axios').get(config.TOYTSUKY_URL + '/health', { timeout: 5000 });
        msg += `- Content Bot: ✅ Online\n`;
      } catch {
        msg += `- Content Bot: ❌ No disponible\n`;
      }
    }

    await ctx.reply(msg);
  });

  bot.command('reporte', async (ctx) => {
    await ctx.reply('Generando reporte semanal...');
    const report = await getWeeklyReport();
    await ctx.reply(formatReport(report));
  });

  bot.command('feedback', async (ctx) => {
    const message = ctx.match;
    if (!message) {
      await ctx.reply('Usa: /feedback [tu mensaje]\nEjemplo: /feedback Las trivia estan muy faciles');
      return;
    }

    if (config.OPENROUTER_API_KEY) {
      await ctx.reply('Procesando con IA...');
      const aiResult = await ai.processFeedbackWithAI(message, {});
      if (aiResult) {
        let msg = `${aiResult.response}\n\n`;
        msg += `*Entendi:* ${aiResult.understanding}\n`;
        msg += `*Tipo:* ${aiResult.type}\n`;
        if (aiResult.adjustments?.length) {
          msg += `*Ajustes:*\n`;
          for (const adj of aiResult.adjustments) {
            msg += `- ${adj.field}: ${adj.action}`;
            if (adj.value) msg += ` → ${adj.value}`;
            msg += '\n';
          }
        }
        await processFeedback(message, ctx.from.id);
        await ctx.reply(msg);
        return;
      }
    }

    const result = await processFeedback(message, ctx.from.id);
    let msg = `Feedback procesado: ${result.type} (${result.adjustments.length} ajustes)`;
    await ctx.reply(msg);
  });

  bot.command('chat', async (ctx) => {
    const message = ctx.match;
    if (!message) {
      await ctx.reply('Usa: /chat [tu mensaje]\nEjemplo: /chat QuePokemon deberiamos destacar hoy?');
      return;
    }

    if (!config.OPENROUTER_API_KEY) {
      await ctx.reply('IA no configurada. Agrega OPENROUTER_API_KEY en Render.');
      return;
    }

    await ctx.reply('Pensando...');
    const response = await ai.chatWithUser([
      { role: 'user', content: message }
    ]);

    if (response) {
      await ctx.reply(response);
    } else {
      await ctx.reply('Error al conectar con la IA. Intenta de nuevo.');
    }
  });

  bot.command('historial', async (ctx) => {
    const days = 7;
    const dates = [];
    for (let i = 0; i < days; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(d.toISOString().split('T')[0]);
    }

    let msg = '*HISTORIAL 7 DIAS*\n\n';
    for (const date of dates) {
      const plan = await getPlan(date);
      const emoji = plan ? (plan.status === 'completed' ? '✔️' : '🔄') : '⬜';
      msg += `${emoji} ${date}: ${plan ? plan.status : 'sin plan'}`;
      if (plan?.posts) msg += ` (${plan.posts.length} posts)`;
      msg += '\n';
    }

    await ctx.reply(msg);
  });

  bot.catch((err) => {
    console.error('[TELEGRAM] Error:', err.message);
  });

  console.log('[TELEGRAM] Bot inicializado');
  return bot;
}

function getBot() {
  return bot;
}

module.exports = { init, getBot };
