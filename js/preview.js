// Preview edition of the Gazette: from Wednesday on, the newsletter looks ahead to this week's
// matchups. It covers the stakes (playoff math), who each manager is leaning on, injury sweats,
// revenge games, rematches, and live scores once games kick off.
import { scoreStats, NON_STARTING } from "./scoring.js?v=20261112120249";
import { avatarUrl } from "./sleeper.js?v=20261112120249";
import { personaFor } from "./personas.js?v=20261112120249";
import { isChugLeague } from "./chugs.js?v=20261112120249";
import { teamsThrough, standSort, winChance } from "./newsletter.js?v=20261112120249";
import { esc, f1, rec, pairs, seeded, fill, leagueDisplay } from "./util.js?v=20261112120249";

const ord = (n) => n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

const L = {
  headline: [
    "Week {W}: {A} vs {B} and Nothing Else Matters",
    "Week {W} Preview: {A} and {B} Settle It Like Adults (Badly)",
    "Clear Your Sunday: {A} vs {B} Headlines Week {W}",
    "{A} vs {B}: Somebody Is Getting Embarrassed in Week {W}",
  ],
  headlineDesperate: [
    "Week {W}: {n} Teams Can't Afford to Lose, and {A} vs {B} Leads the Way",
    "Desperation Week: {n} Must-Win Teams and {A} vs {B} Up Top",
  ],
  mustWinBoth: [
    "Loser of this one can start planning the draft party.",
    "Both teams need it. Only one gets it. Popcorn.",
    "Two desperate teams, one W. Elimination game energy.",
  ],
  mustWin: [
    "{T} is {gb} out with {left} to play. Lose this and it's over-ish.",
    "Must-win for {T}. Their season is on a ventilator.",
    "{T} needs this one. Badly. The group chat knows it.",
  ],
  spoiler: [
    "{T} is playing for pride, which means they have nothing to lose and everything to ruin.",
    "{T} is out of it but would love nothing more than to wreck someone's season.",
  ],
  bubbleIn: ["{T} holds a playoff spot, barely. A loss here and they could be on the outside looking in.", "{T} is clinging to the playoff line by their fingernails."],
  bubbleOut: ["{T} is tied with the playoff line but losing the points tiebreaker. Needs this one.", "{T} is right on the doorstep of a playoff spot. Win and knock."],
  coinflip: ["Coin flip. Projections have it within {sp}.", "Too close to call: {sp} points separate them on paper."],
  favored: ["{F} is favored by {sp}.", "Sleeper likes {F} by {sp}."],
  bigFav: ["{F} is favored by {sp}. {D}'s best hope is a meteor.", "{F} by {sp}. {D} should aim for 'scoring points'."],
  needBoom: ["To pull the upset, {D} needs {P} to go off.", "{D}'s whole week rides on {P} having a career day."],
  favNeed: ["{F} just needs {P} to do his usual thing.", "{F} is counting on {P} to keep it boring."],
  rematch: ["Rematch of week {w}, when {Wn} won {s}.", "They met in week {w}: {Wn} won {s}. Revenge is on the menu."],
  revenge: ["🔥 Revenge game: {P} faces his old team."],
};

/** Playoff stakes for each team, using wins and then points for. */
function stakesFor(standings, playoffTeams, left) {
  const out = new Map();
  const n = standings.length;
  const P = Math.min(playoffTeams || 0, n);
  if (!P || left <= 0) return out;
  const lineWins = standings[P - 1].wins, outWins = standings[P]?.wins ?? -1;
  standings.forEach((t, i) => {
    const rank = i + 1;
    const maxWins = t.wins + left;
    const aheadForever = standings.filter((o) => o !== t && o.wins > maxWins).length; // can't be caught
    const couldPass = standings.filter((o) => o !== t && o.wins + left >= t.wins).length;
    let key, label;
    if (aheadForever >= P) { key = "out"; label = "💀 Eliminated"; }
    else if (couldPass < P) { key = "clinched"; label = "🔒 Clinched"; }
    else if (rank <= P) {
      const cushion = t.wins - outWins;
      if (rank <= 2 && cushion >= 2) { key = "seed"; label = "👑 Chasing a bye"; }
      else if (cushion >= 2) { key = "safe"; label = "😎 Comfortable"; }
      else { key = "bubble"; label = "😬 Bubble"; }
    } else {
      const gb = lineWins - t.wins;
      if (gb <= 0) { key = "bubble"; label = "😬 Bubble"; }
      else { key = "must"; label = "🚨 Must win"; }
    }
    out.set(t.rosterId, { key, label, rank, gb: Math.max(0, lineWins - t.wins), cushion: t.wins - outWins });
  });
  return out;
}

