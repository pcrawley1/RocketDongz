// Trade tracker: what each side actually got (points scored for them since the trade).
import { sleeper } from "./sleeper.js?v=20261110130333";

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
 * Score each side of each trade.
 * Points count from the trade's week through `lastDone`, only for weeks the player was on the receiving roster.
 */
export function gradeTrades(trades, allWeeks, lastDone, currentRosters = new Map()) {
  const rowFor = (w, rid) => (allWeeks[w] || []).find((r) => r.roster_id === rid);
  const production = (pid, rid, fromWeek) => {
    let pts = 0, started = 0, weeks = 0;
    for (let w = Math.max(1, fromWeek); w <= lastDone; w++) {
      const row = rowFor(w, rid);
      if (!row || !(row.players || []).includes(pid)) continue;
      const p = row.players_points?.[pid] ?? 0;
      pts += p; weeks++;
      if ((row.starters || []).includes(pid)) started += p;
    }
    return { pts, started, weeks };
  };

  return trades.map((t) => {
    const leg = t.leg || 1;
    const weeksSince = Math.max(0, lastDone - leg + 1);
    const got = {}; // rid -> [{pid, pts, started, weeks, flipped?, gone?}]
    for (const [pid, rid] of Object.entries(t.adds || {})) {
      const prod = production(pid, rid, leg);
      // Did this team trade the player away again later? (Explains a low/zero total.)
      const flip = trades.find((o) => o.created > t.created && o.drops?.[pid] === rid);
      // Use today's rosters (a trade after the last completed week won't be in that week's lineups yet).
      const onRosterNow = currentRosters.has(rid)
        ? currentRosters.get(rid).has(pid)
        : (allWeeks[lastDone] || []).find((r) => r.roster_id === rid)?.players?.includes(pid);
      (got[rid] ||= []).push({ pid, ...prod, flipped: flip ? (flip.leg || 1) : null, gone: !flip && !onRosterNow && lastDone >= leg });
    }
    const sides = t.roster_ids.map((rid) => {
      const received = got[rid] || [];
      const sentIds = Object.entries(t.drops || {}).filter(([, from]) => from === rid).map(([pid]) => pid);
      const sent = sentIds.map((pid) => Object.values(got).flat().find((g) => g.pid === pid)).filter(Boolean);
      const recvPts = received.reduce((s, g) => s + g.pts, 0);
      const sentPts = sent.reduce((s, g) => s + g.pts, 0);
      const faabIn = (t.waiver_budget || []).filter((f) => f.receiver === rid).reduce((s, f) => s + f.amount, 0);
      const faabOut = (t.waiver_budget || []).filter((f) => f.sender === rid).reduce((s, f) => s + f.amount, 0);
      const picksIn = (t.draft_picks || []).filter((p) => p.owner_id === rid);
      const diff = recvPts - sentPts;
      return { rid, received, recvPts, startedPts: received.reduce((s, g) => s + g.started, 0), sentPts, diff, faabIn, faabOut, picksIn, ...grade(diff, recvPts, sentPts, weeksSince) };
    });
    const ranked = [...sides].sort((a, b) => b.diff - a.diff);
    return { t, leg, weeksSince, sides, winner: ranked[0], loser: ranked.at(-1), margin: ranked[0].diff };
  });
}

function grade(diff, recv, sent, weeksSince) {
  if (weeksSince < 2) return { grade: "TBD", tier: "tbd" };
  // Floor of 30 pts keeps small-sample trades (one player, one week) from getting extreme grades.
  const r = diff / Math.max((recv + sent) / 2, 30);
  const g =
    r >= 0.5 ? "A+" : r >= 0.3 ? "A" : r >= 0.15 ? "B+" : r >= 0.05 ? "B" :
    r > -0.05 ? "C" : r >= -0.15 ? "C-" : r >= -0.3 ? "D" : "F";
  const tier = g.startsWith("A") ? "a" : g.startsWith("B") ? "b" : g.startsWith("C") ? "c" : g === "D" ? "d" : "f";
  return { grade: g, tier };
}
