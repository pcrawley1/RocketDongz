// Waiver wire commentary. Every quip starts from facts about the specific move: how often the player
// has been passed around, who cut him, his best week, points wasted on the bench, injuries, age,
// next opponent, FAAB price, and how the add compares with the drop. An honest verdict follows, and
// no line repeats on the page.
import { esc, f1, seeded, fill } from "./util.js?v=20261116111131";
import { personaFor } from "./personas.js?v=20261116111131";

const V = {
  // verdicts by tier, honest first, mean second
  a: [
    "Credit where it's due: that's a league-winning type of pickup.",
    "Annoyingly, this was the smartest move anyone made that week.",
    "Rest of the league was asleep. {T} was not.",
    "This is what reading the waiver wire looks like, everyone. Take notes.",
    "Genuinely great add. We hate to see it.",
    "Points per game well above replacement. No jokes, just respect. Okay, one joke: everyone else missed it.",
    "Somebody check {T}'s browser history for a fantasy subscription.",
    "A real hit. The kind you brag about in the group chat. {T} definitely did.",
  ],
  b: [
    "Solid, useful, startable. Hard to make fun of. We'll try next week.",
    "Real fantasy points. A legitimately good add.",
    "Not flashy, but he's been a starter-quality body.",
    "Respectable. {T} did their homework on this one.",
    "Above replacement and pulling his weight. Fine. Good, even.",
    "The rare pickup that actually helps. Noted, reluctantly.",
    "He's scored like a starter. Grudging thumbs up.",
  ],
  c: [
    "Verdict: bench depth. The fantasy equivalent of a spare tire.",
    "He exists. He occasionally scores. That's the review.",
    "Roster filler with a pulse. Not much more.",
    "Somewhere between 'useful' and 'why'. Closer to 'why'.",
    "A body. A warm, mediocre body.",
    "If you squint, he's a bye-week fill-in.",
    "Meh. The waiver wire's version of gas station sushi.",
  ],
  f: [
    "Verdict: wasted roster spot.",
    "The waiver wire was free and this still feels like overpaying.",
    "Hasn't come close to replacement level. A whiff.",
    "Points per game that would embarrass a kicker.",
    "This move made the team worse by existing.",
    "Should've left him on the wire for someone else to regret.",
    "A swing and a miss. A big, slow, public miss.",
    "Statistically, picking a name out of a hat does better.",
  ],
  earlyGood: [
    "Projections like it. Hasn't played for them yet, so hold the parade.",
    "On paper, a nice grab. Paper doesn't score, though.",
    "Sleeper's projections approve. We'll check back Monday.",
    "Early read: a smart add. Don't make us eat those words.",
    "Looks good in the spreadsheet. Sundays are not spreadsheets.",
    "The math says yes. The math has been wrong before.",
    "Promising. Which is what everyone says right before it isn't.",
    "Good process. Results pending.",
  ],
  earlyBad: [
    "Even the projections are shrugging.",
    "Projected for roughly nothing. Bold.",
    "The projections took one look and said 'no thanks'.",
    "Early read: not great, Bob.",
    "Projected numbers that would make a backup long snapper blush.",
    "The projection is a rounding error.",
    "If this works out, we'll apologize. It won't.",
    "Sleeper projects him for 'please don't start me'.",
    "Even in a best-case world, this is a bench body.",
  ],
  tbd: [
    "No games, no projection. Jury's out.",
    "Nothing to grade yet. Enjoy the honeymoon.",
    "Too early to roast. We're patient. Mostly.",
    "Grade pending. Roast pending. Both coming.",
    "No data, no verdict. Check back next week.",
    "Schrödinger's pickup: both good and bad until he plays.",
  ],
};

