import { sleeper, avatarUrl } from "./sleeper.js";
import { buildTeams, computeAdvanced, sortStandings } from "./stats.js";
import { scoreStats, NON_STARTING } from "./scoring.js";
import { playerNews } from "./news.js";
import { buildNewsletter } from "./newsletter.js";
import { esc, f1, f2, pct, rec, signed, stripTags, pairs } from "./util.js";

const DEFAULT_USER = "PierceCrawley";
const DEFAULT_LEAGUE = "Rocket Dongs"; // what first-time visitors to the bare URL see
const $ = (s) => document.querySelector(s);
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
};

const ui = {
  form: $("#user-form"), username: $("#username"), season: $("#season"),
  league: $("#league"), status: $("#status"), main: $("#main"),
  tabs: document.querySelectorAll(".tab"), week: $("#week"),
};

// Shareable links: ?league=<id>&tab=newsletter&week=9 opens straight to that view.
const params = new URLSearchParams(location.search);
const linkLeague = params.get("league");
if (params.get("ln")) store.set("leagueName", params.get("ln")), store.set("league", "");
let linkWeek = Number(params.get("week")) || null;

let ctx = null;
let tab = params.get("tab") || store.get("tab", "newsletter");
const weekFor = {}; // remembers selected week per tab

init();

async function init() {
  ui.username.value = store.get("username", DEFAULT_USER);
  const state = await sleeper.state();
  const cur = Number(state.league_season);
  ui.season.innerHTML = Array.from({ length: 6 }, (_, i) => cur - i).map((y) => `<option>${y}</option>`).join("");
  ui.season.value = store.get("season", String(cur));

  ui.form.addEventListener("submit", (e) => { e.preventDefault(); loadUser(); });
  ui.season.addEventListener("change", () => { store.set("season", ui.season.value); loadUser(); });
  ui.league.addEventListener("change", () => { store.set("league", ui.league.value); loadLeague(ui.league.value); });
  ui.week.addEventListener("change", () => { weekFor[tab] = Number(ui.week.value); render(); });
  ui.tabs.forEach((b) => b.addEventListener("click", () => { tab = b.dataset.tab; store.set("tab", tab); render(); }));

  // Expand a player row to show news (event delegation).
  ui.main.addEventListener("click", (e) => {
    const li = e.target.closest("li.player[data-id]");
    if (li) toggleNews(li);
  });

  $("#share").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(location.href); setStatus("Link copied. Paste it in the group chat."); }
    catch { prompt("Copy this link:", location.href); }
  });

  if (linkLeague) {
    ctx = { me: null };
    ui.league.innerHTML = `<option value="${esc(linkLeague)}">Loading…</option>`;
    await loadLeague(linkLeague);
    ui.league.innerHTML = `<option value="${esc(linkLeague)}">${esc(ctx.league?.name || linkLeague)}</option>`;
    if (ctx.league) ui.season.value = ctx.league.season;
  } else {
    loadUser();
  }
}

function syncUrl() {
  if (!ctx?.league) return;
  const q = new URLSearchParams({ league: ctx.league.league_id, tab });
  if (!ui.week.hidden && ui.week.value) q.set("week", ui.week.value);
  history.replaceState(null, "", `${location.pathname}?${q}`);
}

function setStatus(msg, isError = false) {
  ui.status.textContent = msg || "";
  ui.status.classList.toggle("error", isError);
}

async function loadUser() {
  const name = ui.username.value.trim();
  if (!name) return;
  setStatus("Looking up user…");
  try {
    const me = await sleeper.user(name);
    if (!me) throw new Error(`No Sleeper user named "${name}"`);
    store.set("username", name);
    const leagues = await sleeper.leagues(me.user_id, ui.season.value);
    if (!leagues.length) {
      ui.league.innerHTML = "";
      ui.main.innerHTML = `<p class="empty">No leagues for ${ui.season.value}.</p>`;
      return setStatus("");
    }
    ui.league.innerHTML = leagues.map((l) => `<option value="${l.league_id}">${esc(l.name)}</option>`).join("");
    const savedName = store.get("leagueName", DEFAULT_LEAGUE);
    const pick = leagues.find((l) => l.league_id === store.get("league")) || leagues.find((l) => l.name === savedName) || leagues[0];
    ui.league.value = pick.league_id;
    ctx = { me };
    await loadLeague(pick.league_id);
  } catch (e) {
    setStatus(e.message, true);
  }
}

