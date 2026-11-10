import { sleeper, avatarUrl } from "./sleeper.js?v=20261110131211";
import { buildTeams, computeAdvanced, sortStandings } from "./stats.js?v=20261110131211";
import { scoreStats, NON_STARTING } from "./scoring.js?v=20261110131211";
import { playerNews } from "./news.js?v=20261110131211";
import { buildNewsletter } from "./newsletter.js?v=20261110131211";
import { isChugLeague, listChugs, uploadChug, videoUrl } from "./chugs.js?v=20261110131211";
import { personaFor } from "./personas.js?v=20261110131211";
import { loadTrades, gradeTrades, replacementLevels } from "./trades.js?v=20261110131211";
import { preseasonFor } from "./preseason.js?v=20261110131211";
import { seeded } from "./util.js?v=20261110131211";
import { esc, f1, f2, pct, rec, signed, stripTags, pairs, leagueDisplay } from "./util.js?v=20261110131211";

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
const pageDefaults = window.RD_DEFAULTS || {}; // set by generated short-link pages (e.g. /spuds/)
const linkLeague = params.get("league");
const linkLeagueName = params.get("ln") || (linkLeague ? null : pageDefaults.ln);
if (linkLeagueName) store.set("leagueName", linkLeagueName), store.set("league", "");
let linkWeek = Number(params.get("week")) || null;

