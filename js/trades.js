// Trade tracker.
// Grades use VALUE = points above replacement (a waiver-level player at the same position), counting
//   • points already scored for the receiving team since the trade, and
//   • projected rest-of-season points (only for players still on that roster).
// Early trades lean on projections, late trades on real output. Raw points are still shown for context.
import { sleeper } from "./sleeper.js?v=20261110130843";

/** All completed trades this season, newest first. */
export async function loadTrades(leagueId, maxWeek) {
  const weeks = Array.from({ length: maxWeek + 1 }, (_, i) => i); // week 0 = preseason
  const lists = await Promise.all(weeks.map((w) => sleeper.transactions(leagueId, w).catch(() => [])));
  const seen = new Set();
  return lists.flat()
    .filter((t) => t && t.type === "trade" && t.status === "complete" && !seen.has(t.transaction_id) && seen.add(t.transaction_id))
    .sort((a, b) => b.created - a.created);
}

/**
 * Weekly replacement level per position, from one week of projections (already in league scoring).
 * Replacement = the first player outside the league's typical starters at that position.
 */
export function replacementLevels(weekPoints, posOf, rosterPositions, teams) {
  const slots = rosterPositions.reduce((m, s) => (m[s] = (m[s] || 0) + 1, m), {});
  const flex = (slots.FLEX || 0) + (slots.WRRB_FLEX || 0) + (slots.REC_FLEX || 0);
  const sflex = slots.SUPER_FLEX || 0;
  const starters = {
    QB: (slots.QB || 0) + sflex * 0.8, RB: (slots.RB || 0) + flex * 0.45, WR: (slots.WR || 0) + flex * 0.45,
    TE: (slots.TE || 0) + flex * 0.1, K: slots.K || 0, DEF: slots.DEF || 0,
  };
  const byPos = {};
  for (const [pid, pts] of weekPoints) {
    const pos = posOf(pid);
    if (pos in starters && pts > 0) (byPos[pos] ||= []).push(pts);
  }
  const repl = {};
  for (const [pos, n] of Object.entries(starters)) {
    const list = (byPos[pos] || []).sort((a, b) => b - a);
    repl[pos] = list[Math.min(Math.round(n * teams), list.length - 1)] || 0;
  }
  return repl;
}

/**
 * @param opts.currentRosters Map rosterId -> Set(pid)
 * @param opts.ros            Map pid -> { pts, games } projected for the rest of the regular season
 * @param opts.repl           { [pos]: weekly replacement points }
 * @param opts.posOf          pid -> position
 */
export function gradeTrades(trades, allWeeks, lastDone, { currentRosters = new Map(), ros = new Map(), repl = {}, posOf = () => "" } = {}) {
  const rowFor = (w, rid) => (allWeeks[w] || []).find((r) => r.roster_id === rid);
  const production = (pid, rid, fromWeek) => {
    let pts = 0, started = 0, games = 0;
    for (let w = Math.max(1, fromWeek); w <= lastDone; w++) {
      const row = rowFor(w, rid);
      if (!row || !(row.players || []).includes(pid)) continue;
      const p = row.players_points?.[pid] ?? 0;
      pts += p;
      if (p !== 0) games++; // a 0 is usually a bye or inactive: don't charge replacement for it
      if ((row.starters || []).includes(pid)) started += p;
    }
    return { pts, started, games };
  };

  return trades.map((t) => {
    const leg = t.leg || 1;
    const got = {};
    for (const [pid, rid] of Object.entries(t.adds || {})) {
      const prod = production(pid, rid, leg);
      const flip = trades.find((o) => o.created > t.created && o.drops?.[pid] === rid);
      const onRosterNow = currentRosters.has(rid)
        ? currentRosters.get(rid).has(pid)
        : (allWeeks[lastDone] || []).find((r) => r.roster_id === rid)?.players?.includes(pid);
      const future = onRosterNow && !flip ? (ros.get(pid) || { pts: 0, games: 0 }) : { pts: 0, games: 0 };
      const r = repl[posOf(pid)] || 0;
      const valueSoFar = Math.max(0, prod.pts - r * prod.games);
      const valueRos = Math.max(0, future.pts - r * future.games);
      (got[rid] ||= []).push({
        pid, ...prod, ros: future.pts, valueSoFar, valueRos, value: valueSoFar + valueRos,
        flipped: flip ? (flip.leg || 1) : null,
        gone: !flip && !onRosterNow && lastDone >= leg,
      });
    }
    const all = Object.values(got).flat();
    const sum = (arr, k) => arr.reduce((s, g) => s + g[k], 0);
    const sides = t.roster_ids.map((rid) => {
      const received = got[rid] || [];
      const sent = Object.entries(t.drops || {}).filter(([, from]) => from === rid)
        .map(([pid]) => all.find((g) => g.pid === pid)).filter(Boolean);
      const faabIn = (t.waiver_budget || []).filter((f) => f.receiver === rid).reduce((s, f) => s + f.amount, 0);
      const picksIn = (t.draft_picks || []).filter((p) => p.owner_id === rid);
      const value = sum(received, "value"), sentValue = sum(sent, "value");
      return {
        rid, received, faabIn, picksIn,
        recvPts: sum(received, "pts"), recvRos: sum(received, "ros"),
        value, sentValue, diff: value - sentValue,
        onlyUnscored: !received.length && (faabIn > 0 || picksIn.length > 0),
      };
    });
    // Player-for-FAAB/picks deals can't be graded on points alone.
    const unscored = sides.some((s) => s.onlyUnscored);
    const totalValue = sum(all, "value");
    const realized = totalValue ? sum(all, "valueSoFar") / totalValue : 0;
    // Mostly-projected trades are pulled toward the middle; fully played-out trades get the full grade.
    const certainty = 0.6 + 0.4 * realized;
    for (const s of sides) Object.assign(s, unscored ? { grade: "💰", tier: "faab", r: 0 } : grade(s.diff, s.value, s.sentValue, certainty));

    const ranked = [...sides].sort((a, b) => b.diff - a.diff);
    return { t, leg, sides, unscored, realized, winner: ranked[0], loser: ranked.at(-1), margin: ranked[0].diff };
  });
}

// Mirrored scale centered on B: the winner's grade pairs with the loser's (A- ↔ C+, A ↔ C, A+ ↔ C-).
// D and F only show up when a trade is truly lopsided.
const WIN  = [[0.8, "A+", "a"], [0.6, "A+", "a"], [0.4, "A", "a"], [0.25, "A-", "a"], [0.1, "B+", "b"]];
const LOSE = [[1.0, "F", "f"], [0.8, "D", "d"], [0.6, "C-", "c"], [0.4, "C", "c"], [0.25, "C+", "c"], [0.1, "B-", "b"]];
function grade(diff, mine, theirs, certainty = 1) {
  // Floor keeps small trades (a backup for a backup) from swinging to extremes.
  const r = (diff / Math.max((mine + theirs) / 2, 25)) * certainty;
  const scale = r >= 0 ? WIN : LOSE;
  for (const [min, g, tier] of scale) if (Math.abs(r) >= min) return { grade: g, tier, r };
  return { grade: "B", tier: "b", r };
}