async function loadLeague(leagueId) {
  setStatus("Loading league…");
  try {
    const [league, users, rosters, state] = await Promise.all([
      sleeper.league(leagueId), sleeper.users(leagueId), sleeper.rosters(leagueId), sleeper.state(),
    ]);
    store.set("leagueName", league.name);
    const regEnd = (league.settings.playoff_week_start || 15) - 1;
    const isCurrent = league.season === state.league_season && league.status !== "complete";
    const currentWeek = isCurrent ? Math.max(1, Number(state.week)) : regEnd;
    const lastDone = isCurrent ? Math.min(currentWeek - 1, regEnd) : regEnd;
    const maxWeek = isCurrent ? Math.min(currentWeek, 18) : regEnd;

    const allWeeks = {};
    await Promise.all(Array.from({ length: maxWeek }, (_, i) => i + 1).map(async (w) => {
      allWeeks[w] = (await sleeper.matchups(leagueId, w)) || [];
    }));
    const doneWeeks = Object.fromEntries(
      Object.entries(allWeeks).filter(([w, rows]) => Number(w) <= lastDone && rows.some((r) => r.points > 0))
    );
    const baseTeams = buildTeams(rosters, users);
    const teams = computeAdvanced(baseTeams, doneWeeks);
    ctx = { ...ctx, league, users, baseTeams, teams, allWeeks, doneWeeks, state, currentWeek, lastDone, isCurrent, maxWeek };
    weekFor.matchups = isCurrent ? currentWeek : maxWeek;
    weekFor.newsletter = lastDone;
    if (linkWeek) { weekFor[tab] = linkWeek; linkWeek = null; }
    setStatus("");
    render();
    sleeper.players(); // warm the player DB in the background
  } catch (e) {
    setStatus(e.message, true);
  }
}

// ---------- render ----------
function render() {
  ui.tabs.forEach((b) => b.setAttribute("aria-selected", b.dataset.tab === tab));
  const weekTabs = { matchups: ctx?.maxWeek, newsletter: ctx?.lastDone };
  ui.week.hidden = !(tab in weekTabs);
  if (!ctx?.teams) return;
  if (tab in weekTabs) {
    const max = weekTabs[tab];
    ui.week.innerHTML = Array.from({ length: max }, (_, i) => i + 1).map((w) =>
      `<option value="${w}">Week ${w}${ctx.isCurrent && w === ctx.currentWeek ? " (live)" : ""}</option>`).join("");
    ui.week.value = String(Math.min(weekFor[tab] || max, max));
  }
  syncUrl();
  const views = { newsletter, standings, power, matchups, scores };
  (views[tab] || standings)();
}

const isMine = (t) => t.ownerId === ctx.me?.user_id;

function teamCell(t) {
  const img = avatarUrl(t.avatar);
  return `<div class="team ${isMine(t) ? "mine" : ""}">
    ${img ? `<img src="${img}" alt="" loading="lazy">` : `<span class="ph"></span>`}
    <div><div class="tname">${esc(t.team)}</div><div class="owner">${esc(t.owner)}${isMine(t) ? " · you" : ""}</div></div>
  </div>`;
}

function header() {
  const { league, lastDone, isCurrent } = ctx;
  const type = { 0: "Redraft", 1: "Keeper", 2: "Dynasty" }[league.settings.type] ?? "";
  return `<div class="league-head">
    <h2>${esc(league.name)}</h2>
    <p>${league.season} · ${league.total_rosters} teams · ${type} · ${isCurrent ? `through week ${lastDone}` : "final regular season"}</p>
  </div>`;
}

function loading(msg) { ui.main.innerHTML = header() + `<p class="note">${msg}</p>`; }
const stillOn = (t, w) => tab === t && Number(ui.week.value) === w;

// ---------- newsletter ----------
async function newsletter() {
  const W = Number(ui.week.value);
  if (!W) { ui.main.innerHTML = `<p class="empty">No completed weeks yet. Check back after week 1.</p>`; return; }
  loading("Stopping the presses…");
  const season = ctx.league.season;
  const [players, projThis, projNext] = await Promise.all([
    sleeper.players().catch(() => ({})),
    sleeper.projections(season, W),
    ctx.allWeeks[W + 1] ? sleeper.projections(season, W + 1) : Promise.resolve(null),
  ]);
  if (!stillOn("newsletter", W)) return;
  ui.main.innerHTML = buildNewsletter({
    league: ctx.league, teams: ctx.baseTeams, allWeeks: ctx.allWeeks, players, week: W, projThis, projNext, me: ctx.me,
  });
}

