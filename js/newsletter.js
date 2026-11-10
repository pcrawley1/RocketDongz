// Builds the weekly newsletter: TL;DR + scoreboard recaps + awards + standings roasts + preview.
import { computeAdvanced } from "./stats.js?v=20261110123555";
import { scoreStats, optimalScore, NON_STARTING } from "./scoring.js?v=20261110123555";
import { avatarUrl } from "./sleeper.js?v=20261110123555";
import { personaFor } from "./personas.js?v=20261110123555";
import { esc, f1, f2, rec, pairs, seeded, fill, leagueDisplay } from "./util.js?v=20261110123555";

// ---------------------------------------------------------------- templates (short = readable)
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
  // One-liners under each scoreboard. {W}/{L} are winner/loser names.
  recap: {
    blowout: [
      "Not a loss. A cry for help.",
      "{L}, maybe try starting players who play football?",
      "{L}'s lineup looked autodrafted on a dial-up connection.",
      "Somebody check the pulse on {L}.",
    ],
    close: [
      "{L} will be thinking about {lBench} on the bench forever.",
      "One less dumb lineup decision and {L} wins this. Instead: an L.",
      "{L} has already drafted the group-chat excuse.",
    ],
    robbed: [
      "{L} beats most of the league with that. Brutal. Unfair. Hilarious.",
      "Wrong week to play {W}. Fantasy football is cruel.",
    ],
    stole: [
      "No style, no shame, just a W. Nobody enjoyed watching this.",
      "Below-median win. Both teams should think about what they've done.",
    ],
    normal: [
      "Solid, unremarkable, the fantasy equivalent of a Toyota Camry.",
      "{L} fought, in the sense that they set a lineup.",
      "Business as usual. {L} showed up and that's about it.",
    ],
  },
  rocket: ["Everybody else was playing checkers.", "Top score of the week. Respect.", "Launched into orbit."],
  dong: ["Lower than some kickers' career highs.", "They didn't lose, they surrendered.", "If you watched this lineup, seek counseling."],
  bench: ["Read your notifications.", "Looked at the right lineup and said 'nah'.", "The bench outplayed the starters."],
  boom: ["Genius or lucky? (Lucky.)", "Nobody saw that coming. Including the manager."],
  bust: ["Would like a refund.", "Projected to show up. Did not."],
  unlucky: ["Cosmic injustice.", "Scored enough to beat almost anyone. Almost."],
  lucky: ["Buy a lottery ticket.", "Won ugly. A W is a W."],
  standing: {
    last: ["Their ceiling has a basement.", "Toilet Bowl favorites.", "Draft board entered into evidence."],
    losing: ["{n} straight Ls. Somebody check on {O}.", "'Long season' is starting to sound like a threat."],
    unlucky: ["Should be about {exp}. Schedule has a vendetta.", "{luckAbs} more Ls than they deserve."],
    fraud: ["FRAUD WATCH: {luckAbs} unearned wins.", "Winning like a toddler wins Candy Land."],
    top: ["Everyone is coming for {O}.", "Smug, and earned."],
    weakO: ["{ppg} PPG. Their offense is a rumor.", "Can't win a shootout without a gun."],
    hot: ["{n} straight. Somebody stop them.", "Insufferable in the group chat, probably."],
    mid: [
      "Perfectly mid.", "Like gas station sushi: could go either way.", "Existing. Contributing. Barely noticed.",
      "A participation trophy with a roster.", "Will make the playoffs and lose by 40.", "The human equivalent of 'it's fine.'",
      "Riding the bubble like it owes them money.", "Mostly just rated.",
    ],
  },
  lock: ["{D}'s best hope is a meteor.", "{D} should aim for 'scoring points'."],
  gotw: ["Clear your Sunday.", "Somebody's going to be insufferable Monday."],
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
// Rough win chance from a projected spread (fantasy weekly scores swing ~±25).
const winChance = (spread) => 1 / (1 + Math.exp(-spread / 14));

