// Pure league math: standings, all-play, luck, weekly score grid.

const pts = (whole, dec) => (whole || 0) + (dec || 0) / 100;

/**
 * @param rosters  Sleeper rosters
 * @param users    Sleeper league users
 * @param weeks    { [week]: matchupRows[] } for completed weeks only
 */
export function buildTeams(rosters, users) {
  const byUser = new Map(users.map((u) => [u.user_id, u]));
  return rosters.map((r) => {
    const u = byUser.get(r.owner_id) || {};
    const s = r.settings || {};
    return {
      rosterId: r.roster_id,
      ownerId: r.owner_id,
      owner: u.display_name || "Unowned",
      team: (u.metadata?.team_name || u.display_name || `Team ${r.roster_id}`).trim(),
      avatar: u.metadata?.avatar || u.avatar || null,
      wins: s.wins || 0,
      losses: s.losses || 0,
      ties: s.ties || 0,
      pf: pts(s.fpts, s.fpts_decimal),
      pa: pts(s.fpts_against, s.fpts_against_decimal),
      maxPf: pts(s.ppts, s.ppts_decimal),
      streak: r.metadata?.streak || "",
      players: r.players || [],
    };
  });
}

export function computeAdvanced(teams, weeks) {
  const t = new Map(teams.map((x) => [x.rosterId, { ...x, apW: 0, apL: 0, apT: 0, scores: {}, weekRanks: {} }]));

  for (const [week, rows] of Object.entries(weeks)) {
    const scored = rows.filter((r) => t.has(r.roster_id));
    for (const r of scored) t.get(r.roster_id).scores[week] = r.points ?? 0;

    // All-play: your score vs every other team that week.
    for (const a of scored) {
      const ta = t.get(a.roster_id);
      for (const b of scored) {
        if (a === b) continue;
        if (a.points > b.points) ta.apW++;
        else if (a.points < b.points) ta.apL++;
        else ta.apT++;
      }
    }
    // Rank within the week (1 = highest).
    const sorted = [...scored].sort((x, y) => y.points - x.points);
    sorted.forEach((r, i) => (t.get(r.roster_id).weekRanks[week] = i + 1));
  }

  const out = [...t.values()].map((x) => {
    const games = x.wins + x.losses + x.ties;
    const apGames = x.apW + x.apL + x.apT;
    const winPct = games ? (x.wins + x.ties / 2) / games : 0;
    const apPct = apGames ? (x.apW + x.apT / 2) / apGames : 0;
    const weeksPlayed = Object.keys(x.scores).length;
    // Expected wins = all-play% × games; luck = actual − expected.
    const expWins = apPct * games;
    return {
      ...x,
      games, winPct, apPct, expWins,
      luck: x.wins + x.ties / 2 - expWins,
      ppg: weeksPlayed ? Object.values(x.scores).reduce((a, b) => a + b, 0) / weeksPlayed : 0,
    };
  });

  // Power score: 50% all-play, 30% PPG percentile, 20% last-3-weeks form.
  const weekKeys = Object.keys(weeks).map(Number).sort((a, b) => a - b);
  const recent = weekKeys.slice(-3);
  const ppgs = out.map((x) => x.ppg);
  const lo = Math.min(...ppgs), hi = Math.max(...ppgs);
  const n = out.length;
  for (const x of out) {
    const ppgNorm = hi > lo ? (x.ppg - lo) / (hi - lo) : 0.5;
    const ranks = recent.map((w) => x.weekRanks[w]).filter(Boolean);
    const form = ranks.length ? 1 - (ranks.reduce((a, b) => a + b, 0) / ranks.length - 1) / Math.max(n - 1, 1) : 0.5;
    x.form = form;
    x.power = 100 * (0.5 * x.apPct + 0.3 * ppgNorm + 0.2 * form);
  }
  return out;
}

export function sortStandings(teams) {
  return [...teams].sort((a, b) => b.winPct - a.winPct || b.pf - a.pf);
}
