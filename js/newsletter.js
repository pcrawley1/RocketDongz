// Builds the weekly newsletter: recap + awards + roasts + next-week preview.
import { computeAdvanced } from "./stats.js";
import { scoreStats, optimalScore, NON_STARTING } from "./scoring.js";
import { esc, f1, f2, rec, pairs, seeded, fill } from "./util.js";

// ---------------------------------------------------------------- templates
const T = {
  headline: {
    blowout: [
      "{W} Commits Fantasy War Crimes Against {L}",
      "{W} Hangs {m} on {L}; Authorities Notified",
      "Massacre: {L} Found Face-Down After {m}-Point Loss",
      "{L} Declared Legally Deceased Following {W} Beatdown",
    ],
    close: [
      "Heart Attack Special: {W} Edges {L} by {m}",
      "{L} Loses by {m}. Somewhere, a Bench Player Weeps",
      "Photo Finish: {W} Survives {L} by a Hair",
    ],
    top: [
      "{T} Drops {s} and Dares Anyone to Say Something",
      "{T} Goes Nuclear With {s}",
      "Lock Your Doors: {T} Put Up {s}",
    ],
  },
  recap: {
    blowout: [
      "{W} put {L} in a blender, {ws} to {ls}. A {m}-point margin isn't a loss, it's a cry for help. {wStar} did most of the damage while {Lp} lineup looked like it was drafted by autopick on a dial-up connection.",
      "This one was over before the late window. {W} ({ws}) bullied {L} ({ls}) by {m}. {L}, maybe try starting players who play football?",
      "{W} beat {L} by {m}. That's not a typo, and {L} can't blame the refs. {wStar} alone was basically a team.",
    ],
    close: [
      "{W} escaped {L} {ws}-{ls}, a margin of {m}. {L} will be thinking about {lBench} on the bench for the rest of their life.",
      "Nail-biter alert: {W} beat {L} by {m}. {L} has already drafted the group-chat excuse. We've all read it before.",
      "{L} lost by {m}. One stat correction, one kicker, one less dumb lineup decision. Instead: an L. {W} says thanks.",
    ],
    robbed: [
      "{L} put up {ls}, which beats most of the league, and still lost because {W} went off for {ws}. Brutal. Unfair. Hilarious.",
      "{L} scored {ls} and would have beaten most teams this week. Unfortunately they played {W} ({ws}). Fantasy football is a cruel mistress.",
    ],
    stole: [
      "{W} won with a below-median {ws}. No style, no shame, just a W. {L} somehow managed to score less ({ls}). Both teams should think about what they've done.",
      "Ugly win of the week: {W} {ws}, {L} {ls}. Nobody who watched this enjoyed it.",
    ],
    normal: [
      "{W} took care of {L}, {ws}-{ls}. {wStar} led the way. {L} got {lStar} from their best guy, and that was about it.",
      "{W} over {L}, {ws} to {ls}. Solid, unremarkable, the fantasy equivalent of a Toyota Camry.",
      "{W} beat {L} by {m}. {L} fought, in the sense that they set a lineup.",
    ],
  },
  dong: [
    "{T} scored {s}. That's lower than some kickers' career highs. Truly the Dong of the Week.",
    "{T} limped to {s}. If you watched their lineup, please seek counseling.",
    "{T} put up {s}, the lowest score in the league. They didn't lose, they surrendered.",
  ],
  rocket: [
    "{T} launched {s} into orbit. Top score of the week. Respect.",
    "{T} went for {s}. Everybody else was playing checkers.",
  ],
  bench: [
    "{T} left {b} points on the bench. A perfect lineup scores {opt}{flip}. Read your notifications, {O}.",
    "{T} benched {b} points. {opt} was available. {O} looked at that and said 'nah'{flip}.",
  ],
  flip: [" and wins the matchup", ". That's a W thrown in the trash"],
  standing: {
    last: [
      "Dead last. Their ceiling has a basement. Pray for them.",
      "Last place and comfortable down there. Toilet Bowl favorites.",
      "Rock bottom. Their draft board has been entered into evidence.",
    ],
    losing: [
      "{n} straight losses. Somebody check on {O}.",
      "Losing streak at {n}. 'It's a long season' is starting to sound like a threat.",
    ],
    unlucky: [
      "Real record should be about {exp}. The schedule-makers have a vendetta.",
      "Lost {luckAbs} more games than they deserve. Respect the process, curse the matchups.",
    ],
    fraud: [
      "FRAUD WATCH: {luckAbs} more wins than their scoring supports. Enjoy it while it lasts.",
      "Winning the way a toddler wins at Candy Land. {luckAbs} wins of pure, unearned luck.",
    ],
    top: [
      "Top of the pile. Everyone is coming for {O}.",
      "League leader. Smug, and earned.",
    ],
    weakO: [
      "{ppg} points per game. Their offense is a rumor.",
      "Averaging {ppg}. You can't lose a shootout if you never bring a gun.",
    ],
    hot: [
      "{n} in a row. Somebody stop them, please.",
      "On a {n}-game heater. Insufferable in the group chat, probably.",
    ],
    mid: [
      "Perfectly mid. Nobody fears them, nobody pities them.",
      "Squarely in the 'could go either way' tier. Like gas station sushi.",
      "Existing. Contributing. Barely noticed.",
      "The fantasy version of a participation trophy. Present and accounted for.",
      "Has the vibe of a team that'll make the playoffs and lose by 40.",
      "Their best quality is that nobody has a reason to talk about them.",
      "The human equivalent of 'it's fine.'",
      "Riding the bubble like it owes them money.",
      "Somehow both overrated and underrated. Mostly just rated.",
    ],
  },
  lock: [
    "{F} is favored by {sp}. {D} should keep expectations reasonable, like 'scoring points'.",
    "Vegas has {F} by {sp}. {D}'s best hope is a meteor.",
  ],
  gotw: [
    "This is the one. {A} vs {B}, projected {pa}-{pb}. Clear your Sunday.",
    "{A} vs {B}. Projected within {sp}. Somebody's going to be insufferable Monday.",
  ],
};