// ---------------------------------------------------------------- main
/**
 * @param d { league, teams, allWeeks, players, week, projThis, projNext, me }
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
  const av = (rid, size = "") => {
    const url = avatarUrl(byId.get(rid)?.avatar);
    return url ? `<img class="av ${size}" src="${url}" alt="" loading="lazy">` : `<span class="av ph ${size}"></span>`;
  };
  const who = (rid) => `<span class="who">${av(rid, "sm")}${B(name(rid))}</span>`;
  const seed = `${league.league_id}-${W}`;
  const usedLines = new Set();
  const pick = (arr, key) => {
    const start = Math.floor(seeded(key)() * arr.length);
    for (let i = 0; i < arr.length; i++) {
      const line = arr[(start + i) % arr.length];
      if (!usedLines.has(line)) { usedLines.add(line); return line; }
    }
    return arr[start];
  };
  // Inside jokes: a persona line for this team's owner, or null to fall back to the generic line.
  const pLine = (rid, cat, key, vars = {}) => {
    const p = personaFor(owner(rid));
    const arr = p?.[cat];
    return arr?.length ? fill(pick(arr, `${seed}-${cat}-${key}-${rid}`), { N: B(p.nick), ...vars }) : null;
  };

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

  // --- standings as of week W (used in several places)
  const now = teamsThrough(d.teams, allWeeks, W).sort(standSort);
  const nowById = new Map(now.map((t) => [t.rosterId, t]));
  const recOf = (rid) => { const t = nowById.get(rid); return t ? rec(t.wins, t.losses, t.ties) : ""; };

  // --- scoreboard recaps
  const results = games.map(([a, b]) => {
    const [w, l] = a.points >= b.points ? [a, b] : [b, a];
    const m = w.points - l.points;
    const kind = m >= 35 ? "blowout" : m < 5 ? "close" : l.points > median ? "robbed" : w.points < median ? "stole" : "normal";
    return { w, l, m, kind };
  });
  const TAG = { blowout: "💀 Blowout", close: "😬 Nail-biter", robbed: "🥷 Robbed", stole: "🤢 Ugly W", normal: "" };
  const order = { blowout: 0, close: 1, robbed: 2, stole: 3, normal: 4 };
  const teamRow = (r, won) => {
    const t = fact.get(r.roster_id).top;
    return `<div class="sb-row ${won ? "win" : "lose"}">
      ${av(r.roster_id)}
      <div class="sb-name"><div class="sb-team">${esc(name(r.roster_id))} <span class="sb-rec">${recOf(r.roster_id)}</span></div>
        ${t ? `<div class="sb-star">⭐ ${esc(pname(t.id))} <b>${f1(t.pts)}</b></div>` : ""}</div>
      <div class="sb-score">${f2(r.points)}</div>
    </div>`;
  };
  const recapHtml = [...results].sort((a, b) => order[a.kind] - order[b.kind] || b.m - a.m).map(({ w, l, m, kind }) => {
    const lb = fact.get(l.roster_id).bench[0];
    const pv = { W: B(name(w.roster_id)), L: B(name(l.roster_id)), s: f2(l.points) };
    const quip = pLine(l.roster_id, "loss", "r", pv) || pLine(w.roster_id, "win", "r", pv) || fill(pick(T.recap[kind], `${seed}-recap-${w.roster_id}`), {
      W: B(name(w.roster_id)), L: B(name(l.roster_id)),
      lBench: lb ? `${esc(pname(lb.id))}'s ${f1(lb.pts)}` : "the bench",
    });
    return `<article class="sb sb-${kind}">
      <div class="sb-head">${TAG[kind] ? `<span class="tag tag-${kind}">${TAG[kind]}</span>` : `<span></span>`}<span class="sb-margin">won by ${f1(m)}</span></div>
      ${teamRow(w, true)}${teamRow(l, false)}
      <p class="quip">${quip}</p>
    </article>`;
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

  // --- awards: big stat first, then who, then a one-liner
  const awards = [];
  const award = (a) => awards.push(a);
  award({ icon: "🚀", title: "Rocket of the Week", color: "orange", stat: f2(topRow.points), who: who(topRow.roster_id), quip: pLine(topRow.roster_id, "high", "a", { s: f2(topRow.points) }) || pick(T.rocket, seed + "r") });
  award({ icon: "🗑️", title: "Dong of the Week", color: "red", stat: f2(lowRow.points), who: who(lowRow.roster_id), quip: pLine(lowRow.roster_id, "low", "a", { s: f2(lowRow.points) }) || pick(T.dong, seed + "d") });

  const benchBoss = [...fact.values()].sort((a, b) => b.left - a.left)[0];
  if (benchBoss && benchBoss.left >= 8) {
    const rid = benchBoss.r.roster_id;
    const res = results.find((x) => x.w.roster_id === rid || x.l.roster_id === rid);
    const flips = res && res.l.roster_id === rid && benchBoss.opt > res.w.points;
    award({ icon: "🪑", title: "Bench Blunder", color: "purple", stat: `${f1(benchBoss.left)}`, sub: "pts left on bench", who: who(rid),
      quip: flips ? `Best lineup was ${f2(benchBoss.opt)}. <b>That's a win thrown in the trash.</b>` : pLine(rid, "bench", "a") || pick(T.bench, seed + "b") });
  }

  const allStarters = [...fact.values()].flatMap((f) => f.starters.filter((s) => s.id !== "0" && s.proj != null).map((s) => ({ ...s, rid: f.r.roster_id })));
  if (allStarters.length) {
    const boom = [...allStarters].sort((a, b) => (b.pts - b.proj) - (a.pts - a.proj))[0];
    const bust = [...allStarters].filter((s) => s.proj >= 8).sort((a, b) => (b.proj - b.pts) - (a.proj - a.pts))[0];
    award({ icon: "💥", title: "Boom", color: "green", stat: f1(boom.pts), sub: `proj ${f1(boom.proj)}`,
      who: `<span class="who">${B(pname(boom.id))}<span class="dim"> · ${esc(name(boom.rid))}</span></span>`, quip: pick(T.boom, seed + "bo") });
    if (bust) award({ icon: "🧊", title: "Bust", color: "teal", stat: f1(bust.pts), sub: `proj ${f1(bust.proj)}`,
      who: `<span class="who">${B(pname(bust.id))}<span class="dim"> · ${esc(name(bust.rid))}</span></span>`, quip: pick(T.bust, seed + "bu") });
  }
  const unlucky = results.filter((x) => x.l.points > median).sort((a, b) => b.l.points - a.l.points)[0];
  if (unlucky) {
    const beaten = rows.filter((r) => r.points < unlucky.l.points).length;
    award({ icon: "🥲", title: "Unluckiest Loss", color: "indigo", stat: f2(unlucky.l.points), sub: `beat ${beaten} of ${rows.length - 1} teams`, who: who(unlucky.l.roster_id), quip: pick(T.unlucky, seed + "u") });
  }
  const lucky = results.filter((x) => x.w.points < median).sort((a, b) => a.w.points - b.w.points)[0];
  if (lucky) award({ icon: "🍀", title: "Luckiest Win", color: "mint", stat: f2(lucky.w.points), sub: "below median, still won", who: who(lucky.w.roster_id), quip: pick(T.lucky, seed + "l") });

  // --- standings & roasts
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
  let biggestRiser = null;
  const standingsHtml = now.map((t, i) => {
    const pr = powerNow.indexOf(t.rosterId) + 1;
    const move = powerPrev ? powerPrev.indexOf(t.rosterId) + 1 - pr : 0;
    if (move > 0 && (!biggestRiser || move > biggestRiser.move)) biggestRiser = { t, move };
    const zone = i === now.length - 1 ? "last" : i < playoffTeams ? "in" : "out";
    const streakCls = t.streakType === "W" ? "w" : t.streakType === "L" ? "l" : "";
    return `${i === playoffTeams ? `<div class="cut-label">Playoff line</div>` : ""}
    <div class="st-row">
      <span class="rank-badge ${zone}">${i + 1}</span>
      ${av(t.rosterId)}
      <div class="st-main">
        <div class="st-top"><b>${esc(t.team)}</b><span class="chip">${rec(t.wins, t.losses, t.ties)}</span>${personaFor(t.owner) ? `<span class="chip aka">${esc(personaFor(t.owner).tag)}</span>` : ""}${t.streak ? `<span class="chip streak ${streakCls}">${esc(t.streak)}</span>` : ""}</div>
        <div class="roast">${pLine(t.rosterId, "standing", "st") || roast(t, i)}</div>
      </div>
      <div class="st-power"><span class="dim">PWR</span><b>${pr}</b>${move ? `<span class="${move > 0 ? "pos" : "neg"}">${move > 0 ? "▲" : "▼"}${Math.abs(move)}</span>` : ""}</div>
    </div>`;
  }).join("");

  // --- preview of next week
  let previewHtml = "", gotwLine = "";
  const N = W + 1;
  const nextRows = allWeeks[N];
  if (nextRows?.length && projNext && Object.keys(projNext).length) {
    const projTeam = (r) => (r.starters || []).reduce((s, id) => s + (projNext[id] ? scoreStats(projNext[id].stats, sc) : 0), 0);
    const alertsFor = (r) => {
      const out = [];
      const empty = (r.starters || []).map((id, i) => (id === "0" || !id ? startSlots[i] : null)).filter(Boolean);
      if (empty.length) out.push(`<span class="inj inj-bad">EMPTY</span> ${empty.map(esc).join(", ")} slot${empty.length > 1 ? "s" : ""}`);
      (r.starters || []).forEach((id) => {
        if (id === "0" || !id) return;
        const pj = projNext[id];
        const inj = pj?.injury || players[id]?.injury;
        if (inj) {
          const sev = ["Out", "IR", "Doubtful", "PUP", "Sus"].includes(inj);
          out.push(`<span class="inj ${sev ? "inj-bad" : ""}">${esc(inj)}</span> ${esc(pname(id))}`);
        } else if (!pj && players[id]?.pos !== "DEF") {
          out.push(`<span class="inj inj-bad">NO PROJ</span> ${esc(pname(id))}`);
        }
      });
      return out;
    };
    const nextGames = pairs(nextRows).filter((g) => g.length === 2).map(([a, b]) => {
      const pa = projTeam(a), pb = projTeam(b);
      const powerSum = (nowById.get(a.roster_id)?.power || 0) + (nowById.get(b.roster_id)?.power || 0);
      return { a, b, pa, pb, sp: Math.abs(pa - pb), score: powerSum - 2 * Math.abs(pa - pb) };
    });
    const gotw = [...nextGames].sort((x, y) => y.score - x.score)[0];
    const lock = [...nextGames].sort((x, y) => y.sp - x.sp)[0];
    if (gotw) gotwLine = `${esc(name(gotw.a.roster_id))} vs ${esc(name(gotw.b.roster_id))}`;

    const card = (g) => {
      const isG = g === gotw, isL = g === lock && g !== gotw && g.sp >= 10;
      const pA = winChance(g.pa - g.pb);
      const al = alertsFor(g.a), bl = alertsFor(g.b);
      const label = isG ? `<div class="pv-label gotw">🔥 Game of the Week</div>` : isL ? `<div class="pv-label lock">🔒 Lock of the Week</div>` : "";
      const fav = g.pa >= g.pb ? g.a : g.b, dog = fav === g.a ? g.b : g.a;
      const quip = isG ? pick(T.gotw, seed + "g") : isL ? fill(pick(T.lock, seed + "lk"), { D: B(name(dog.roster_id)) }) : "";
      const side = (r, p, chance, right) => `<div class="pv-side ${right ? "right" : ""}">
          ${av(r.roster_id)}<div><div class="pv-team">${esc(name(r.roster_id))}</div><div class="pv-proj"><b>${f1(p)}</b> <span class="dim">proj · ${Math.round(chance * 100)}%</span></div></div></div>`;
      return `<div class="pv ${isG ? "is-gotw" : ""} ${isL ? "is-lock" : ""}">
        ${label}
        <div class="pv-teams">${side(g.a, g.pa, pA, false)}${side(g.b, g.pb, 1 - pA, true)}</div>
        <div class="tug"><span style="width:${(pA * 100).toFixed(1)}%"></span></div>
        ${quip ? `<p class="quip">${quip}</p>` : ""}
        ${al.length || bl.length ? `<div class="pv-alerts"><div>${al.map((x) => `<div>${x}</div>`).join("")}</div><div class="right">${bl.map((x) => `<div>${x}</div>`).join("")}</div></div>` : ""}
      </div>`;
    };
    const ordered = [gotw, ...(lock !== gotw && lock.sp >= 10 ? [lock] : []), ...nextGames.filter((g) => g !== gotw && !(g === lock && lock.sp >= 10))];
    previewHtml = `<section class="nl-section"><h3>Week ${N} Preview</h3>
      <div class="pv-grid">${ordered.map(card).join("")}</div>
      <p class="note">Win % is a rough estimate from projected points. Badges flag starters who are injured, empty, or have no projection (bye?).</p>
    </section>`;
  }

  // --- TL;DR
  const tldr = [
    `🚀 ${B(name(topRow.roster_id))} had the top score: <b>${f2(topRow.points)}</b>`,
    biggest.m >= 25 ? `💀 ${B(name(biggest.w.roster_id))} beat ${B(name(biggest.l.roster_id))} by <b>${f1(biggest.m)}</b>` : null,
    closest.m < 8 ? `😬 ${B(name(closest.w.roster_id))} survived ${B(name(closest.l.roster_id))} by <b>${f2(closest.m)}</b>` : null,
    `🗑️ ${B(name(lowRow.roster_id))} scraped together <b>${f2(lowRow.points)}</b>`,
    biggestRiser ? `📈 ${B(biggestRiser.t.team)} jumped <b>${biggestRiser.move}</b> spot${biggestRiser.move > 1 ? "s" : ""} in the power rankings` : null,
    gotwLine ? `🔥 Next week's Game of the Week: <b>${gotwLine}</b>` : null,
  ].filter(Boolean);

  const disp = leagueDisplay(league.name);
  return `<div class="newsletter">
    <header class="masthead">
      <div class="kicker">${disp.emoji} Week ${W} Edition · ${esc(league.season)}</div>
      <h2>The ${esc(disp.name)} Gazette</h2>
      <div class="dim">Fantasy news, unearned confidence and public humiliation</div>
    </header>
    <h1 class="headline">${headline}</h1>
    <section class="tldr"><div class="tldr-title">The 10-second version</div><ul>${tldr.map((x) => `<li>${x}</li>`).join("")}</ul></section>
    <section class="nl-section"><h3>Week ${W} Scoreboard</h3><div class="sb-grid">${recapHtml}</div></section>
    <section class="nl-section"><h3>Awards Ceremony</h3><div class="awards">
      ${awards.map((a) => `<div class="award" style="--c: var(--${a.color})">
        <div class="award-title"><span class="icon-tile">${a.icon}</span>${a.title}</div>
        <div class="award-stat"><b>${a.stat}</b>${a.sub ? `<span>${a.sub}</span>` : ""}</div>
        <div class="award-who">${a.who}</div>
        <p class="quip">${a.quip}</p>
      </div>`).join("")}
    </div></section>
    <section class="nl-section"><h3>State of the League</h3><div class="standings-list">${standingsHtml}</div></section>
    ${previewHtml}
  </div>`;
}
