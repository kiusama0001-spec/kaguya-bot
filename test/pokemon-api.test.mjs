import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPokemonCache, fetchPokemon, fetchPokemonSpecies, fetchEvolutionChain,
  fetchPokemonMoves, fetchItem, fetchTypeEffectiveness, pokemonTypeEffectiveness,
  recommendTeam,
} from '../artifacts/api-server/src/lib/pokemon.mjs';

const response = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const originalFetch = globalThis.fetch;
function mockFetch(handler) { globalThis.fetch = async (url, options) => { assert.ok(options.signal, 'HTTP requests must have a timeout signal'); return handler(new URL(url)); }; }
function afterTest() { globalThis.fetch = originalFetch; clearPokemonCache(); }

test('PokéAPI client caches successful resources and reuses the same value', async () => {
  clearPokemonCache(); let calls = 0;
  mockFetch(() => { calls++; return response({ id: 25, name: 'pikachu', types: [] }); });
  const first = await fetchPokemon('pikachu'); const second = await fetchPokemon('pikachu');
  assert.equal(first.name, 'pikachu'); assert.equal(second.id, 25); assert.equal(calls, 1); afterTest();
});

test('PokéAPI client rejects unsafe identifiers before making a request', async () => {
  clearPokemonCache(); let called = false;
  mockFetch(() => { called = true; return response({}); });
  await assert.rejects(fetchPokemon('../secret'), /Identificador inválido/);
  await assert.rejects(fetchTypeEffectiveness('fire?x=1'), /Identificador inválido/);
  assert.equal(called, false); afterTest();
});

test('PokéAPI missing resources return a clear 404 error', async () => {
  clearPokemonCache(); mockFetch(() => response({}, 404));
  await assert.rejects(fetchPokemon('missingmon'), /No encontré ese recurso/); afterTest();
});

test('evolution lookup returns the chain and condition from live species references', async () => {
  clearPokemonCache();
  mockFetch((url) => {
    if (url.pathname === '/api/v2/pokemon-species/eevee/') return response({ name: 'eevee', evolution_chain: { url: 'https://pokeapi.co/api/v2/evolution-chain/67/' } });
    if (url.pathname === '/api/v2/evolution-chain/67/') return response({ chain: { species: { name: 'eevee' }, evolves_to: [{ species: { name: 'vaporeon' }, evolution_details: [{ trigger: { name: 'use-item' }, item: { name: 'water-stone' } }], evolves_to: [] }] } });
    throw new Error(`Unexpected path ${url.pathname}`);
  });
  const chain = await fetchEvolutionChain('eevee');
  assert.deepEqual(chain.stages.map((x) => x.name), ['eevee', 'vaporeon']);
  assert.match(chain.stages[1].condition, /water-stone/); afterTest();
});

test('move and item lookup return real API names and learning methods', async () => {
  clearPokemonCache();
  mockFetch((url) => {
    if (url.pathname === '/api/v2/pokemon/pikachu/') return response({ id: 25, name: 'pikachu', moves: [{ move: { name: 'thunderbolt' }, version_group_details: [{ move_learn_method: { name: 'level-up' }, level_learned_at: 26, version_group: { name: 'red-blue' } }] }] });
    if (url.pathname === '/api/v2/item/water-stone/') return response({ id: 84, name: 'water-stone', cost: 2100, effect_entries: [{ short_effect: 'Evolves certain Pokémon.' }] });
    throw new Error(`Unexpected path ${url.pathname}`);
  });
  const moves = await fetchPokemonMoves('pikachu'); const item = await fetchItem('water-stone');
  assert.equal(moves.moves[0].name, 'thunderbolt'); assert.equal(moves.moves[0].methods[0].level, 26);
  assert.equal(item.name, 'water-stone'); assert.equal(item.cost, 2100); afterTest();
});

test('type-effectiveness helpers expose attack, weakness, resistance and immunity relations', async () => {
  clearPokemonCache();
  mockFetch((url) => {
    if (url.pathname === '/api/v2/type/fire/') return response({ name: 'fire', damage_relations: { double_damage_to: [{ name: 'grass' }], half_damage_to: [{ name: 'water' }], no_damage_to: [], double_damage_from: [{ name: 'water' }, { name: 'ground' }], half_damage_from: [{ name: 'fire' }], no_damage_from: [] } });
    if (url.pathname === '/api/v2/pokemon/charmander/') return response({ id: 4, name: 'charmander', types: [{ type: { name: 'fire' } }] });
    throw new Error(`Unexpected path ${url.pathname}`);
  });
  const offensive = await fetchTypeEffectiveness('fire'); const defensive = await pokemonTypeEffectiveness('charmander');
  assert.deepEqual(offensive.offensive.superEffective, ['grass']);
  assert.deepEqual(defensive.double.sort(), ['ground', 'water']);
  assert.deepEqual(defensive.half, ['fire']); afterTest();
});

// Recommendations are intentionally tested with a constrained fake dataset: it proves the algorithm
// consumes the live type endpoints and bounds team size, without depending on external network access.
test('team recommendations reject empty input and cap the requested team at six Pokémon', async () => {
  await assert.rejects(recommendTeam([]), /Indica uno o más Pokémon/);
  let pokemonCalls = 0;
  const typeData = {
    electric: { double_damage_from: [{ name: 'ground' }] },
    ground: { half_damage_to: [{ name: 'bug' }], no_damage_to: [{ name: 'flying' }], double_damage_to: [{ name: 'electric' }] },
    bug: { pokemon: [{ pokemon: { name: 'bugmon' } }] },
    flying: { pokemon: [{ pokemon: { name: 'flymon' } }] },
  };
  mockFetch((url) => {
    const name = url.pathname.split('/').filter(Boolean).at(-1);
    if (url.pathname.startsWith('/api/v2/pokemon/')) {
      pokemonCalls++;
      const type = name === 'bugmon' ? 'bug' : name === 'flymon' ? 'flying' : 'electric';
      return response({ id: pokemonCalls, name, types: [{ type: { name: type } }], stats: [{ base_stat: 50 }] });
    }
    if (url.pathname.startsWith('/api/v2/type/')) return response({ name, damage_relations: typeData[name] ?? {}, pokemon: typeData[name]?.pokemon ?? [] });
    throw new Error(`Unexpected path ${url.pathname}`);
  });
  const team = await recommendTeam(['a','b','c','d','e','f','g']);
  assert.equal(team.team.length, 6);
  assert.deepEqual(team.weaknessesToReview, ['ground']);
  assert.deepEqual(team.suggestions.map((item) => item.name).sort(), ['bugmon', 'flymon']);
  assert.deepEqual(team.suggestions.map((item) => item.helpsCover).sort(), ['bug', 'flying']);
  afterTest();
});
