const axios = require('axios');
const config = require('../config');

const PROVIDERS = [
  {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'llama-3.3-70b-versatile',
    key: () => config.GROQ_API_KEY,
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    }),
  },
  {
    name: 'Google',
    url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
    model: 'gemini-2.0-flash',
    key: () => config.GOOGLE_AI_KEY,
    transform: (messages) => ({
      contents: messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    }),
    extractResponse: (data) => data.candidates?.[0]?.content?.parts?.[0]?.text,
    headers: (key) => ({
      'Content-Type': 'application/json',
      'x-goog-api-key': key,
    }),
  },
  {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: config.AI_MODEL || 'google/gemini-2.0-flash-exp:free',
    key: () => config.OPENROUTER_API_KEY,
    headers: (key) => ({
      'Authorization': `Bearer ${key}`,
      'HTTP-Referer': 'https://pokemon-orchestrator.onrender.com',
      'X-Title': 'Pokemon Orchestrator',
      'Content-Type': 'application/json',
    }),
  },
];

async function chat(messages, options = {}) {
  for (const provider of PROVIDERS) {
    const apiKey = provider.key();
    if (!apiKey) continue;

    try {
      console.log(`[AI] Intentando con ${provider.name}...`);

      let data;
      if (provider.transform) {
        data = provider.transform(messages);
      } else {
        data = {
          model: options.model || provider.model,
          messages,
          max_tokens: options.maxTokens || 500,
          temperature: options.temperature || 0.8,
        };
      }

      const res = await axios.post(provider.url, data, {
        headers: provider.headers(apiKey),
        timeout: 30000,
      });

      let content;
      if (provider.extractResponse) {
        content = provider.extractResponse(res.data);
      } else {
        content = res.data.choices?.[0]?.message?.content;
      }

      if (content) {
        console.log(`[AI] Exito con ${provider.name}`);
        return content;
      }
    } catch (e) {
      console.log(`[AI] ${provider.name} fallo: ${e.response?.data?.error?.message || e.message}`);
    }
  }

  console.error('[AI] Todos los proveedores fallaron');
  return null;
}

async function analyzeTrendsWithAI(trends) {
  const prompt = `Eres un asistente experto en Pokemon y marketing de comunidades.

Analiza estas tendencias y sugiere 5 ideas de contenido para una comunidad de Pokemon en WhatsApp:

Tendencias Pokemon:
${JSON.stringify(trends.pokemon?.trendingPokemon || [], null, 2)}

Noticias recientes:
${JSON.stringify(trends.news?.articles?.slice(0, 5) || [], null, 2)}

Para cada idea, responde en este formato EXACTO (una idea por linea):
IDEA: [tipo de contenido] | [grupo destino] | [descripcion breve]

Grupos disponibles: general, tienda, torneos, compra, subastas, rifas, anuncios
Tipos de contenido: pokemon-dia, ofertas, trivia, intercambios, subasta, rifas, anuncio, meme, quiz, dato-curioso

Sé creativo y relevante. Piensa en que genera mas interaccion.`;

  const response = await chat([{ role: 'user', content: prompt }], { maxTokens: 800 });
  if (!response) return [];

  const ideas = [];
  const lines = response.split('\n').filter(l => l.includes('IDEA:'));
  for (const line of lines) {
    const match = line.match(/IDEA:\s*(.+)/);
    if (match) {
      const parts = match[1].split('|').map(p => p.trim());
      if (parts.length >= 3) {
        ideas.push({
          contentType: parts[0],
          groupType: parts[1],
          description: parts[2],
        });
      }
    }
  }

  return ideas;
}

