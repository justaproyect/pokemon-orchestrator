const config = require('../config');
const { getDb } = require('../mongo');
const ai = require('./ai');
const axios = require('axios');

const GREETINGS = [
  'Hey {name}! Bienvenido a la comunidad Pokemon! Que te gusta mas, cartas o videojuegos?',
  'Hola {name}! Otro entrenador mas se une! Preparate para la diversion!',
  '{name} acaba de llegar! Un aplauso para el nuevo miembro!',
  'Bienvenido {name}! Aqui somos como una gran familia Pokemon!',
  'Oye {name}! Justo estabamos esperando a alguien como tu!',
];

const HYPE_MESSAGES = [
  'ATENTOS ENTRENADORES! Algo MUY especial viene ahora...',
  'Se vienen cositas BUENAS! Quien esta listo?',
  'ALERTA! Algo EPICO esta por pasar! No se lo pierdan!',
  'Preparense que esto se pone INTERESANTE!',
  'VAMOS QUE ESTO SE CALIENTA! 🔥',
];

const SILENCE_MESSAGES = [
  'Hey entrenadores, este grupo se quedo sin bateria? 🔋',
  'Bueno... veo que todos estan atrapando Pokemon IRL hoy 😅',
  'El silencio se siente... alguien tiene algo que contar?',
  'Que pasó aqui? Todos en modoinvisible?',
  'Grupo dormido? Despierten que hay cosas BUENAS!',
];

const CLOSING_MESSAGES = [
  'Que gran dia tuvimos entrenadores! Manana tenemos algo EPICO preparado!',
  'El grupo estuvo increible hoy! Nos vemos manana con mas aventuras!',
  'DIA COMPLETO! Gracias por la energia, los quiero mucho!',
  'Se acabó la jornada Pokemon! Cuenten que hicieron hoy!',
  'Hoy fue un diaazo! Manana seguimos con todo!',
];

const SURPRISE_TEMPLATES = [
  { type: 'trivia', message: 'RETRO TRIVIA! QuePokemon es este?\n\nUna criatura electrica amarilla con colas como rayos.\n\nResponde con !trivia [nombre]' },
  { type: 'reto', message: 'RETO DEL MOMENTO! Quien puede nombrar 5 Pokemon tipo fuego en 30 segundos? 🏃‍♂️' },
  { type: 'encuesta', message: 'ENCUESTA RELAMPAGO! Charizard o Blastoise? Responde con !encuesta [a/b]' },
  { type: 'sorpresa', message: 'SORPRESA! Los primeros 3 en responder "POKEMON" ganan 50 puntos extra!' },
  { type: 'dato', message: 'DATO QUE NO SABIAS! Sabian que Magikarp puede saltar montanas segun la leyenda? 🐟' },
];

async function getGreeting(userName) {
  const template = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
  return template.replace('{name}', userName || 'Entrenador');
}

async function getHypeMessage() {
  return HYPE_MESSAGES[Math.floor(Math.random() * HYPE_MESSAGES.length)];
}

async function getSilenceMessage() {
  return SILENCE_MESSAGES[Math.floor(Math.random() * SILENCE_MESSAGES.length)];
}

async function getClosingMessage() {
  return CLOSING_MESSAGES[Math.floor(Math.random() * CLOSING_MESSAGES.length)];
}

async function getSurprise() {
  return SURPRISE_TEMPLATES[Math.floor(Math.random() * SURPRISE_TEMPLATES.length)];
}

async function generateSmartReaction(messageText, userName) {
  if (!config.OPENROUTER_API_KEY) {
    return null;
  }

  const prompt = `Eres un animador de fiestas profesional en un grupo de WhatsApp de Pokemon.
Un usuario llamado ${userName} escribio: "${messageText}"

Responde de forma CORTA (maximo 100 caracteres), divertida y con energia de animador.
Usa emojis. Sé entusiasta. Si es sobre Pokemon, conecta con eso.
No uses comandos. Solo reacciona como lo haria un animador.`;

  try {
    const response = await ai.chat([{ role: 'user', content: prompt }], { maxTokens: 150 });
    return response;
  } catch (e) {
    console.log('[ANIMATOR] Error generando reaccion:', e.message);
    return null;
  }
}

