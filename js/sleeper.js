// Thin client for the public, read-only Sleeper API.
// Docs: https://docs.sleeper.com  — no auth; keep under ~1000 calls/min.

const BASE = "https://api.sleeper.app/v1";
const cache = new Map();

async function get(path) {
  if (cache.has(path)) return cache.get(path);
  const p = fetch(BASE + path).then(async (res) => {
    if (!res.ok) throw new Error(`Sleeper ${res.status} on ${path}`);
    const text = await res.text();
    return text ? JSON.parse(text) : null; // Sleeper returns empty body for unknown users
  });
  cache.set(path, p);
  p.catch(() => cache.delete(path));
  return p;
}

export const sleeper = {
  state: () => get("/state/nfl"),
  user: (usernameOrId) => get(`/user/${encodeURIComponent(usernameOrId)}`),
  leagues: (userId, season) => get(`/user/${userId}/leagues/nfl/${season}`),
  league: (leagueId) => get(`/league/${leagueId}`),
  users: (leagueId) => get(`/league/${leagueId}/users`),
  rosters: (leagueId) => get(`/league/${leagueId}/rosters`),
  matchups: (leagueId, week) => get(`/league/${leagueId}/matchups/${week}`),
  transactions: (leagueId, week) => get(`/league/${leagueId}/transactions/${week}`),
  winnersBracket: (leagueId) => get(`/league/${leagueId}/winners_bracket`),
  tradedPicks: (leagueId) => get(`/league/${leagueId}/traded_picks`),
  // ~5MB. Sleeper asks that you call this at most once a day, so we cache it.
  players: () => loadPlayers(),
  // Unofficial endpoint (what the Sleeper app uses). Returns { [player_id]: { stats, opponent, injury } }.
  projections: (season, week) => projections(season, week),
};

const projCache = new Map();
function projections(season, week) {
  const key = `${season}-${week}`;
  if (!projCache.has(key)) {
    const pos = ["QB", "RB", "WR", "TE", "K", "DEF"].map((p) => `position[]=${p}`).join("&");
    const p = fetch(`https://api.sleeper.com/projections/nfl/${season}/${week}?season_type=regular&${pos}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        const out = {};
        for (const r of rows || []) {
          out[r.player_id] = {
            stats: r.stats || {},
            opponent: r.opponent || "",
            injury: r.player?.injury_status || null,
            injuryPart: r.player?.injury_body_part || null,
          };
        }
        return out;
      })
      .catch(() => ({}));
    projCache.set(key, p);
  }
  return projCache.get(key);
}

export function avatarUrl(avatar) {
  if (!avatar) return null;
  return avatar.startsWith("http") ? avatar : `https://sleepercdn.com/avatars/thumbs/${avatar}`;
}

// ---- Player DB, cached in IndexedDB for 24h ----
const DB = "rocketdongz", STORE = "kv", KEY = "players_nfl_v2", TTL = 24 * 3600 * 1000;
let playersPromise;

function idb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet(key) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function idbSet(key, val) {
  const db = await idb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(val, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

function loadPlayers() {
  playersPromise ??= (async () => {
    try {
      const hit = await idbGet(KEY);
      if (hit && Date.now() - hit.at < TTL) return hit.data;
    } catch { /* IndexedDB unavailable — fall through to network */ }
    const raw = await fetch(`${BASE}/players/nfl`).then((r) => r.json());
    // Slim it down to what we display.
    const data = {};
    for (const [id, p] of Object.entries(raw)) {
      data[id] = {
        name: p.full_name || [p.first_name, p.last_name].filter(Boolean).join(" ") || id,
        pos: p.position || (p.fantasy_positions || [])[0] || "",
        team: p.team || "",
        positions: p.fantasy_positions || (p.position ? [p.position] : []),
        espnId: p.espn_id || null,
        injury: p.injury_status || null,
        injuryPart: p.injury_body_part || null,
        age: p.age || null,
        yearsExp: p.years_exp ?? null,
      };
    }
    try { await idbSet(KEY, { at: Date.now(), data }); } catch {}
    return data;
  })();
  return playersPromise;
}