async function processFeedbackWithAI(message, context) {
  const prompt = `Eres el asistente de un bot de Pokemon WhatsApp. Un usuario te dio este feedback:

"${message}"

Contexto actual:
- Grupos activos: general, tienda, torneos, compra, subastas, rifas, anuncios
- Tipos de contenido: pokemon-dia, ofertas, trivia, intercambios, subasta, rifas, anuncio

Interpreta el feedback y responde en este formato JSON:
{
  "understanding": "Lo que el usuario quiere decir en una frase",
  "type": "content_adjustment|schedule_change|theme_change|general_feedback",
  "adjustments": [
    {
      "field": "campo a ajustar",
      "action": "acción a tomar",
      "value": "valor nuevo (si aplica)"
    }
  ],
  "response": "Respuesta amigable al usuario confirmando que entendiste"
}

Solo responde con el JSON, sin texto adicional.`;

  const response = await chat([{ role: 'user', content: prompt }], {
    maxTokens: 400,
    temperature: 0.3,
  });

  if (!response) return null;

  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('[AI] Error parsing feedback JSON:', e.message);
  }
  return null;
}

async function generateContentWithAI(contentType, theme, pokemonData) {
  const prompts = {
    'pokemon-dia': `Escribe un post para un grupo de Pokemon WhatsApp sobre el Pokemon del dia.
Pokemon: ${pokemonData?.name || 'aleatorio'}
Tipo: ${pokemonData?.types || 'desconocido'}
Estilo: Divertido, informativo, con emojis. Maximo 300 caracteres.
Termina con: "Envia *!pokemon* para ver otro Pokemon"`,

    'trivia': `Crea una pregunta de trivia Pokemon para un grupo de WhatsApp.
Tema: ${theme || 'general'}
Formato:
*TRIVIA DEL DIA*
[pregunta]
A) [opcion]
B) [opcion]
C) [opcion]
D) [opcion]
Responde con *!trivia [letra]*`,

    'ofertas': `Crea un post de ofertas para una tienda Pokemon.
Estilo: Emocionante, con descuentos ficticios. Usa asteriscos para negrita.
Termina con: "Escribe *!tienda* para pedidos"`,

    'intercambios': `Crea un post de intercambios Pokemon.
Estilo: Ofrece 3 Pokemon, pide 2 Pokemon.
Termina con: "Envia *!damepoke* para ver que puedes ofrecer"`,

    'subasta': `Crea una subasta de un articulo Pokemon.
Estilo: Descripcion del producto, precio inicial, puja minima.
Termina con: "Haz tu puja con *!subasta*"`,

    'rifas': `Crea una rifa Pokemon.
Estilo: Premio atractivo, precio del boleto, como participar.
Termina con: "Escribe *!rifa* para participar"`,

    'anuncio': `Crea un anuncio importante para la comunidad Pokemon.
Estilo: Formal pero amigable. Incluye reglas o informacion importante.`,

    'meme': `Crea un texto divertido/meme sobre Pokemon para un grupo de WhatsApp.
Estilo: Humor, referencias al juego/anime. Maximo 200 caracteres.`,

    'quiz': `Crea un quiz rapido de Pokemon con 3 preguntas.
Formato: Pregunta + respuesta correcta.`,

    'dato-curioso': `Crea un dato curioso interesante sobre Pokemon.
Estilo: Sorprendente, educativo. Maximo 200 caracteres.`,
  };

  const prompt = prompts[contentType] || prompts['pokemon-dia'];
  const response = await chat([{ role: 'user', content: prompt }], { maxTokens: 500 });
  return response;
}

async function chatWithUser(messages) {
  const systemPrompt = `Eres el asistente del Orchestrator de Pokemon WhatsApp.
Tu trabajo es:
1. Analizar tendencias de Pokemon
2. Proponer ideas de contenido
3. Programar envios diarios
4. Dar reportes de como va la comunidad
5. Discutir con el usuario que contenido crear

Sé conciso, amigable y usa emojis moderadamente.
Responde en español.`;

  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  return await chat(fullMessages, { maxTokens: 600 });
}

module.exports = {
  chat,
  analyzeTrendsWithAI,
  processFeedbackWithAI,
  generateContentWithAI,
  chatWithUser,
};