let ctx = null;
let tab = params.get("tab") || pageDefaults.tab || store.get("tab", "newsletter");
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
  ui.main.addEventListener("change", (e) => {
    const input = e.target.closest("input.chug-file");
    if (input?.files?.[0]) startChugUpload(input);
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
  // Keep the path in sync with the league so shared links get the right preview card:
  // Studs and Spuds → /spuds/ (potato card), everything else → the main page.
  const root = new URL(document.baseURI).pathname.replace(/[^/]*$/, ""); // site root, even on /spuds/ pages
  const path = /spud/i.test(ctx.league.name) ? `${root}spuds/` : root;
  history.replaceState(null, "", `${path}?${q}`);
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
    const disp = leagueDisplay(league.name);
    $("#app-title").textContent = `${disp.emoji} ${disp.name}`;
    document.title = `${disp.name} Gazette`;
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
  const chugTab = document.querySelector('.tab[data-tab="chugs"]');
  const chugOk = isChugLeague(ctx?.league);
  chugTab.hidden = !chugOk;
  if (tab === "chugs" && ctx?.league && !chugOk) tab = "newsletter";
  if (tab === "preseason") tab = "power"; // merged into Power rankings
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
  const views = { newsletter, standings, power, matchups, scores, chugs: chugsView, trades: tradesView };
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
    <h2>${esc(leagueDisplay(league.name).name)}</h2>
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

// ---------- power (+ preseason comparison when a league has one) ----------
function power() {
  const rows = [...ctx.teams].sort((a, b) => b.power - a.power);
  const standRank = new Map(sortStandings(ctx.teams).map((t, i) => [t.rosterId, i + 1]));
  const max = Math.max(...rows.map((r) => r.power));
  const z = preseasonData();
  const by = z ? esc(z.pre.by) : "";
  ui.main.innerHTML = header() + (z ? z.banner : "") + `
  <div class="card scroll"><table>
    <thead><tr><th>#</th><th class="l">Team</th><th class="l bar-col">Power score</th><th>vs standings</th><th>All-play</th><th>PPG</th><th>Last 3</th>
      ${z ? `<th class="zev-col">${by} had them</th><th class="zev-col">vs ${by}</th>` : ""}</tr></thead>
    <tbody>${rows.map((t, i) => {
      const diff = standRank.get(t.rosterId) - (i + 1);
      const zr = z?.byRoster.get(t.rosterId);
      return `<tr>
        <td class="rank">${i + 1}</td><td class="l">${teamCell(t)}</td>
        <td class="l bar-col"><div class="bar"><span style="width:${(t.power / max) * 100}%"></span><em>${f1(t.power)}</em></div></td>
        <td class="${diff > 0 ? "pos" : diff < 0 ? "neg" : "dim"}">${diff ? (diff > 0 ? "▲" : "▼") + Math.abs(diff) : "—"}</td>
        <td>${pct(t.apPct)}</td><td>${f1(t.ppg)}</td><td>${pct(t.form)}</td>
        ${z ? (zr ? `<td class="zev-col"><span class="zev-pick">#${zr.pre}</span></td>
          <td class="zev-col ${zr.delta > 0 ? "pos" : zr.delta < 0 ? "neg" : "dim"}">${zr.delta ? (zr.delta > 0 ? "▲" : "▼") + Math.abs(zr.delta) : "✓ nailed"}</td>`
          : `<td class="zev-col dim">–</td><td class="zev-col"></td>`) : ""}
      </tr>`;
    }).join("")}</tbody></table></div>
  <p class="note">Power = 50% all-play win % + 30% points per game (scaled within the league) + 20% weekly finish over the last 3 weeks. "vs standings" ▲ = ranked higher by power than by record.${z ? ` "vs ${by}" ▲ = doing better than ${by} predicted.` : ""}</p>
  ${z ? z.chart : ""}`;
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

// ---------- 🍻 chugs ----------
async function chugsView() {
  loading("Icing the beers…");
  let videos = {};
  try { videos = await listChugs(ctx.league.league_id, ctx.league.season); }
  catch (e) { setStatus(e.message, true); }
  if (tab !== "chugs") return;

  const regEnd = (ctx.league.settings.playoff_week_start || 15) - 1;
  const byRoster = new Map(ctx.teams.map((t) => [t.rosterId, t]));
  const lowest = (rows) => (rows || []).filter((r) => r.points != null).reduce((m, r) => (!m || r.points < m.points ? r : m), null);
  const shame = new Map();
  let done = 0, posted = 0;

  const cards = Array.from({ length: regEnd }, (_, i) => i + 1).map((w) => {
    const rows = ctx.allWeeks[w];
    const isDone = w <= ctx.lastDone && rows?.some((r) => r.points > 0);
    const isLive = !isDone && ctx.isCurrent && w === ctx.currentWeek;
    const vid = videos[w];
    if (isDone) done++;
    if (isDone && vid) posted++;

    if (!isDone) {
      const low = isLive && rows?.some((r) => r.points > 0) ? lowest(rows) : null;
      return `<div class="chug-card ${isLive ? "live" : "future"}">
        <div class="chug-head"><span class="chug-week">Week ${w}</span><span class="chip">${isLive ? "⏳ In progress" : "Upcoming"}</span></div>
        <p class="dim">${low ? `Currently on the hook: <b>${esc(byRoster.get(low.roster_id)?.team || "")}</b> (${f1(low.points)})` : isLive ? "Someone's getting thirsty…" : "Somebody's future is foamy."}</p>
      </div>`;
    }

    const loser = lowest(rows);
    const t = byRoster.get(loser.roster_id) || { team: "?", owner: "", avatar: null };
    shame.set(loser.roster_id, (shame.get(loser.roster_id) || 0) + 1);
    const img = avatarUrl(t.avatar);
    const fileInput = (label, cls) => `<label class="${cls}">${label}<input class="chug-file" type="file" accept="video/*" hidden
      data-week="${w}" data-roster="${loser.roster_id}" data-chugger="${esc(t.team)}"></label>`;
    return `<div class="chug-card ${vid ? "has-video" : "owed"}" data-week="${w}">
      <div class="chug-head"><span class="chug-week">Week ${w}</span>${vid ? `<span class="chip ok">✅ Chugged</span>` : `<span class="chip owe">🍺 Owes a chug</span>`}</div>
      <div class="chug-who">${img ? `<img class="av" src="${img}" alt="">` : `<span class="av ph"></span>`}
        <div><b>${esc(t.team)}</b><div class="dim">${esc(t.owner)} · last place with ${f2(loser.points)}</div></div></div>
      ${vid
        ? `<video class="chug-video" controls playsinline preload="metadata" src="${videoUrl(vid.video_path)}#t=0.1"></video>
           <div class="chug-foot dim">Posted ${new Date(vid.uploaded_at).toLocaleDateString([], { month: "short", day: "numeric" })} · ${fileInput("Replace video", "link")}</div>`
        : `${fileInput("🎥 Upload chug video", "upload-btn")}<p class="dim chug-wait">${chugTaunt(t, w)}</p>`}
      <div class="progress" hidden><span></span></div>
      <p class="chug-err" hidden></p>
    </div>`;
  }).join("");

  const repeat = [...shame.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]);
  ui.main.innerHTML = header() + `
    <div class="chug-hero">
      <div class="chug-hero-title">🍻 Chugs</div>
      <p>Lowest score of the week chugs a beer. On camera. No exceptions.</p>
      <div class="chug-stats">
        <div><b>${posted}/${done}</b><span>chugs posted</span></div>
        <div><b>${done - posted}</b><span>still owed</span></div>
        ${repeat.length ? `<div class="repeat"><span>Repeat offenders</span>${repeat.map(([rid, n]) => `<div>${"🍺".repeat(n)} ${esc(byRoster.get(Number(rid))?.team || "")}</div>`).join("")}</div>` : ""}
      </div>
    </div>
    <div class="chug-grid">${cards}</div>
    <p class="note">Anyone with the link can upload. Videos max 50MB: set your iPhone to <b>Settings → Camera → Record Video → 1080p at 30 fps</b> (4K is too big). Uploading again replaces that week's video.</p>`;
}

async function startChugUpload(input) {
  const card = input.closest(".chug-card");
  const bar = card.querySelector(".progress"), fill = bar.querySelector("span"), err = card.querySelector(".chug-err");
  const file = input.files[0];
  err.hidden = true; bar.hidden = false; fill.style.width = "2%";
  card.classList.add("uploading");
  try {
    await uploadChug({
      leagueId: ctx.league.league_id, season: ctx.league.season, week: Number(input.dataset.week),
      rosterId: Number(input.dataset.roster), chugger: input.dataset.chugger, file,
      onProgress: (p) => (fill.style.width = `${Math.max(2, p * 100).toFixed(0)}%`),
    });
    setStatus(`🍻 Week ${input.dataset.week} chug posted.`);
    if (tab === "chugs") chugsView();
  } catch (e) {
    bar.hidden = true; card.classList.remove("uploading");
    err.textContent = e.message; err.hidden = false;
  } finally {
    input.value = "";
  }
}

function chugTaunt(t, week) {
  const p = personaFor(t.owner);
  if (!p?.chug?.length) return "🐔 No video yet. The league is waiting.";
  const line = p.chug[Math.floor(seeded(`chug-${week}-${t.owner}`)() * p.chug.length)];
  return "🍺 " + esc(line).replace(/\{N\}/g, `<b>${esc(p.nick)}</b>`);
}

// ---------- 🔮 preseason rankings vs reality (rendered inside Power rankings) ----------
function preseasonData() {
  const pre = preseasonFor(ctx.league);
  if (!pre) return null;
  const byOwner = new Map(ctx.teams.map((t) => [t.owner.toLowerCase(), t]));
  const powerOrder = [...ctx.teams].sort((a, b) => b.power - a.power);
  const rows = pre.ranks.map((r, i) => {
    const t = byOwner.get(r.owner.toLowerCase());
    if (!t) return null;
    const now = powerOrder.indexOf(t) + 1;
    return { ...r, t, pre: i + 1, now, delta: i + 1 - now };
  }).filter(Boolean);
  const n = rows.length;
  if (!n) return null;
  const by = esc(pre.by);

  const avgMiss = rows.reduce((s, r) => s + Math.abs(r.delta), 0) / n;
  const rho = 1 - (6 * rows.reduce((s, r) => s + r.delta ** 2, 0)) / (n * (n * n - 1));
  const [grade, gradeLine] =
    avgMiss <= 1.5 ? ["A", `${by} might actually know ball. Disgusting.`] :
    avgMiss <= 2.5 ? ["B", `Respectable. Don't tell ${by}, he'll be insufferable.`] :
    avgMiss <= 3.5 ? ["C", "Coin-flip accuracy, delivered with total confidence."] :
    avgMiss <= 4.5 ? ["D", `${by} should keep his day job.`] :
                     ["F", "A blindfolded raccoon would've done better."];
  const best = [...rows].sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.pre - b.pre)[0];
  const over = [...rows].sort((a, b) => a.delta - b.delta)[0];
  const slept = [...rows].sort((a, b) => b.delta - a.delta)[0];
  const self = rows.find((r) => r.owner.toLowerCase() === pre.byOwner.toLowerCase());
  const selfLine = !self ? "" :
    self.now <= self.pre ? `Ranked himself #${self.pre} and he's #${self.now}. Annoyingly correct.` :
    self.now <= 4 ? `Ranked himself #${self.pre}, sitting #${self.now}. Close, but the humility was free.` :
    self.now <= Math.ceil(n / 2) ? `Ranked himself #${self.pre}. Reality says #${self.now}. Confidence is free.` :
    `Ranked himself #${self.pre}. He's #${self.now}. Delusion is a hell of a drug.`;

  const callout = (icon, title, color, r, text) => `<div class="award" style="--c: var(--${color})">
    <div class="award-title"><span class="icon-tile">${icon}</span>${title}</div>
    <div class="award-stat"><b>${esc(r.name)}</b><span>#${r.pre} → #${r.now}</span></div>
    <p class="quip">${text}</p></div>`;

  const banner = `
    <div class="pre-hero">
      <div><div class="pre-title">🔮 Power Rankings vs ${by}'s Preseason Picks</div>
        <p>${by} ranked everyone before the ${pre.season} season. Here's how that's aging through week ${ctx.lastDone}. <i>${gradeLine}</i></p></div>
      <div class="grade"><b>${grade}</b><span>avg miss ${avgMiss.toFixed(1)} spots</span></div>
    </div>
    <div class="awards pre-callouts">
      ${self ? callout("🪞", `${by} on ${by}`, "pink", self, selfLine) : ""}
      ${callout("🎯", "Best call", "green", best, best.delta === 0 ? "Nailed it exactly. Even a broken clock…" : `Only ${Math.abs(best.delta)} spot${Math.abs(best.delta) > 1 ? "s" : ""} off.`)}
      ${over.delta < 0 ? callout("🤡", "Most overrated", "red", over, `${Math.abs(over.delta)} spots worse than advertised.`) : ""}
      ${slept.delta > 0 ? callout("😴", "Slept on", "indigo", slept, `${slept.delta} spots better than ${by} thought.`) : ""}
    </div>`;

  // Slope chart: preseason rank (left) → current power rank (right).
  const rowH = 34, top = 34, W = 420, xl = 128, xr = 292, H = top + n * rowH;
  const y = (rank) => top + (rank - 0.5) * rowH;
  const lines = rows.map((r) => {
    const cls = r.delta > 0 ? "up" : r.delta < 0 ? "down" : "flat";
    return `<g class="slope ${cls} ${r === self ? "self" : ""}">
      <line x1="${xl + 8}" y1="${y(r.pre)}" x2="${xr - 8}" y2="${y(r.now)}"/>
      <circle cx="${xl + 8}" cy="${y(r.pre)}" r="4"/><circle cx="${xr - 8}" cy="${y(r.now)}" r="4"/>
      <text x="${xl - 4}" y="${y(r.pre) + 5}" text-anchor="end"><tspan class="rk">${r.pre}</tspan>  ${esc(r.name)}</text>
      <text x="${xr + 4}" y="${y(r.now) + 5}">${esc(r.name)}  <tspan class="rk">${r.now}</tspan></text>
    </g>`;
  }).join("");
  const chart = `
    <h3 class="section-h">${by}'s picks vs reality</h3>
    <div class="card slope-card"><svg class="slope-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${by}'s preseason ranks compared with current power ranks">
      <text class="col-title" x="${xl - 4}" y="16" text-anchor="end">${by.toUpperCase()}'S PRESEASON</text>
      <text class="col-title" x="${xr + 4}" y="16">POWER RANK NOW</text>
      ${lines}</svg></div>
    <p class="note">Green = beating ${by}'s prediction, red = falling short, bold pink = ${by} himself. Spearman correlation: ${rho.toFixed(2)} (1 = perfect, 0 = random${rho < 0 ? `, negative = ${by} would have done better ranking it upside down` : ""}).</p>`;

  return { pre, banner, chart, byRoster: new Map(rows.map((r) => [r.t.rosterId, r])) };
}

// ---------- 🤝 trades ----------
async function tradesView() {
  loading("Reviewing the paperwork…");
  const season = ctx.league.season;
  const regEnd = (ctx.league.settings.playoff_week_start || 15) - 1;
  const futureWeeks = [];
  for (let w = ctx.lastDone + 1; w <= regEnd; w++) futureWeeks.push(w);
  const [players, trades, ...projs] = await Promise.all([
    sleeper.players().catch(() => ({})),
    loadTrades(ctx.league.league_id, ctx.maxWeek),
    ...futureWeeks.map((w) => sleeper.projections(season, w)),
  ]);
  if (tab !== "trades") return;

  // Rest-of-season projection per traded player (league scoring), plus weekly replacement level by position.
  const sc = ctx.league.scoring_settings || {};
  const posOf = (pid) => players[pid]?.pos || (isNaN(pid) ? "DEF" : "");
  const tradedIds = new Set(trades.flatMap((t) => Object.keys(t.adds || {})));
  const ros = new Map();
  for (const pid of tradedIds) {
    let pts = 0, games = 0;
    for (const p of projs) {
      const v = p[pid] ? scoreStats(p[pid].stats, sc) : 0;
      if (v > 0) { pts += v; games++; }
    }
    ros.set(pid, { pts, games });
  }
  const replWeek = projs[0] || (await sleeper.projections(season, Math.max(1, ctx.lastDone)));
  if (tab !== "trades") return;
  const repl = replacementLevels(
    Object.entries(replWeek).map(([pid, p]) => [pid, scoreStats(p.stats, sc)]),
    posOf, ctx.league.roster_positions, ctx.teams.length);
  const graded = gradeTrades(trades, ctx.allWeeks, ctx.lastDone, {
    currentRosters: new Map(ctx.teams.map((t) => [t.rosterId, new Set(t.players)])), ros, repl, posOf,
  });

  const byRoster = new Map(ctx.teams.map((t) => [t.rosterId, t]));
  const team = (rid) => byRoster.get(rid) || { team: `Team ${rid}`, owner: "", avatar: null };
  const av = (rid) => { const u = avatarUrl(team(rid).avatar); return u ? `<img class="av" src="${u}" alt="">` : `<span class="av ph"></span>`; };
  const pl = (pid) => players[pid] || { name: pid, pos: "", team: "" };
  const seasonStart = season === ctx.state.league_season ? Date.parse(ctx.state.season_start_date || "") || 0 : 0;
  const weeksLeft = futureWeeks.length;

  if (!graded.length) {
    ui.main.innerHTML = header() + `<div class="trade-hero"><div class="trade-title">🤝 Trade Tracker</div><p>No trades yet this season. Cowards, all of you.</p></div>`;
    return;
  }

  // Season summary (by value: points so far + projected rest of season)
  const net = new Map();
  for (const g of graded) for (const s of g.sides) {
    const cur = net.get(s.rid) || { n: 0, diff: 0 };
    cur.n++;
    if (!g.unscored) cur.diff += s.diff; // FAAB deals count as trades but not toward value
    net.set(s.rid, cur);
  }
  const netArr = [...net.entries()].map(([rid, v]) => ({ rid: Number(rid), ...v }));
  const shark = [...netArr].sort((a, b) => b.diff - a.diff)[0];
  const mark = [...netArr].sort((a, b) => a.diff - b.diff)[0];
  const addict = [...netArr].sort((a, b) => b.n - a.n)[0];
  const heist = [...graded].filter((g) => g.sides.length >= 2 && !g.unscored).sort((a, b) => b.margin - a.margin)[0];

  const verdict = (g) => {
    if (g.sides.length < 2) return "";
    if (g.unscored) {
      const ps = g.sides.find((s) => !s.onlyUnscored), fs = g.sides.find((s) => s.onlyUnscored);
      const what = fs.faabIn ? `$${fs.faabIn} of FAAB` : "draft capital";
      return `Player-for-${fs.faabIn ? "FAAB" : "picks"} deal: <b>${esc(team(ps.rid).team)}</b> has gotten ${f1(ps.recvPts)} pts so far (${f1(ps.recvRos)} more projected) for ${what}. Worth it? You decide.`;
    }
    const W = `<b>${esc(team(g.winner.rid).team)}</b>`, L = `<b>${esc(team(g.loser.rid).team)}</b>`;
    const early = g.realized < 0.35;
    const lean = early ? " on paper" : "";
    const r = g.winner.r;
    if (r < 0.08 || g.margin < 6) return early ? "Too close to call. Ask again in a few weeks." : "Fair trade. Boring, but fair.";
    const p = personaFor(team(g.loser.rid).owner);
    if (p?.trade?.length && r >= 0.25 && !early) {
      const line = p.trade[Math.floor(seeded(`trade-${g.t.transaction_id}`)() * p.trade.length)];
      return esc(line).split("{N}").join(`<b>${esc(p.nick)}</b>`).split("{W}").join(W);
    }
    if (r >= 0.6 && !early) return `Daylight robbery. ${W} fleeced ${L}, +${f1(g.margin)} in value.`;
    if (r >= 0.3) return `${W} is winning this one${lean}, +${f1(g.margin)} in value.`;
    return `${W} has a slight edge${lean} (+${f1(g.margin)}). Plenty of football left.`;
  };

  const sideHtml = (g, s) => {
    const items = s.received.map((r) => {
      const p = pl(r.pid);
      const note = r.flipped ? `<span class="tnote">↪ flipped wk ${r.flipped}</span>` : r.gone ? `<span class="tnote">✂️ dropped</span>` : "";
      return `<li><span class="pname">${esc(p.name)} <span class="dim">${esc(p.pos)}${p.team ? " · " + esc(p.team) : ""}</span>${note}</span>
        <span class="tp"><b>${f1(r.pts)}</b><span class="ros">${r.ros ? `+${f1(r.ros)}` : ""}</span></span></li>`;
    });
    if (s.faabIn) items.push(`<li><span class="pname">💰 $${s.faabIn} FAAB</span><span class="tp dim">not scored</span></li>`);
    for (const pk of s.picksIn) items.push(`<li><span class="pname">🎟️ ${esc(pk.season)} round ${pk.round} pick</span><span class="tp dim">not scored</span></li>`);
    if (!items.length) items.push(`<li><span class="pname dim">Nothing. Literally nothing.</span><span class="tp"></span></li>`);
    const winning = !g.unscored && g.winner === s && g.margin >= 6 && s.r >= 0.08;
    return `<div class="trade-side ${winning ? "winning" : ""}">
      <div class="trade-who">${av(s.rid)}<div class="trade-name"><b>${esc(team(s.rid).team)}</b><div class="dim">${esc(team(s.rid).owner)}</div></div>
        <span class="grade-badge g-${s.tier}">${s.grade}</span></div>
      <div class="trade-got"><span>Got</span><span>so far <i>+ rest of season</i></span></div>
      <ul class="trade-list">${items.join("")}</ul>
      <div class="trade-total"><span>Points <span class="dim">${f1(s.recvPts)} so far · ${f1(s.recvRos)} proj</span></span>${g.unscored ? "" : `<span class="val" title="Points above a waiver-level player at the same position">value <b>${f1(s.value)}</b></span>`}</div>
    </div>`;
  };

  const cards = graded.map((g) => {
    const date = new Date(g.t.created).toLocaleDateString([], { month: "short", day: "numeric" });
    const when = seasonStart && g.t.created < seasonStart ? "Preseason" : `Week ${g.leg}`;
    const pctPlayed = Math.round(g.realized * 100);
    const v = verdict(g);
    return `<article class="trade-card">
      <div class="trade-head"><span class="chip">${when}</span><span class="dim">${date}</span>
        ${g.realized < 0.35 ? `<span class="chip proj-chip">🔮 Mostly projected</span>` : ""}
        <span class="played" title="Share of this trade's total value that's already been scored"><span class="played-bar"><span style="width:${pctPlayed}%"></span></span>${pctPlayed}% played out</span></div>
      <div class="trade-sides">${g.sides.map((s) => sideHtml(g, s)).join("")}</div>
      ${v ? `<p class="quip trade-verdict">${v}</p>` : ""}
    </article>`;
  }).join("");

  const stat = (label, rid, val) => `<div><span>${label}</span><b>${esc(team(rid).team)}</b><em>${val}</em></div>`;
  ui.main.innerHTML = header() + `
    <div class="trade-hero">
      <div class="trade-title">🤝 Trade Tracker</div>
      <p>${graded.length} trade${graded.length === 1 ? "" : "s"} this season. Grades blend what's already happened with what's projected for the last ${weeksLeft} week${weeksLeft === 1 ? "" : "s"} of the regular season, so early trades stay close to the middle until they play out.</p>
      <div class="trade-stats">
        ${shark && shark.diff > 0 ? stat("🦈 Trade shark", shark.rid, `+${f1(shark.diff)} value`) : ""}
        ${mark && mark.diff < 0 ? stat("🎣 Easiest mark", mark.rid, `${f1(mark.diff)} value`) : ""}
        ${heist && heist.margin > 0 ? stat("🏴‍☠️ Biggest heist", heist.winner.rid, `+${f1(heist.margin)} vs ${esc(team(heist.loser.rid).team)}`) : ""}
        ${addict && addict.n > 1 ? stat("📞 Trade addict", addict.rid, `${addict.n} trades`) : ""}
      </div>
    </div>
    <div class="trade-grid">${cards}</div>
    <p class="note"><b>How grades work:</b> an even trade is a B; A+ and F are only for lopsided deals. Each player's <b>value</b> is points above a waiver-level player at his position (so a QB's big raw totals don't automatically win), counting points already scored for the receiving team since the trade (bench included, byes not penalized) plus Sleeper's projection for weeks ${ctx.lastDone + 1}–${regEnd} in your league's scoring if he's still on the roster. "% played out" shows how much of a trade's value is real points vs projection. Player-for-FAAB deals get 💰 instead of a grade.</p>`;
}