// ---------------------------------------------------------------- helpers
const B = (s) => `<b>${esc(s)}</b>`;

/** Recompute records/streaks from matchup results through week `through`. */
function teamsThrough(baseTeams, allWeeks, through) {
  const m = new Map(baseTeams.map((t) => [t.rosterId, { ...t, wins: 0, losses: 0, ties: 0, pf: 0, pa: 0, results: "" }]));
  const weeks = {};
  for (let w = 1; w <= through; w++) {
    const rows = allWeeks[w];
    if (!rows || !rows.some((r) => r.points > 0)) continue;
    weeks[w] = rows;
    for (const [a, b] of pairs(rows)) {
      if (!b) continue;
      const ta = m.get(a.roster_id), tb = m.get(b.roster_id);
      if (!ta || !tb) continue;
      ta.pf += a.points; ta.pa += b.points; tb.pf += b.points; tb.pa += a.points;
      if (a.points > b.points) { ta.wins++; tb.losses++; ta.results += "W"; tb.results += "L"; }
      else if (a.points < b.points) { tb.wins++; ta.losses++; tb.results += "W"; ta.results += "L"; }
      else { ta.ties++; tb.ties++; ta.results += "T"; tb.results += "T"; }
    }
  }
  for (const t of m.values()) {
    const last = t.results.at(-1);
    let n = 0;
    for (let i = t.results.length - 1; i >= 0 && t.results[i] === last; i--) n++;
    t.streakType = last; t.streakN = n;
    t.streak = last ? `${n}${last}` : "";
  }
  return computeAdvanced([...m.values()], weeks);
}

const standSort = (a, b) => b.winPct - a.winPct || b.pf - a.pf;

// ---------------------------------------------------------------- main
/**
 * @param d { league, teams, allWeeks, players, week, projThis, projNext, me }
 *   week     — the completed week being recapped
 *   projThis — projections for `week` (for boom/bust)
 *   projNext — projections for week+1 (for preview), or null
 */