const F = {
  rental: [
    "{P} has now been picked up {n} times this season. He's not a player, he's a timeshare.",
    "{P}, added for the {nth} time this year. Half the league has his number saved.",
    "Welcome to stop #{n} on the {P} rental tour.",
    "{P} has been on more rosters this season than some guys have been on in a career. Pickup #{n}.",
  ],
  recycledGood: [
    "{X} cut {P} in week {w}. {T} went dumpster diving and came up with a gem.",
    "{X} gave up on {P} in week {w}. {T} said thank you very much.",
    "One man's trash: {X} dropped {P} in week {w} and {T} is cashing in.",
  ],
  recycledBad: [
    "{X} cut {P} in week {w} for a reason. {T} found out what it was.",
    "{T} fished {P} out of {X}'s trash from week {w}. It was trash.",
    "{X} already learned this lesson in week {w}. {T} wanted to learn it personally.",
  ],
  boom: [
    "{P} dropped {b} on them in week {w}, so there's that.",
    "Week {w}: {P} put up {b}. A memory to cherish.",
    "{P}'s week {w} ({b} pts) paid for the whole thing.",
  ],
  benchWaste: [
    "{P} has scored {bench} of his {pts} points on {T}'s bench. Great pickup, horrible lineup decisions.",
    "{bench} of {P}'s points came while {T} had him benched. You found him, now play him.",
    "{T} picked up {P} and then hid him: {bench} points left on the bench.",
  ],
  injured: [
    "{P} is currently listed {inj}{part}. Bold strategy.",
    "Small detail: {P} is {inj}{part}.",
    "Adding {P}, who's {inj}{part}. Fantasy optimism at its finest.",
  ],
  rookie: [
    "Rookie flier on {P}. Youth is fun until it isn't.",
    "{P} is a rookie. {T} is buying the upside and the growing pains.",
    "Betting on a rookie in {P}. Somebody remind him it's the NFL.",
  ],
  old: [
    "{P} is {age}. Hope he stretched.",
    "At {age}, {P} is running on ice baths and vibes.",
    "{P} turns AARP-eligible in a few years ({age}). Respect the hustle.",
  ],
  opp: [
    "{P} draws {opp} this week.",
    "Next up for {P}: {opp}.",
    "{P} gets {opp} this week, which is the whole reason this happened.",
  ],
  defStream: [
    "Streaming the {P} D against {opp}. Living week to week like a true degenerate.",
    "{P} defense vs {opp}: the waiver-wire defense special.",
    "Plugging in the {P} D against {opp}. Defense stream number who-knows.",
  ],
  kicker: [
    "A kicker pickup. Thrilling.",
    "Swapping kickers. The most fantasy thing you can do.",
    "Kicker streaming: chaos with an extra point.",
  ],
  topBid: [
    "Most expensive claim of the season at {B}.",
    "{B}: nobody in the league has paid more for a single player this year.",
    "{T} dropped {B} on this. Biggest FAAB swing of the season.",
  ],
  bigBid: [
    "{B} of FAAB for {P}. That's real money in fake money.",
    "{T} paid {B} for {P}.",
    "Price tag: {B}.",
  ],
  freeClaim: [
    "A $0 claim. Priced accordingly.",
    "Zero dollars. You get what you pay for.",
    "Free claim. Bargain-bin energy.",
  ],
  swapWin: [
    "Swapped {D} for {P} and won the exchange, {y} to {x}.",
    "Out with {D}, in with {P}. {P} has outscored him {y} to {x}. Good call.",
  ],
  swapLoss: [
    "Swapped {D} for {P}. {D} has outscored him {x} to {y} since. Whoops.",
    "Cut {D} for this. {D}: {x}. {P}: {y}. Do the math.",
    "{D} ({x} since) for {P} ({y}). That's a downgrade with extra steps.",
  ],
  cutFast: [
    "Added {P}, cut him a week later. He didn't even get to unpack.",
    "Catch and release. {P} was treated like a fish.",
    "{P}'s stay with {T}: shorter than a Netflix free trial.",
  ],
  workhorse: [
    "{T} has started him {g} straight weeks. Lineup cornerstone off the wire.",
    "{P} became a weekly starter for {T}. That's how it's supposed to work.",
  ],
};

const PLAIN = [
  "{T} took a flier on {P}.", "{P} is {T}'s problem now.", "{T} clicked 'add' on {P}.", "In: {P}. Destination: {T}.",
  "{T} welcomes {P} to the roster.", "{P} gets a new fantasy home with {T}.", "{T} rolled the dice on {P}.",
];

const D = {
  regret: [
    "And they cut {D}, who's scored {X} since{O}. 🤡",
    "Meanwhile, {D} has {X} since getting cut{O}. Oops.",
    "Cost of this move: {D}, who's put up {X} since{O}.",
  ],
  dropRegret: [
    "{T} cut {D} for nothing. {D} has scored {X} since{O}. 🤡",
    "{T} dropped {D} into the void and he's put up {X} since{O}. Tremendous.",
    "{D} got cut by {T} and responded with {X} points{O}. Revenge is a dish best served in PPR.",
  ],
  tenure: [
    "{T} cut {D} after {n} weeks together. Didn't even send a goodbye text.",
    "{n} weeks on the roster and {D} gets released without a word. Cold.",
  ],
  injuredDrop: [
    "Cut {D}, who's {inj}. Cold, but fair.",
    "{D} is {inj}, so {T} moved on. Business is business.",
  ],
  quiet: [
    "{D} hasn't done much since, so no regrets.",
    "{D} has been invisible since getting cut. Correct call.",
    "{T} dropped {D} and nobody noticed. Including {D}.",
  ],
  plain: [
    "{T} released {D} back into the wild.",
    "{D} is a free agent now, thanks to {T}.",
    "{T} cut {D}. That's it. That's the move.",
  ],
};

