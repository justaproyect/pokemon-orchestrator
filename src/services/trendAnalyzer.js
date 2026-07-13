const axios = require('axios');
const { getDb } = require('../mongo');

const TREND_SOURCES = {
  pokemon: {
    pokeApi: 'https://pokeapi.co/api/v2/pokemon?limit=151',
    tcgApi: 'https://api.pokemontcg.io/v2/cards?orderBy=-set.releaseDate&pageSize=10',
  },
  news: {
    googleNews: 'https://news.google.com/rss/search?q=pokemon+when:1d&hl=es-419&gl=CO&ceid=CO:es-419',
  },
};

async function fetchPokemonTrends() {
  try {
    const [pokeRes, tcgRes] = await Promise.all([
      axios.get('https://pokeapi.co/api/v2/pokemon?limit=151', { timeout: 10000 }),
      axios.get('https://api.pokemontcg.io/v2/cards?orderBy=-set.releaseDate&pageSize=10', { timeout: 10000 }).catch(() => null),
    ]);

    const recentCards = tcgRes?.data?.data || [];
    const trendingPokemon = recentCards.map(card => ({
      name: card.name,
      set: card.set?.name || 'Unknown',
      rarity: card.rarity || 'Common',
      imageUrl: card.images?.small || null,
      price: card.cardmarket?.prices?.averagePrice || null,
    }));

    return {
      source: 'pokemon_tcg',
      trendingPokemon: trendingPokemon.slice(0, 5),
      totalCards: pokeRes.data.count,
      fetchedAt: new Date(),
    };
  } catch (e) {
    console.error('[TRENDS] Error fetching Pokemon trends:', e.message);
    return null;
  }
}

async function fetchGoogleNews() {
  try {
    const res = await axios.get(
      'https://news.google.com/rss/search?q=pokemon+when:1d&hl=es-419&gl=CO&ceid=CO:es-419',
      { timeout: 10000 }
    );

    const xml = res.data;
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 10) {
      const itemXml = match[1];
      const title = itemXml.match(/<title>(.*?)<\/title>/)?.[1] || '';
      const link = itemXml.match(/<link>(.*?)<\/link>/)?.[1] || '';
      const pubDate = itemXml.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';

      if (title) {
        items.push({
          title: title.replace(/<!\[CDATA\[|\]\]>/g, ''),
          link,
          pubDate,
        });
      }
    }

    return {
      source: 'google_news',
      articles: items,
      fetchedAt: new Date(),
    };
  } catch (e) {
    console.error('[TRENDS] Error fetching news:', e.message);
    return null;
  }
}

async function analyzeTrends() {
  const db = getDb();
  const results = await Promise.all([
    fetchPokemonTrends(),
    fetchGoogleNews(),
  ]);

  const trends = {
    fetchedAt: new Date(),
    pokemon: results[0],
    news: results[1],
    themes: extractThemes(results),
  };

  await db.collection('trends').insertOne(trends);
  console.log('[TRENDS] Analisis completado:', trends.themes.length, 'temas detectados');

  return trends;
}

function extractThemes(results) {
  const themes = [];

  if (results[0]?.trendingPokemon) {
    for (const poke of results[0].trendingPokemon) {
      themes.push({
        type: 'pokemon_card',
        name: poke.name,
        set: poke.set,
        rarity: poke.rarity,
        idea: `Publicar sobre la carta ${poke.name} de ${poke.set} (${poke.rarity})`,
      });
    }
  }

  if (results[1]?.articles) {
    const keywords = ['raid', 'evento', 'torneo', 'raro', 'nuevo', 'lanzamiento', 'carta'];
    for (const article of results[1].articles) {
      const lower = article.title.toLowerCase();
      for (const kw of keywords) {
        if (lower.includes(kw)) {
          themes.push({
            type: 'news',
            title: article.title,
            keyword: kw,
            idea: `Crear contenido basado en: ${article.title}`,
          });
          break;
        }
      }
    }
  }

  const defaultThemes = [
    { type: 'seasonal', idea: 'Contenido tematico del momento' },
    { type: 'community', idea: 'Post para fomentar interaccion' },
    { type: 'educational', idea: 'Tip o dato curioso de Pokemon' },
  ];

  while (themes.length < 5) {
    themes.push(defaultThemes[themes.length % defaultThemes.length]);
  }

  return themes;
}

async function getLatestTrends() {
  const db = getDb();
  return await db.collection('trends').findOne({}, { sort: { fetchedAt: -1 } });
}

module.exports = { analyzeTrends, getLatestTrends };