export function buildNewsletter(d) {
  const { league, allWeeks, players, week: W, projThis, projNext } = d;
  const sc = league.scoring_settings || {};
  const slots = league.roster_positions;
  const startSlots = slots.filter((s) => !NON_STARTING.has(s));
  const byId = new Map(d.teams.map((t) => [t.rosterId, t]));
  const name = (rid) => byId.get(rid)?.team || `Team ${rid}`;
  const owner = (rid) => byId.get(rid)?.owner || "this person";
  const pname = (id) => players[id]?.name || id;
  const seed = `${league.league_id}-${W}`;
  // Pick without repeating a line within the same issue.
  const usedLines = new Set();
  const pick = (arr, key) => {
    const start = Math.floor(seeded(key)() * arr.length);
    for (let i = 0; i < arr.length; i++) {
      const line = arr[(start + i) % arr.length];
      if (!usedLines.has(line)) { usedLines.add(line); return line; }
    }
    return arr[start];
  };
  const poss = (html, raw) => html + (/s$/i.test(raw) ? "'" : "'s");

  const rows = allWeeks[W] || [];
  const games = pairs(rows).filter((g) => g.length === 2);
  if (!games.length || !rows.some((r) => r.points > 0)) {
    return `<p class="empty">No completed games in week ${W} yet. The presses are cold.</p>`;
  }

  // --- per-team week facts
  const scoresSorted = rows.map((r) => r.points).sort((a, b) => a - b);
  const median = (scoresSorted[Math.floor((scoresSorted.length - 1) / 2)] + scoresSorted[Math.ceil((scoresSorted.length - 1) / 2)]) / 2;
  const fact = new Map();
  for (const r of rows) {
    const starters = (r.starters || []).map((id, i) => ({ id, pts: r.starters_points?.[i] ?? 0, proj: projThis?.[id] ? scoreStats(projThis[id].stats, sc) : null }));
    const top = [...starters].filter((s) => s.id !== "0").sort((a, b) => b.pts - a.pts)[0];
    const startSet = new Set(r.starters || []);
    const bench = (r.players || []).filter((id) => !startSet.has(id)).map((id) => ({ id, pts: r.players_points?.[id] ?? 0 })).sort((a, b) => b.pts - a.pts);
    const opt = optimalScore(r, slots, players);
    fact.set(r.roster_id, { r, starters, top, bench, opt, left: Math.max(0, opt - r.points) });
  }
  const star = (rid) => { const t = fact.get(rid).top; return t ? `${esc(pname(t.id))} (${f1(t.pts)})` : "nobody"; };

  // --- matchup recaps
  const results = games.map(([a, b]) => {
    const [w, l] = a.points >= b.points ? [a, b] : [b, a];
    const m = w.points - l.points;
    const kind = m >= 35 ? "blowout" : m < 5 ? "close" : l.points > median ? "robbed" : w.points < median ? "stole" : "normal";
    return { w, l, m, kind };
  });
  const recapHtml = results.map(({ w, l, m, kind }) => {
    const lb = fact.get(l.roster_id).bench[0];
    const text = fill(pick(T.recap[kind], `${seed}-recap-${w.roster_id}`), {
      W: B(name(w.roster_id)), L: B(name(l.roster_id)), Lp: poss(B(name(l.roster_id)), name(l.roster_id)), ws: f2(w.points), ls: f2(l.points), m: f2(m),
      wStar: star(w.roster_id), lStar: star(l.roster_id),
      lBench: lb ? `${esc(pname(lb.id))}'s ${f1(lb.pts)}` : "whatever was",
    });
    const tag = { blowout: "BLOWOUT", close: "NAIL-BITER", robbed: "ROBBED", stole: "UGLY W", normal: "" }[kind];
    return `<article class="recap">
      <div class="score-line"><span>${esc(name(w.roster_id))} <b>${f2(w.points)}</b></span><span class="dim">def.</span><span>${esc(name(l.roster_id))} <b>${f2(l.points)}</b></span>${tag ? `<span class="tag tag-${kind}">${tag}</span>` : ""}</div>
      <p>${text}</p></article>`;
  }).join("");

  // --- headline
  const biggest = [...results].sort((a, b) => b.m - a.m)[0];
  const closest = [...results].sort((a, b) => a.m - b.m)[0];
  const topRow = [...rows].sort((a, b) => b.points - a.points)[0];
  const lowRow = [...rows].sort((a, b) => a.points - b.points)[0];
  let headline;
  if (biggest.m >= 40) headline = fill(pick(T.headline.blowout, seed + "h"), { W: esc(name(biggest.w.roster_id)), L: esc(name(biggest.l.roster_id)), m: f1(biggest.m) });
  else if (closest.m < 3) headline = fill(pick(T.headline.close, seed + "h"), { W: esc(name(closest.w.roster_id)), L: esc(name(closest.l.roster_id)), m: f2(closest.m) });
  else headline = fill(pick(T.headline.top, seed + "h"), { T: esc(name(topRow.roster_id)), s: f2(topRow.points) });

  // --- awards
  const awards = [];
  awards.push({ icon: "🚀", title: "Rocket of the Week", color: "orange", body: fill(pick(T.rocket, seed + "r"), { T: B(name(topRow.roster_id)), s: f2(topRow.points) }) });
  awards.push({ icon: "🗑️", title: "Dong of the Week", color: "red", cls: "shame", body: fill(pick(T.dong, seed + "d"), { T: B(name(lowRow.roster_id)), s: f2(lowRow.points) }) });

  const benchBoss = [...fact.values()].sort((a, b) => b.left - a.left)[0];
  if (benchBoss && benchBoss.left >= 8) {
    const rid = benchBoss.r.roster_id;
    const res = results.find((x) => x.w.roster_id === rid || x.l.roster_id === rid);
    const lost = res && res.l.roster_id === rid;
    const flips = lost && benchBoss.opt > res.w.points;
    awards.push({ icon: "🪑", title: "Bench Blunder", color: "purple", cls: "shame", body: fill(pick(T.bench, seed + "b"), {
      T: B(name(rid)), O: esc(owner(rid)), b: f1(benchBoss.left), opt: f2(benchBoss.opt),
      flip: flips ? pick(T.flip, seed + "f") : "",
    }) });
  }

  const allStarters = [...fact.values()].flatMap((f) => f.starters.filter((s) => s.id !== "0" && s.proj != null).map((s) => ({ ...s, rid: f.r.roster_id })));
  if (allStarters.length) {
    const boom = [...allStarters].sort((a, b) => (b.pts - b.proj) - (a.pts - a.proj))[0];
    const bust = [...allStarters].filter((s) => s.proj >= 8).sort((a, b) => (b.proj - b.pts) - (a.proj - a.pts))[0];
    awards.push({ icon: "💥", title: "Boom", color: "green", body: `${B(pname(boom.id))} put up <b>${f1(boom.pts)}</b> on a ${f1(boom.proj)}-point projection for ${B(name(boom.rid))}. Whoever starts guys like this is either a genius or lucky. (Lucky.)` });
    if (bust) awards.push({ icon: "🧊", title: "Bust", color: "teal", cls: "shame", body: `${B(pname(bust.id))} was projected for ${f1(bust.proj)} and delivered <b>${f1(bust.pts)}</b>. ${B(name(bust.rid))} would like a refund.` });
  }

  const unlucky = results.filter((x) => x.l.points > median).sort((a, b) => b.l.points - a.l.points)[0];
  if (unlucky) {
    const beaten = rows.filter((r) => r.points < unlucky.l.points).length;
    awards.push({ icon: "🥲", title: "Unluckiest Loss", color: "indigo", body: `${B(name(unlucky.l.roster_id))} scored ${f2(unlucky.l.points)}, enough to beat ${beaten} of ${rows.length - 1} teams, and still took an L. Cosmic injustice.` });
  }
  const lucky = results.filter((x) => x.w.points < median).sort((a, b) => a.w.points - b.w.points)[0];
  if (lucky) awards.push({ icon: "🍀", title: "Luckiest Win", color: "mint", body: `${B(name(lucky.w.roster_id))} won with ${f2(lucky.w.points)}, below the league median. Buy a lottery ticket.` });

  // --- standings & roasts (as of week W)
  const now = teamsThrough(d.teams, allWeeks, W).sort(standSort);
  const prev = W > 1 ? teamsThrough(d.teams, allWeeks, W - 1) : null;
  const powerNow = [...now].sort((a, b) => b.power - a.power).map((t) => t.rosterId);
  const powerPrev = prev ? [...prev].sort((a, b) => b.power - a.power).map((t) => t.rosterId) : null;
  const ppgSorted = [...now].sort((a, b) => a.ppg - b.ppg);
  const roast = (t, i) => {
    const v = { O: esc(t.owner), n: t.streakN, ppg: f1(t.ppg), exp: `${Math.round(t.expWins)}-${t.games - Math.round(t.expWins)}`, luckAbs: f1(Math.abs(t.luck)) };
    const s = (cat) => fill(pick(T.standing[cat], `${seed}-${cat}-${t.rosterId}`), v);
    if (i === now.length - 1) return s("last");
    if (i === 0) return s("top");
    if (t.streakType === "L" && t.streakN >= 3) return s("losing");
    if (t.luck >= 1.5) return s("fraud");
    if (t.luck <= -1.5) return s("unlucky");
    if (t.streakType === "W" && t.streakN >= 3) return s("hot");
    if (ppgSorted.indexOf(t) < 2) return s("weakO");
    return s("mid");
  };
  const playoffTeams = league.settings.playoff_teams || 6;
  const standingsHtml = now.map((t, i) => {
    const pr = powerNow.indexOf(t.rosterId) + 1;
    const move = powerPrev ? powerPrev.indexOf(t.rosterId) + 1 - pr : 0;
    const zone = i === now.length - 1 ? "last" : i < playoffTeams ? "in" : "out";
    return `<tr class="${i === playoffTeams - 1 ? "cutline" : ""}">
      <td class="rank"><span class="rank-badge ${zone}">${i + 1}</span></td>
      <td class="l"><b>${esc(t.team)}</b> <span class="dim">${rec(t.wins, t.losses, t.ties)} · ${esc(t.streak)}</span><div class="roast">${roast(t, i)}</div></td>
      <td>${pr}${move ? ` <span class="${move > 0 ? "pos" : "neg"}">${move > 0 ? "▲" : "▼"}${Math.abs(move)}</span>` : ""}</td>
    </tr>`;
  }).join("");

  // --- preview of next week
  let previewHtml = "";
  const N = W + 1;
  const nextRows = allWeeks[N];
  if (nextRows?.length && projNext && Object.keys(projNext).length) {
    const pw = new Map(now.map((t) => [t.rosterId, t]));
    const projTeam = (r) => (r.starters || []).reduce((s, id) => s + (projNext[id] ? scoreStats(projNext[id].stats, sc) : 0), 0);
    const nextGames = pairs(nextRows).filter((g) => g.length === 2).map(([a, b]) => {
      const pa = projTeam(a), pb = projTeam(b);
      const powerSum = (pw.get(a.roster_id)?.power || 0) + (pw.get(b.roster_id)?.power || 0);
      return { a, b, pa, pb, sp: Math.abs(pa - pb), score: powerSum - 2 * Math.abs(pa - pb) };
    });
    const gotw = [...nextGames].sort((x, y) => y.score - x.score)[0];
    const lock = [...nextGames].sort((x, y) => y.sp - x.sp)[0];

    // Lineup problems: empty slots, injured starters, starters with no projection (bye / out).
    const alerts = [];
    for (const r of nextRows) {
      const empty = (r.starters || []).map((id, i) => (id === "0" || !id ? startSlots[i] : null)).filter(Boolean);
      if (empty.length === 1) alerts.push(`${B(name(r.roster_id))} has an <b>empty ${esc(empty[0])} slot</b>. Bold strategy.`);
      else if (empty.length > 1) alerts.push(`${B(name(r.roster_id))} has <b>${empty.length} empty slots</b> (${empty.map(esc).join(", ")}). Is ${esc(owner(r.roster_id))} even alive?`);
      (r.starters || []).forEach((id, i) => {
        if (id === "0" || !id) return;
        const pj = projNext[id];
        const inj = pj?.injury || players[id]?.injury;
        if (inj) {
          const sev = ["Out", "IR", "Doubtful", "PUP", "Sus"].includes(inj);
          alerts.push(`${B(name(r.roster_id))} is starting ${B(pname(id))} <span class="inj ${sev ? "inj-bad" : ""}">${esc(inj)}${pj?.injuryPart ? " · " + esc(pj.injuryPart) : ""}</span>${sev ? ". Pay attention, " + esc(owner(r.roster_id)) + "." : ""}`);
        } else if (!pj && players[id]?.pos !== "DEF") {
          alerts.push(`${B(name(r.roster_id))} is starting ${B(pname(id))} with <b>no projection</b> (bye week? Cut? Witness protection?).`);
        }
      });
    }

    previewHtml = `<section class="nl-section"><h3>Week ${N} Preview</h3>
      ${gotw ? `<div class="gotw"><span class="kicker">Game of the Week</span><p>${fill(pick(T.gotw, seed + "g"), { A: B(name(gotw.a.roster_id)), B: B(name(gotw.b.roster_id)), pa: f1(gotw.pa), pb: f1(gotw.pb), sp: f1(gotw.sp) })}</p></div>` : ""}
      ${lock && lock !== gotw && lock.sp >= 10 ? (() => { const [F, D] = lock.pa >= lock.pb ? [lock.a, lock.b] : [lock.b, lock.a]; return `<div class="gotw lock"><span class="kicker">Lock of the Week</span><p>${fill(pick(T.lock, seed + "l"), { F: B(name(F.roster_id)), D: B(name(D.roster_id)), sp: f1(lock.sp) })}</p></div>`; })() : ""}
      <table class="lines"><thead><tr><th class="l">Matchup</th><th>Proj</th><th>Line</th></tr></thead><tbody>
      ${nextGames.map((g) => { const fav = g.pa >= g.pb ? g.a : g.b; return `<tr><td class="l">${esc(name(g.a.roster_id))} <span class="dim">vs</span> ${esc(name(g.b.roster_id))}</td><td>${f1(g.pa)} – ${f1(g.pb)}</td><td>${esc(name(fav.roster_id))} −${f1(g.sp)}</td></tr>`; }).join("")}
      </tbody></table>
      ${alerts.length ? `<h4>Lineup Watch</h4><ul class="alerts">${alerts.map((a) => `<li>${a}</li>`).join("")}</ul>` : ""}
    </section>`;
  }

  return `<div class="newsletter">
    <header class="masthead">
      <div class="kicker">Week ${W} Edition · ${esc(league.season)}</div>
      <h2>The ${esc(league.name)} Gazette</h2>
      <div class="dim">Your trusted source for fantasy news, unearned confidence and public humiliation</div>
    </header>
    <h1 class="headline">${headline}</h1>
    <section class="nl-section"><h3>Week ${W} Recap</h3>${recapHtml}</section>
    <section class="nl-section"><h3>Awards Ceremony</h3><div class="awards">
      ${awards.map((a) => `<div class="award ${a.cls || ""}" style="--c: var(--${a.color || "blue"})"><div class="award-title"><span class="icon-tile">${a.icon}</span>${a.title}</div><p>${a.body}</p></div>`).join("")}
    </div></section>
    <section class="nl-section"><h3>State of the League</h3>
      <table class="nl-standings"><thead><tr><th>#</th><th class="l">Team &amp; Commentary</th><th>Power</th></tr></thead><tbody>${standingsHtml}</tbody></table>
    </section>
    ${previewHtml}
  </div>`;
}
