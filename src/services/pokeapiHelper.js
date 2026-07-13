const axios = require('axios');

const BASE_URL = 'https://pokeapi.co/api/v2';

const POKEMON_NAMES = {
  'bulbasaur': 1, 'ivysaur': 2, 'venusaur': 3,
  'charmander': 4, 'charmeleon': 5, 'charizard': 6,
  'squirtle': 7, 'wartortle': 8, 'blastoise': 9,
  'pikachu': 25, 'raichu': 26,
  'clefairy': 35, 'clefable': 36,
  'jigglypuff': 39, 'wigglytuff': 40,
  'gastly': 92, 'haunter': 93, 'gengar': 94,
  'dratini': 147, 'dragonair': 148, 'dragonite': 149,
  'mewtwo': 150, 'mew': 151,
  'eevee': 133, 'vaporeon': 134, 'jolteon': 135, 'flareon': 136,
  'snorlax': 143, 'lapras': 131, 'gyarados': 130,
  'alakazam': 65, 'machamp': 68, 'golem': 76,
  'arcanine': 59, 'starmie': 121, 'ninetales': 38,
};

async function getRandomPokemon() {
  const id = Math.floor(Math.random() * 151) + 1;
  try {
    const res = await axios.get(`${BASE_URL}/pokemon/${id}`, { timeout: 10000 });
    const pokemon = res.data;
    return {
      id: pokemon.id,
      name: pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1),
      types: pokemon.types.map(t => t.type.name).join('/'),
      imageUrl: pokemon.sprites.other['official-artwork'].front_default || pokemon.sprites.front_default,
    };
  } catch (e) {
    return { id: 25, name: 'Pikachu', types: 'electric', imageUrl: null };
  }
}

async function getPokemonByName(name) {
  const id = POKEMON_NAMES[name.toLowerCase()];
  if (!id) return null;
  try {
    const res = await axios.get(`${BASE_URL}/pokemon/${id}`, { timeout: 10000 });
    const pokemon = res.data;
    return {
      id: pokemon.id,
      name: pokemon.name.charAt(0).toUpperCase() + pokemon.name.slice(1),
      types: pokemon.types.map(t => t.type.name).join('/'),
      imageUrl: pokemon.sprites.other['official-artwork'].front_default || pokemon.sprites.front_default,
    };
  } catch (e) {
    return null;
  }
}

module.exports = { getRandomPokemon, getPokemonByName };