// ---------- standings ----------
function standings() {
  const rows = sortStandings(ctx.teams);
  const playoffTeams = ctx.league.settings.playoff_teams || 6;
  ui.main.innerHTML = header() + `
  <div class="card"><table>
    <thead><tr>
      <th>#</th><th class="l">Team</th><th>Record</th><th>PF</th><th>PA</th><th>PPG</th>
      <th title="Record if you played every team every week">All-play</th>
      <th title="Actual wins minus expected wins from all-play">Luck</th>
      <th>Streak</th>
    </tr></thead>
    <tbody>${rows.map((t, i) => `
      <tr class="${i === playoffTeams - 1 ? "cutline" : ""}">
        <td class="rank">${i + 1}</td><td class="l">${teamCell(t)}</td>
        <td><b>${rec(t.wins, t.losses, t.ties)}</b></td>
        <td>${f2(t.pf)}</td><td>${f2(t.pa)}</td><td>${f1(t.ppg)}</td>
        <td>${rec(t.apW, t.apL, t.apT)} <span class="dim">${pct(t.apPct)}</span></td>
        <td class="${t.luck > 0.5 ? "pos" : t.luck < -0.5 ? "neg" : ""}">${signed(t.luck)}</td>
        <td>${esc(t.streak)}</td>
      </tr>`).join("")}
    </tbody></table></div>
  <p class="note">Dashed line = playoff cut (${playoffTeams} teams). Luck = actual wins − expected wins, where expected wins come from your all-play win %.</p>`;
}

// ---------- power ----------
function power() {
  const rows = [...ctx.teams].sort((a, b) => b.power - a.power);
  const standRank = new Map(sortStandings(ctx.teams).map((t, i) => [t.rosterId, i + 1]));
  const max = Math.max(...rows.map((r) => r.power));
  ui.main.innerHTML = header() + `
  <div class="card"><table>
    <thead><tr><th>#</th><th class="l">Team</th><th class="l bar-col">Power score</th><th>vs standings</th><th>All-play</th><th>PPG</th><th>Last 3</th></tr></thead>
    <tbody>${rows.map((t, i) => {
      const diff = standRank.get(t.rosterId) - (i + 1);
      return `<tr>
        <td class="rank">${i + 1}</td><td class="l">${teamCell(t)}</td>
        <td class="l bar-col"><div class="bar"><span style="width:${(t.power / max) * 100}%"></span><em>${f1(t.power)}</em></div></td>
        <td class="${diff > 0 ? "pos" : diff < 0 ? "neg" : "dim"}">${diff ? (diff > 0 ? "▲" : "▼") + Math.abs(diff) : "—"}</td>
        <td>${pct(t.apPct)}</td><td>${f1(t.ppg)}</td><td>${pct(t.form)}</td>
      </tr>`;
    }).join("")}</tbody></table></div>
  <p class="note">Power = 50% all-play win % + 30% points per game (scaled within the league) + 20% weekly finish over the last 3 weeks. ▲ means ranked higher by power than by record.</p>`;
}

// ---------- matchups ----------
const INJ_SHORT = { Questionable: "Q", Doubtful: "D", Out: "O", IR: "IR", PUP: "PUP", Sus: "SUS", NA: "NA", COV: "COV" };

async function matchups() {
  const week = Number(ui.week.value);
  loading("Loading players and projections…");
  const [players, proj] = await Promise.all([
    sleeper.players().catch(() => ({})),
    sleeper.projections(ctx.league.season, week),
  ]);
  if (!stillOn("matchups", week)) return;

  const sc = ctx.league.scoring_settings || {};
  const byRoster = new Map(ctx.teams.map((t) => [t.rosterId, t]));
  const slots = ctx.league.roster_positions.filter((p) => !NON_STARTING.has(p));
  const rows = ctx.allWeeks[week] || [];
  const started = rows.some((r) => r.points > 0);
  const hasProj = Object.keys(proj).length > 0;

  const teamProj = (r) => (r.starters || []).reduce((s, id) => s + (proj[id] ? scoreStats(proj[id].stats, sc) : 0), 0);

  const playerRow = (r, id, i) => {
    const p = players[id] || { name: id === "0" ? "— empty —" : id, pos: "", team: "" };
    const pj = proj[id];
    const projPts = pj ? scoreStats(pj.stats, sc) : null;
    const actual = r.starters_points?.[i] ?? 0;
    const inj = pj?.injury || p.injury;
    const opp = pj?.opponent ? `${pj.opponent.startsWith("@") ? "" : "vs "}${pj.opponent}` : (id !== "0" && hasProj && p.pos !== "DEF" ? "BYE?" : "");
    const delta = started && projPts != null ? actual - projPts : null;
    return `<li class="player" ${id !== "0" ? `data-id="${esc(id)}"` : ""}>
      <span class="slot">${esc(slots[i] || "")}</span>
      <span class="pname">${esc(p.name)}${inj ? ` <span class="inj ${["Out", "IR", "Doubtful", "Sus"].includes(inj) ? "inj-bad" : ""}" title="${esc(inj)}${p.injuryPart ? " · " + esc(p.injuryPart) : ""}">${esc(INJ_SHORT[inj] || inj)}</span>` : ""}
        <span class="dim">${esc(p.pos)}${p.team ? " · " + esc(p.team) : ""}${opp ? " · " + esc(opp) : ""}</span></span>
      <span class="pp">${started ? `<b>${f1(actual)}</b>` : ""}<span class="proj ${delta == null ? "" : delta >= 0 ? "pos" : "neg"}">${projPts != null ? f1(projPts) : "–"}</span></span>
      <div class="news" hidden></div>
    </li>`;
  };

  const side = (r, won) => {
    const t = byRoster.get(r.roster_id);
    const pt = teamProj(r);
    return `<div class="side ${won ? "won" : ""} ${isMine(t) ? "mine-side" : ""}">${teamCell(t)}
      <div class="score">${started ? f2(r.points || 0) : f1(pt)}<span class="dim proj-total">${started ? `proj ${f1(pt)}` : "projected"}</span></div>
      <div class="col-head"><span></span><span></span><span>${started ? "pts · <i>proj</i>" : "<i>proj</i>"}</span></div>
      <ul>${(r.starters || []).map((id, i) => playerRow(r, id, i)).join("")}</ul></div>`;
  };

  const cards = pairs(rows).map(([a, b]) => {
    if (!b) return `<div class="card match">${side(a, false)}</div>`;
    const pa = teamProj(a), pb = teamProj(b);
    const margin = Math.abs((a.points || 0) - (b.points || 0));
    const fav = pa >= pb ? a : b;
    const mid = started
      ? `by ${f2(margin)}`
      : hasProj ? `${esc(byRoster.get(fav.roster_id).team.split(" ")[0])}<br>−${f1(Math.abs(pa - pb))}` : "vs";
    return `<div class="card match">
      ${side(a, started && a.points > b.points)}
      <div class="vs">${mid}</div>
      ${side(b, started && b.points > a.points)}
    </div>`;
  }).join("");

  ui.main.innerHTML = header() +
    `<p class="note">Projections use your league's scoring. Click any player for the latest news.${started ? " Green/red = beat/missed projection." : ""}</p>` +
    (cards || `<p class="empty">No matchups for week ${week}.</p>`);
}