const ord = (n) => n + (["th", "st", "nd", "rd"][((n % 100) - 20) % 10] || ["th", "st", "nd", "rd"][n % 100] || "th");

/**
 * @param ctx { rated, moves, team(rid), players, nextProj, allWeeks, lastDone }
 * @returns quip(x) -> html
 */
export function waiverTalk({ rated, moves, team, players, nextProj, allWeeks, lastDone }) {
  const used = new Set();
  const typeUse = new Map();
  const pick = (arr, key) => {
    const start = Math.floor(seeded(key)() * arr.length);
    for (let i = 0; i < arr.length; i++) {
      const line = arr[(start + i) % arr.length];
      if (!used.has(line)) { used.add(line); return line; }
    }
    return null; // pool exhausted: caller tries another angle instead of repeating
  };
  const fillP = (arr, key, vars) => { const l = pick(arr, key); return l == null ? null : fill(l, vars); };
  const name = (rid) => `<b>${esc(team(rid).team)}</b>`;
  const pn = (pid) => `<b>${esc(players[pid]?.name || pid)}</b>`;
  const addsOf = new Map(); // pid -> moves (oldest first) that added him
  const ordered = [...moves].sort((a, b) => a.created - b.created);
  for (const m of ordered) for (const pid of Object.keys(m.adds || {})) (addsOf.get(pid) || addsOf.set(pid, []).get(pid)).push(m);
  const bids = rated.map((x) => x.bid || 0);
  const maxBid = Math.max(0, ...bids);
  const weeksOn = (pid, rid, before) => {
    let n = 0;
    for (let w = 1; w < before; w++) if ((allWeeks[w] || []).find((r) => r.roster_id === rid)?.players?.includes(pid)) n++;
    return n;
  };

  // Pick the most interesting fact, nudging away from fact types already used a lot on this page.
  const choose = (facts, key) => {
    const rnd = seeded(key);
    const scored = facts.filter(Boolean).map((f) => ({ ...f, s: f.w - 1.5 * (typeUse.get(f.type) || 0) + rnd() }));
    scored.sort((a, b) => b.s - a.s);
    for (const f of scored) {
      const text = f.t();
      if (text) { typeUse.set(f.type, (typeUse.get(f.type) || 0) + 1); return { ...f, text }; }
    }
    return null;
  };

  return (x) => {
    const key = `ww2-${x.m.transaction_id}`;
    const T = name(x.rid);
    const regret = x.drops.find((d) => d.regret);
    const O = (d) => (d?.now && d.now !== x.rid ? ` for ${esc(team(d.now).team)}` : "");

    if (!x.best) {
      const d = x.drops[0];
      if (!d) return "";
      const Dn = pn(d.pid);
      const inj = players[d.pid]?.injury;
      const n = weeksOn(d.pid, x.rid, x.leg);
      const f = choose([
        regret && { type: "regret", w: 9, t: () => fillP(D.dropRegret, key, { T, D: Dn, X: `<b>${f1(regret.since)}</b>`, O: O(regret) }) },
        inj && { type: "injDrop", w: 5, t: () => fillP(D.injuredDrop, key, { T, D: Dn, inj: esc(inj) }) },
        n >= 4 && { type: "tenure", w: 4, t: () => fillP(D.tenure, key, { T, D: Dn, n }) },
        d.games >= 2 && { type: "quiet", w: 3, t: () => fillP(D.quiet, key, { T, D: Dn }) },
        { type: "plainDrop", w: 1, t: () => fillP(D.plain, key, { T, D: Dn }) },
      ], key);
      return f?.text || fillP(D.plain, key + "x", { T, D: Dn }) || `${T} cut ${Dn}.`;
    }

    const a = x.best;
    const p = players[a.pid] || {};
    const P = pn(a.pid);
    const adds = addsOf.get(a.pid) || [];
    const nth = adds.findIndex((m) => m.transaction_id === x.m.transaction_id) + 1;
    const prior = [...ordered].reverse().find((m) => m.created < x.m.created && m.drops?.[a.pid] != null && m.drops[a.pid] !== x.rid);
    const opp = nextProj?.[a.pid]?.opponent;
    const good = a.tier === "a" || a.tier === "b";
    const early = !a.weeksHeld && a.tier !== "tbd";
    const B = x.bid ? `<b>$${x.bid}</b>` : "";
    const drop = x.drops[0];
    const isCurrent = x.leg > lastDone;

    const persona = personaFor(team(x.rid).owner);
    const fact = choose([
      persona?.waiver?.length && { type: "persona", w: 5, t: () => fillP(persona.waiver, key, { N: `<b>${esc(persona.nick)}</b>`, P }) },
      a.cutFast && { type: "cutFast", w: 8, t: () => fillP(F.cutFast, key, { P, T }) },
      nth >= 3 && { type: "rental", w: 6 + nth, t: () => fillP(F.rental, key, { P, n: nth, nth: ord(nth) }) },
      prior && { type: "recycled", w: 6, t: () => fillP(good ? F.recycledGood : F.recycledBad, key, { P, T, X: name(prior.roster_ids[0]), w: prior.leg }) },
      a.bench >= 15 && a.bench > a.started && { type: "bench", w: 8, t: () => fillP(F.benchWaste, key, { P, T, bench: `<b>${f1(a.bench)}</b>`, pts: f1(a.pts) }) },
      a.bestPts >= 20 && { type: "boom", w: 6, t: () => fillP(F.boom, key, { P, b: `<b>${f1(a.bestPts)}</b>`, w: a.bestW }) },
      drop && a.games && drop.games && drop.since > a.pts + 5 && { type: "swapLoss", w: 8, t: () => fillP(F.swapLoss, key, { P, D: pn(drop.pid), x: `<b>${f1(drop.since)}</b>`, y: `<b>${f1(a.pts)}</b>` }) },
      drop && a.games && drop.games && a.pts > drop.since + 10 && { type: "swapWin", w: 6, t: () => fillP(F.swapWin, key, { P, D: pn(drop.pid), x: `<b>${f1(drop.since)}</b>`, y: `<b>${f1(a.pts)}</b>` }) },
      p.injury && a.kept && { type: "injured", w: 7, t: () => fillP(F.injured, key, { P, T, inj: esc(p.injury), part: p.injuryPart ? ` (${esc(p.injuryPart)})` : "" }) },
      x.bid && x.bid === maxBid && x.bid >= 10 && { type: "topBid", w: 9, t: () => fillP(F.topBid, key, { B, T }) },
      x.bid >= 15 && { type: "bigBid", w: 4, t: () => fillP(F.bigBid, key, { B, T, P }) },
      x.type === "waiver" && x.bid === 0 && { type: "free", w: 2, t: () => pick(F.freeClaim, key) },
      p.pos === "DEF" && opp && isCurrent && { type: "def", w: 5, t: () => fillP(F.defStream, key, { P: esc(p.team || p.name || ""), opp: esc(opp) }) },
      p.pos === "K" && { type: "kicker", w: 3, t: () => pick(F.kicker, key) },
      opp && isCurrent && p.pos !== "DEF" && { type: "opp", w: 3, t: () => fillP(F.opp, key, { P, opp: esc(opp) }) },
      p.yearsExp === 0 && { type: "rookie", w: 3, t: () => fillP(F.rookie, key, { P, T }) },
      p.age >= 31 && { type: "old", w: 3, t: () => fillP(F.old, key, { P, age: p.age }) },
      a.games >= 3 && a.started >= a.pts * 0.95 && a.kept && { type: "workhorse", w: 4, t: () => fillP(F.workhorse, key, { P, T, g: a.games }) },
    ], key);

    const verdictPool = a.cutFast ? null : early ? (good ? V.earlyGood : V.earlyBad) : V[a.tier];
    let out = fact?.text || fillP(PLAIN, key, { T, P }) || `${T} added ${P}.`;
    const verdict = verdictPool && fillP(verdictPool, key + "v", { T, P });
    if (verdict) out += " " + verdict;
    const rl = regret && fact?.type !== "swapLoss" && fillP(D.regret, key + "r", { D: pn(regret.pid), X: `<b>${f1(regret.since)}</b>`, O: O(regret) });
    if (rl) out += " " + rl;
    return out;
  };
}
