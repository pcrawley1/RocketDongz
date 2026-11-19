// League history: every season back to the league's first (via previous_league_id).
// Completed seasons are cached permanently in IndexedDB, so they only download once per browser.
import { sleeper, archive } from "./sleeper.js?v=20261119091849";
import { pairs } from "./util.js?v=20261119091849";

const VERSION = "hist-v1";

async function loadSeason(leagueId, { maxWeek } = {}) {
  const [league, users, rosters, bracket] = await Promise.all([
    sleeper.league(leagueId), sleeper.users(leagueId), sleeper.rosters(leagueId),
    sleeper.winnersBracket(leagueId).catch(() => []),
  ]);
  const complete = league.status === "complete";
  const last = complete ? 18 : maxWeek;
  const weeks = {};
  await Promise.all(Array.from({ length: last }, (_, i) => i + 1).map(async (w) => {
    const rows = (await sleeper.matchups(leagueId, w).catch(() => [])) || [];
    if (rows.some((r) => r.points > 0)) weeks[w] = rows.map((r) => ({
      roster_id: r.roster_id, matchup_id: r.matchup_id, points: r.points,
      starters: r.starters, players_points: r.players_points,
    }));
  }));
  const userInfo = Object.fromEntries((users || []).map((u) => [u.user_id, {
    name: u.display_name, team: (u.metadata?.team_name || "").trim(), avatar: u.avatar,
  }]));
  return {
    leagueId, season: league.season, name: league.name, complete,
    regEnd: (league.settings.playoff_week_start || 15) - 1,
    playoffTeams: league.settings.playoff_teams || 0,
    owners: Object.fromEntries((rosters || []).map((r) => [r.roster_id, r.owner_id || `roster-${r.roster_id}`])),
    users: userInfo, bracket: bracket || [], weeks, prev: league.previous_league_id,
  };
}

/** All seasons, newest first. `onProgress(done, total?)` for the loading message. */
export async function loadHistory(currentLeagueId, currentMaxWeek, onProgress) {
  const seasons = [];
  let id = currentLeagueId;
  while (id && id !== "0") {
    const key = `${VERSION}-${id}`;
    let s = await archive.get(key);
    if (!s) {
      s = await loadSeason(id, { maxWeek: currentMaxWeek });
      if (s.complete) archive.set(key, s);
    }
    seasons.push(s);
    onProgress?.(seasons.length);
    id = s.prev;
  }
  return seasons;
}

/** Crunch the numbers for one set of seasons. */
export function crunch(seasons) {
  const playerWeeks = [], teamWeeks = [], games = [];
  const mgr = new Map(); // owner_id -> record
  const M = (oid) => mgr.get(oid) || mgr.set(oid, { oid, seasons: 0, w: 0, l: 0, t: 0, pf: 0, pa: 0, titles: [], runnerUps: [], playoffs: 0, highs: 0 }).get(oid);
  const summaries = [];

  for (const s of seasons) {
    const owner = (rid) => s.owners[rid];
    const tm = (rid) => ({ oid: owner(rid), team: s.users[owner(rid)]?.team || s.users[owner(rid)]?.name || `Team ${rid}` });
    const rec = new Map();
    const R = (rid) => rec.get(rid) || rec.set(rid, { rid, w: 0, l: 0, t: 0, pf: 0 }).get(rid);
    for (const rid of Object.keys(s.owners)) { R(Number(rid)); M(owner(rid)).seasons++; }

    for (const [wk, rows] of Object.entries(s.weeks)) {
      const w = Number(wk);
      const playoff = w > s.regEnd;
      for (const r of rows) {
        if (r.matchup_id == null || !r.points) continue;
        const t = tm(r.roster_id);
        teamWeeks.push({ ...t, season: s.season, week: w, pts: r.points, playoff });
        for (const [pid, pts] of Object.entries(r.players_points || {})) {
          if (pts >= 10) playerWeeks.push({ pid, pts, ...t, season: s.season, week: w, started: (r.starters || []).includes(pid), playoff });
        }
      }
      for (const g of pairs(rows)) {
        if (g.length !== 2 || !(g[0].points || g[1].points)) continue;
        const [a, b] = g[0].points >= g[1].points ? g : [g[1], g[0]];
        games.push({ season: s.season, week: w, playoff, win: { ...tm(a.roster_id), pts: a.points }, lose: { ...tm(b.roster_id), pts: b.points }, margin: a.points - b.points });
        if (playoff) continue;
        for (const [x, y] of [[a, b], [b, a]]) {
          const m = M(owner(x.roster_id)), r = R(x.roster_id);
          m.pf += x.points; m.pa += y.points; r.pf += x.points;
          if (x.points > y.points) { m.w++; r.w++; } else if (x.points < y.points) { m.l++; r.l++; } else { m.t++; r.t++; }
        }
      }
    }

    const final = s.bracket.find((m) => m.p === 1);
    const champ = s.complete && final?.w ? final.w : null;
    const runner = s.complete && final?.l ? final.l : null;
    const inPlayoffs = new Set(s.bracket.flatMap((m) => [m.t1, m.t2]).filter((x) => typeof x === "number"));
    for (const rid of inPlayoffs) M(owner(rid)).playoffs++;
    if (champ) M(owner(champ)).titles.push(s.season);
    if (runner) M(owner(runner)).runnerUps.push(s.season);

    const table = [...rec.values()].sort((a, b) => (b.w + b.t / 2) - (a.w + a.t / 2) || b.pf - a.pf);
    const pfLead = [...rec.values()].sort((a, b) => b.pf - a.pf)[0];
    const sw = teamWeeks.filter((t) => t.season === s.season).sort((a, b) => b.pts - a.pts)[0];
    summaries.push({
      season: s.season, complete: s.complete,
      champ: champ && tm(champ), runner: runner && tm(runner),
      top: table[0] && { ...tm(table[0].rid), rec: table[0] },
      last: table.at(-1) && { ...tm(table.at(-1).rid), rec: table.at(-1) },
      pfLead: pfLead && { ...tm(pfLead.rid), pf: pfLead.pf },
      bestWeek: sw,
    });
  }

  const byPts = (a, b) => b.pts - a.pts;
  const highs = [...teamWeeks].sort(byPts);
  for (const t of highs.slice(0, 25)) mgr.get(t.oid) && mgr.get(t.oid).highs++;
  return {
    summaries,
    playerSpikes: playerWeeks.filter((p) => p.started).sort(byPts).slice(0, 25),
    benchSpikes: playerWeeks.filter((p) => !p.started).sort(byPts).slice(0, 10),
    teamHighs: highs.slice(0, 10),
    teamLows: teamWeeks.filter((t) => !t.playoff).sort((a, b) => a.pts - b.pts).slice(0, 10),
    blowouts: [...games].sort((a, b) => b.margin - a.margin).slice(0, 6),
    nailbiters: [...games].filter((g) => g.margin > 0).sort((a, b) => a.margin - b.margin).slice(0, 6),
    managers: [...mgr.values()],
  };
}
