const config = require('../config');
const { getDb } = require('../mongo');
const ai = require('./ai');
const imageGen = require('./imageGenerator');
const pokeapi = require('./pokeapiHelper');

const CONTENT_TYPES = {
  'pokemon-dia': { group: 'general', generateText: true, generateImage: true },
  'trivia': { group: 'torneos', generateText: true, generateImage: true },
  'ofertas': { group: 'tienda', generateText: true, generateImage: true },
  'intercambios': { group: 'compra', generateText: true, generateImage: true },
  'subasta': { group: 'subastas', generateText: true, generateImage: true },
  'rifas': { group: 'rifas', generateText: true, generateImage: true },
  'anuncio': { group: 'anuncios', generateText: true, generateImage: true },
  'meme': { group: 'general', generateText: true, generateImage: true },
  'quiz': { group: 'torneos', generateText: true, generateImage: true },
  'dato-curioso': { group: 'general', generateText: true, generateImage: true },
};

async function generateText(contentType, theme, pokemonData) {
  if (!config.OPENROUTER_API_KEY) {
    return generateFallbackText(contentType, pokemonData);
  }

  const prompts = {
    'pokemon-dia': `Escribe un post para WhatsApp sobre el Pokemon del dia.
Pokemon: ${pokemonData?.name || 'Pikachu'}
Tipo: ${pokemonData?.types || 'electric'}
Formato: Emoji + titulo + descripcion + datos curiosos + call to action.
Maximo 400 caracteres. Usa *para negrita.`,
    'trivia': `Crea una pregunta de trivia Pokemon para WhatsApp.
Formato: Titulo + pregunta + 4 opciones (A,B,C,D) + "Responde con *!trivia [letra]*"`,
    'ofertas': `Crea un post de ofertas para tienda Pokemon WhatsApp.
Incluye 2-3 productos con precios y descuentos ficticios.
Termina con "Escribe *!tienda* para pedidos"`,
    'intercambios': `Crea un post de intercambios Pokemon.
Ofrece 3 Pokemon, pide 2.
Termina con "Envia *!damepoke* para ver que puedes ofrecer"`,
    'subasta': `Crea una subasta de articulo Pokemon.
Producto, precio inicial, puja minima.
Termina con "Haz tu puja con *!subasta*"`,
    'rifas': `Crea una rifa Pokemon.
Premio, precio boleto, como participar.
Termina con "Escribe *!rifa* para participar"`,
    'anuncio': `Crea un anuncio para la comunidad Pokemon.
Formal pero amigable. Reglas o informacion importante.`,
    'meme': `Crea un texto divertido/meme Pokemon para WhatsApp.
Humor, referencias al juego/anime. Maximo 200 caracteres.`,
    'quiz': `Crea un quiz rapido de Pokemon con 3 preguntas y respuestas.`,
    'dato-curioso': `Crea un dato curioso interesante sobre Pokemon.
Sorprendente, educativo. Maximo 200 caracteres.`,
  };

  const prompt = prompts[contentType] || prompts['pokemon-dia'];
  const response = await ai.chat([{ role: 'user', content: prompt }], { maxTokens: 500 });
  return response || generateFallbackText(contentType, pokemonData);
}

function generateFallbackText(contentType, pokemonData) {
  const fallbacks = {
    'pokemon-dia': `*POKEMON DEL DIA*\n\n${pokemonData?.name || 'Pikachu'} - ${pokemonData?.types || 'electrico'}\n\nEnvia *!pokemon* para ver otro Pokemon`,
    'trivia': '*TRIVIA DEL DIA*\n\nCual es el Pokemon mas rapido del mundo?\nA) Electrode\nB) Ninjask\nC) Deoxys Speed\nD) Jolteon\n\nResponde con *!trivia [letra]*',
    'ofertas': '*OFERTAS DEL DIA*\n\n- Figura Pikachu 30% OFF\n- Camiseta Pokemon 20% OFF\n\nEscribe *!tienda* para pedidos',
    'intercambios': '*INTERCAMBIOS*\n\nOfrezco: Charizard, Blastoise, Venusaur\nBusco: Dragonite, Gengar\n\nEnvia *!damepoke*',
    'subasta': '*SUBASTA*\n\nCarta Charizard PSA 9\nPrecio inicial: $500.000\n\nHaz tu puja con *!subasta*',
    'rifas': '*RIFA*\n\nPremio: Figura Pikachu gigante\nBoleto: $5.000\n\nEscribe *!rifa* para participar',
    'anuncio': '*AVISO*\n\nRecuerden respetar las reglas del grupo.\nGracias por ser parte!',
    'meme': 'Cuando tu Pokemon no obedece en batalla... 😅\n\nEnvia *!pokemon* para mas diversión',
    'quiz': '*QUIZ POKEMON*\n\n1. Cuantos Pokemon hay en la Pokedex Nacional?\n2. Quien es el rival de Ash?\n3. Cuál es elPokemon mas pesado?',
    'dato-curioso': '*DATO CURIOSO*\n\n¿Sabias que Magikarp puede saltar montañas? Segun la leyenda, puede saltar cualquier obstaculo.',
  };
  return fallbacks[contentType] || fallbacks['pokemon-dia'];
}

async function generateFullContent(postId, contentType, theme, groupType) {
  const db = getDb();
  console.log(`[CONTENT] Generando contenido completo: ${contentType} para ${groupType}`);

  let pokemonData = null;
  if (contentType === 'pokemon-dia' || theme?.includes('pokemon')) {
    pokemonData = await pokeapi.getRandomPokemon();
  }

  const [message, imageData] = await Promise.all([
    generateText(contentType, theme, pokemonData),
    imageGen.generateContentWithImage(contentType, theme, pokemonData),
  ]);

  const content = {
    postId,
    date: new Date().toISOString().split('T')[0],
    groupType,
    status: 'pending_review',
    contentType,
    message: message || '',
    imageUrl: imageData?.imageUrl || null,
    imageBuffer: null,
    pokemonData: pokemonData ? {
      id: pokemonData.id,
      name: pokemonData.name,
      types: pokemonData.types,
    } : null,
    aiModel: config.OPENROUTER_API_KEY ? config.AI_MODEL : 'template',
    generatedAt: new Date(),
    reviewedAt: null,
    approvedBy: null,
    sentAt: null,
    sentToGroups: [],
    engagement: { reactions: 0, replies: 0, forwards: 0 },
  };

  await db.collection('generated_content').insertOne(content);
  console.log(`[CONTENT] Generado: ${contentType} - imagen: ${imageData?.imageUrl ? 'Cloudinary' : 'no'}`);

  return content;
}

async function generatePlanContent(plan) {
  const db = getDb();
  const results = [];

  for (const post of plan.posts) {
    try {
      const content = await generateFullContent(
        post.postId,
        post.contentType,
        post.theme,
        post.groupType
      );
      results.push(content);
    } catch (e) {
      console.error(`[CONTENT] Error generando ${post.postId}:`, e.message);
    }
  }

  if (results.length > 0) {
    await db.collection('plans').updateOne(
      { date: plan.date },
      { $set: { status: 'pending_review', updatedAt: new Date() } }
    );
    console.log(`[CONTENT] Plan ${plan.date} listo para revision: ${results.length}/${plan.posts.length} posts generados`);
  }

  return results;
}

module.exports = { generateFullContent, generatePlanContent, generateText, CONTENT_TYPES };