/**
 * @param d { league, teams (base), allWeeks, players, week, lastDone, proj, regEnd }
 */
export function buildPreview(d) {
  const { league, allWeeks, players, week: W, lastDone, proj, regEnd } = d;
  const sc = league.scoring_settings || {};
  const startSlots = league.roster_positions.filter((s) => !NON_STARTING.has(s));
  const seed = `${league.league_id}-pv-${W}`;
  const pick = (arr, key) => arr[Math.floor(seeded(seed + key)() * arr.length)];
  const now = teamsThrough(d.teams, allWeeks, lastDone);
  const standings = [...now].sort(standSort);
  const byId = new Map(now.map((t) => [t.rosterId, t]));
  const name = (rid) => byId.get(rid)?.team || `Team ${rid}`;
  const Bn = (rid) => `<b>${esc(name(rid))}</b>`;
  const av = (rid) => { const u = avatarUrl(byId.get(rid)?.avatar); return u ? `<img class="av" src="${u}" alt="" loading="lazy">` : `<span class="av ph"></span>`; };
  const pname = (id) => players[id]?.name || id;
  const playoffs = W > regEnd;
  const left = playoffs ? 0 : regEnd - W + 1; // regular-season games left, including this one
  const stakes = stakesFor(standings, league.settings.playoff_teams, left);
  const rankOf = new Map(standings.map((t, i) => [t.rosterId, i + 1]));
  const pp = (id) => (proj[id] ? scoreStats(proj[id].stats, sc) : 0);
  const rows = allWeeks[W] || [];
  const live = rows.some((r) => r.points > 0);

  const sideInfo = (r, opp) => {
    const starters = (r.starters || []).filter((id) => id && id !== "0");
    const projTotal = starters.reduce((s, id) => s + pp(id), 0);
    const leaning = [...starters].sort((a, b) => pp(b) - pp(a)).slice(0, 2);
    const sweats = [];
    const empty = (r.starters || []).map((id, i) => (!id || id === "0" ? startSlots[i] : null)).filter(Boolean);
    if (empty.length) sweats.push(`<span class="inj inj-bad">EMPTY</span> ${empty.map(esc).join(", ")}`);
    for (const id of starters) {
      const inj = proj[id]?.injury || players[id]?.injury;
      if (inj) sweats.push(`<span class="inj ${["Out", "IR", "Doubtful", "PUP", "Sus"].includes(inj) ? "inj-bad" : ""}">${esc(inj)}</span> ${esc(pname(id))}`);
      else if (!proj[id] && players[id]?.pos !== "DEF") sweats.push(`<span class="inj inj-bad">BYE?</span> ${esc(pname(id))}`);
    }
    // Revenge: a starter who spent time on the opponent's roster earlier this season.
    const revenge = starters.filter((id) => {
      for (let w = 1; w < W; w++) if ((allWeeks[w] || []).find((x) => x.roster_id === opp.roster_id)?.players?.includes(id)) return true;
      return false;
    });
    return { r, projTotal, leaning, sweats, revenge, live: r.points || 0 };
  };

  const games = pairs(rows).filter((g) => g.length === 2).map(([a, b]) => {
    const A = sideInfo(a, b), Bs = sideInfo(b, a);
    const sp = Math.abs(A.projTotal - Bs.projTotal);
    const sa = stakes.get(a.roster_id), sb = stakes.get(b.roster_id);
    const weight = (s) => ({ must: 3, bubble: 3, seed: 2, safe: 1, clinched: 0.5, out: 0 }[s?.key] ?? 1);
    const pa = (byId.get(a.roster_id)?.power || 0) + (byId.get(b.roster_id)?.power || 0);
    return { a: A, b: Bs, sp, sa, sb, score: pa / 10 + 2 * (weight(sa) + weight(sb)) - sp / 4 };
  });
  if (!games.length) return `<p class="empty">No matchups set for week ${W} yet.</p>`;
  const gotw = [...games].sort((x, y) => y.score - x.score)[0];
  const lock = [...games].sort((x, y) => y.sp - x.sp)[0];
  const desperate = [...stakes.values()].filter((s) => s.key === "must" || s.key === "bubble").length;

  // Last time these two met this season.
  const lastMeeting = (ra, rb) => {
    for (let w = W - 1; w >= 1; w--) {
      const g = pairs(allWeeks[w] || []).find((p) => p.length === 2 && p.some((x) => x.roster_id === ra) && p.some((x) => x.roster_id === rb));
      if (g && g.some((x) => x.points > 0)) {
        const [x, y] = g[0].points >= g[1].points ? g : [g[1], g[0]];
        return { w, winner: x.roster_id, s: `${f1(x.points)}–${f1(y.points)}` };
      }
    }
    return null;
  };

  const storyline = (g, key) => {
    const out = [];
    const ka = g.sa?.key, kb = g.sb?.key;
    const fav = g.a.projTotal >= g.b.projTotal ? g.a : g.b, dog = fav === g.a ? g.b : g.a;
    const F = Bn(fav.r.roster_id), D = Bn(dog.r.roster_id), sp = `<b>${f1(g.sp)}</b>`;
    if (ka === "must" && kb === "must") out.push(pick(L.mustWinBoth, key + "mb"));
    else for (const [side, s] of [[g.a, g.sa], [g.b, g.sb]]) {
      const T = Bn(side.r.roster_id);
      if (s?.key === "must") out.push(fill(pick(L.mustWin, key + side.r.roster_id), { T, gb: `${s.gb} game${s.gb === 1 ? "" : "s"}`, left: `${left} game${left === 1 ? "" : "s"}` }));
      else if (s?.key === "bubble") out.push(fill(pick(s.rank <= (league.settings.playoff_teams || 0) ? L.bubbleIn : L.bubbleOut, key + side.r.roster_id), { T }));
      else if (s?.key === "out" && ["must", "bubble"].includes((side === g.a ? g.sb : g.sa)?.key)) out.push(fill(pick(L.spoiler, key + side.r.roster_id), { T }));
    }
    if (g.sp < 5) out.push(fill(pick(L.coinflip, key + "c"), { sp }));
    else if (g.sp >= 20) out.push(fill(pick(L.bigFav, key + "f"), { F, D, sp }));
    else out.push(fill(pick(L.favored, key + "f"), { F, sp }));
    if (g.sp >= 5 && dog.leaning[0]) out.push(fill(pick(L.needBoom, key + "n"), { D, P: `<b>${esc(pname(dog.leaning[0]))}</b>` }));
    else if (fav.leaning[0]) out.push(fill(pick(L.favNeed, key + "n"), { F, P: `<b>${esc(pname(fav.leaning[0]))}</b>` }));
    const m = lastMeeting(g.a.r.roster_id, g.b.r.roster_id);
    if (m) out.push(fill(pick(L.rematch, key + "r"), { w: m.w, Wn: Bn(m.winner), s: m.s }));
    for (const side of [g.a, g.b]) {
      const p = personaFor(byId.get(side.r.roster_id)?.owner);
      if (p?.preview?.length) out.push(fill(pick(p.preview, key + "p"), { N: `<b>${esc(p.nick)}</b>` }));
    }
    return out.join(" ");
  };

  const sideHtml = (s, st, chance, right) => {
    const t = byId.get(s.r.roster_id);
    return `<div class="pv-side ${right ? "right" : ""}">${av(s.r.roster_id)}<div>
        <div class="pv-team">${esc(name(s.r.roster_id))}</div>
        <div class="dim">${t ? rec(t.wins, t.losses, t.ties) : ""} · ${ord(rankOf.get(s.r.roster_id) || 0)}</div>
        <div class="pv-proj">${live ? `<b>${f1(s.live)}</b> <span class="dim">live · </span>` : ""}<b>${f1(s.projTotal)}</b> <span class="dim">proj · ${Math.round(chance * 100)}%</span></div>
        ${st ? `<span class="stake st-${st.key}">${st.label}</span>` : ""}
      </div></div>`;
  };
  const leanHtml = (s, right) => `<div class="${right ? "right" : ""}">
      <div class="lean-h">Counting on</div>
      ${s.leaning.map((id) => `<div>${esc(pname(id))} <span class="dim">${esc(players[id]?.pos || "")} · ${f1(pp(id))}</span></div>`).join("")}
      ${s.revenge.map((id) => `<div>🔥 ${esc(pname(id))} <span class="dim">revenge game</span></div>`).join("")}
      ${s.sweats.length ? `<div class="lean-h">Sweating</div>${s.sweats.map((x) => `<div>${x}</div>`).join("")}` : ""}
    </div>`;

  const card = (g) => {
    const isG = g === gotw, isL = g === lock && !isG && g.sp >= 15;
    const both = g.sa?.key === "must" && g.sb?.key === "must";
    const pA = winChance(g.a.projTotal - g.b.projTotal);
    const label = isG ? `<div class="pv-label gotw">🔥 Game of the Week</div>` : both ? `<div class="pv-label lock">⚔️ Elimination Game</div>` : isL ? `<div class="pv-label lock">🔒 Lock of the Week</div>` : "";
    return `<div class="pv pv2 ${isG ? "is-gotw" : ""}">
      ${label}
      <div class="pv-teams">${sideHtml(g.a, g.sa, pA, false)}${sideHtml(g.b, g.sb, 1 - pA, true)}</div>
      <div class="tug"><span style="width:${(pA * 100).toFixed(1)}%"></span></div>
      <p class="pv-story">${storyline(g, `${g.a.r.roster_id}-${g.b.r.roster_id}`)}</p>
      <div class="pv-alerts pv-lean">${leanHtml(g.a, false)}${leanHtml(g.b, true)}</div>
    </div>`;
  };
  const ordered = [gotw, ...games.filter((g) => g !== gotw).sort((x, y) => y.score - x.score)];

  // Playoff picture
  const P = league.settings.playoff_teams || 0;
  const picture = playoffs ? "" : standings.map((t, i) => {
    const st = stakes.get(t.rosterId);
    return `${i === P ? `<div class="pp-line">✂️ Playoff line</div>` : ""}<div class="pp-row">
      <span class="rank">${i + 1}</span>${av(t.rosterId)}<span class="pp-name">${esc(t.team)}<span class="dim"> ${rec(t.wins, t.losses, t.ties)}</span></span>
      ${st ? `<span class="stake st-${st.key}">${st.label}</span>` : ""}</div>`;
  }).join("");

  // TL;DR
  const gA = name(gotw.a.r.roster_id), gB = name(gotw.b.r.roster_id);
  const low = [...games.flatMap((g) => [g.a, g.b])].sort((x, y) => x.projTotal - y.projTotal)[0];
  const coin = [...games].sort((x, y) => x.sp - y.sp)[0];
  const tldr = [
    `🔥 Game of the Week: <b>${esc(gA)}</b> vs <b>${esc(gB)}</b>`,
    !playoffs && desperate ? `🚨 <b>${desperate}</b> team${desperate === 1 ? " is" : "s are"} on the bubble or in must-win mode with <b>${left}</b> game${left === 1 ? "" : "s"} left` : null,
    lock.sp >= 15 ? `🔒 Lock: ${Bn(lock.a.projTotal >= lock.b.projTotal ? lock.a.r.roster_id : lock.b.r.roster_id)} by <b>${f1(lock.sp)}</b>` : null,
    coin !== gotw && coin.sp < 5 ? `🪙 Coin flip: ${Bn(coin.a.r.roster_id)} vs ${Bn(coin.b.r.roster_id)} (${f1(coin.sp)} apart)` : null,
    isChugLeague(league) ? `🍺 Chug watch: ${Bn(low.r.roster_id)} is projected lowest (<b>${f1(low.projTotal)}</b>). Stretch that throat.` : `🗑️ Projected basement: ${Bn(low.r.roster_id)} at <b>${f1(low.projTotal)}</b>`,
  ].filter(Boolean);

  const headline = fill(pick(desperate >= 3 && !playoffs ? L.headlineDesperate : L.headline, "h"), { W, A: esc(gA), B: esc(gB), n: desperate });
  const disp = leagueDisplay(league.name);
  return `<div class="newsletter">
    <header class="masthead">
      <div class="kicker">${disp.emoji} Week ${W} Preview Edition · ${esc(league.season)}</div>
      <h2>The ${esc(disp.name)} Gazette</h2>
      <div class="dim">${live ? "Games are underway. Live scores below." : "Who needs it, who's sweating, and who's about to get embarrassed"}</div>
    </header>
    <h1 class="headline">${headline}</h1>
    <section class="tldr"><div class="tldr-title">The 10-second version</div><ul>${tldr.map((x) => `<li>${x}</li>`).join("")}</ul></section>
    <section class="nl-section"><h3>Week ${W} Matchups</h3><div class="pv-grid">${ordered.map(card).join("")}</div>
      <p class="note">Projections use your league's scoring and current lineups. Win % is a rough estimate. "Counting on" = each team's top projected starters.</p></section>
    ${picture ? `<section class="nl-section"><h3>Playoff Picture</h3><p class="dim pp-sub">Top ${P} make it · ${left} regular-season game${left === 1 ? "" : "s"} left including this week</p><div class="card pp-card">${picture}</div></section>` : ""}
    ${lastDone ? `<p class="recap-link"><button type="button" class="upload-btn secondary" data-recap="${lastDone}">📰 Read the Week ${lastDone} recap</button></p>` : ""}
  </div>`;
}
