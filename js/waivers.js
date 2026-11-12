// Waiver wire tracker: every completed waiver claim / free-agent add or drop this season,
// rated honestly. A pickup is judged on points per game (what he's scored for that team plus
// what he's projected for the rest of the regular season) vs a waiver-level player at his position.
// A drop is judged on what the cut player has scored since leaving.
import { sleeper } from "./sleeper.js?v=20261112120249";

/** Completed waiver + free-agent moves this season, newest first. */
export async function loadMoves(leagueId, maxWeek) {
  const weeks = Array.from({ length: maxWeek + 1 }, (_, i) => i);
  const lists = await Promise.all(weeks.map((w) => sleeper.transactions(leagueId, w).catch(() => [])));
  const seen = new Set();
  return lists.flat()
    .filter((t) => t && (t.type === "waiver" || t.type === "free_agent") && t.status === "complete"
      && !seen.has(t.transaction_id) && seen.add(t.transaction_id))
    .sort((a, b) => b.created - a.created);
}

// Points per game vs replacement level.
export const RATINGS = [
  [1.35, "🔥", "Hit", "a"],
  [1.0, "👍", "Solid", "b"],
  [0.6, "🤷", "Filler", "c"],
  [-Infinity, "🗑️", "Dud", "f"],
];

/**
 * @param opts.currentRosters Map rosterId -> Set(pid)
 * @param opts.ros            Map pid -> { pts, games } projected for the rest of the regular season
 * @param opts.actual         (pid, week) -> real fantasy points that week in league scoring (null if unknown)
 * @param opts.repl           { [pos]: weekly replacement points }
 * @param opts.posOf          pid -> position
 */
export function rateMoves(moves, allWeeks, lastDone, { currentRosters, ros, actual, repl, posOf }) {
  const rowFor = (w, rid) => (allWeeks[w] || []).find((r) => r.roster_id === rid);
  const ownerNow = (pid) => { for (const [rid, set] of currentRosters) if (set.has(pid)) return rid; return null; };

  return moves.map((m) => {
    const rid = m.roster_ids?.[0];
    const leg = m.leg || 1;
    const bid = m.settings?.waiver_bid ?? null;

    const adds = Object.entries(m.adds || {}).filter(([, r]) => r === rid).map(([pid]) => {
      let pts = 0, started = 0, games = 0, weeksHeld = 0;
      for (let w = Math.max(1, leg); w <= lastDone; w++) {
        const row = rowFor(w, rid);
        if (!row || !(row.players || []).includes(pid)) continue;
        weeksHeld++;
        const p = row.players_points?.[pid] ?? 0;
        pts += p;
        if (p !== 0) games++;
        if ((row.starters || []).includes(pid)) started += p;
      }
      const kept = currentRosters.get(rid)?.has(pid) ?? false;
      const future = kept ? ros.get(pid) || { pts: 0, games: 0 } : { pts: 0, games: 0 };
      const r = repl[posOf(pid)] || 0;
      const g = games + future.games;
      const ppg = g ? (pts + future.pts) / g : 0;
      const score = r > 0 ? ppg / r : ppg > 0 ? 1 : 0;
      const [, emoji, label, tier] = g ? RATINGS.find(([min]) => score >= min) : [0, "❔", "TBD", "tbd"];
      const value = Math.max(0, pts - r * games) + Math.max(0, future.pts - r * future.games);
      return { pid, pts, started, games, weeksHeld, kept, ros: future.pts, ppg, score, emoji, label, tier, value,
        cutFast: !kept && weeksHeld <= 1 && lastDone > leg };
    });

    const drops = Object.entries(m.drops || {}).filter(([, r]) => r === rid).map(([pid]) => {
      let since = 0, games = 0;
      for (let w = Math.max(1, leg); w <= lastDone; w++) {
        const row = rowFor(w, rid);
        if (row && (row.players || []).includes(pid)) continue; // still played for us that week
        const p = actual(pid, w);
        if (p) { since += p; games++; }
      }
      const r = repl[posOf(pid)] || 0;
      const ppg = games ? since / games : 0;
      const now = ownerNow(pid);
      const streamer = ["K", "DEF"].includes(posOf(pid)); // streaming K/DEF is normal: only flag a real miss
      const regret = games >= 2 && since >= (streamer ? 30 : 15) && r > 0 && ppg >= r * (streamer ? 1.4 : 1.25);
      return { pid, since, games, ppg, now, regret };
    });

    const best = [...adds].sort((a, b) => b.value - a.value)[0] || null;
    return { m, rid, leg, bid, type: m.type, adds, drops, best };
  });
}
