module.exports = {
  PORT: process.env.PORT || 3002,
  MONGO_URI: process.env.MONGO_URI || '',
  MONGO_DB: process.env.MONGO_DB || 'pokemon_bots',

  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_ALLOWED_USERS: (process.env.TELEGRAM_ALLOWED_USERS || '').split(',').filter(Boolean),

  CONTENT_BOT_URL: process.env.CONTENT_BOT_URL || '',
  COMMUNITY_BOT_URL: process.env.COMMUNITY_BOT_URL || '',
  TOYTSUKY_URL: process.env.TOYTSUKY_URL || '',

  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  AI_MODEL: process.env.AI_MODEL || 'google/gemini-2.0-flash-001',

  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '',

  TIMEZONE: process.env.TIMEZONE || 'America/Bogota',
  PLAN_HOUR: parseInt(process.env.PLAN_HOUR || '1'),
  PLAN_MINUTE: parseInt(process.env.PLAN_MINUTE || '0'),
  ANALYTICS_HOUR: parseInt(process.env.ANALYTICS_HOUR || '23'),

  GROUPS_ROTATION: [
    ['general', 'tienda', 'torneos'],
    ['compra', 'rifas', 'anuncios'],
    ['general', 'subastas', 'rifas'],
    ['tienda', 'torneos', 'compra'],
    ['anuncios', 'general', 'subastas'],
    ['rifas', 'tienda', 'torneos'],
    ['compra', 'subastas', 'anuncios'],
  ],
};
