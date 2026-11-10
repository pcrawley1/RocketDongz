export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const f1 = (n) => (n ?? 0).toFixed(1);
export const f2 = (n) => (n ?? 0).toFixed(2);
export const pct = (n) => (n * 100).toFixed(0) + "%";
export const rec = (w, l, t) => `${w}-${l}${t ? "-" + t : ""}`;
export const signed = (n, d = 1) => (n > 0 ? "+" : "") + n.toFixed(d);
export const stripTags = (s) => String(s ?? "").replace(/<[^>]*>/g, "");

/** Group matchup rows into [[a, b], ...] by matchup_id. */
export function pairs(rows) {
  const g = new Map();
  for (const r of rows || []) {
    if (r.matchup_id == null) continue;
    if (!g.has(r.matchup_id)) g.set(r.matchup_id, []);
    g.get(r.matchup_id).push(r);
  }
  return [...g.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}

/** Deterministic RNG so an issue reads the same on every reload. */
export function seeded(seedStr) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
export const pick = (arr, seed) => arr[Math.floor(seeded(seed)() * arr.length)];
export const fill = (tpl, vars) => tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`));

/** Short display name + emoji for a league (e.g. "Studs and Spuds FFL" → 🥔 "Studs and Spuds"). */
export function leagueDisplay(leagueName = "") {
  const name = leagueName.replace(/\s+(FFL|FFBL|League|Fantasy Football)$/i, "").trim() || leagueName;
  const n = name.toLowerCase();
  const emoji = /spud|potato/.test(n) ? "🥔" : /rocket|dong/.test(n) ? "🚀" : "🏈";
  return { name, emoji };
}
