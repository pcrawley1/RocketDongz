// Scoring helpers: league-specific projections and optimal-lineup math.

/** Score a stat line using the league's scoring_settings (works for projections or actuals). */
export function scoreStats(stats, scoring) {
  if (!stats) return 0;
  let total = 0;
  for (const [k, mult] of Object.entries(scoring)) {
    const v = stats[k];
    if (typeof v === "number") total += v * mult;
  }
  return Math.round(total * 100) / 100;
}

const ELIGIBLE = {
  QB: ["QB"], RB: ["RB"], WR: ["WR"], TE: ["TE"], K: ["K"], DEF: ["DEF"],
  FLEX: ["RB", "WR", "TE"],
  WRRB_FLEX: ["WR", "RB"],
  REC_FLEX: ["WR", "TE"],
  SUPER_FLEX: ["QB", "RB", "WR", "TE"],
  DL: ["DL", "DE", "DT"], LB: ["LB"], DB: ["DB", "CB", "S"],
  IDP_FLEX: ["DL", "DE", "DT", "LB", "DB", "CB", "S"],
};
export const NON_STARTING = new Set(["BN", "IR", "TAXI"]);

/**
 * Best possible lineup score from the players on a roster that week.
 * Greedy, most-restrictive slots first, which is optimal for standard slot sets.
 */
export function optimalScore(matchupRow, rosterPositions, players) {
  const slots = rosterPositions.filter((s) => !NON_STARTING.has(s))
    .sort((a, b) => (ELIGIBLE[a]?.length ?? 9) - (ELIGIBLE[b]?.length ?? 9));
  const pool = (matchupRow.players || []).map((id) => {
    const p = players[id] || {};
    const positions = p.positions?.length ? p.positions : [p.pos || (isNaN(id) ? "DEF" : "")];
    return { id, positions, pts: matchupRow.players_points?.[id] ?? 0 };
  }).sort((a, b) => b.pts - a.pts);
  const used = new Set();
  let total = 0;
  for (const slot of slots) {
    const ok = ELIGIBLE[slot] || [slot];
    const pick = pool.find((p) => !used.has(p.id) && p.positions.some((x) => ok.includes(x)));
    if (pick) { used.add(pick.id); total += pick.pts; }
  }
  return Math.round(total * 100) / 100;
}
