const API = "https://pokeapi.co/api/v2";
const CACHE_TTL = 15 * 60_000;
const CACHE_LIMIT = 500;
const cache = new Map();

export const TYPE_ES = Object.freeze({
  normal: "normal", fire: "fuego", water: "agua", electric: "eléctrico", grass: "planta",
  ice: "hielo", fighting: "lucha", poison: "veneno", ground: "tierra", flying: "volador",
  psychic: "psíquico", bug: "bicho", rock: "roca", ghost: "fantasma", dragon: "dragón",
  dark: "siniestro", steel: "acero", fairy: "hada",
});

function normalizeId(value) {
  const id = String(value ?? "").trim().toLowerCase().normalize("NFKC").replace(/\s+/g, "-");
  if (!/^[a-z0-9-]{1,60}$/.test(id)) throw new Error("Identificador inválido. Usa un nombre o número de PokéAPI.");
  return id;
}

async function api(path) {
  if (!/^\/[a-z-]+\/[a-z0-9-]{1,60}\/?$/.test(path)) throw new Error("Ruta de PokéAPI no permitida.");
  const key = path.toLowerCase();
  const now = Date.now();
  const previous = cache.get(key);
  if (previous && now - previous.at < CACHE_TTL) return previous.value;
  const response = await fetch(`${API}${path}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (response.status === 404) throw new Error("No encontré ese recurso en PokéAPI.");
  if (!response.ok) throw new Error(`PokéAPI respondió HTTP ${response.status}.`);
  const value = await response.json();
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { at: now, value });
  return value;
}

export async function fetchPokemon(identifier) {
  const id = normalizeId(identifier);
  return api(`/pokemon/${id}/`);
}

export async function fetchPokemonSpecies(identifier) {
  const id = normalizeId(identifier);
  return api(`/pokemon-species/${id}/`);
}

export async function fetchEvolutionChain(identifier) {
  const species = await fetchPokemonSpecies(identifier);
  const rawUrl = species?.evolution_chain?.url;
  const match = typeof rawUrl === "string" && rawUrl.match(/^https:\/\/pokeapi\.co\/api\/v2\/evolution-chain\/(\d+)\/$/);
  if (!match) throw new Error("PokéAPI no devolvió una cadena evolutiva válida.");
  const chain = await api(`/evolution-chain/${match[1]}/`);
  const stages = [];
  const walk = (node, depth = 0, condition = "") => {
    stages.push({ name: node.species.name, depth, condition });
    for (const next of node.evolves_to ?? []) {
      const detail = next.evolution_details?.[0] ?? {};
      const parts = [];
      if (detail.min_level) parts.push(`nivel ${detail.min_level}`);
      if (detail.item?.name) parts.push(`objeto ${detail.item.name}`);
      if (detail.min_happiness) parts.push(`amistad ${detail.min_happiness}+`);
      if (detail.time_of_day) parts.push(`de ${detail.time_of_day}`);
      if (detail.known_move?.name) parts.push(`con movimiento ${detail.known_move.name}`);
      if (detail.location?.name) parts.push(`en ${detail.location.name}`);
      if (detail.trigger?.name === "trade") parts.push("intercambio");
      else if (detail.trigger?.name === "use-item" && !detail.item?.name) parts.push("usar un objeto evolutivo");
      else if (detail.trigger?.name === "level-up" && !detail.min_level) parts.push("subir de nivel (condición especial)");
      walk(next, depth + 1, parts.join(", ") || "condición específica del juego");
    }
  };
  walk(chain.chain);
  return { species: species.name, stages, url: `https://pokeapi.co/api/v2/evolution-chain/${match[1]}/` };
}

export async function fetchPokemonMoves(identifier, limit = 20) {
  const pokemon = await fetchPokemon(identifier);
  const moves = (pokemon.moves ?? []).slice(0, Math.max(1, Math.min(30, limit))).map((entry) => {
    const methods = (entry.version_group_details ?? []).map((detail) => ({
      method: detail.move_learn_method?.name ?? "unknown",
      level: detail.level_learned_at ?? 0,
      version: detail.version_group?.name ?? "",
    }));
    return { name: entry.move.name, methods };
  });
  return { name: pokemon.name, id: pokemon.id, moves, url: `https://pokeapi.co/api/v2/pokemon/${pokemon.id}/` };
}

export async function fetchItem(identifier) {
  const id = normalizeId(identifier);
  return api(`/item/${id}/`);
}

export async function fetchType(identifier) {
  const id = normalizeId(identifier);
  return api(`/type/${id}/`);
}

export async function pokemonTypeEffectiveness(identifier) {
  const pokemon = await fetchPokemon(identifier);
  const typeNames = pokemon.types.map((entry) => entry.type.name);
  const incoming = new Map();
  for (const defendingType of typeNames) {
    const type = await fetchType(defendingType);
    const relations = type.damage_relations;
    const apply = (entries, factor) => entries.forEach((entry) => incoming.set(entry.name, (incoming.get(entry.name) ?? 1) * factor));
    apply(relations.double_damage_from ?? [], 2);
    apply(relations.half_damage_from ?? [], 0.5);
    apply(relations.no_damage_from ?? [], 0);
  }
  const grouped = { four: [], double: [], half: [], quarter: [], immune: [] };
  for (const [type, factor] of incoming) {
    if (factor === 4) grouped.four.push(type);
    else if (factor === 2) grouped.double.push(type);
    else if (factor === 0.5) grouped.half.push(type);
    else if (factor === 0.25) grouped.quarter.push(type);
    else if (factor === 0) grouped.immune.push(type);
  }
  return { name: pokemon.name, types: typeNames, ...grouped, source: `https://pokeapi.co/api/v2/pokemon/${pokemon.id}/` };
}

export async function fetchTypeEffectiveness(identifier) {
  const name = normalizeId(identifier);
  const type = await fetchType(name);
  const relations = type.damage_relations;
  const names = (key) => (relations[key] ?? []).map((entry) => entry.name);
  return {
    name,
    url: `https://pokeapi.co/api/v2/type/${name}/`,
    offensive: {
      superEffective: names("double_damage_to"),
      notVeryEffective: names("half_damage_to"),
      noEffect: names("no_damage_to"),
    },
    defensive: {
      weaknesses: names("double_damage_from"),
      resistances: names("half_damage_from"),
      immunities: names("no_damage_from"),
    },
  };
}

export async function recommendTeam(identifiers) {
  const inputs = identifiers.map((value) => String(value).trim()).filter(Boolean).slice(0, 6);
  if (!inputs.length) throw new Error("Indica uno o más Pokémon para evaluar el equipo. Ejemplo: /equipo pikachu charizard");
  const team = await Promise.all(inputs.map((value) => fetchPokemon(value)));
  const teamTypes = new Set(team.flatMap((pokemon) => pokemon.types.map((entry) => entry.type.name)));
  const defensiveWeaknesses = new Map();
  for (const typeName of teamTypes) {
    const type = await fetchType(typeName);
    for (const attackingType of type.damage_relations.double_damage_from ?? []) {
      defensiveWeaknesses.set(attackingType.name, (defensiveWeaknesses.get(attackingType.name) ?? 0) + 1);
    }
  }
  const priorities = [...defensiveWeaknesses.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([type]) => type);
  const candidateTypes = new Set();
  for (const attackType of priorities) {
    const attacking = await fetchType(attackType);
    // On the attacker's type resource, half_damage_to/no_damage_to identify
    // defender types that resist or are immune to that threat. double_damage_to
    // would recommend types weak to the threat (the previous logic was inverted).
    for (const counter of [
      ...(attacking.damage_relations.half_damage_to ?? []),
      ...(attacking.damage_relations.no_damage_to ?? []),
    ]) {
      if (!teamTypes.has(counter.name)) candidateTypes.add(counter.name);
    }
  }
  const suggestions = [];
  for (const typeName of [...candidateTypes].slice(0, 5)) {
    try {
      const type = await fetchType(typeName);
      const candidates = (type.pokemon ?? []).slice(0, 8).map((entry) => entry.pokemon?.name).filter(Boolean);
      for (const candidate of candidates) {
        if (team.some((pokemon) => pokemon.name === candidate) || suggestions.some((pokemon) => pokemon.name === candidate)) continue;
        try {
          const pokemon = await fetchPokemon(candidate);
          const stats = pokemon.stats.reduce((sum, stat) => sum + stat.base_stat, 0);
          suggestions.push({ name: pokemon.name, types: pokemon.types.map((entry) => entry.type.name), baseStatTotal: stats, helpsCover: typeName });
        } catch { /* one unavailable candidate does not abort the entire recommendation */ }
        if (suggestions.filter((item) => item.helpsCover === typeName).length >= 2) break;
      }
    } catch { /* preserve usable suggestions when a type endpoint is temporarily unavailable */ }
  }
  suggestions.sort((a, b) => b.baseStatTotal - a.baseStatTotal);
  return {
    team: team.map((pokemon) => ({ name: pokemon.name, types: pokemon.types.map((entry) => entry.type.name) })),
    weaknessesToReview: priorities,
    suggestions: suggestions.slice(0, 6),
    source: "https://pokeapi.co/docs/v2",
  };
}

export function clearPokemonCache() { cache.clear(); }