async function toggleNews(li) {
  const box = li.querySelector(".news");
  if (!box.hidden) { box.hidden = true; return; }
  box.hidden = false;
  if (box.dataset.loaded) return;
  box.innerHTML = `<span class="dim">Loading news…</span>`;
  const id = li.dataset.id;
  const players = await sleeper.players().catch(() => ({}));
  const items = await playerNews(id, players[id]).catch(() => []);
  box.dataset.loaded = "1";
  box.innerHTML = items.length
    ? items.map((n) => `<div class="news-item"><div class="news-when">${n.when.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div><div class="news-head">${esc(stripTags(n.headline))}</div>${n.story ? `<div class="news-story">${esc(stripTags(n.story))}</div>` : ""}</div>`).join("")
    : `<span class="dim">No recent news.</span>`;
}

// ---------- weekly scores ----------
function scores() {
  const weeks = Object.keys(ctx.doneWeeks).map(Number).sort((a, b) => a - b);
  const n = ctx.teams.length;
  const rows = sortStandings(ctx.teams);
  const all = rows.flatMap((t) => weeks.map((w) => ({ t, w, s: t.scores[w] ?? 0 })));
  all.sort((a, b) => b.s - a.s);
  const best = all[0], worst = all[all.length - 1];

  ui.main.innerHTML = header() + `
  <div class="callouts">
    ${best ? `<div class="card callout"><span class="dim">Highest score</span><b>${f2(best.s)}</b><span>${esc(best.t.team)} · wk ${best.w}</span></div>` : ""}
    ${worst ? `<div class="card callout"><span class="dim">Lowest score</span><b>${f2(worst.s)}</b><span>${esc(worst.t.team)} · wk ${worst.w}</span></div>` : ""}
  </div>
  <div class="card scroll"><table class="grid">
    <thead><tr><th class="l">Team</th>${weeks.map((w) => `<th>${w}</th>`).join("")}<th>Avg rank</th></tr></thead>
    <tbody>${rows.map((t) => {
      const ranks = weeks.map((w) => t.weekRanks[w]).filter(Boolean);
      const avg = ranks.reduce((a, b) => a + b, 0) / (ranks.length || 1);
      return `<tr><td class="l">${teamCell(t)}</td>${weeks.map((w) => {
        const r = t.weekRanks[w];
        const heat = r ? 1 - (r - 1) / Math.max(n - 1, 1) : 0;
        return `<td class="heat" style="--h:${heat.toFixed(2)}" title="Week ${w}: rank ${r} of ${n}">${f1(t.scores[w] ?? 0)}</td>`;
      }).join("")}<td>${avg.toFixed(1)}</td></tr>`;
    }).join("")}</tbody></table></div>
  <p class="note">Cell shading shows each team's rank among all scores that week (darker = higher).</p>`;
}
