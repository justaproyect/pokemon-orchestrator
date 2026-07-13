const axios = require('axios');
const config = require('../config');
const { getDb } = require('../mongo');

const POLLINATIONS_URL = 'https://image.pollinations.ai/prompt';

function generateImageUrl(prompt, options = {}) {
  const width = options.width || 800;
  const height = options.height || 600;
  const seed = options.seed || Math.floor(Math.random() * 1000000);

  const encodedPrompt = encodeURIComponent(prompt);
  return `${POLLINATIONS_URL}/${encodedPrompt}?width=${width}&height=${height}&seed=${seed}&nologo=true`;
}

async function generateImage(prompt, options = {}) {
  const pollinationsUrl = generateImageUrl(prompt, options);

  console.log('[IMG] Generando imagen:', prompt.substring(0, 60) + '...');

  try {
    const response = await axios.get(pollinationsUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
      maxRedirects: 5,
    });

    const buffer = Buffer.from(response.data);
    if (buffer.length < 1000) {
      console.error('[IMG] Imagen muy pequena, posible error');
      return { url: null, buffer: null };
    }

    console.log('[IMG] Imagen generada:', (buffer.length / 1024).toFixed(1) + 'KB');

    const cloudinaryUrl = await uploadToCloudinary(buffer, options.filename || 'plan_' + Date.now());
    if (cloudinaryUrl) {
      return { url: cloudinaryUrl, buffer: null };
    }

    return { url: pollinationsUrl, buffer: buffer };
  } catch (e) {
    console.error('[IMG] Error generando imagen:', e.message);
    return { url: null, buffer: null };
  }
}

async function uploadToCloudinary(buffer, filename) {
  if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
    console.log('[IMG] Cloudinary no configurado');
    return null;
  }

  try {
    const cloudinary = require('cloudinary').v2;
    cloudinary.config({
      cloud_name: config.CLOUDINARY_CLOUD_NAME,
      api_key: config.CLOUDINARY_API_KEY,
      api_secret: config.CLOUDINARY_API_SECRET,
    });

    return new Promise((resolve) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'pokemon-bot/plans',
          public_id: filename || `plan_${Date.now()}`,
          resource_type: 'image',
        },
        (error, result) => {
          if (error) {
            console.error('[IMG] Error subiendo a Cloudinary:', error.message);
            resolve(null);
          } else {
            console.log('[IMG] Subido a Cloudinary:', result.secure_url);
            resolve(result.secure_url);
          }
        }
      );
      stream.end(buffer);
    });
  } catch (e) {
    console.error('[IMG] Error Cloudinary:', e.message);
    return null;
  }
}

async function generateContentWithImage(contentType, theme, pokemonData) {
  const imagePrompts = {
    'pokemon-dia': (poke) => `Pokemon ${poke?.name || 'Pikachu'} official artwork, colorful, detailed, white background, high quality illustration, anime style`,
    'trivia': () => `Pokemon trivia quiz, colorful pokeball background, fun educational style, vibrant colors, anime`,
    'ofertas': () => `Pokemon store sale promotion, colorful deals banner, pokeball theme, exciting shopping, anime style`,
    'intercambios': () => `Pokemon trading cards exchange, two trainers trading pokemon, colorful anime style`,
    'subasta': () => `Pokemon rare card auction, golden shimmer, luxury item display, dramatic lighting, anime`,
    'rifas': () => `Pokemon raffle lottery prize, golden pokeball, celebration confetti, exciting giveaway, anime`,
    'anuncio': () => `Pokemon community announcement, friendly pokemon characters gathering, warm welcoming scene, anime`,
    'meme': () => `Funny pokemon meme, cute pokemon doing something silly, humor style, colorful, anime`,
    'quiz': () => `Pokemon quiz challenge, question marks with pokeballs, fun learning style, anime`,
    'dato-curioso': () => `Pokemon fun fact, cute pokemon with lightbulb, educational illustration style, anime`,
  };

  const promptFn = imagePrompts[contentType] || imagePrompts['pokemon-dia'];
  const prompt = promptFn(pokemonData);

  const filename = `${contentType}_${pokemonData?.name || 'general'}_${Date.now()}`;
  const result = await generateImage(prompt, { filename });

  return {
    imageUrl: result.url,
    imageBuffer: result.buffer,
  };
}

module.exports = { generateImage, generateImageUrl, uploadToCloudinary, generateContentWithImage };
