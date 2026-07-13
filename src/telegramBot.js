const { Bot } = require('grammy');
const config = require('./config');
const { generatePlan, getPlan, getUpcomingPlans } = require('./services/planGenerator');
const { processFeedback, getRecentFeedback } = require('./services/feedbackProcessor');
const { getDailyAnalytics, getWeeklyReport, formatReport } = require('./services/analyticsAnalyzer');
const { analyzeTrends, getLatestTrends } = require('./services/trendAnalyzer');
const { generatePlanContent, generateFullContent } = require('./services/contentGenerator');
const ai = require('./services/ai');
const axios = require('axios');
const { getDb } = require('./mongo');

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
      'Comandos:\n' +
      '/generar - Crear posts con imagenes\n' +
      '/pendientes - Ver posts para revisar\n' +
      '/plan - Ver plan de hoy\n' +
      '/probar [groupId] - Probar 1 post\n' +
      '/tendencias - Ver tendencias\n' +
      '/status - Estado del sistema\n' +
      '/chat [mensaje] - Hablar con la IA\n' +
      '/ayuda - Ver esta ayuda\n\n' +
      '*Como revisar posts:*\n' +
      'Despues de /generar, toca los botones\n' +
      '✅ Aprobar → Se envia al grupo\n' +
      '⏸️ Diferir → Guarda para despues\n' +
      '✏️ Editar → Cambias el texto'
    );
  });

  bot.command('ayuda', async (ctx) => {
    await ctx.reply(
      '*Comandos:*\n\n' +
      '/generar - Crear posts ahora\n' +
      '/pendientes - Ver posts pendientes\n' +
      '/plan - Plan de hoy\n' +
      '/probar [groupId] - Probar 1 post\n' +
      '/tendencias - Analizar tendencias\n' +
      '/status - Estado del sistema\n' +
      '/chat [msg] - Hablar con la IA\n\n' +
      '*Revisar posts:*\n' +
      'Toca ✅ o ⏸️ en cada post\n' +
      'No necesitas escribir comandos'
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
      await ctx.reply(`Plan: ${plan.posts.length} posts. Generando contenido e imagenes...`);
      
      const results = await generatePlanContent(plan);
      
      await ctx.reply(`*CONTENIDO LISTO PARA REVISAR*\n\nToca un boton para aprobar o diferir cada post:`);

      for (const content of results) {
        const preview = content.message?.substring(0, 120) || 'Sin texto';
        const imgStatus = content.imageUrl ? '📷 Con imagen' : '⚠️ Sin imagen';

        const keyboard = {
          inline_keyboard: [
            [
              { text: '✅ Aprobar', callback_data: `aprobar:${content.postId}` },
              { text: '⏸️ Diferir', callback_data: `diferir:${content.postId}` },
            ],
            [
              { text: '✏️ Editar texto', callback_data: `editar:${content.postId}` },
            ],
          ],
        };

        await ctx.reply(
          `*${content.contentType.toUpperCase()}* → ${content.groupType}\n` +
          `${preview}...\n` +
          `${imgStatus}`,
          { reply_markup: keyboard }
        );
      }
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

  bot.command('pendientes', async (ctx) => {
    const db = getDb();
    const pending = await db.collection('generated_content')
      .find({ status: 'pending_review' })
      .sort({ generatedAt: -1 })
      .toArray();

    if (pending.length === 0) {
      await ctx.reply('No hay posts pendientes de revision.');
      return;
    }

    await ctx.reply(`Tienes *${pending.length} posts* para revisar:`);

    for (const post of pending) {
      const preview = post.message?.substring(0, 100) || 'Sin texto';
      const imgStatus = post.imageUrl ? '📷 Con imagen' : '⚠️ Sin imagen';

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Aprobar', callback_data: `aprobar:${post.postId}` },
            { text: '⏸️ Diferir', callback_data: `diferir:${post.postId}` },
          ],
          [
            { text: '✏️ Editar texto', callback_data: `editar:${post.postId}` },
          ],
        ],
      };

      await ctx.reply(
        `*${post.contentType.toUpperCase()}* → ${post.groupType}\n` +
        `${preview}...\n` +
        `${imgStatus}`,
        { reply_markup: keyboard }
      );
    }
  });

  bot.on('callback_query:data', async (ctx) => {
    const [action, postId] = ctx.callbackQuery.data.split(':');
    const db = getDb();

    if (action === 'aprobar') {
      const post = await db.collection('generated_content').findOne({ postId });
      if (!post) {
        await ctx.answerCallbackQuery('Post no encontrado');
        return;
      }

      if (post.status !== 'pending_review') {
        await ctx.answerCallbackQuery(`Ya tiene status: ${post.status}`);
        return;
      }

      await db.collection('generated_content').updateOne(
        { postId },
        { $set: { status: 'approved', reviewedAt: new Date(), approvedBy: 'telegram' } }
      );

      console.log(`[APROBAR] Post ${postId} aprobado`);

      let enviado = false;
      if (config.COMMUNITY_BOT_URL) {
        try {
          const response = await axios.post(`${config.COMMUNITY_BOT_URL}/probar`, {
            message: post.message,
            imageUrl: post.imageUrl,
            groupId: getGroupIdForType(post.groupType),
          });
          if (response.data.success) {
            enviado = true;
            await db.collection('generated_content').updateOne(
              { postId },
              { $set: { status: 'sent', sentAt: new Date() } }
            );
          }
        } catch (e) {
          console.log('[APROBAR] Error enviando:', e.message);
        }
      }

      const keyboard = {
        inline_keyboard: [[
          { text: enviado ? '✅ Enviado' : '✅ Aprobado (pendiente envio)', callback_data: 'noop' },
        ]],
      };

      await ctx.editMessageText(
        `✅ *APROBADO*\n\n` +
        `*Tipo:* ${post.contentType}\n` +
        `*Grupo:* ${post.groupType}\n` +
        `${enviado ? '*Enviado al grupo de WhatsApp*' : '*Guardado para envio automatico*'}`,
        { reply_markup: keyboard }
      );
      await ctx.answerCallbackQuery('Aprobado');
    }

    if (action === 'diferir') {
      await db.collection('generated_content').updateOne(
        { postId },
        { $set: { status: 'deferred', reviewedAt: new Date() } }
      );

      const keyboard = {
        inline_keyboard: [[
          { text: '⏸️ Diferido', callback_data: 'noop' },
        ]],
      };

      await ctx.editMessageText(`⏸️ *DIFERIDO*\n\nGuardado para despues.`);
      await ctx.editMessageReplyMarkup({ reply_markup: keyboard });
      await ctx.answerCallbackQuery('Diferido');
    }

    if (action === 'editar') {
      await ctx.reply('Escribe el nuevo texto para este post:');
      await ctx.answerCallbackQuery();

      const awaitingEdit = new Map();
      awaitingEdit.set(ctx.from.id, postId);
      bot._awaitingEdit = awaitingEdit;
    }

    if (action === 'noop') {
      await ctx.answerCallbackQuery();
    }
  });

  bot.on('message:text', async (ctx) => {
    if (bot._awaitingEdit && bot._awaitingEdit.has(ctx.from.id)) {
      const postId = bot._awaitingEdit.get(ctx.from.id);
      bot._awaitingEdit.delete(ctx.from.id);

      const db = getDb();
      await db.collection('generated_content').updateOne(
        { postId },
        { $set: { message: ctx.message.text, updatedAt: new Date() } }
      );

      const post = await db.collection('generated_content').findOne({ postId });

      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ Aprobar', callback_data: `aprobar:${postId}` },
            { text: '⏸️ Diferir', callback_data: `diferir:${postId}` },
          ],
        ],
      };

      await ctx.reply(
        `✏️ *TEXTO ACTUALIZADO*\n\n` +
        `${ctx.message.text.substring(0, 200)}...\n\n` +
        `Grupo: ${post?.groupType}`,
        { reply_markup: keyboard }
      );
    }
  });

  bot.catch((err) => {
    console.error('[TELEGRAM] Error:', err.message);
  });

  console.log('[TELEGRAM] Bot inicializado');
  return bot;
}

function getGroupIdForType(groupType) {
  const types = {
    general: 'general',
    tienda: 'tienda',
    torneos: 'torneos',
    compra: 'compra',
    subastas: 'subastas',
    rifas: 'rifas',
    anuncios: 'anuncios',
  };
  return types[groupType] || 'general';
}

function getBot() {
  return bot;
}

module.exports = { init, getBot };