async function generateWeeklyRecap() {
  const db = getDb();

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const messages = await db.collection('delivery_log')
    .find({ sentAt: { $gte: weekAgo } })
    .toArray();

  const activeUsers = {};
  for (const msg of messages) {
    if (msg.engagement) {
      for (const [user, data] of Object.entries(msg.engagement || {})) {
        activeUsers[user] = (activeUsers[user] || 0) + 1;
      }
    }
  }

  const topUsers = Object.entries(activeUsers)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  let recap = 'RECAP SEMANAL POKEMON!\n\n';

  if (topUsers.length > 0) {
    recap += 'TOP ENTRENADORES DE LA SEMANA:\n';
    topUsers.forEach(([user, count], i) => {
      recap += `${i + 1}. ${user} - ${count} interacciones\n`;
    });
    recap += '\n';
  }

  recap += 'Gracias por ser parte de esta comunidad! Manana seguimos con todo!';

  return recap;
}

async function sendAnimation(groupType, animationType) {
  if (!config.COMMUNITY_BOT_URL) {
    console.log('[ANIMATOR] COMMUNITY_BOT_URL no configurada');
    return null;
  }

  let message = '';

  switch (animationType) {
    case 'greeting':
      message = await getGreeting('Entrenador');
      break;
    case 'hype':
      message = await getHypeMessage();
      break;
    case 'silence':
      message = await getSilenceMessage();
      break;
    case 'closing':
      message = await getClosingMessage();
      break;
    case 'surprise':
      const surprise = await getSurprise();
      message = surprise.message;
      break;
    case 'recap':
      message = await generateWeeklyRecap();
      break;
    default:
      message = await getHypeMessage();
  }

  const groupId = getGroupIdForType(groupType);
  if (!groupId) {
    console.log('[ANIMATOR] No se encontro grupo para tipo:', groupType);
    return null;
  }

  try {
    const response = await axios.post(`${config.COMMUNITY_BOT_URL}/probar`, {
      message: message,
      imageUrl: null,
      groupId: groupId,
    });

    if (response.data.success) {
      console.log(`[ANIMATOR] Animacion enviada: ${animationType} a ${groupType}`);
      return message;
    }
  } catch (e) {
    console.log('[ANIMATOR] Error enviando animacion:', e.message);
  }

  return null;
}

function getGroupIdForType(groupType) {
  const groups = {
    general: process.env.GROUP_GENERAL,
    tienda: process.env.GROUP_TIENDA,
    torneos: process.env.GROUP_TORNEOS,
    compra: process.env.GROUP_COMPRA,
    subastas: process.env.GROUP_SUBASTAS,
    rifas: process.env.GROUP_RIFAS,
    anuncios: process.env.GROUP_ANUNCIOS,
  };
  return groups[groupType] || null;
}

function getRotationForDay(date) {
  const d = new Date(date);
  const dayOfYear = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
  const rotation = config.GROUPS_ROTATION;
  return rotation[dayOfYear % rotation.length];
}

async function runScheduledAnimations() {
  const now = new Date();
  const hour = now.getHours();
  const today = now.toISOString().split('T')[0];
  const groups = getRotationForDay(today);

  if (hour === 10 && groups.length > 0) {
    await sendAnimation(groups[0], 'greeting');
    console.log('[ANIMATOR] Animacion manana enviada');
  }

  if (hour === 14 && groups.length > 1) {
    await sendAnimation(groups[1], 'hype');
    console.log('[ANIMATOR] Animacion tarde enviada');
  }

  if (hour === 18 && groups.length > 2) {
    await sendAnimation(groups[2], 'surprise');
    console.log('[ANIMATOR] Sorpresa enviada');
  }

  if (hour === 21) {
    const randomGroup = groups[Math.floor(Math.random() * groups.length)];
    await sendAnimation(randomGroup, 'silence');
    console.log('[ANIMATOR] Mensaje de silencio enviado');
  }

  if (hour === 22) {
    await sendAnimation(groups[0], 'closing');
    console.log('[ANIMATOR] Cierre del dia enviado');
  }

  const dayOfWeek = now.getDay();
  if (dayOfWeek === 0 && hour === 20) {
    for (const group of groups) {
      await sendAnimation(group, 'recap');
    }
    console.log('[ANIMATOR] Recap semanal enviado');
  }
}

module.exports = {
  getGreeting,
  getHypeMessage,
  getSilenceMessage,
  getClosingMessage,
  getSurprise,
  generateSmartReaction,
  generateWeeklyRecap,
  sendAnimation,
  runScheduledAnimations,
  getRotationForDay,
};
