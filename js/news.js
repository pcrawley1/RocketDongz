// Player news from ESPN's public fantasy news feed (no key, CORS-open).
// Sleeper's player DB only has espn_id for some players, so we fall back to ESPN name search
// and remember the mapping in localStorage.

const ID_KEY = "espnIds";
let idMap = {};
try { idMap = JSON.parse(localStorage.getItem(ID_KEY) || "{}"); } catch {}
const saveIds = () => { try { localStorage.setItem(ID_KEY, JSON.stringify(idMap)); } catch {} };

const newsCache = new Map();

async function espnIdFor(sleeperId, player) {
  if (player.espnId) return player.espnId;
  if (sleeperId in idMap) return idMap[sleeperId];
  const url = `https://site.web.api.espn.com/apis/common/v3/search?query=${encodeURIComponent(player.name)}&type=player&sport=football&league=nfl&limit=5`;
  const res = await fetch(url).then((r) => r.json()).catch(() => null);
  const items = res?.items || [];
  const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, "");
  const hit = items.find((i) => norm(i.displayName || "") === norm(player.name)) || items[0];
  idMap[sleeperId] = hit?.id || null;
  saveIds();
  return idMap[sleeperId];
}

/** Returns [{ when: Date, headline, story }] — newest first. */
export function playerNews(sleeperId, player, limit = 4) {
  if (newsCache.has(sleeperId)) return newsCache.get(sleeperId);
  const p = (async () => {
    if (!player || player.pos === "DEF") return [];
    const id = await espnIdFor(sleeperId, player);
    if (!id) return [];
    const res = await fetch(`https://site.api.espn.com/apis/fantasy/v2/games/ffl/news/players?limit=${limit}&playerId=${id}`)
      .then((r) => r.json()).catch(() => null);
    return (res?.feed || []).map((a) => ({
      when: new Date(a.published || a.lastModified),
      headline: a.headline || "",
      story: a.story || a.description || "",
    }));
  })();
  newsCache.set(sleeperId, p);
  return p;
}
