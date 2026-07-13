const axios = require('axios');
const { getDb } = require('../mongo');

const POLLINATIONS_URL = 'https://image.pollinations.ai/prompt';

async function generateImage(prompt, options = {}) {
  const width = options.width || 800;
  const height = options.height || 600;
  const seed = options.seed || Math.floor(Math.random() * 1000000);

  const encodedPrompt = encodeURIComponent(prompt);
  const url = `${POLLINATIONS_URL}/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;

  console.log('[IMG] Generando imagen:', prompt.substring(0, 60) + '...');

  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxRedirects: 5,
    });

    const buffer = Buffer.from(response.data);
    if (buffer.length < 1000) {
      console.error('[IMG] Imagen muy pequena, posible error');
      return null;
    }

    console.log('[IMG] Imagen generada:', (buffer.length / 1024).toFixed(1) + 'KB');
    return buffer;
  } catch (e) {
    console.error('[IMG] Error generando imagen:', e.message);
    return null;
  }
}

async function uploadToCloudinary(buffer, filename, type = 'image') {
  const config = require('../config');
  if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
    console.log('[IMG] Cloudinary no configurado, guardando como buffer local');
    return { url: null, buffer: buffer };
  }

  const cloudinary = require('cloudinary').v2;
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
  });

  return new Promise((resolve, reject) => {
    const resourceType = type === 'video' ? 'video' : 'image';
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'pokemon-bot/plans',
        public_id: filename || `plan_${Date.now()}`,
        resource_type: resourceType,
      },
      (error, result) => {
        if (error) {
          console.error('[IMG] Error subiendo a Cloudinary:', error.message);
          resolve({ url: null, buffer: buffer });
        } else {
          console.log('[IMG] Subido a Cloudinary:', result.secure_url);
          resolve({ url: result.secure_url, buffer: null });
        }
      }
    );
    stream.end(buffer);
  });
}

async function generateContentWithImage(contentType, theme, pokemonData) {
  const imagePrompts = {
    'pokemon-dia': (poke) => `Pokemon ${poke?.name || 'Pikachu'} official art style, colorful, detailed, white background, high quality illustration`,
    'trivia': () => `Pokemon trivia quiz question, colorful pokeball background, fun educational style, vibrant colors`,
    'ofertas': () => `Pokemon store sale promotion, colorful deals banner, pokeball theme, exciting shopping atmosphere`,
    'intercambios': () => `Pokemon trading cards exchange, two trainers trading pokemon, colorful anime style`,
    'subasta': () => `Pokemon rare card auction, golden shimmer, luxury item display, dramatic lighting`,
    'rifas': () => `Pokemon raffle lottery prize, golden pokeball, celebration confetti, exciting giveaway`,
    'anuncio': () => `Pokemon community announcement, friendly pokemon characters gathering, warm welcoming scene`,
    'meme': () => `Funny pokemon meme, cute pokemon doing something silly, humor style, colorful`,
    'quiz': () => `Pokemon quiz challenge, question marks with pokeballs, fun learning style`,
    'dato-curioso': () => `Pokemon fun fact, cute pokemon with lightbulb, educational illustration style`,
  };

  const promptFn = imagePrompts[contentType] || imagePrompts['pokemon-dia'];
  const prompt = promptFn(pokemonData);

  const imageBuffer = await generateImage(prompt);
  if (!imageBuffer) return { imageUrl: null, imageBuffer: null };

  const filename = `plan_${contentType}_${Date.now()}`;
  const cloudinaryResult = await uploadToCloudinary(imageBuffer, filename);

  return {
    imageUrl: cloudinaryResult.url,
    imageBuffer: cloudinaryResult.buffer,
  };
}

module.exports = { generateImage, uploadToCloudinary, generateContentWithImage };
