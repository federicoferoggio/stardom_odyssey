// ── STRATEGIC MAP ────────────────────────────────────────────────────────────
// Self-contained: all data comes from local JSON under all_info/, no Google
// Sheets fetch, no localStorage cache. Ported/adapted from map.js + adds the
// family "empire screen" overlay (stats, leaders/traits, opinions).

const CANVAS = 10000,
  CENTER = CANVAS / 2,
  DIST_SCALE = 250,
  MOON_GAP = 60,
  MOON_START = 60,
  PLANET_R = 28,
  MOON_R = 12,
  SUN_R = 55;
const ZOOM_MIN = 400;
const ZOOM_MAX = 20000;

// Icons are drawn at a fixed world-space size, so zooming way out would shrink
// them to illegibility. BASE_VB_WIDTH is the viewBox width at which icons show
// at their natural size; beyond that, refreshIconScale() grows them back up to
// MAX_ICON_SCALE so a system is still readable fully zoomed out.
const BASE_VB_WIDTH = 1600;
const MAX_ICON_SCALE = 6;

// A satellite's (moon, or a base anchored directly to a planet, e.g.
// Lalleanza on Void) icon is pinned to a constant on-screen size by the
// scaling above, but its orbital separation from its parent keeps shrinking
// in screen space as you zoom out -- so a multi-moon planet starts
// overlapping well before MAX_ICON_SCALE even saturates. Past this viewBox
// width, satellites collapse into just their parent planet (hidden, orbit
// rings hidden), which gets an extra size boost to read as "a system is
// collapsed here, zoom in to see it."
const MOON_COLLAPSE_VB_WIDTH = 4000;
const COLLAPSED_PLANET_BOOST = 1.35;

const resConfig = [
  { key: "shards", label: "Shards", color: "#88ccff", icon: "💎" },
  { key: "gems", label: "Gems", color: "#aaffaa", icon: "🟢" },
  { key: "opals", label: "Opals", color: "#ffddaa", icon: "🔶" },
  { key: "resources", label: "Resources", color: "#ffaacc", icon: "⚙️" },
];

// Flavor-text phrase bank, keyed by stat name then tier (0-2). Self-contained
// copy of the bank shared by parser.js, so this page has no dependency on it.
const qualities = {
  Might: [
    [
      "le loro truppe sono contadini con spade",
      "il loro esercito è più simbolico che reale",
    ],
    [
      "le loro forze sono ben addestrate e pronte alla battaglia",
      "i loro soldati non temono lo scontro",
    ],
    [
      "le loro forze sono terrificanti da affrontare in battaglia",
      "il loro esercito semina il terrore ovunque",
    ],
  ],
  Treasure: [
    [
      "hanno solo risparmi di poco valore",
      "le loro casse contengono appena il necessario",
    ],
    ["trattano in monete d'oro", "la loro ricchezza è notevole"],
    ["commerciano in lingotti d'oro", "il loro tesoro è inestimabile"],
  ],
  Influence: [
    [
      "a pochi interessa della loro esistenza",
      "sono ignorati da tutti nel sistema",
    ],
    ["sono rispettati nel sistema", "godono di una discreta considerazione"],
    [
      "sono leggendari e riveriti in ogni angolo del sistema",
      "la loro parola è legge",
    ],
  ],
  Territory: [
    [
      "controllano una regione dimenticata",
      "i loro territori sono insignificanti",
    ],
    [
      "governano un pianeta vasto e sviluppato, e numerose colonie",
      "le loro terre si espandono su più sistemi",
    ],
    [
      "dominano pianeti, asteroidi, colonie e persino di più",
      "il loro dominio si estende oltre l'immaginabile",
    ],
  ],
  Sovereignty: [
    [
      "i loro sudditi li tollerano appena",
      "sono mal sopportati dalla popolazione",
    ],
    ["i loro sudditi li sostengono", "hanno il supporto della popolazione"],
    ["i loro sudditi li venerano", "il loro regno è visto come sacro"],
  ],
};

function generateFamilyDescription(stats) {
  const relevant = Object.entries(stats).filter(([k]) => qualities[k]);
  if (!relevant.length) return "";
  const average = relevant.reduce((sum, [, v]) => sum + v, 0) / relevant.length;
  const getTier = (value) => (value <= 2 ? 0 : value <= 4 ? 1 : 2);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sentences = relevant.map(([key, value]) => ({
    key,
    value,
    phrase: pick(qualities[key][getTier(value)]),
  }));
  const paired = [];
  for (let i = 0; i < sentences.length - 1; i += 2) {
    const a = sentences[i],
      b = sentences[i + 1];
    const conj =
      Math.abs(a.value - average) > 1 &&
      Math.abs(b.value - average) > 1 &&
      ((a.value > average && b.value < average) ||
        (a.value < average && b.value > average))
        ? "ma"
        : "e";
    paired.push(`${a.phrase} ${conj} ${b.phrase}`);
  }
  if (sentences.length % 2 !== 0)
    paired.push(sentences[sentences.length - 1].phrase);
  const text = paired.join(". ") + ".";
  return text.replace(/(^\w|\.\s*\w)/g, (c) => c.toUpperCase());
}

let byId = {},
  tick = 0,
  ready = false;
let ownerColors = {};
let iconScaleGroups = {};
let satellitesByParent = {}; // parentId -> [satelliteId, ...], see MOON_COLLAPSE_VB_WIDTH above
let fleetIconGroups = {}; // bodyId -> <g>, this body's OWN fleet markers (anonymous+named combined, deduped by family), rebuilt each tick in updateScene() -- declared here (not down by buildScene) because refreshIconScale() reads it immediately at load time via applyVB()
let fleetIconGroupsCollapsed = {}; // parentId -> <g>, only for bodies with satellites: the MERGED (parent + all its satellites) marker row shown when zoomed out past MOON_COLLAPSE_VB_WIDTH, toggled by refreshIconScale()
let fleetTokenScaleEls = []; // <g class="fleet-icon-scale"> elements, rebuilt every updateScene(), rescaled by refreshIconScale()
let fleetCourseLineEls = []; // in-transit course <line> elements, same deal (stroke-width instead of a transform)

function escHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Data (all_info/*.json) is checked-in project data, not sanitized user input,
// but a stray value there still shouldn't be able to break out of a style
// attribute -- only accept a well-formed hex color, else fall back.
function safeColor(color) {
  return typeof color === "string" && /^#[0-9a-fA-F]{3,8}$/.test(color)
    ? color
    : "#888888";
}

// companies.json's own "color" field is the single source of truth for a
// family's color (map body colors are seeded from/consistent with it); this
// falls back to the map-derived ownerColors for non-family owners (e.g. an
// NPC faction with no companies.json entry).
function familyColor(name) {
  return safeColor(
    (companiesByName[name] && companiesByName[name].color) || ownerColors[name],
  );
}

// Loaded data
let companiesByName = {};
let governiByName = {};
let leadersByFamily = {};
let traitsById = {};
let opinionsByFamily = {};
let treatyTypesByName = {};
let treatiesByFamily = {}; // all_info/treaties.json rows, grouped by `from`
let treatyOpinionsByFamily = {}; // live-computed, mirrored both ways -- see computeTreatyOpinions()
let currentMonth = 0;
let timelineByMonth = {};
let familyAssetsByOwner = {};
let localizedAssetsByBody = {};
let governmentCompatibility = {};
let raceCompatibility = {};
let religionCompatibility = {};
let planetRaceComposition = {};
let planetReligionComposition = {};
let namedFleets = []; // all_info/fleets.json .fleets -- named, orderable fleets
let fleetsById = {}; // namedFleets indexed by id, for fleet-vs-fleet order targets
let bodyIdByName = {}; // body.name (lowercased) -> id, built once in loadMap, reused by fleet home-planet resolution

// ── FOG OF WAR / KNOWLEDGE REVEAL ─────────────────────────────────────────────
// What the players currently know about each family is GM-authored directly
// in all_info/reveals.json (per-family stat/leader-trait/asset boolean
// flags) rather than derived from a single progressive score -- lets the GM
// reveal e.g. Territory before Might, or one leader's trait before another's,
// in whatever order the story actually goes. Government type and opinions
// toward other families are never gated. Leader identity (name/portrait/
// role) is never gated either -- court membership is always public, only a
// leader's traits are hidden. Missing family/field in reveals.json defaults
// to hidden (false).
let revealsByFamily = {};
let devRevealAll = false;
let currentOverlayFamily = null;

// The site is played from La Mano's own perspective (that's the player-run
// family) -- a family always knows everything about itself, so the reveal
// flags never gate its own info, independent of the GM-only reveal-all toggle.
const PLAYER_FAMILY = "La Mano";

function familyReveal(name) {
  const r = (revealsByFamily && revealsByFamily[name]) || {};
  return {
    stats: r.stats || {},
    leaders: r.leaders || {},
    uniqueAssetsKnown: !!r.uniqueAssetsKnown,
  };
}
function statKnown(name, statKey) {
  if (devRevealAll || name === PLAYER_FAMILY) return true;
  return !!familyReveal(name).stats[statKey];
}
function leaderTraitKnown(name, role, traitIndex) {
  if (devRevealAll || name === PLAYER_FAMILY) return true;
  const box = familyReveal(name).leaders[role] || {};
  return !!box[traitIndex === 0 ? "trait1Known" : "trait2Known"];
}
function assetsKnown(name) {
  if (devRevealAll || name === PLAYER_FAMILY) return true;
  return familyReveal(name).uniqueAssetsKnown;
}
// "Conoscenza Piena": sums every trackable flag for a family (5 stats + 2
// traits per actual leader + 1 for unique assets -- the total scales with
// how many leaders that family actually has, so Hai's 1 leader or Gith's 0
// don't get stuck below 100%) into a known/total count for the knowledge bar.
function familyKnowledgeSummary(name) {
  const leaders = leadersByFamily[name] || [];
  const total = 5 + leaders.length * 2 + 1;
  if (devRevealAll || name === PLAYER_FAMILY)
    return { known: total, total, pct: 100 };
  let known = 0;
  STAT_KEYS.forEach((k) => {
    if (statKnown(name, k)) known++;
  });
  leaders.forEach((l) => {
    for (let i = 0; i < 2; i++) if (leaderTraitKnown(name, l.role, i)) known++;
  });
  if (assetsKnown(name)) known++;
  return {
    known,
    total,
    pct: total > 0 ? Math.round((known / total) * 100) : 100,
  };
}

function lockedBadge(message) {
  const span = document.createElement("span");
  span.className = "locked-badge";
  span.textContent = "🔒";
  span.title =
    message || "I giocatori non hanno ancora scoperto questa informazione";
  return span;
}

function hexToRgb(hex) {
  hex = hex.replace(/^#/, "");
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  return {
    r: parseInt(hex.slice(0, 2), 16) || 0,
    g: parseInt(hex.slice(2, 4), 16) || 0,
    b: parseInt(hex.slice(4, 6), 16) || 0,
  };
}

const NS = "http://www.w3.org/2000/svg";
function el(tag, attrs = {}) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

const svg = document.getElementById("solar-svg");
const bgStars = document.getElementById("bg-stars");
let vb = {
  x: CENTER - window.innerWidth / 2,
  y: CENTER - window.innerHeight / 2,
  w: window.innerWidth,
  h: window.innerHeight,
};
function applyVB() {
  svg.setAttribute("viewBox", `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
  refreshIconScale();
}
function refreshIconScale() {
  const k = Math.min(MAX_ICON_SCALE, Math.max(1, vb.w / BASE_VB_WIDTH));
  const collapsed = vb.w >= MOON_COLLAPSE_VB_WIDTH;
  Object.entries(iconScaleGroups).forEach(([id, g]) => {
    const boost =
      collapsed && satellitesByParent[id] && satellitesByParent[id].length
        ? COLLAPSED_PLANET_BOOST
        : 1;
    g.setAttribute("transform", `scale(${(k * boost).toFixed(3)})`);
  });
  Object.values(satellitesByParent)
    .flat()
    .forEach((satId) => {
      const g = bodyGroups[satId];
      if (g) g.style.display = collapsed ? "none" : "";
    });
  document.querySelectorAll("#orbit-layer .moon-orbit-ring").forEach((ring) => {
    ring.style.display = collapsed ? "none" : "";
  });

  // A satellite's own fleet-icon row disappears along with it when
  // collapsed (it's a child of the now-hidden satellite group) -- the
  // parent's MERGED row (built in updateScene, this body + its
  // satellites combined) takes over instead, and vice versa when zoomed
  // back in. Mirrors the satellite-body visibility toggle just above.
  Object.keys(fleetIconGroupsCollapsed).forEach((parentId) => {
    const expandedG = fleetIconGroups[parentId];
    const collapsedG = fleetIconGroupsCollapsed[parentId];
    if (expandedG) expandedG.style.display = collapsed ? "none" : "";
    if (collapsedG) collapsedG.style.display = collapsed ? "" : "none";
  });

  // Named-fleet tokens/course-lines aren't anchored to any single body's
  // icon-scale group (a transiting fleet isn't "at" a body), so they're
  // rescaled independently here using the same k curve as body icons.
  fleetTokenScaleEls.forEach((g) => {
    g.setAttribute("transform", `scale(${k.toFixed(3)})`);
  });
  fleetCourseLineEls.forEach((line) => {
    line.setAttribute("stroke-width", (2 * k).toFixed(2));
  });
}
applyVB();

let panning = false,
  px = 0,
  py = 0;
svg.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  panning = true;
  px = e.clientX;
  py = e.clientY;
});
svg.addEventListener("mousemove", (e) => {
  if (!panning) return;
  followEntity = null;
  vb.x -= (e.clientX - px) * (vb.w / svg.clientWidth);
  vb.y -= (e.clientY - py) * (vb.h / svg.clientHeight);
  px = e.clientX;
  py = e.clientY;
  applyVB();
  clampVB();
});
svg.addEventListener("mouseup", () => {
  panning = false;
});
svg.addEventListener("mouseleave", () => {
  panning = false;
});
svg.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const f = e.deltaY > 0 ? 1.04 : 0.96;
    // Zoom (unlike pan) doesn't break camera-follow -- while following,
    // anchor the zoom on the viewport CENTER (where the followed body/fleet
    // already sits) instead of the mouse cursor, so it can't drift off
    // center just because the cursor wasn't exactly over it.
    const mx = followEntity ? 0.5 : e.offsetX / svg.clientWidth;
    const my = followEntity ? 0.5 : e.offsetY / svg.clientHeight;
    const prevW = vb.w,
      prevH = vb.h;
    vb.w *= f;
    vb.h *= f;
    clampVB();
    vb.x += (prevW - vb.w) * mx;
    vb.y += (prevH - vb.h) * my;
    applyVB();
  },
  { passive: false },
);
let lastTD = null;
svg.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      panning = true;
      px = e.touches[0].clientX;
      py = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      panning = false;
      lastTD = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
    }
  },
  { passive: false },
);
svg.addEventListener(
  "touchmove",
  (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && panning) {
      followEntity = null;
      vb.x -= (e.touches[0].clientX - px) * (vb.w / svg.clientWidth);
      vb.y -= (e.touches[0].clientY - py) * (vb.h / svg.clientHeight);
      px = e.touches[0].clientX;
      py = e.touches[0].clientY;
      clampVB();
      applyVB();
    } else if (e.touches.length === 2 && lastTD) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      vb.w *= lastTD / d;
      vb.h *= lastTD / d;
      lastTD = d;
      clampVB();
      applyVB();
    }
  },
  { passive: false },
);
svg.addEventListener("touchend", () => {
  panning = false;
  lastTD = null;
});

function clampVB() {
  // Clamp both axes by the SAME factor (not independently) so the viewBox's
  // aspect ratio never drifts from the actual element's on non-square
  // viewports. Independent clamping used to let one axis hit ZOOM_MIN/MAX
  // before the other at extreme zoom, distorting the viewBox and throwing
  // off click-coordinate math (e.g. the ruler). preserveAspectRatio="none"
  // on the <svg> makes the math exact regardless, but this also keeps the
  // content itself from visibly stretching at extreme zoom.
  const factorFor = (v) =>
    v > ZOOM_MAX ? ZOOM_MAX / v : v < ZOOM_MIN ? ZOOM_MIN / v : 1;
  const fw = factorFor(vb.w),
    fh = factorFor(vb.h);
  const factor = Math.abs(fw - 1) > Math.abs(fh - 1) ? fw : fh;
  if (factor !== 1) {
    vb.w *= factor;
    vb.h *= factor;
  }
}

// ── CAMERA FOLLOW ─────────────────────────────────────────────────────────────
// Selecting a body (showInfo) or a fleet (showFleetInfo) starts the camera
// tracking it hard-centered every tick as time moves -- a manual pan (drag)
// breaks the follow (you clearly want to look elsewhere); zooming does NOT
// (see the wheel handler above, which re-anchors on center instead of the
// cursor while following, so it can't drift). Selecting a static trade lane
// (showPathInfo) clears it -- nothing there moves, so there's nothing to
// track. Re-selecting a body/fleet always re-engages it.
let followEntity = null; // {type:'body', id} | {type:'fleet', fleet} | null
function setFollowEntity(entity) {
  followEntity = entity;
}
function followEntityPosition() {
  if (!followEntity) return null;
  if (followEntity.type === "body")
    return computeAllPositions(tick)[followEntity.id] || null;
  return getFleetState(followEntity.fleet, tick).position || null;
}
function applyCameraFollow() {
  if (!followEntity) return;
  const p = followEntityPosition();
  if (!p) return;
  vb.x = p.x - vb.w / 2;
  vb.y = p.y - vb.h / 2;
  applyVB();
}

// ── LOAD LOCAL JSON ───────────────────────────────────────────────────────────
// Every all_info/*.json file is hand-edited directly by the GM (no in-app
// editor) -- a 404 (renamed/moved file) or a JSON syntax typo used to fail
// completely silently here (console.error only, that section just quietly
// fell back to its empty default), easy to miss mid-session. dataLoadErrors
// collects the failures so init() can surface them on-screen once loading
// settles -- see showDataErrorBanner().
let dataLoadErrors = [];
async function loadJson(path, fallback) {
  try {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`${path}: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error("[STRATMAP] failed to load", path, err);
    dataLoadErrors.push(path);
    return fallback;
  }
}
function showDataErrorBanner() {
  if (!dataLoadErrors.length) return;
  const host = document.getElementById("data-error-banner");
  if (!host) return;
  host.innerHTML = "";
  const msg = document.createElement("span");
  msg.textContent = `⚠ Errore nel caricamento di: ${dataLoadErrors.join(", ")} — quella sezione userà valori vuoti/di default. Controlla la console per i dettagli.`;
  host.appendChild(msg);
  const dismiss = document.createElement("button");
  dismiss.textContent = "Ignora";
  dismiss.addEventListener("click", () => host.classList.remove("show"));
  host.appendChild(dismiss);
  host.classList.add("show");
}

// ── NORMALISE MAP DATA ────────────────────────────────────────────────────────
function normalise(bodies, paths) {
  const map = {};
  map["sun"] = {
    id: "sun",
    anchor: "",
    distance: 0,
    speed: 0,
    color: "#ffaa00",
    name: "Sun",
    owner: "",
    fleets: [],
    descr: "",
    isNode: true,
    moonSlot: 0,
  };
  const moonCount = {};
  bodies.forEach((b) => {
    const id = (b.id || "").trim().toLowerCase();
    if (!id) return;
    const anchor = (b.anchor || "sun").trim().toLowerCase();
    let moonSlot = 0;
    if (!b.node && anchor !== "sun") {
      if (moonCount[anchor] === undefined) moonCount[anchor] = 0;
      moonSlot = moonCount[anchor]++;
    }
    const color = safeColor(b.color || "#aaaaaa");
    map[id] = {
      id,
      anchor,
      distance: Number(b.distance) || 0,
      moonSlot,
      speed: Number(b.speed) || 1,
      offset: Number(b.offset) || 0,
      color,
      name: b.name || b.id,
      owner: b.owner || "",
      fleets: [],
      descr: b.descr || "",
      resourceIds: Array.isArray(b.resourceIds) ? b.resourceIds : [],
      type: b.type || "planet",
      isNode: !!b.node,
    };
  });
  Object.values(map).forEach((b) => {
    if (b.owner) ownerColors[b.owner.trim()] = b.color;
  });
  Object.values(map).forEach((b) => {
    b.ownerColor =
      (b.owner && ownerColors[b.owner.trim()]) || b.color || "#aaaaaa";
  });
  map.__paths = (paths || []).map((p) => ({
    ids: (p.ids || []).map((s) => s.trim().toLowerCase()),
    name: p.name || "",
    color: safeColor(p.color || "#aaaaaa"),
    type: (p.type || "path").trim().toLowerCase(),
    owner: p.owner || "",
    fleets: Array.isArray(p.fleets) ? p.fleets : [],
    descr: p.descr || "",
    departure: Number(p.departure) || 0,
  }));
  return map;
}

// ── ORBITAL ENGINE ────────────────────────────────────────────────────────────
// Single-slot cache: within one render pass (or one animation frame), several
// independent code paths (updateScene, getFleetState, focusOnBody, the
// info-panel renderers...) all ask for positions at the SAME t -- recomputing
// the full recursive walk every time is pure waste since byId never changes
// at runtime (no live-editing UI, GM edits the JSON file and reloads).
let lastPositionsT = null,
  lastPositionsCache = null;
function computeAllPositions(t) {
  if (t === lastPositionsT) return lastPositionsCache;
  const cache = {};
  function pos(id) {
    if (cache[id]) return cache[id];
    const b = byId[id];
    if (!b || !b.anchor) {
      cache[id] = { x: CENTER, y: CENTER };
      return cache[id];
    }
    const parent = pos(b.anchor);
    const r =
      b.anchor === "sun"
        ? b.distance * DIST_SCALE
        : MOON_START + b.moonSlot * MOON_GAP;
    const angle =
      b.type === "point"
        ? ((b.offset || 0) * Math.PI) / 180
        : (b.speed > 0 ? (t / b.speed) * Math.PI * 2 : 0) +
          ((b.offset || 0) * Math.PI) / 180;
    cache[id] = {
      x: parent.x + r * Math.cos(angle),
      y: parent.y + r * Math.sin(angle),
      orbitR: r,
      parentX: parent.x,
      parentY: parent.y,
    };
    return cache[id];
  }
  Object.keys(byId)
    .filter((id) => id !== "__paths")
    .forEach((id) => pos(id));
  lastPositionsT = t;
  lastPositionsCache = cache;
  return cache;
}

// ── FLEET INTERCEPT SOLVE ─────────────────────────────────────────────────────
// Every orbit is fully deterministic (computeAllPositions above), so a "move
// to X" order is solved as a real intercept problem rather than chased frame
// by frame: given the fleet's live start position/time and constant speed,
// find the smallest future month where the fleet (traveling in a fixed
// straight line at constant speed) and the target's position coincide.
// Coarse-scan then bisect -- simple and numerically robust for the smooth,
// bounded target paths this system actually has (circular orbits, or another
// fleet's own already-solved course), no closed-form needed.
const INTERCEPT_HORIZON_MONTHS = 240;
const INTERCEPT_STEP_MONTHS = 0.5;
const DEFAULT_FLEET_SPEED = 4; // AU/month -- matches the old hardcoded global every fleet used to share

// ── FLEET ARCHETYPES ──────────────────────────────────────────────────────────
// A named fleet's speed/maxDistance/bonusRange/bonus used to be hand-copied
// onto every single entry in fleets.json -- most of the roster never
// actually varied. Now a fleet just names a 'type' key into this table and
// gets that archetype's numbers for free; only a "legendary"/special fleet
// needs to declare a field at all, and doing so OVERRIDES that one field for
// that fleet only (see resolveFleetDefaults -- a field's mere PRESENCE in the
// fleet's own JSON wins over the archetype default, even if its value is
// null/'' , so it stays distinguishable from "just inherit the archetype").
const FLEET_ARCHETYPES = {
  interceptor: {
    speed: 16,
    maxDistance: 40,
    bonusRange: 120,
    bonus:
      "Quando questa flotta ingaggia un'altra flotta in combattimento, ottiene +1 a Might per il tiro d'attacco.",
  },
  suppressor: {
    speed: 4,
    maxDistance: 600,
    bonusRange: 90,
    bonus:
      "Finché orbita attorno a un pianeta nemico, ogni tiro nemico che coinvolge Territory su quel corpo subisce -1.",
  },
  "ground-support": {
    speed: 8,
    maxDistance: 60,
    bonusRange: 30,
    bonus:
      "Per ogni cobattimento di tipo esercito contro esercito su questo corpo, ottieni 750 punti schieramento aggiuntivi.",
  },
  "arcanic-shield": {
    speed: 6,
    maxDistance: 90,
    bonusRange: 60,
    bonus:
      "Finché questa flotta orbita attorno a un pianeta, né tu né il nemico potete usare la fase Poteri su quel corpo.",
  },
};
function resolveFleetDefaults(fleet) {
  const a = FLEET_ARCHETYPES[fleet.type] || {};
  const pick = (key, fallback) =>
    key in fleet ? fleet[key] : key in a ? a[key] : fallback;
  return {
    speed: pick("speed", DEFAULT_FLEET_SPEED),
    maxDistance: pick("maxDistance", null),
    bonusRange: pick("bonusRange", null),
    bonus: pick("bonus", "") || "",
  };
}

function solveIntercept(startPos, startMonth, speedAU, targetPosFn) {
  if (!(speedAU > 0)) return null;
  const speedSVG = speedAU * DIST_SCALE;
  const f = (t) => {
    const p = targetPosFn(t);
    if (!p) return null;
    return (
      Math.hypot(p.x - startPos.x, p.y - startPos.y) -
      speedSVG * (t - startMonth)
    );
  };
  let prevT = startMonth,
    prevF = f(startMonth);
  if (prevF === null) return null;
  if (prevF <= 0)
    return {
      etaMonth: startMonth,
      point: targetPosFn(startMonth),
      distanceAU: 0,
    };
  for (
    let t = startMonth + INTERCEPT_STEP_MONTHS;
    t <= startMonth + INTERCEPT_HORIZON_MONTHS;
    t += INTERCEPT_STEP_MONTHS
  ) {
    const curF = f(t);
    if (curF === null) return null;
    if (curF <= 0) {
      let lo = prevT,
        hi = t;
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        const midF = f(mid);
        if (midF === null) return null;
        if (midF > 0) lo = mid;
        else hi = mid;
      }
      const etaMonth = hi;
      const point = targetPosFn(etaMonth);
      const distanceAU = speedAU * (etaMonth - startMonth);
      return { etaMonth, point, distanceAU };
    }
    prevT = t;
    prevF = curF;
  }
  return null; // no crossing within the horizon -> infeasible
}

// ── FLEET STATE RESOLUTION ────────────────────────────────────────────────────
// A named fleet's position is fully determined by its (static, JSON-authored)
// order list -- nothing about resolving it actually depends on which month
// is currently displayed, except which segment of its timeline t falls into.
// So rather than re-walking the order list (re-solving every intercept, incl.
// the maxDistance wait-for-range scan) on every single render call -- which
// is what made scrubbing/animating the tick slower the more fleets existed --
// each fleet's ENTIRE order list is solved ONCE into a "plan": a chronological
// list of dated segments (buildFleetPlan), cached per fleet (getFleetPlan,
// rebuilt only when fleets.json reloads, i.e. once in loadMap()). Reading a
// fleet's live state at a given t (evaluatePlanAt) then just picks the
// matching segment and interpolates -- no solving on the render path at all.
//
// A plan segment is one of:
//   {mode:'body', bodyId, from, to}     -- parked at a real body, tracked live within [from,to)
//   {mode:'point', position, from, to}  -- holding at a fixed rendezvous point that isn't a body
//   {mode:'course', course, from, to}   -- mid-course (from===course.startMonth, to===course.etaMonth)
//   {mode:'disabled', position, from, to} -- ghosted while disabled
// evaluatePlanAt() turns the matching segment into the same shape the old
// resolveFleetState() used to return ({mode, position, ...}) so every render
// call site keeps working unchanged. `waits` is a separate flat list of
// {from, to, order, departureMonth, rawTarget} windows (order.month <= t <
// departureMonth, i.e. authored but not yet in launch range) used only to set
// the `pending` flag/badge -- it doesn't change what segment/position is live.
const RESOLVE_DEPTH_LIMIT = 8;

function fleetHomeBodyId(fleet) {
  const company = companiesByName[fleet.owner];
  if (!company || !company.planet) return null;
  return bodyIdByName[company.planet.trim().toLowerCase()] || null;
}

function positionOnCourse(course, month) {
  if (month >= course.etaMonth) return course.endPoint;
  const frac = Math.max(
    0,
    (month - course.startMonth) / (course.etaMonth - course.startMonth),
  );
  return {
    x: course.startPos.x + (course.endPoint.x - course.startPos.x) * frac,
    y: course.startPos.y + (course.endPoint.y - course.startPos.y) * frac,
  };
}

// Target position lookup used by solveIntercept while BUILDING a plan (see
// below) -- for a fleet target this resolves (and caches) that other fleet's
// own plan just once, then every probe month during the intercept search is
// a cheap evaluatePlanAt() rather than a fresh re-solve.
function resolveTargetPosFn(targetId, depth) {
  if (byId[targetId]) return (t) => computeAllPositions(t)[targetId];
  const targetFleet = fleetsById[targetId];
  if (targetFleet) {
    const targetPlan = getFleetPlan(targetFleet, depth + 1);
    return (t) => evaluatePlanAt(targetPlan, targetFleet, t).position;
  }
  return null;
}

// Granularity for the "wait until in range" departure search below -- whole
// months are plenty precise for a month-scale game and keep the search
// (which re-runs solveIntercept's own sub-month scan at every candidate)
// cheap in the common case where the very first candidate already works.
const WAIT_STEP_MONTHS = 1;

function degenerateFleetPlan(fleet) {
  const homeId = fleetHomeBodyId(fleet);
  const startBodyId =
    fleet.startBody && byId[fleet.startBody] ? fleet.startBody : homeId;
  return {
    segments: [
      { mode: "body", bodyId: startBodyId, from: -Infinity, to: Infinity },
    ],
    errors: [{ message: "Riferimento circolare tra flotte." }],
    waits: [],
  };
}

// Replays a fleet's ENTIRE order list (unconditionally, not gated by any
// particular t) into a plan -- see the FLEET STATE RESOLUTION note above.
function buildFleetPlan(fleet, depth) {
  const homeId = fleetHomeBodyId(fleet);
  const startBodyId =
    fleet.startBody && byId[fleet.startBody] ? fleet.startBody : homeId;
  const defaults = resolveFleetDefaults(fleet);
  const errors = [];
  const waits = [];
  const segments = [];

  let state = { mode: "body", bodyId: startBodyId };
  let segStart = -Infinity;
  let disabled = false;
  const orders = (fleet.orders || []).slice().sort((a, b) => a.month - b.month);

  // Where the fleet is at an arbitrary month given whatever state it's
  // CURRENTLY resolved to so far -- reused both for a move order's own
  // departure point and for probing candidate departure months while
  // waiting for a launch window to open. 'shadow' (see the fleet-vs-fleet
  // chase below) has no position of its own -- once caught, this fleet's
  // position is simply whatever the target fleet's OWN (already-cached)
  // plan says it is, at any month, forever after.
  function stateAt(month) {
    if (state.mode === "course") {
      if (month >= state.course.etaMonth) {
        return state.course.targetIsBody
          ? computeAllPositions(month)[state.course.rawTarget]
          : state.course.endPoint;
      }
      return positionOnCourse(state.course, month);
    }
    if (state.mode === "shadow") {
      const targetFleet = fleetsById[state.targetFleetId];
      return evaluatePlanAt(
        getFleetPlan(targetFleet, depth + 1),
        targetFleet,
        month,
      ).position;
    }
    if (state.mode === "point" || state.mode === "disabled")
      return state.position;
    if (state.bodyId) return computeAllPositions(month)[state.bodyId];
    return { x: CENTER, y: CENTER };
  }
  function closeSegment(endMonth) {
    const rec =
      state.mode === "course"
        ? { mode: "course", course: state.course }
        : state.mode === "shadow"
          ? { mode: "shadow", targetFleetId: state.targetFleetId }
          : state.mode === "point"
            ? { mode: "point", position: state.position }
            : state.mode === "disabled"
              ? { mode: "disabled", position: state.position }
              : { mode: "body", bodyId: state.bodyId };
    segments.push({ ...rec, from: segStart, to: endMonth });
    segStart = endMonth;
  }

  for (let orderIdx = 0; orderIdx < orders.length; orderIdx++) {
    const order = orders[orderIdx];
    const nextOrderMonth =
      orderIdx + 1 < orders.length ? orders[orderIdx + 1].month : Infinity;
    if (order.action === "disable") {
      const pos = stateAt(order.month);
      closeSegment(order.month);
      disabled = true;
      state = { mode: "disabled", position: pos };
      continue;
    }
    if (order.action === "enable") {
      disabled = false;
      if (state.mode === "disabled") {
        closeSegment(order.month);
        state = { mode: "point", position: state.position };
      }
      continue;
    }
    if (order.action !== "move" || disabled) continue;

    const rawTarget = order.target === "home" ? homeId : order.target;
    if (!rawTarget) {
      errors.push({
        order,
        message: `Obiettivo "${order.target}" non riconosciuto.`,
      });
      continue;
    }
    if (fleetsById[rawTarget]) {
      // ── FLEET-VS-FLEET: turn-by-turn pursuit ──────────────────────────
      // A move order targeting another fleet doesn't get a single solved
      // lead-shot intercept (that's only exact for a body's smooth,
      // perfectly predictable orbit) -- instead the chaser re-aims every
      // month at wherever the target ACTUALLY is that month and covers one
      // month of its own speed toward that fixed point, repeating until it
      // closes the gap. Bounded by: the timeline's own visible window
      // (nothing past it is ever rendered, so there's no reason to keep
      // simulating -- see TIMELINE_WINDOW_MONTHS), the next authored order
      // (so e.g. a later 'disable' still interrupts at the right month,
      // same as it already does for a single long solved course), and
      // maxDistance as a running TOTAL distance budget for the whole chase
      // (not a per-leg cap) -- if that runs out before catching up, the
      // chase stops there and gets the usual "fuori portata" warning.
      const targetFleet = fleetsById[rawTarget];
      const targetPlan = getFleetPlan(targetFleet, depth + 1);
      const stopBound = Math.min(
        baseTick + TIMELINE_WINDOW_MONTHS,
        nextOrderMonth,
      );
      const stepDist = defaults.speed * DIST_SCALE;
      const maxDistanceSVG =
        defaults.maxDistance == null ? null : defaults.maxDistance * DIST_SCALE;
      let distTraveledSVG = 0;
      let m = order.month;
      // Close whatever state preceded this order (e.g. parked at home) right
      // at its own month, exactly like the body-target branch's
      // closeSegment(departureMonth) below -- without this, the first hop's
      // closeSegment() call would mislabel the OLD state's entire history
      // (from wherever segStart was, possibly -Infinity) as if it were
      // already part of this course.
      closeSegment(order.month);

      while (m < stopBound) {
        const pos = stateAt(m);
        const targetPos = evaluatePlanAt(targetPlan, targetFleet, m).position;
        const distToTarget = Math.hypot(
          targetPos.x - pos.x,
          targetPos.y - pos.y,
        );
        const budgetLeft =
          maxDistanceSVG == null ? Infinity : maxDistanceSVG - distTraveledSVG;
        if (budgetLeft <= 0) {
          errors.push({
            order,
            message: `Inseguimento interrotto: superata la distanza massima (${defaults.maxDistance} UA) senza raggiungere l'obiettivo.`,
          });
          break;
        }

        let hopEta = m + Math.min(stepDist, budgetLeft) / stepDist;
        let cappedByWindow = false;
        if (hopEta > stopBound) {
          hopEta = stopBound;
          cappedByWindow = true;
        }
        const hopReach = stepDist * (hopEta - m);

        if (distToTarget <= hopReach) {
          // Close enough to reach the target's THIS-MONTH position within
          // the hop budget -- caught. From here on this fleet just IS
          // wherever the target is (see stateAt/closeSegment's 'shadow'
          // handling), for as long as this plan runs.
          const catchEta = m + distToTarget / stepDist;
          state = {
            mode: "course",
            course: {
              startPos: pos,
              startMonth: m,
              etaMonth: catchEta,
              endPoint: targetPos,
              rawTarget,
              targetIsBody: false,
              // Only the FIRST monthly hop is the order's real departure --
              // buildFleetDepartureEvents uses this to report just one
              // "started chasing" line instead of one per re-aim.
              isRepeatHop: m !== order.month,
            },
          };
          closeSegment(catchEta);
          distTraveledSVG += distToTarget;
          state = { mode: "shadow", targetFleetId: rawTarget };
          break;
        }

        const ux = (targetPos.x - pos.x) / distToTarget;
        const uy = (targetPos.y - pos.y) / distToTarget;
        state = {
          mode: "course",
          course: {
            startPos: pos,
            startMonth: m,
            etaMonth: hopEta,
            endPoint: { x: pos.x + ux * hopReach, y: pos.y + uy * hopReach },
            rawTarget,
            targetIsBody: false,
            isRepeatHop: m !== order.month,
          },
        };
        closeSegment(hopEta);
        distTraveledSVG += hopReach;
        m = hopEta;
        if (!cappedByWindow && hopReach < stepDist) {
          // The hop budget (not the visible window / next order) is what
          // cut this leg short -- maxDistance is exhausted.
          errors.push({
            order,
            message: `Inseguimento interrotto: superata la distanza massima (${defaults.maxDistance} UA) senza raggiungere l'obiettivo.`,
          });
          break;
        }
      }
      continue;
    }

    const posFn = resolveTargetPosFn(rawTarget, depth);
    if (!posFn) {
      errors.push({
        order,
        message: `Obiettivo "${order.target}" non riconosciuto.`,
      });
      continue;
    }

    // No cap -> solve once at the order's own month, same as before.
    // Capped -> the order's month is only the EARLIEST possible
    // departure; scan forward (fleet holding in place, still tracked
    // live via stateAt) for the first month a solve actually fits within
    // maxDistance, and depart then instead of rejecting.
    let solved = null,
      departureMonth = null;
    if (defaults.maxDistance == null) {
      departureMonth = order.month;
      solved = solveIntercept(
        stateAt(departureMonth),
        departureMonth,
        defaults.speed,
        posFn,
      );
    } else {
      for (
        let dep = order.month;
        dep <= order.month + INTERCEPT_HORIZON_MONTHS;
        dep += WAIT_STEP_MONTHS
      ) {
        const candidate = solveIntercept(
          stateAt(dep),
          dep,
          defaults.speed,
          posFn,
        );
        if (candidate && candidate.distanceAU <= defaults.maxDistance) {
          solved = candidate;
          departureMonth = dep;
          break;
        }
      }
    }
    if (!solved) {
      errors.push({
        order,
        message: `Nessuna finestra di lancio raggiungibile entro ${INTERCEPT_HORIZON_MONTHS} mesi (fuori portata).`,
      });
      continue;
    }

    if (departureMonth > order.month)
      waits.push({
        from: order.month,
        to: departureMonth,
        order,
        departureMonth,
        rawTarget,
      });

    closeSegment(departureMonth);
    state = {
      mode: "course",
      course: {
        startPos: stateAt(departureMonth),
        startMonth: departureMonth,
        etaMonth: solved.etaMonth,
        endPoint: solved.point,
        rawTarget,
        targetIsBody: !!byId[rawTarget],
      },
    };
    // The fleet either tracks the arrived body live from then on, or (a
    // bare-point rendezvous, e.g. arriving at another fleet) holds fixed
    // at the point the intercept actually happened -- close the course
    // segment right away so the NEXT order's stateAt() sees this too.
    closeSegment(solved.etaMonth);
    state = byId[rawTarget]
      ? { mode: "body", bodyId: rawTarget }
      : { mode: "point", position: solved.point };
  }
  closeSegment(Infinity);
  return { segments, errors, waits };
}

let fleetPlanCache = new Map();
let fleetPlanBuilding = new Set();
function getFleetPlan(fleet, depth) {
  depth = depth || 0;
  if (fleet.id && fleetPlanCache.has(fleet.id))
    return fleetPlanCache.get(fleet.id);
  if (
    depth > RESOLVE_DEPTH_LIMIT ||
    (fleet.id && fleetPlanBuilding.has(fleet.id))
  )
    return degenerateFleetPlan(fleet);
  if (fleet.id) fleetPlanBuilding.add(fleet.id);
  const plan = buildFleetPlan(fleet, depth);
  if (fleet.id) {
    fleetPlanBuilding.delete(fleet.id);
    fleetPlanCache.set(fleet.id, plan);
  }
  return plan;
}

// Precomputes every named fleet's plan -- called once from loadMap() after a
// JSON (re)load; nothing else ever invalidates it (byId/fleets.json don't
// change at runtime, there's no in-app editor -- see loadJson's own note).
function buildAllFleetPlans() {
  fleetPlanCache = new Map();
  fleetPlanBuilding = new Set();
  namedFleets.forEach((fleet) => getFleetPlan(fleet, 0));
}

function evaluatePlanAt(plan, fleet, t) {
  let seg = plan.segments[plan.segments.length - 1];
  for (const s of plan.segments) {
    if (t < s.to) {
      seg = s;
      break;
    }
  }
  const wait = plan.waits.find((w) => t >= w.from && t < w.to);
  const pending = wait
    ? {
        order: wait.order,
        departureMonth: wait.departureMonth,
        rawTarget: wait.rawTarget,
      }
    : null;

  if (seg.mode === "course") {
    if (t >= seg.course.etaMonth) {
      return seg.course.targetIsBody
        ? {
            mode: "body",
            bodyId: seg.course.rawTarget,
            position: computeAllPositions(t)[seg.course.rawTarget],
            fleet,
            errors: plan.errors,
            pending,
          }
        : {
            mode: "point",
            position: seg.course.endPoint,
            fleet,
            errors: plan.errors,
            pending,
          };
    }
    return {
      mode: "transit",
      position: positionOnCourse(seg.course, t),
      course: seg.course,
      fleet,
      errors: plan.errors,
      pending,
    };
  }
  if (seg.mode === "shadow") {
    // Caught up with a chased fleet -- from here on this fleet just IS
    // wherever the target fleet's OWN (separately cached) plan says it is,
    // whatever that mode happens to be (parked/transit/disabled/shadowing
    // someone else in turn); only fleet/errors/pending below stay this
    // fleet's own, so UI clicks and warnings still refer to the chaser.
    const targetFleet = fleetsById[seg.targetFleetId];
    const targetState = evaluatePlanAt(
      getFleetPlan(targetFleet, 0),
      targetFleet,
      t,
    );
    return {
      ...targetState,
      fleet,
      shadowing: targetFleet,
      errors: plan.errors,
      pending,
    };
  }
  if (seg.mode === "disabled")
    return {
      mode: "disabled",
      position: seg.position,
      fleet,
      errors: plan.errors,
      pending,
    };
  if (seg.mode === "point")
    return {
      mode: "point",
      position: seg.position,
      fleet,
      errors: plan.errors,
      pending,
    };
  return {
    mode: "body",
    bodyId: seg.bodyId,
    position: seg.bodyId
      ? computeAllPositions(t)[seg.bodyId]
      : { x: CENTER, y: CENTER },
    fleet,
    errors: plan.errors,
    pending,
  };
}

function getFleetState(fleet, t) {
  return evaluatePlanAt(getFleetPlan(fleet, 0), fleet, t);
}

function targetLabel(targetId) {
  if (!targetId) return "?";
  if (byId[targetId]) return byId[targetId].name;
  if (fleetsById[targetId]) return fleetsById[targetId].name;
  return targetId;
}

// ── GRADIENT / COLOR FILTER ───────────────────────────────────────────────────
function ensureColorFilter(id, color) {
  const defs = document.getElementById("svg-defs");
  const fId = `cf-${id}`;
  if (defs.querySelector(`#${fId}`)) return fId;
  const f = el("filter", {
    id: fId,
    "color-interpolation-filters": "sRGB",
    x: "-20%",
    y: "-20%",
    width: "140%",
    height: "140%",
  });
  f.appendChild(
    el("feFlood", {
      "flood-color": color,
      "flood-opacity": "1",
      result: "flood",
    }),
  );
  f.appendChild(
    el("feComposite", {
      in: "flood",
      in2: "SourceGraphic",
      operator: "in",
      result: "colored",
    }),
  );
  f.appendChild(
    el("feGaussianBlur", { in: "colored", stdDeviation: "3", result: "glow" }),
  );
  const merge = el("feMerge", {});
  merge.appendChild(el("feMergeNode", { in: "glow" }));
  merge.appendChild(el("feMergeNode", { in: "colored" }));
  f.appendChild(merge);
  defs.appendChild(f);
  return fId;
}

// ── BUILD SCENE ───────────────────────────────────────────────────────────────
let bodyGroups = {};
function buildScene() {
  document.getElementById("orbit-layer").innerHTML = "";
  const bodyLayer = document.getElementById("body-layer");
  bodyLayer.innerHTML = "";
  bodyGroups = {};
  iconScaleGroups = {};
  fleetIconGroups = {};
  fleetIconGroupsCollapsed = {};
  if (bgStars) bgStars.innerHTML = "";

  satellitesByParent = {};
  Object.values(byId).forEach((b) => {
    if (b.id === "sun" || b.isNode) return;
    if (b.anchor && b.anchor !== "sun")
      (satellitesByParent[b.anchor] = satellitesByParent[b.anchor] || []).push(
        b.id,
      );
  });

  const sunG = el("g", { "data-id": "sun", class: "body-group" });
  const sunScale = el("g", { class: "icon-scale" });
  sunScale.appendChild(
    el("circle", {
      r: SUN_R * 2.8,
      fill: "url(#sunGrad)",
      opacity: "0.5",
      filter: "url(#glow-strong)",
    }),
  );
  sunScale.appendChild(
    el("circle", {
      r: SUN_R,
      fill: "url(#sunGrad)",
      filter: "url(#glow-strong)",
      stroke: "rgba(255,240,180,0.3)",
      "stroke-width": "2",
    }),
  );
  const sunLbl = el("text", {
    x: SUN_R + 8,
    y: 0,
    class: "body-label",
    "dominant-baseline": "middle",
  });
  sunLbl.textContent = "Sun";
  sunScale.appendChild(sunLbl);
  const sunFleetIconG = el("g", { class: "fleet-icons" });
  sunScale.appendChild(sunFleetIconG);
  fleetIconGroups["sun"] = sunFleetIconG;
  sunG.appendChild(sunScale);
  sunG.addEventListener("click", () => showInfo(byId["sun"]));
  sunG.setAttribute("transform", `translate(${CENTER},${CENTER})`);
  bodyLayer.appendChild(sunG);
  bodyGroups["sun"] = sunG;
  iconScaleGroups["sun"] = sunScale;

  Object.values(byId).forEach((b) => {
    if (b.id === "sun") return;
    const isMain = b.anchor === "sun" || b.type === "planet";
    const r =
      {
        planet: PLANET_R,
        base: PLANET_R * 0.8,
        moon: MOON_R,
        point: MOON_R * 0.75,
      }[b.type] ?? MOON_R;
    const typeMap = {
      planet: "images/planet.svg",
      moon: "images/moon.svg",
      base: "images/base.svg",
      point: "images/point.svg",
    };
    const iconSrc = typeMap[b.type] || "images/planet.svg";
    const cfId = ensureColorFilter(b.id, b.color);

    // Everything visual (halo/icon/label/fleet markers) lives inside an
    // inner "icon-scale" group so refreshIconScale() can grow it when
    // zoomed far out, without touching the outer group's world-space
    // position (set separately by updateScene()).
    const g = el("g", { "data-id": b.id, class: "body-group" });
    const scaleG = el("g", { class: "icon-scale" });
    g.appendChild(scaleG);
    if (b.type === "point" && b.speed > 0) {
      const zoneR = b.speed * DIST_SCALE;
      const { r: cr, g: cg, b: cb } = hexToRgb(b.color);
      const zone = el("circle", {
        r: zoneR,
        fill: `rgba(${Math.round(cr * 0.4)},${Math.round(cg * 0.4)},${Math.round(cb * 0.4)},0.18)`,
        stroke: `rgba(${Math.round(cr * 0.6)},${Math.round(cg * 0.6)},${Math.round(cb * 0.6)},0.35)`,
        "stroke-width": "2",
        "stroke-dasharray": "8 6",
        "pointer-events": "none",
      });
      // The "zone of influence" ring is in world space (radius = speed *
      // DIST_SCALE, same unit as orbits), so it stays outside the scaled group.
      g.insertBefore(zone, g.firstChild);
    }
    const halo = el("circle", {
      r: r * 2.2,
      fill: b.color,
      opacity: "0.0",
      style: "transition:opacity .2s",
    });
    scaleG.appendChild(halo);
    const icon = el("image", {
      href: iconSrc,
      x: -r,
      y: -r,
      width: r * 2,
      height: r * 2,
      filter: `url(#${cfId})`,
    });
    scaleG.appendChild(icon);
    const lbl = el("text", {
      x: r + 7,
      y: 0,
      class: isMain ? "body-label" : "moon-label",
      "dominant-baseline": "middle",
    });
    lbl.textContent = b.name;
    scaleG.appendChild(lbl);
    g.addEventListener("mouseenter", () => {
      halo.setAttribute("opacity", "0.25");
      icon.setAttribute("opacity", "1");
    });
    g.addEventListener("mouseleave", () => {
      halo.setAttribute("opacity", "0.0");
      icon.setAttribute("opacity", "0.85");
    });
    icon.setAttribute("opacity", "0.85");
    g.addEventListener("click", (e) => {
      e.stopPropagation();
      showInfo(b);
    });

    // Fleet markers (anonymous + named combined, deduped by family) are
    // built fresh every tick in updateScene() -- this body's OWN row
    // always exists; bodies WITH satellites (checked below) also get a
    // second, initially-hidden row holding the MERGED parent+satellites
    // count, shown instead of the per-body rows when zoomed out past
    // MOON_COLLAPSE_VB_WIDTH (refreshIconScale() toggles between them,
    // same mechanism it already uses to hide the satellites themselves).
    const fleetIconG = el("g", { class: "fleet-icons" });
    scaleG.appendChild(fleetIconG);
    fleetIconGroups[b.id] = fleetIconG;
    if (satellitesByParent[b.id] && satellitesByParent[b.id].length) {
      const collapsedG = el("g", {
        class: "fleet-icons fleet-icons-collapsed",
      });
      scaleG.appendChild(collapsedG);
      fleetIconGroupsCollapsed[b.id] = collapsedG;
    }

    bodyLayer.appendChild(g);
    bodyGroups[b.id] = g;
    iconScaleGroups[b.id] = scaleG;
  });

  (function injectMapBackground() {
    const existing = document.getElementById("map-bg-image");
    if (existing) existing.remove();
    const brion = byId["brion7"];
    if (!brion) return;
    const orbitR = brion.distance * DIST_SCALE;
    const side = orbitR * 2;
    const x = CENTER - orbitR;
    const y = CENTER - orbitR;
    const bgImg = document.createElementNS(NS, "image");
    bgImg.setAttribute("id", "map-bg-image");
    bgImg.setAttribute("href", "images/maponlyasteroids.svg");
    bgImg.setAttribute("x", x);
    bgImg.setAttribute("y", y);
    bgImg.setAttribute("width", side);
    bgImg.setAttribute("height", side);
    bgImg.setAttribute("opacity", "1");
    bgImg.setAttribute("pointer-events", "none");
    const orbitLayer = document.getElementById("orbit-layer");
    svg.insertBefore(bgImg, orbitLayer);
  })();
}

// ── UPDATE SCENE ──────────────────────────────────────────────────────────────
function updateScene(t) {
  if (!ready) return;
  const positions = computeAllPositions(t);
  const orbitLayer = document.getElementById("orbit-layer");
  orbitLayer.innerHTML = "";
  const satellitesCollapsed = vb.w >= MOON_COLLAPSE_VB_WIDTH;
  Object.values(byId).forEach((b) => {
    if (b.id === "sun") return;
    const p = positions[b.id];
    if (!p) return;
    if (b.type !== "base" && b.type !== "point") {
      const isMoonRing = b.anchor !== "sun";
      const ring = el("circle", {
        cx: p.parentX,
        cy: p.parentY,
        r: p.orbitR,
        class: isMoonRing ? "moon-orbit-ring" : "orbit-ring",
      });
      if (isMoonRing && satellitesCollapsed) ring.style.display = "none";
      orbitLayer.appendChild(ring);
    }
    const g = bodyGroups[b.id];
    if (g)
      g.setAttribute(
        "transform",
        `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`,
      );
  });
  if (bodyGroups["sun"])
    bodyGroups["sun"].setAttribute(
      "transform",
      `translate(${CENTER},${CENTER})`,
    );

  const pathLayer = document.getElementById("path-layer");
  pathLayer.innerHTML = "";
  const defs = document.getElementById("svg-defs");
  defs.querySelectorAll('[id^="mp-"]').forEach((e) => e.remove());
  defs.querySelectorAll('[id^="arrow-"]').forEach((e) => e.remove());

  // Permanent trade lanes only now (all_info/points_of_interest.json's
  // tradePaths) -- fleet movement has its own resolution below, replacing
  // the old warpath/progress mechanic entirely.
  (byId.__paths || []).forEach((path, pi) => {
    const arrowId = `arrow-${pi}`;
    if (!defs.querySelector(`#${arrowId}`)) {
      const marker = el("marker", {
        id: arrowId,
        markerWidth: "8",
        markerHeight: "8",
        refX: "6",
        refY: "3",
        orient: "auto",
      });
      marker.appendChild(
        el("polygon", {
          points: "0,0 0,6 8,3",
          fill: path.color,
          opacity: "0.85",
        }),
      );
      defs.appendChild(marker);
    }
    const pts = path.ids.map((id) => positions[id]).filter(Boolean);
    if (pts.length < 2) return;
    const segments = [];
    let totalLen = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      segments.push({ a: pts[i], b: pts[i + 1], len });
      totalLen += len;
    }
    const pathG = el("g", { class: "path-group", style: "cursor:pointer" });
    pathG.addEventListener("click", (e) => {
      e.stopPropagation();
      showPathInfo(path, totalLen);
    });

    for (let i = 0; i < segments.length; i++) {
      const { a, b, len } = segments[i];
      const dx = b.x - a.x,
        dy = b.y - a.y;
      const ux = dx / len,
        uy = dy / len;
      const trim = Math.min(PLANET_R + 10, len * 0.2);
      const lineAttrs = {
        x1: a.x + ux * trim,
        y1: a.y + uy * trim,
        x2: b.x - ux * (trim + 10),
        y2: b.y - uy * (trim + 10),
        stroke: path.color,
        "stroke-width": "2.5",
        opacity: "0.7",
      };
      if (i === segments.length - 1)
        lineAttrs["marker-end"] = `url(#${arrowId})`;
      const hitAttrs = { ...lineAttrs };
      delete hitAttrs["marker-end"];
      const hit = el("line", {
        ...hitAttrs,
        stroke: "transparent",
        "stroke-width": "18",
      });
      pathG.appendChild(hit);
      pathG.appendChild(el("line", lineAttrs));
    }
    pathLayer.appendChild(pathG);
  });

  // ── NAMED FLEETS ─────────────────────────────────────────────────────────
  // A named fleet's own live status (see getFleetState/evaluatePlanAt) decides how it
  // renders: parked at a real body -> folds into that body's own icon row,
  // deduped by family alongside any anonymous fleets there (see the body
  // icon-row pass below); anything else (in transit, holding at a bare
  // rendezvous point, or ghosted while disabled) gets its own token.
  fleetTokenScaleEls = [];
  fleetCourseLineEls = [];
  const namedFleetsByBody = {}; // bodyId -> [{fleet, res}, ...] currently resolved as parked there
  namedFleets.forEach((fleet) => {
    const res = getFleetState(fleet, t);
    const ownerColor = familyColor(fleet.owner);
    if (res.mode === "body" && res.bodyId) {
      (namedFleetsByBody[res.bodyId] =
        namedFleetsByBody[res.bodyId] || []).push({ fleet, res });
      return;
    }
    const p = res.position;
    if (!p) return;
    const ghosted = res.mode === "disabled";
    const iconSize = 20;

    if (res.mode === "transit") {
      const c = res.course;
      // Wrapped in a clickable group with a wide invisible hit-line, same
      // pattern as the permanent trade-lane lines above -- clicking
      // anywhere along the dashed course (not just the icon) opens the
      // fleet's info panel.
      const lineG = el("g", { style: "cursor:pointer" });
      lineG.addEventListener("click", (e) => {
        e.stopPropagation();
        showFleetInfo(fleet, t);
      });
      const hit = el("line", {
        x1: c.startPos.x,
        y1: c.startPos.y,
        x2: c.endPoint.x,
        y2: c.endPoint.y,
        stroke: "transparent",
        "stroke-width": "18",
      });
      const line = el("line", {
        x1: c.startPos.x,
        y1: c.startPos.y,
        x2: c.endPoint.x,
        y2: c.endPoint.y,
        stroke: ownerColor,
        opacity: "0.5",
        "stroke-dasharray": "12 8",
      });
      lineG.appendChild(hit);
      lineG.appendChild(line);
      pathLayer.appendChild(lineG);
      fleetCourseLineEls.push(line);
    }

    const iconG = el("g", {
      transform: `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`,
      style: "cursor:pointer",
      class: "fleet-token" + (ghosted ? " fleet-token-ghost" : ""),
    });
    const scaleG = el("g", { class: "fleet-icon-scale" });
    iconG.appendChild(scaleG);
    scaleG.appendChild(
      el("circle", {
        r: iconSize / 2 + 2,
        fill: ownerColor,
        opacity: ghosted ? "0.35" : "0.55",
        stroke: "rgba(255,255,255,0.5)",
        "stroke-width": "1.5",
      }),
    );
    scaleG.appendChild(
      el("image", {
        href: "images/attack.svg",
        x: -iconSize / 2,
        y: -iconSize / 2,
        width: iconSize,
        height: iconSize,
        style: `filter: drop-shadow(0 0 6px ${ownerColor}) brightness(${ghosted ? 1 : 1.8}); opacity: ${ghosted ? 0.6 : 1};`,
      }),
    );
    if (ghosted) {
      const badge = el("text", {
        x: iconSize / 2 + 4,
        y: 4,
        class: "fleet-ghost-badge",
      });
      badge.textContent = "⏸";
      scaleG.appendChild(badge);
    }
    if (res.errors && res.errors.length) {
      const warn = el("text", {
        x: -(iconSize / 2 + 12),
        y: 4,
        class: "fleet-warn-badge",
      });
      warn.textContent = "⚠";
      scaleG.appendChild(warn);
    }
    iconG.addEventListener("click", (e) => {
      e.stopPropagation();
      showFleetInfo(fleet, t);
    });
    pathLayer.appendChild(iconG);
    fleetTokenScaleEls.push(scaleG);
  });

  // ── BODY FLEET ICON ROWS ────────────────────────────────────────────────
  // Anonymous stationed fleets (b.fleets, family-name strings) and named
  // fleets currently parked here (namedFleetsByBody) are combined into one
  // family -> count map per body, so several fleets from the same family
  // never draw as separate markers -- one icon per family, with a small
  // ×N badge when more than one. Bodies with satellites also get a second
  // MERGED row (this body + all its satellites) built into
  // fleetIconGroupsCollapsed, shown instead when moons collapse at high
  // zoom-out (toggled by refreshIconScale(), not rebuilt on pure zoom).
  function familyCounts(bodyId) {
    const counts = {}; // name -> {count, pending}
    const b = byId[bodyId];
    ((b && b.fleets) || []).forEach((name) => {
      counts[name] = counts[name] || { count: 0, pending: false };
      counts[name].count++;
    });
    (namedFleetsByBody[bodyId] || []).forEach(({ fleet, res }) => {
      counts[fleet.owner] = counts[fleet.owner] || { count: 0, pending: false };
      counts[fleet.owner].count++;
      if (res.pending) counts[fleet.owner].pending = true;
    });
    return counts;
  }
  function mergeCounts(target, extra) {
    Object.entries(extra).forEach(([name, v]) => {
      target[name] = target[name] || { count: 0, pending: false };
      target[name].count += v.count;
      target[name].pending = target[name].pending || v.pending;
    });
    return target;
  }
  function renderFamilyIcons(targetGroup, counts, isMain) {
    targetGroup.innerHTML = "";
    const names = Object.keys(counts);
    if (!names.length) return;
    const iconSize = isMain ? 14 : 10;
    const iconGap = isMain ? 16 : 12;
    const r = isMain ? PLANET_R : MOON_R;
    const startX = r - ((names.length - 1) * iconGap) / 2;
    const topY = -(r + 10);
    names.forEach((name, i) => {
      const ownerColor = familyColor(name);
      const cx = startX + i * iconGap;
      targetGroup.appendChild(
        el("circle", {
          cx,
          cy: topY,
          r: iconSize / 2 + 1,
          fill: ownerColor,
          opacity: "0.6",
          stroke: "rgba(255,255,255,0.4)",
          "stroke-width": "1",
        }),
      );
      targetGroup.appendChild(
        el("image", {
          href: "images/attack.svg",
          x: cx - iconSize / 2,
          y: topY - iconSize / 2,
          width: iconSize,
          height: iconSize,
          style: `filter: drop-shadow(0 0 2px ${ownerColor}); opacity: 0.9;`,
        }),
      );
      if (counts[name].count > 1) {
        const badge = el("text", {
          x: cx + iconSize / 2 + 1,
          y: topY + iconSize / 2 + 2,
          class: "fleet-count-badge",
        });
        badge.textContent = `×${counts[name].count}`;
        targetGroup.appendChild(badge);
      }
      if (counts[name].pending) {
        const badge = el("text", {
          x: cx - iconSize / 2 - 2,
          y: topY - iconSize / 2 - 2,
          class: "fleet-wait-badge",
        });
        badge.textContent = "⏳";
        targetGroup.appendChild(badge);
      }
    });
  }
  Object.keys(fleetIconGroups).forEach((bodyId) => {
    const b = byId[bodyId];
    const isMain =
      bodyId === "sun" || (b && (b.anchor === "sun" || b.type === "planet"));
    renderFamilyIcons(fleetIconGroups[bodyId], familyCounts(bodyId), isMain);
  });
  Object.keys(fleetIconGroupsCollapsed).forEach((parentId) => {
    const merged = familyCounts(parentId);
    (satellitesByParent[parentId] || []).forEach((satId) => {
      mergeCounts(merged, familyCounts(satId));
    });
    renderFamilyIcons(fleetIconGroupsCollapsed[parentId], merged, true);
  });

  refreshIconScale(); // apply the current zoom's fleet scale + collapse toggle immediately, not just on the next pan/zoom event
}

// ── TICK CONTROLS ─────────────────────────────────────────────────────────────
// `tick` is the DISPLAYED value everything renders from (updateScene,
// renderTimelinePanel, the camera-follow). `targetTick` is whatever the user
// just asked for -- dragging the slider, the prev/next buttons, or the
// "Corrente" reset. Rather than snapping `tick` straight to `targetTick`,
// tickAnimStep eases it there over ~1-2s via requestAnimationFrame, so every
// way of moving through time (including live slider drag) reads as one
// continuous glide instead of a jump-cut; the slider's own thumb still
// tracks the pointer natively while dragging (only the rendered scene/label
// trail behind it -- see draggingSlider below).
// How many months on either side of baseTick the timeline slider actually
// shows -- also used as the hard cap on how far a fleet-vs-fleet chase (see
// buildFleetPlan) simulates its monthly pursuit hops, since nothing past the
// slider's own max is ever rendered anyway.
const TIMELINE_WINDOW_MONTHS = 24;
let baseTick = 0;
let targetTick = 0;
let tickHoldInterval = null;
let tickAnimHandle = null;
let tickAnimLastTs = null;
let draggingSlider = false;
const TICK_EASE_TAU = 0.35; // seconds -- ~4-5 tau (1.5-2s) to visually settle
// Below this remaining gap the change is visually imperceptible (~half a
// day of in-game time) -- snap immediately rather than let the exponential
// tail keep re-running the full updateScene() DOM rebuild every frame for
// several more seconds to close a gap nobody can actually see.
const TICK_SNAP_EPS = 0.02;

const tickSlider = document.getElementById("tickSlider");

function clampTick(v) {
  v = Math.round((parseFloat(v) || 0) * 100) / 100;
  const min = parseFloat(tickSlider.min),
    max = parseFloat(tickSlider.max);
  if (!Number.isNaN(min)) v = Math.max(min, v);
  if (!Number.isNaN(max)) v = Math.min(max, v);
  return v;
}
function setTargetTick(val) {
  targetTick = clampTick(val);
  if (tickAnimHandle == null)
    tickAnimHandle = requestAnimationFrame(tickAnimStep);
}
function tickAnimStep(ts) {
  if (tickAnimLastTs == null) tickAnimLastTs = ts;
  const dt = Math.min(0.1, Math.max(0, (ts - tickAnimLastTs) / 1000)); // clamp so a backgrounded tab doesn't leap on resume
  tickAnimLastTs = ts;
  const diff = targetTick - tick;
  if (Math.abs(diff) <= TICK_SNAP_EPS) {
    tick = targetTick;
    applyTick();
    tickAnimHandle = null;
    tickAnimLastTs = null;
    return;
  }
  tick += diff * (1 - Math.exp(-dt / TICK_EASE_TAU));
  applyTick();
  tickAnimHandle = requestAnimationFrame(tickAnimStep);
}
function applyTick() {
  if (!draggingSlider) tickSlider.value = tick;
  document.querySelector("#tick-label span").textContent =
    Math.round(tick * 100) / 100;
  updateScene(tick);
  renderTimelinePanel(tick);
  applyCameraFollow();
}

// Holding prev/next steps the TARGET (not the still-easing displayed tick),
// so repeated/rapid steps accumulate predictably and the eased tick just
// keeps chasing whatever the latest target is, instead of restarting from a
// barely-moved position every 150ms.
function stepTick(delta) {
  setTargetTick(targetTick + delta * 0.03);
}
function startHold(delta) {
  stepTick(delta);
  tickHoldInterval = setInterval(() => stepTick(delta), 150);
}
function stopHold() {
  clearInterval(tickHoldInterval);
  tickHoldInterval = null;
}

const tickPrevBtn = document.getElementById("tickPrevBtn");
const tickNextBtn = document.getElementById("tickNextBtn");
tickPrevBtn.addEventListener("mousedown", () => startHold(-1));
tickNextBtn.addEventListener("mousedown", () => startHold(1));
window.addEventListener("mouseup", stopHold);
tickPrevBtn.addEventListener("mouseleave", stopHold);
tickNextBtn.addEventListener("mouseleave", stopHold);
tickPrevBtn.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    startHold(-1);
  },
  { passive: false },
);
tickNextBtn.addEventListener(
  "touchstart",
  (e) => {
    e.preventDefault();
    startHold(1);
  },
  { passive: false },
);
tickPrevBtn.addEventListener("touchend", stopHold);
tickNextBtn.addEventListener("touchend", stopHold);

tickSlider.addEventListener("input", (e) => setTargetTick(e.target.value));
tickSlider.addEventListener("mousedown", () => {
  draggingSlider = true;
});
tickSlider.addEventListener(
  "touchstart",
  () => {
    draggingSlider = true;
  },
  { passive: true },
);
window.addEventListener("mouseup", () => {
  draggingSlider = false;
});
tickSlider.addEventListener("touchend", () => {
  draggingSlider = false;
});
document
  .getElementById("resetBtn")
  .addEventListener("click", () => setTargetTick(baseTick));

function loadMap(bodies, paths, timeline, stationedFleets) {
  byId = normalise(bodies, paths);
  (stationedFleets || []).forEach((s) => {
    const body = byId[s.bodyId];
    if (body) body.fleets = Array.isArray(s.fleets) ? s.fleets : [];
  });

  // Fleet count is no longer might-derived (see the "Genera Flotta" action)
  // -- bodyIdByName is still needed by fleetHomeBodyId() to resolve a
  // fleet's own home planet.
  bodyIdByName = {};
  Object.values(byId).forEach((b) => {
    if (b && b.name) bodyIdByName[b.name.trim().toLowerCase()] = b.id;
  });

  currentMonth = (timeline && timeline.currentMonth) || 0;
  tick = currentMonth;
  targetTick = currentMonth;
  baseTick = currentMonth;
  tickSlider.min = baseTick - TIMELINE_WINDOW_MONTHS;
  tickSlider.max = baseTick + TIMELINE_WINDOW_MONTHS;
  tickSlider.step = 0.03125;
  tickSlider.value = tick;
  document.querySelector("#tick-label span").textContent = tick;
  // Solve every named fleet's order list (incl. intercepts) exactly once
  // here -- see the FLEET STATE RESOLUTION note -- rather than repeating
  // that work on every subsequent render call below and on every frame
  // thereafter.
  buildAllFleetPlans();
  buildFleetDepartureEvents();
  buildScene();
  ready = true;
  updateScene(tick);
  refreshIconScale();
  renderTimelinePanel(tick);
}

// Auto-generated "fleet X started moving to Y" lines, merged into the
// timeline panel alongside the real GM-authored events -- derived directly
// from each fleet's precomputed plan (every 'course' segment already knows
// its own solved departure month), so this can never disagree with what the
// map itself renders, and needs no re-solving as the tick moves.
let fleetDepartureEventsByMonth = {};
function buildFleetDepartureEvents() {
  fleetDepartureEventsByMonth = {};
  namedFleets.forEach((fleet) => {
    getFleetPlan(fleet, 0).segments.forEach((seg) => {
      if (seg.mode !== "course" || seg.course.isRepeatHop) return;
      const monthNum = Math.round(seg.course.startMonth);
      const text = `⚔ ${fleet.name} (${fleet.owner}) è partita verso ${targetLabel(seg.course.rawTarget)}.`;
      (fleetDepartureEventsByMonth[monthNum] =
        fleetDepartureEventsByMonth[monthNum] || []).push(text);
    });
  });
}
function fleetDepartureEventsForMonth(monthNum) {
  return fleetDepartureEventsByMonth[monthNum] || [];
}

// ── TIMELINE PANEL ───────────────────────────────────────────────────────────────
// all_info/timeline.json: { currentMonth, months: [{month, title, events:[{description,modifier}]}] }.
// One toolbar panel, one month per "page" -- two-way synced with the map's
// tick slider: dragging the slider flips the page, and the prev/next buttons
// here jump the map's tick to that whole month.
function renderTimelinePanel(currentTick) {
  const monthEl = document.getElementById("timeline-panel-month");
  if (!monthEl) return;
  const monthNum = Math.round(currentTick);
  const month = timelineByMonth[monthNum];
  const titleEl = document.getElementById("timeline-panel-title");
  const eventsEl = document.getElementById("timeline-panel-events");
  monthEl.textContent = `Mese ${monthNum}`;
  titleEl.textContent = (month && month.title) || "—";
  eventsEl.innerHTML = "";
  const realEvents = ((month && month.events) || []).filter(
    (ev) => ev.description || ev.modifier,
  );
  const autoEvents = fleetDepartureEventsForMonth(monthNum);
  if (realEvents.length === 0 && autoEvents.length === 0) {
    eventsEl.innerHTML =
      '<div class="opinion-empty">Nessun evento registrato per questo mese.</div>';
    return;
  }
  realEvents.forEach((ev) => {
    const row = document.createElement("div");
    row.className = "timeline-event-row";
    row.innerHTML = `
            ${ev.description ? `<div class="timeline-event-desc">${escHtml(ev.description)}</div>` : ""}
            ${ev.modifier ? `<div class="timeline-event-modifier">⚙ ${escHtml(ev.modifier)}</div>` : ""}`;
    eventsEl.appendChild(row);
  });
  autoEvents.forEach((text) => {
    const row = document.createElement("div");
    row.className = "timeline-event-row auto";
    row.innerHTML = `<div class="timeline-event-desc">${escHtml(text)}</div>`;
    eventsEl.appendChild(row);
  });
}
document
  .getElementById("timeline-prev-btn")
  .addEventListener("click", () => setTargetTick(Math.round(targetTick) - 1));
document
  .getElementById("timeline-next-btn")
  .addEventListener("click", () => setTargetTick(Math.round(targetTick) + 1));

// ── UNIFIED TOP TOOLBAR ────────────────────────────────────────────────────────
// One dropdown open at a time (Famiglie / Risorse & Asset / Info), replacing
// the three independently-positioned drawers from earlier iterations.
const TOOLBAR_PANELS = ["families", "resources", "info", "timeline"];
function closeAllToolbarPanels() {
  TOOLBAR_PANELS.forEach((name) => {
    document.getElementById(`${name}-panel`).classList.remove("open");
    document.getElementById(`toolbar-${name}-btn`).classList.remove("active");
  });
}
function openToolbarPanel(name) {
  closeAllToolbarPanels();
  document.getElementById(`${name}-panel`).classList.add("open");
  document.getElementById(`toolbar-${name}-btn`).classList.add("active");
}
function toggleToolbarPanel(name) {
  const isOpen = document
    .getElementById(`${name}-panel`)
    .classList.contains("open");
  if (isOpen) closeAllToolbarPanels();
  else openToolbarPanel(name);
}
TOOLBAR_PANELS.forEach((name) => {
  document
    .getElementById(`toolbar-${name}-btn`)
    .addEventListener("click", () => toggleToolbarPanel(name));
});

// ── PLANET INFO PANEL ─────────────────────────────────────────────────────────
// #info-meta lines used to be one plain textContent string (\n-joined) --
// fine while every line was inert, but named fleets parked at a body need to
// stay clickable (open that fleet's own panel) while living in this same
// "⬡ Type: / ↩ Orbits:" list, so it's now built from real DOM nodes. A line
// is either a plain string, or {prefix, parts:[{text, onClick?, color?}]}
// for a line that mixes plain text with clickable fragments.
function setInfoMeta(lines) {
  const host = document.getElementById("info-meta");
  host.innerHTML = "";
  lines.forEach((line) => {
    const row = document.createElement("div");
    if (typeof line === "string") {
      row.textContent = line;
    } else {
      row.appendChild(document.createTextNode(line.prefix));
      line.parts.forEach((part, i) => {
        if (i > 0) row.appendChild(document.createTextNode(", "));
        if (part.onClick) {
          const span = document.createElement("span");
          span.textContent = part.text;
          span.className = "owner-link";
          if (part.color) span.style.color = part.color;
          span.addEventListener("click", (e) => {
            e.stopPropagation();
            part.onClick();
          });
          row.appendChild(span);
        } else {
          row.appendChild(document.createTextNode(part.text));
        }
      });
    }
    host.appendChild(row);
  });
}

function showInfo(b) {
  document.getElementById("info-name").textContent = b.name || b.id;
  const oe = document.getElementById("info-owner");
  oe.innerHTML = "";
  oe.style.color = b.color || "#aaa";
  if (b.owner) {
    const link = document.createElement("span");
    link.textContent = `⚑ ${b.owner}`;
    link.className = "owner-link";
    link.title = "Vedi la famiglia";
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      showFamilyOverlay(b.owner);
    });
    oe.appendChild(link);
  }
  document.getElementById("info-desc").textContent = b.descr || "—";

  const metaLines = [];
  if (b.type) metaLines.push(`⬡ Type: ${b.type}`);
  const parkedNamed = namedFleetsParkedAt(b.id);
  const anonNames = b.fleets || [];
  if (anonNames.length || parkedNamed.length) {
    metaLines.push({
      prefix: "⚔ Fleets: ",
      parts: [
        ...anonNames.map((n) => ({ text: n })),
        ...parkedNamed.map((fl) => ({
          text: fl.name,
          color: familyColor(fl.owner),
          onClick: () => showFleetInfo(fl, tick),
        })),
      ],
    });
  }
  if (b.anchor) metaLines.push(`↩ Orbits: ${b.anchor}`);
  setInfoMeta(metaLines);

  renderResourceChips(b.resourceIds);
  renderFleetBonusChips(parkedNamed);
  renderComposition(b.name);
  renderLocalizedAssets(b.id);
  renderFamilyQuickView(b.owner);
  setFollowEntity(b.id === "sun" ? null : { type: "body", id: b.id });

  openToolbarPanel("info");
}

// Named fleets currently resolved (live, at the global `tick`) as parked at
// a given body -- used both for the "Flotte in orbita" chips below and to
// decide which bodies get a named-fleet icon row in updateScene().
function namedFleetsParkedAt(bodyId) {
  return namedFleets.filter((fl) => {
    const st = getFleetState(fl, tick);
    return st.mode === "body" && st.bodyId === bodyId;
  });
}

// Live distance (AU) between a fleet's resolved position and its own home
// body's current position -- the "logistics" reading, and the value
// fleetBonusActive() below gates a fleet's bonus against.
function fleetLogisticsDistanceAU(fleet, res, t) {
  const homeId = fleetHomeBodyId(fleet);
  if (!homeId || !res.position) return null;
  const homePos = computeAllPositions(t)[homeId];
  if (!homePos) return null;
  return (
    Math.hypot(res.position.x - homePos.x, res.position.y - homePos.y) /
    DIST_SCALE
  );
}

// A fleet's bonus is only in effect while it's within bonusRange AU of its
// own home body (no bonusRange declared -- from its own JSON or its
// archetype -- -> always active, no gating). See resolveFleetDefaults().
function fleetBonusActive(fleet, res, t) {
  const bonusRange = resolveFleetDefaults(fleet).bonusRange;
  if (bonusRange == null) return true;
  const distAU = fleetLogisticsDistanceAU(fleet, res, t);
  return distAU != null && distAU <= bonusRange;
}

// Named fleets parked at a body show up here as clickable chips (name +
// owner color, bonus text + live active/inactive readout in the hover
// tooltip) -- appended alongside renderResourceChips() in the same
// #info-bonuses host rather than a new container, same "informational only"
// treatment as a resource chip.
function renderFleetBonusChips(fleetsHere) {
  const host = document.getElementById("info-bonuses");
  if (!fleetsHere || fleetsHere.length === 0) return;
  host.style.display = "flex";
  fleetsHere.forEach((fleet) => {
    const res = getFleetState(fleet, tick);
    const { bonus, bonusRange } = resolveFleetDefaults(fleet);
    const active = fleetBonusActive(fleet, res, tick);
    const distAU = fleetLogisticsDistanceAU(fleet, res, tick);
    const chip = document.createElement("div");
    chip.className = "trait-chip" + (active ? "" : " locked");
    chip.style.borderColor = familyColor(fleet.owner);
    chip.textContent = `⚔ ${fleet.name}`;
    const tip = document.createElement("div");
    tip.className = "trait-tooltip";
    const bonusText = bonus
      ? `${fleet.owner}: ${bonus}`
      : `Flotta di ${fleet.owner}, nessun bonus dichiarato.`;
    const statusText =
      bonusRange == null
        ? ""
        : active
          ? `✅ Bonus attivo (${distAU.toFixed(1)}/${bonusRange} UA dalla base)`
          : `⛔ Bonus inattivo (fuori raggio: ${distAU != null ? distAU.toFixed(1) : "?"}/${bonusRange} UA dalla base)`;
    tip.innerHTML = `<div>${escHtml(bonusText)}</div>${statusText ? `<div class="modline">${escHtml(statusText)}</div>` : ""}`;
    chip.appendChild(tip);
    chip.addEventListener("click", (e) => {
      e.stopPropagation();
      showFleetInfo(fleet, tick);
    });
    host.appendChild(chip);
  });
}

// Top 3 races + top 3 religions for a body (all_info/diplomacy.json), when
// that body's name matches one of the 20 planets with composition data.
// Moons/bases/points without a matching entry just hide the section.
function renderComposition(bodyName) {
  const host = document.getElementById("info-composition");
  const raceComp = planetRaceComposition[bodyName];
  const religionComp = planetReligionComposition[bodyName];
  if (!raceComp && !religionComp) {
    host.innerHTML = "";
    host.style.display = "none";
    return;
  }
  host.style.display = "block";
  const raceRows = topComposition(raceComp)
    .map(
      ([n, p]) => `<span class="composition-pill">${p}% ${escHtml(n)}</span>`,
    )
    .join("");
  const religionRows = topComposition(religionComp)
    .map(
      ([n, p]) => `<span class="composition-pill">${p}% ${escHtml(n)}</span>`,
    )
    .join("");
  host.innerHTML = `
        ${raceRows ? `<div class="composition-row"><span class="composition-label">Popolazione</span>${raceRows}</div>` : ""}
        ${religionRows ? `<div class="composition-row"><span class="composition-label">Religione</span>${religionRows}</div>` : ""}`;
}

// Every resource/property a body has (all_info/resources.json) is inert by
// itself -- it only gates which craftable assets a controlling family can
// use. Shown as chips (name, colored by category) with the list of
// craftAssets it's an ingredient for in the hover tooltip, so the
// resource-vs-asset split is visible in the UI itself. Same place also feeds
// the Resources & Assets panel.
function renderResourceChips(resourceIds) {
  const host = document.getElementById("info-bonuses");
  host.innerHTML = "";
  if (!resourceIds || resourceIds.length === 0) {
    host.style.display = "none";
    return;
  }
  host.style.display = "flex";
  resourceIds.forEach((rid) => {
    const res = resourcesById[rid];
    if (!res) return;
    const cat = resConfig.find((rc) => rc.key === res.category);
    const chip = document.createElement("div");
    chip.className = "trait-chip";
    chip.style.borderColor = (cat && cat.color) || undefined;
    chip.textContent = `${(cat && cat.icon) || ""} ${res.name}`;
    const tip = document.createElement("div");
    tip.className = "trait-tooltip";
    const usedBy = craftData
      .filter((a) => (a.requirementIds || []).includes(rid))
      .map((a) => a.name);
    tip.textContent = usedBy.length
      ? `Ingrediente per: ${usedBy.join(", ")}`
      : "Nessun asset craftabile registrato per questa risorsa.";
    chip.appendChild(tip);
    host.appendChild(chip);
  });
}

function showPathInfo(path, totalLen) {
  document.getElementById("info-name").textContent =
    path.name || path.ids.join(" → ");
  const oe = document.getElementById("info-owner");
  oe.innerHTML = "";
  oe.style.color = path.color || "#aaa";
  if (path.owner) {
    const link = document.createElement("span");
    link.textContent = `⚑ ${path.owner}`;
    link.className = "owner-link";
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      showFamilyOverlay(path.owner);
    });
    oe.appendChild(link);
  }
  document.getElementById("info-desc").textContent = path.descr || "—";
  let meta = "";
  meta += `⬡ Type: ${path.type}\n`;
  meta += `→ Route: ${path.ids.join(" → ")}`;
  document.getElementById("info-meta").textContent = meta;
  renderResourceChips(null);
  renderComposition(null);
  renderLocalizedAssets(null);
  renderFamilyQuickView(path.owner);
  setFollowEntity(null); // trade lanes are static -- nothing here to track across time
  openToolbarPanel("info");
}

// ── FLEET INFO PANEL ──────────────────────────────────────────────────────────
// Shown for a named fleet's own map token (only rendered while it's in
// transit, holding at a bare rendezvous point, or ghosted/disabled -- see
// updateScene()); reuses the same shared #info-panel showPathInfo does.
function showFleetInfo(fleet, t) {
  const res = getFleetState(fleet, t);
  document.getElementById("info-name").textContent = fleet.name || fleet.id;
  const oe = document.getElementById("info-owner");
  oe.innerHTML = "";
  const ownerColor = familyColor(fleet.owner);
  oe.style.color = ownerColor;
  if (fleet.owner) {
    const link = document.createElement("span");
    link.textContent = `⚑ ${fleet.owner}`;
    link.className = "owner-link";
    link.addEventListener("click", (e) => {
      e.stopPropagation();
      showFamilyOverlay(fleet.owner);
    });
    oe.appendChild(link);
  }
  const defaults = resolveFleetDefaults(fleet);
  document.getElementById("info-desc").textContent = defaults.bonus || "—";

  let meta = `⬡ Flotta nominata\n`;
  meta += `⚡ Velocità: ${defaults.speed} UA/mese\n`;
  meta += `↔ Distanza massima per ordine: ${defaults.maxDistance != null ? defaults.maxDistance + " UA" : "illimitata"}\n`;
  const distAU = fleetLogisticsDistanceAU(fleet, res, t);
  if (distAU != null) {
    meta += `📡 Logistica: ${distAU.toFixed(1)} UA dalla base\n`;
    if (defaults.bonusRange != null) {
      const active = fleetBonusActive(fleet, res, t);
      meta += `${active ? "✅" : "⛔"} Bonus ${active ? "attivo" : "inattivo"} (raggio: ${defaults.bonusRange} UA)\n`;
    }
  }
  if (res.mode === "transit") {
    meta += `➤ In rotta verso: ${targetLabel(res.course.rawTarget)}\n`;
    meta += `⏱ Arrivo previsto: mese ${res.course.etaMonth.toFixed(1)}`;
  } else if (res.mode === "disabled") {
    meta += `⏸ Flotta disabilitata`;
  } else if (res.mode === "body" && res.bodyId) {
    meta += `📍 In stazionamento su ${byId[res.bodyId] ? byId[res.bodyId].name : res.bodyId}`;
  } else {
    meta += `📍 In posizione fissa`;
  }
  if (res.pending)
    meta += `\n⏳ In attesa di una finestra di lancio verso ${targetLabel(res.pending.rawTarget)} — partenza prevista mese ${res.pending.departureMonth.toFixed(1)}`;
  if (res.errors && res.errors.length)
    meta += `\n⚠ ${res.errors.map((e) => e.message).join(" | ")}`;
  document.getElementById("info-meta").textContent = meta;

  renderResourceChips(null);
  renderComposition(null);
  renderLocalizedAssets(null);
  renderFamilyQuickView(fleet.owner);
  setFollowEntity({ type: "fleet", fleet });
  openToolbarPanel("info");
}

// Compact family preview shown inline right under a planet/path's own info, so
// a single click on the map surfaces both "what is this place" and "who runs
// it" together — "Espandi" opens the full empire-screen overlay on demand.
function renderFamilyQuickView(ownerName) {
  const host = document.getElementById("info-family-quickview");
  host.innerHTML = "";
  if (!ownerName) {
    host.style.display = "none";
    return;
  }
  ownerName = canonicalFamilyName(ownerName);
  host.style.display = "block";

  const company = companiesByName[ownerName];

  const header = document.createElement("div");
  header.className = "quickview-header";
  const crestFile =
    CREST_OVERRIDES[ownerName] || `${ownerName.replace(/\s+/g, "")}Icon.png`;
  const crest = document.createElement("img");
  crest.className = "quickview-crest";
  crest.style.borderColor = familyColor(ownerName);
  crest.src = `images/symbols/${crestFile}`;
  crest.alt = ownerName;
  crest.onerror = () => {
    crest.onerror = null;
    crest.src = "images/court/Position Empty.webp";
  };
  header.appendChild(crest);

  const textCol = document.createElement("div");
  const nameEl = document.createElement("div");
  nameEl.className = "quickview-name";
  nameEl.textContent = ownerName;
  textCol.appendChild(nameEl);
  const govEl = document.createElement("div");
  govEl.className = "quickview-gov";
  govEl.textContent = company
    ? company.government || ""
    : "Entità indipendente";
  textCol.appendChild(govEl);
  header.appendChild(textCol);
  host.appendChild(header);

  if (company) {
    const statsMini = document.createElement("div");
    statsMini.className = "quickview-stats";
    STAT_KEYS.forEach((k) => {
      const pill = document.createElement("span");
      pill.className = "quickview-stat-pill";
      if (statKnown(ownerName, k)) {
        pill.textContent = `${STAT_LABELS[k].slice(0, 3)} ${company[k] || 0}`;
      } else {
        pill.classList.add("locked");
        pill.textContent = `${STAT_LABELS[k].slice(0, 3)} 🔒`;
      }
      statsMini.appendChild(pill);
    });
    host.appendChild(statsMini);
  }

  const expandBtn = document.createElement("button");
  expandBtn.className = "quickview-expand";
  expandBtn.textContent = "Espandi ▸";
  expandBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showFamilyOverlay(ownerName);
  });
  host.appendChild(expandBtn);
}

// ── FAMILY / EMPIRE SCREEN OVERLAY ────────────────────────────────────────────
const STAT_KEYS = [
  "might",
  "treasure",
  "influence",
  "territory",
  "sovereignty",
];
const STAT_LABELS = {
  might: "Might",
  treasure: "Treasure",
  influence: "Influence",
  territory: "Territory",
  sovereignty: "Sovereignty",
};

// A handful of family names don't match their crest filename 1:1 (e.g. "La
// Mano" ships as HandIcon.png, an in-fiction translation) — override those,
// default to "<NameNoSpaces>Icon.png" for everyone else.
const CREST_OVERRIDES = { "La Mano": "HandIcon.png" };

// The map data spells a couple of owners differently than companies.json
// (same in-fiction naming inconsistency as La Mano/Hand above) — canonicalize
// before any companiesByName/ownerColors lookup.
const OWNER_NAME_ALIASES = { Heretics: "Eretici" };
function canonicalFamilyName(name) {
  return OWNER_NAME_ALIASES[name] || name;
}

function renderInfiltrationBar(name) {
  const host = document.getElementById("family-infiltration");
  host.innerHTML = "";
  const { known, total, pct } = familyKnowledgeSummary(name);
  const label = document.createElement("div");
  label.className = "infiltration-label";
  label.textContent = `Conoscenza: ${known}/${total} (${pct}%)`;
  host.appendChild(label);
  const bar = document.createElement("div");
  bar.className = "infiltration-bar";
  for (let i = 1; i <= total; i++) {
    const seg = document.createElement("div");
    seg.className = "infiltration-seg" + (i <= known ? " filled" : "");
    bar.appendChild(seg);
  }
  host.appendChild(bar);
  if (total > 0 && known >= total) {
    const badge = document.createElement("div");
    badge.className = "full-knowledge-badge";
    badge.textContent = "🎲 Conoscenza Piena";
    badge.title =
      "I giocatori conoscono tutto ciò che è tracciato su questa famiglia: i tiri vengono ora dichiarati apertamente.";
    host.appendChild(badge);
  }
}

function showFamilyOverlay(name) {
  name = canonicalFamilyName(name);
  currentOverlayFamily = name;
  const overlay = document.getElementById("family-overlay");
  const company = companiesByName[name];
  const accent = familyColor(name);
  document
    .getElementById("family-overlay-panel")
    .style.setProperty("--family-accent", accent);

  document.getElementById("family-name").textContent = name;
  const mottoEl = document.getElementById("family-motto");
  mottoEl.textContent = company && company.motto ? `"${company.motto}"` : "";
  mottoEl.style.display = company && company.motto ? "block" : "none";
  const crestEl = document.getElementById("family-crest");
  const crestFile =
    CREST_OVERRIDES[name] || `${name.replace(/\s+/g, "")}Icon.png`;
  crestEl.src = `images/symbols/${crestFile}`;
  crestEl.alt = name;
  crestEl.onerror = () => {
    crestEl.onerror = null;
    crestEl.src = "images/court/Position Empty.webp";
  };

  const statsRow = document.getElementById("family-stats-row");
  const govEl = document.getElementById("family-government");
  const planetEl = document.getElementById("family-planet");
  const historyEl = document.getElementById("family-history");
  const descEl = document.getElementById("family-description");
  const infilHost = document.getElementById("family-infiltration");
  statsRow.innerHTML = "";
  descEl.innerHTML = "";
  historyEl.textContent = (company && company.description) || "";
  historyEl.style.display = company && company.description ? "block" : "none";

  const fleetWarningEl = document.getElementById("family-fleet-warning");
  if (!company) {
    infilHost.innerHTML = "";
    govEl.textContent = "Entità indipendente";
    planetEl.textContent = "";
    fleetWarningEl.style.display = "none";
  } else {
    renderInfiltrationBar(name);
    planetEl.textContent = company.planet ? `Sede: ${company.planet}` : "";
    govEl.textContent = company.government || "";

    // Surface any named fleet whose latest order is unreachable within
    // the intercept solver's search horizon (target unresolved, or no
    // in-range launch window ever found -- see buildFleetPlan) right
    // here. Fleet count itself is no longer might-capped.
    const warnings = [];
    namedFleets
      .filter((fl) => fl.owner === name)
      .forEach((fl) => {
        (getFleetState(fl, tick).errors || []).forEach((e) =>
          warnings.push(`⚠ ${fl.name}: ${e.message}`),
        );
      });
    if (warnings.length) {
      fleetWarningEl.innerHTML = warnings
        .map((w) => `<div>${escHtml(w)}</div>`)
        .join("");
      fleetWarningEl.style.display = "block";
    } else {
      fleetWarningEl.style.display = "none";
    }

    const govDef = governiByName[company.government];
    const caps = govDef ? govDef.statistiche : null;

    // Hover the government name for its short description + both special
    // effects (governi.json already has everything needed for this).
    govEl.querySelectorAll(".trait-tooltip").forEach((e) => e.remove());
    if (govDef) {
      govEl.style.position = "relative";
      const tip = document.createElement("div");
      tip.className = "trait-tooltip";
      tip.innerHTML =
        `<div>${escHtml(govDef.nome_italiano || "")}</div>` +
        (govDef.effetti_speciali || [])
          .map(
            (fx) =>
              `<div class="modline"><strong>${escHtml(fx.nome)}</strong> — ${escHtml(fx.descrizione)}</div>`,
          )
          .join("");
      govEl.appendChild(tip);
    }

    STAT_KEYS.forEach((k) => {
      const card = document.createElement("div");
      card.className = "family-stat";
      if (!statKnown(name, k)) {
        card.classList.add("locked");
        card.innerHTML = `<div class="family-stat-label">${STAT_LABELS[k]}</div>`;
        card.appendChild(
          lockedBadge("I giocatori non conoscono ancora questo valore"),
        );
        statsRow.appendChild(card);
        return;
      }
      const value = company[k] || 0;
      const cap = caps ? caps[STAT_LABELS[k]] || 7 : 7;
      // Current can exceed the government's cap -- shown as-is, only the
      // bar fill itself stays visually capped at 100%.
      const pct = Math.max(
        0,
        Math.min(100, (value / Math.max(cap, value, 1)) * 100),
      );
      card.innerHTML = `
                <div class="family-stat-label">${STAT_LABELS[k]}</div>
                <div class="family-stat-value">${value} <span class="family-stat-cap">(${cap})</span></div>
                <div class="family-stat-bar"><div class="family-stat-bar-fill" style="width:${pct}%"></div></div>`;
      statsRow.appendChild(card);
    });

    if (STAT_KEYS.every((k) => statKnown(name, k))) {
      const statObj = {};
      STAT_KEYS.forEach((k) => {
        statObj[STAT_LABELS[k]] = company[k] || 0;
      });
      descEl.textContent = generateFamilyDescription(statObj);
    } else {
      descEl.appendChild(lockedBadge());
      descEl.appendChild(
        document.createTextNode(
          " Serve profilare tutte le statistiche per capire il carattere attuale di questa famiglia.",
        ),
      );
    }
  }

  renderLeaders(name);
  renderActiveBonuses(name);
  renderResourceSummary(name);
  renderFleetLocations(name);
  renderTerritories(name);
  renderFamilyTreaties(name);
  renderAssets(name);
  renderOpinions(name);

  overlay.classList.add("open");
}

const TERRITORY_TYPE_ICON = {
  planet: "🪐",
  moon: "🌙",
  base: "🛰",
  point: "📍",
};
function renderTerritories(name) {
  const list = document.getElementById("family-territories-list");
  list.innerHTML = "";
  const territories = familyTerritories(name);
  if (territories.length === 0) {
    list.innerHTML = '<div class="opinion-empty">Nessun territorio noto.</div>';
    return;
  }
  territories
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .forEach((b) => {
      const row = document.createElement("div");
      row.className = "territory-row";
      const resCount = (b.resourceIds || []).length;
      row.innerHTML = `
                <span class="territory-icon">${TERRITORY_TYPE_ICON[b.type] || "⬡"}</span>
                <span class="territory-name">${escHtml(b.name)}</span>
                <span class="territory-type">${escHtml(b.type || "")}</span>
                ${resCount ? `<span class="territory-res-count">${resCount} risorse</span>` : ""}`;
      row.addEventListener("click", () => {
        closeFamilyOverlay();
        focusOnBody(b.id);
        showInfo(b);
      });
      list.appendChild(row);
    });
}

// "Risorse Controllate": every resource the family controls anywhere,
// deduped and grouped by category (same resConfig buckets/colors as the
// per-planet resource chips) -- hovering a chip lists which owned body/
// bodies it comes from, reusing the same viewport-clamped tooltip
// mechanism (the chip gets the .trait-chip class, already covered by
// TOOLTIP_HOST_SELECTOR).
function renderResourceSummary(name) {
  const host = document.getElementById("family-resources-summary");
  const byCategory = familyResourceSummary(name);
  const cats = Object.keys(byCategory);
  if (cats.length === 0) {
    host.innerHTML =
      '<div class="opinion-empty">Nessuna risorsa controllata.</div>';
    return;
  }
  host.innerHTML = resConfig
    .filter((rc) => byCategory[rc.key])
    .map(
      (rc) => `
            <div class="resource-summary-group">
                <div class="resource-summary-label" style="color:${rc.color}">${rc.icon} ${escHtml(rc.label)}</div>
                <div class="resource-summary-chips">
                    ${byCategory[rc.key]
                      .map(
                        ({ res, bodies }) => `
                        <div class="trait-chip" style="border-color:${rc.color}">
                            ${escHtml(res.name)}
                            <div class="trait-tooltip">${escHtml(bodies.join(", "))}</div>
                        </div>`,
                      )
                      .join("")}
                </div>
            </div>`,
    )
    .join("");
}

// "Flotte": anonymous stationed-by-planet counts (byId already folds in the
// auto-fill-at-home default, so this matches what's actually drawn on the
// map) plus one row per NAMED fleet this family owns, showing its live
// status (parked/in transit/disabled) resolved via getFleetState().
// Rows are clickable, same jump-to-map pattern as renderTerritories().
function renderFleetLocations(name) {
  const host = document.getElementById("family-fleet-locations");
  const { stationed } = familyFleetLocations(name);
  const named = namedFleets
    .filter((fl) => fl.owner === name)
    .map((fl) => ({ fleet: fl, state: getFleetState(fl, tick) }));
  if (stationed.length === 0 && named.length === 0) {
    host.innerHTML =
      '<div class="opinion-empty">Nessuna flotta rilevata.</div>';
    return;
  }
  const stationedHtml = stationed
    .map(
      ({ body, count }) => `
        <div class="fleet-row" data-body="${escHtml(body.id)}">
            <span class="fleet-icon">🛰</span>
            <span class="fleet-location">${escHtml(body.name)}</span>
            <span class="fleet-count">${count} flott${count === 1 ? "a" : "e"}</span>
        </div>`,
    )
    .join("");
  const namedHtml = named
    .map(({ fleet, state }, i) => {
      let icon, statusText;
      if (state.mode === "transit") {
        icon = "⚔";
        statusText = `→ ${targetLabel(state.course.rawTarget)}, arrivo mese ${state.course.etaMonth.toFixed(1)}`;
      } else if (state.mode === "disabled") {
        icon = "⏸";
        statusText = "Disabilitata";
      } else if (state.mode === "body" && state.bodyId) {
        icon = "🛰";
        statusText = `In stazionamento su ${(byId[state.bodyId] && byId[state.bodyId].name) || state.bodyId}`;
      } else {
        icon = "📍";
        statusText = "In posizione fissa";
      }
      if (state.pending)
        statusText += ` — ⏳ attesa finestra verso ${targetLabel(state.pending.rawTarget)}, mese ${state.pending.departureMonth.toFixed(1)}`;
      const errBadge = state.errors && state.errors.length ? " ⚠" : "";
      return `
            <div class="fleet-row" data-named-idx="${i}">
                <span class="fleet-icon">${icon}</span>
                <span class="fleet-location">${escHtml(fleet.name)}${errBadge}</span>
                <span class="fleet-count">${escHtml(statusText)}</span>
            </div>`;
    })
    .join("");
  host.innerHTML = `
        ${stationed.length ? `<h3 class="family-subsection-label">In stazionamento (anonime)</h3>${stationedHtml}` : ""}
        ${named.length ? `<h3 class="family-subsection-label">Flotte nominate</h3>${namedHtml}` : ""}`;

  host.querySelectorAll(".fleet-row[data-body]").forEach((row) => {
    row.addEventListener("click", () => {
      const id = row.dataset.body;
      closeFamilyOverlay();
      focusOnBody(id);
      showInfo(byId[id]);
    });
  });
  host.querySelectorAll(".fleet-row[data-named-idx]").forEach((row) => {
    row.addEventListener("click", () => {
      const { fleet, state } = named[Number(row.dataset.namedIdx)];
      closeFamilyOverlay();
      if (state.position) {
        vb.x = state.position.x - vb.w / 2;
        vb.y = state.position.y - vb.h / 2;
        applyVB();
      }
      showFleetInfo(fleet, tick);
    });
  });
}

// "Trattati": every treaty this family currently holds, with who -- plain
// clickable list (treatiesByFamily is otherwise only consumed internally
// for opinion/modifier computation, never rendered on its own).
function renderFamilyTreaties(name) {
  const host = document.getElementById("family-treaties-list");
  const treaties = treatiesByFamily[name] || [];
  if (treaties.length === 0) {
    host.innerHTML =
      '<div class="opinion-empty">Nessun trattato in essere.</div>';
    return;
  }
  host.innerHTML = treaties
    .map((t, i) => {
      const { base } = baseTreatyType(t.type);
      const info = treatyTypesByName[base];
      return `
            <div class="treaty-row" data-idx="${i}">
                <span class="treaty-type">${escHtml(t.type)}</span>
                <span class="treaty-partner">con ${escHtml(t.to)}</span>
                ${info ? `<div class="trait-tooltip">${escHtml(info.description)}</div>` : ""}
            </div>`;
    })
    .join("");
  host.querySelectorAll(".treaty-row").forEach((row, i) => {
    row.addEventListener("click", () => showFamilyOverlay(treaties[i].to));
  });
}

// Family overlay "Asset" section: auto-computed craftable assets this family
// currently qualifies for (all_info/assets.json's craftAssets, same
// qualification logic as the global Craftable tab) plus any one-of-a-kind
// assets unique to this family (assets.json's familyAssets, e.g. heirlooms).
function renderAssets(name) {
  const craftHost = document.getElementById("family-craftable-list");
  const uniqueHost = document.getElementById("family-unique-assets-list");

  const craftable = familyCraftableAssets(name);
  craftHost.innerHTML =
    craftable.length === 0
      ? '<div class="opinion-empty">Nessun asset craftabile con le risorse attuali.</div>'
      : craftable
          .map((a) => {
            const reqPills = (a.requirementIds || [])
              .map((rid) => {
                const res = resourcesById[rid];
                return `<span class="craft-req-pill">${escHtml((res && res.name) || rid)}</span>`;
              })
              .join("");
            return `
                <div class="family-asset-item">
                    <div class="family-asset-header">
                        <span class="family-asset-name">${escHtml(a.name || "—")}</span>
                        <span class="family-asset-type">${escHtml(a.type || "")}</span>
                    </div>
                    <div class="family-asset-desc">${escHtml(a.description || "")}</div>
                    <div class="craft-req-list">${reqPills}</div>
                </div>`;
          })
          .join("");

  // Treaty-granted assets (unique-category treaties, e.g. Supporto Arcano
  // -> "Maghi di Ion") have no fixed owner in assets.json -- multiple
  // families can hold the same treaty type at once, so whoever currently
  // has the treaty gets the asset, resolved here rather than pinned to a
  // static owner.
  const treatyGranted = (treatiesByFamily[name] || [])
    .map((t) => {
      const { base } = baseTreatyType(t.type);
      const info = treatyTypesByName[base];
      return info && info.grantsAsset
        ? { ...info.grantsAsset, _via: t.type, _with: t.to }
        : null;
    })
    .filter(Boolean);

  const unique = [...(familyAssetsByOwner[name] || []), ...treatyGranted];
  if (!assetsKnown(name)) {
    uniqueHost.innerHTML =
      '<div class="opinion-empty locked">🔒 I giocatori non hanno ancora scoperto gli asset unici di questa famiglia.</div>';
    return;
  }
  uniqueHost.innerHTML =
    unique.length === 0
      ? '<div class="opinion-empty">Nessun asset unico registrato.</div>'
      : unique
          .map(
            (a) => `
            <div class="family-asset-item unique">
                <div class="family-asset-header">
                    <span class="family-asset-name">${escHtml(a.name || "—")}</span>
                    <span class="family-asset-type">${escHtml(a.type || "")}</span>
                </div>
                ${a._via ? `<div class="family-asset-via">Da ${escHtml(a._via)} con ${escHtml(a._with)}</div>` : ""}
                <div class="family-asset-desc">${escHtml(a.description || "")}</div>
                ${a.effect ? `<div class="family-asset-effect">✦ ${escHtml(a.effect)}</div>` : ""}
            </div>`,
          )
          .join("");
}

// Planet info panel: assets tied to this specific place (all_info/assets.json's
// localizedAssets), shown regardless of who currently owns it -- unlike
// family assets, these follow the place if it's ever conquered.
function renderLocalizedAssets(bodyId) {
  const host = document.getElementById("info-localized-assets");
  if (!host) return;
  const list = (bodyId && localizedAssetsByBody[bodyId]) || [];
  if (list.length === 0) {
    host.innerHTML = "";
    host.style.display = "none";
    return;
  }
  host.style.display = "block";
  host.innerHTML = list
    .map(
      (a) => `
        <div class="family-asset-item">
            <div class="family-asset-header">
                <span class="family-asset-name">${escHtml(a.name || "—")}</span>
                <span class="family-asset-type">${escHtml(a.type || "")}</span>
            </div>
            <div class="family-asset-desc">${escHtml(a.description || "")}</div>
            ${a.effect ? `<div class="family-asset-effect">✦ ${escHtml(a.effect)}</div>` : ""}
        </div>`,
    )
    .join("");
}

function renderLeaders(name) {
  const row = document.getElementById("family-leaders-row");
  row.innerHTML = "";
  const leaders = leadersByFamily[name] || [];
  for (let i = 0; i < 3; i++) {
    const leader = leaders[i];
    if (!leader) {
      const card = document.createElement("div");
      card.className = "leader-card empty";
      card.textContent = "Posizione vacante";
      row.appendChild(card);
      continue;
    }
    const card = document.createElement("div");
    card.className = "leader-card";
    const img = document.createElement("img");
    img.className = "leader-portrait";
    img.src = leader.portrait;
    img.alt = leader.name;
    img.onerror = () => {
      img.onerror = null;
      img.src = "images/court/Position Empty.webp";
    };
    card.appendChild(img);
    const nameEl = document.createElement("div");
    nameEl.className = "leader-name";
    nameEl.textContent = leader.name;
    card.appendChild(nameEl);
    const roleEl = document.createElement("div");
    roleEl.className = "leader-role";
    roleEl.textContent = leader.role || "";
    card.appendChild(roleEl);
    const traitsEl = document.createElement("div");
    traitsEl.className = "leader-traits";
    (leader.traits || []).forEach((traitId, traitIdx) => {
      const trait = traitsById[traitId];
      if (!trait) return;
      if (!leaderTraitKnown(name, leader.role, traitIdx)) {
        const chip = document.createElement("div");
        chip.className = "trait-chip locked";
        chip.textContent = "🔒 ???";
        chip.title = "I giocatori non hanno ancora scoperto questo tratto";
        traitsEl.appendChild(chip);
        return;
      }
      const chip = document.createElement("div");
      chip.className = "trait-chip";
      chip.textContent = trait.label;
      const tip = document.createElement("div");
      tip.className = "trait-tooltip";
      tip.innerHTML =
        `<div>${escHtml(trait.description || "")}</div>` +
        (trait.modifiers || []).map(formatModifierLine).join("");
      chip.appendChild(tip);
      traitsEl.appendChild(chip);
    });
    card.appendChild(traitsEl);
    row.appendChild(card);
  }
}

// A modifier binds to exactly one of stat/action/armies. `armies`-kind
// modifiers (e.g. bonus Deployment Points) must display like any other but
// must NEVER feed a dice roll -- parser.js/script.js already only ever read
// m.stat/m.action when building the roll checklist, so an armies-only
// modifier is naturally excluded there; this is purely the display side.
function modifierLabel(m) {
  return m.stat || m.action || m.armies || "";
}
function formatModifierLine(m) {
  const isArmies = !!m.armies;
  const sign = typeof m.amount === "number" && m.amount > 0 ? "+" : "";
  const marker = isArmies ? "⚔ " : "";
  return `<div class="modline${isArmies ? " armies-mod" : ""}">${marker}${sign}${escHtml(m.amount)} ${escHtml(modifierLabel(m))} — ${escHtml(m.situation || "Always")}</div>`;
}

// Mirrors script.js's `actions` object (the canonical 9-action list) so
// this page can group modifiers by which roll they'd actually apply to,
// without loading script.js itself (this page has no dice-roll UI of its
// own). Keep in sync if the action list or its rolled stats ever change.
const ACTION_ROLLS = {
  Attacco: ["might", "treasure"],
  Difesa: ["might", "territory"],
  Spionaggio: ["influence", "treasure"],
  Controspionaggio: ["influence", "territory"],
  "Controllo dell'Ordine": ["might", "sovereignty"],
  "Guerra Non Convenzionale (richiede un leader)": ["influence", "might"],
  "Raccolta Informazioni": ["influence", "sovereignty"],
  "Aumento Stat": [
    "might",
    "sovereignty",
    "influence",
    "territory",
    "treasure",
  ],
  Diplomazia: ["influence", "treasure"],
};

// Buckets every modifier entry by which action(s) it could apply to: an
// action-bound modifier goes only under its exact action; a stat-bound one
// goes under every action that rolls that stat (or every action if
// stat === "all") -- so an always-on modifier is intentionally repeated
// under each action it's relevant to, matching how a GM would actually
// look this up ("what applies if I declare Attacco?"). armies-kind
// modifiers never apply to any roll, so they're collected separately.
function groupModifiersByAction(mods) {
  const groups = {};
  Object.keys(ACTION_ROLLS).forEach((action) => {
    groups[action] = [];
  });
  const nonRoll = [];
  mods.forEach((entry) => {
    const m = entry.modifier;
    if (m.armies) {
      nonRoll.push(entry);
      return;
    }
    if (m.action) {
      // A handful of trait actions are war-reason-qualified variants
      // of a base action ("Attacco (Conquista)", "Attacco
      // (Umiliazione)") rather than one of the 9 standardized names
      // verbatim -- strip the "(...)" qualifier to find the base
      // action to bucket under; the qualifier itself stays visible in
      // the rendered line via modifierLabel(m).
      const baseAction = m.action.replace(/\s*\(.*\)\s*$/, "");
      const target = groups[m.action]
        ? m.action
        : groups[baseAction]
          ? baseAction
          : null;
      if (target) groups[target].push(entry);
      else nonRoll.push(entry);
      return;
    }
    const stat = (m.stat || "").toLowerCase();
    Object.entries(ACTION_ROLLS).forEach(([action, rolls]) => {
      if (stat === "all" || rolls.includes(stat)) groups[action].push(entry);
    });
  });
  return { groups, nonRoll };
}

// "Bonus Attivi": every currently-active modifier from every source
// (leader traits, treaties, assets), grouped by which of the 9 standardized
// actions it would apply to -- so "what bonuses do I have if I declare
// Attacco?" is a single glance, not a hunt through a by-source list. Each
// line keeps its source (Leader/Trattato/Asset) as a small tag. Stat bars
// above stay showing only raw companies.json values -- see
// familyActiveModifiers().
// "Bonus Attivi" is GM-facing table info (the actual dice-roll modifiers a
// family has), not something players should see regardless of how much
// they've discovered about a family -- so the whole section only renders
// while the maintainer's GM-mode toggle (Ctrl+Shift+G) is on.
function renderActiveBonuses(name) {
  const section = document.getElementById("family-bonuses-section");
  if (section) section.style.display = devRevealAll ? "" : "none";
  if (!devRevealAll) return;
  const host = document.getElementById("family-active-bonuses");
  if (!host) return;
  const mods = familyActiveModifiers(name);
  if (mods.length === 0) {
    host.innerHTML =
      '<div class="opinion-empty">Nessun bonus attivo registrato.</div>';
    return;
  }
  const { groups, nonRoll } = groupModifiersByAction(mods);
  const renderRows = (list) =>
    list
      .map(
        ({ source, modifier }) => `
        <div class="active-bonus-row${modifier.armies ? " armies-mod" : ""}">
            <span class="active-bonus-source">${escHtml(source)}</span>
            <span class="active-bonus-line">${formatModifierLine(modifier)}</span>
        </div>`,
      )
      .join("");

  const sections = Object.entries(groups)
    .filter(([, list]) => list.length > 0)
    .map(
      ([action, list]) => `
            <div class="active-bonus-group">
                <h3 class="family-subsection-label">${escHtml(action)}</h3>
                ${renderRows(list)}
            </div>`,
    );

  if (nonRoll.length > 0) {
    sections.push(`
            <div class="active-bonus-group">
                <h3 class="family-subsection-label">Altri bonus (non legati a un tiro)</h3>
                ${renderRows(nonRoll)}
            </div>`);
  }

  host.innerHTML = sections.length
    ? sections.join("")
    : '<div class="opinion-empty">Nessun bonus attivo registrato.</div>';
}

// ── DIPLOMATIC BASELINE (all_info/diplomacy.json) ────────────────────────────
// Every pair of families has an always-on baseline opinion, independent of
// any curated treaty: government-type compatibility (fixed lookup) + a
// population-weighted average over the race compatibility matrix + the same
// over the religion compatibility matrix, using each family's home planet's
// composition. All three matrices are symmetric, so the baseline is the same
// in both directions -- it's added on top of (not instead of) opinions.json's
// curated per-pair modifiers.
function topComposition(compObj, n = 3) {
  return Object.entries(compObj || {})
    .filter(([, pct]) => pct > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
}
function weightedCompatibility(matrix, compA, compB) {
  if (!compA || !compB) return 0;
  const sumA = Object.values(compA).reduce((s, v) => s + v, 0) || 1;
  const sumB = Object.values(compB).reduce((s, v) => s + v, 0) || 1;
  let total = 0;
  for (const [raceA, pctA] of Object.entries(compA)) {
    if (!pctA) continue;
    const fracA = pctA / sumA;
    const row = matrix[raceA];
    if (!row) continue;
    for (const [raceB, pctB] of Object.entries(compB)) {
      if (!pctB) continue;
      total += fracA * (pctB / sumB) * (row[raceB] ?? 0);
    }
  }
  return total;
}
// Same weighted-average math as weightedCompatibility(), but returns the
// individual (raceA, raceB) contributions instead of just their sum, so a
// tooltip can show exactly which pairs drove the number.
function topContributingPairs(matrix, compA, compB, n = 3) {
  if (!compA || !compB) return [];
  const sumA = Object.values(compA).reduce((s, v) => s + v, 0) || 1;
  const sumB = Object.values(compB).reduce((s, v) => s + v, 0) || 1;
  const pairs = [];
  for (const [a, pctA] of Object.entries(compA)) {
    if (!pctA) continue;
    const row = matrix[a];
    if (!row) continue;
    for (const [b, pctB] of Object.entries(compB)) {
      if (!pctB) continue;
      const matrixVal = row[b] ?? 0;
      const contribution = (pctA / sumA) * (pctB / sumB) * matrixVal;
      if (contribution)
        pairs.push({ a, b, pctA, pctB, matrixVal, contribution });
    }
  }
  pairs.sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));
  return pairs.slice(0, n);
}
// Returns null when either family lacks the government/planet data this
// needs (e.g. an NPC faction with no companies.json entry).
function computeDiplomaticBaseline(nameA, nameB) {
  const a = companiesByName[nameA],
    b = companiesByName[nameB];
  if (!a || !b) return null;
  const planetA = planetRaceComposition[a.planet] ? a.planet : null;
  const planetB = planetRaceComposition[b.planet] ? b.planet : null;
  const government =
    (governmentCompatibility[a.government] || {})[b.government] ?? 0;
  const race =
    planetA && planetB
      ? weightedCompatibility(
          raceCompatibility,
          planetRaceComposition[planetA],
          planetRaceComposition[planetB],
        )
      : 0;
  const religion =
    planetA && planetB
      ? weightedCompatibility(
          religionCompatibility,
          planetReligionComposition[planetA],
          planetReligionComposition[planetB],
        )
      : 0;
  return { government, race, religion, total: government + race + religion };
}
function fmtBaselineNum(v) {
  const n = Math.round(v * 10) / 10;
  return (n > 0 ? "+" : "") + (Number.isInteger(n) ? n : n.toFixed(1));
}

// Curated total for one direction = live treaty-derived opinion
// (treatyOpinionsByFamily, mirrored both ways per treaty edge at load time)
// + opinions.json's hand-authored story-beat modifiers for this pair (now
// the only thing that file holds) + the diplomatic baseline.
function computeOpinionBreakdown(from, to) {
  const mods = [
    ...((treatyOpinionsByFamily[from] || {})[to] || []),
    ...((opinionsByFamily[from] || {})[to] || []),
  ];
  const curatedTotal = mods.reduce((sum, m) => sum + (m.value || 0), 0);
  const baseline = computeDiplomaticBaseline(from, to);
  const total = curatedTotal + (baseline ? baseline.total : 0);
  return { mods, baseline, total };
}

// Renders the baseline (Governo/Popolazione/Religione) + curated modifier
// pills for one direction as an HTML string -- shared by every column of
// the opinions table's expanded row detail.
function opinionBreakdownHtml(from, to, { mods, baseline }) {
  let html = "";
  const a = companiesByName[from],
    b = companiesByName[to];
  if (baseline && a && b) {
    const topA = topComposition(planetRaceComposition[a.planet])
      .map(([n, p]) => `${p}% ${escHtml(n)}`)
      .join(", ");
    const topB = topComposition(planetRaceComposition[b.planet])
      .map(([n, p]) => `${p}% ${escHtml(n)}`)
      .join(", ");
    const raceContribs = topContributingPairs(
      raceCompatibility,
      planetRaceComposition[a.planet],
      planetRaceComposition[b.planet],
    ).map(
      (c) =>
        `${escHtml(c.a)} (${c.pctA}%) × ${escHtml(c.b)} (${c.pctB}%) × ${c.matrixVal} = ${fmtBaselineNum(c.contribution)}`,
    );
    const topRelA = topComposition(planetReligionComposition[a.planet])
      .map(([n, p]) => `${p}% ${escHtml(n)}`)
      .join(", ");
    const topRelB = topComposition(planetReligionComposition[b.planet])
      .map(([n, p]) => `${p}% ${escHtml(n)}`)
      .join(", ");
    const religionContribs = topContributingPairs(
      religionCompatibility,
      planetReligionComposition[a.planet],
      planetReligionComposition[b.planet],
    ).map(
      (c) =>
        `${escHtml(c.a)} (${c.pctA}%) × ${escHtml(c.b)} (${c.pctB}%) × ${c.matrixVal} = ${fmtBaselineNum(c.contribution)}`,
    );
    html += `<span class="opinion-mod baseline ${baseline.government >= 0 ? "positive" : "negative"}">Governo ${fmtBaselineNum(baseline.government)}
            <div class="trait-tooltip"><div>${escHtml(a.government)} (${escHtml(from)}) ↔ ${escHtml(b.government)} (${escHtml(to)})</div><div class="modline">Totale = ${fmtBaselineNum(baseline.government)}</div></div></span>`;
    html += `<span class="opinion-mod baseline ${baseline.race >= 0 ? "positive" : "negative"}">Popolazione ${fmtBaselineNum(baseline.race)}
            <div class="trait-tooltip"><div>${escHtml(from)}: ${topA || "—"}</div><div>${escHtml(to)}: ${topB || "—"}</div>${(raceContribs.length ? raceContribs : ["(nessun contributo significativo)"]).map((l) => `<div class="modline">${l}</div>`).join("")}<div class="modline">Totale = ${fmtBaselineNum(baseline.race)}</div></div></span>`;
    html += `<span class="opinion-mod baseline ${baseline.religion >= 0 ? "positive" : "negative"}">Religione ${fmtBaselineNum(baseline.religion)}
            <div class="trait-tooltip"><div>${escHtml(from)}: ${topRelA || "—"}</div><div>${escHtml(to)}: ${topRelB || "—"}</div>${(religionContribs.length ? religionContribs : ["(nessun contributo significativo)"]).map((l) => `<div class="modline">${l}</div>`).join("")}<div class="modline">Totale = ${fmtBaselineNum(baseline.religion)}</div></div></span>`;
  }
  mods.forEach((m) => {
    const typeInfo =
      treatyTypesByName[m.label] ||
      treatyTypesByName[(m.label || "").replace(/ (su|da)$/, "")];
    html += `<span class="opinion-mod ${m.value >= 0 ? "positive" : "negative"}">${escHtml(m.label)} ${m.value > 0 ? "+" : ""}${m.value}${typeInfo ? `<div class="trait-tooltip">${escHtml(typeInfo.description)}</div>` : ""}</span>`;
  });
  return html || '<div class="opinion-empty">Nessun modificatore.</div>';
}

const fmtOpinionTotal = (t) =>
  (t > 0 ? "+" : "") + (Number.isInteger(t) ? t : t.toFixed(1));
const opinionTotalClass = (t) =>
  t > 0 ? "positive" : t < 0 ? "negative" : "neutral";

// Opinions table: one row per other family with three columns -- Noi→Loro,
// Loro→Noi, and Loro→La Mano (a constant reference column showing how much
// every other family likes/dislikes the player family, regardless of whose
// overlay you're viewing -- omitted when already viewing La Mano's own
// overlay, since it would just repeat column 2). Row click toggles a detail
// panel below it with the full breakdown for all three directions;
// clicking the family name itself jumps straight to their overlay instead.
function renderOpinions(name) {
  const list = document.getElementById("family-opinions-list");
  list.innerHTML = "";

  const otherNames = Object.keys(companiesByName).filter((n) => n !== name);
  const showHandColumn = name !== PLAYER_FAMILY;

  const rows = otherNames.map((other) => ({
    other,
    ours: computeOpinionBreakdown(name, other),
    theirs: computeOpinionBreakdown(other, name),
    theirsOfHand: showHandColumn
      ? computeOpinionBreakdown(other, PLAYER_FAMILY)
      : null,
  }));
  rows.sort((a, b) => Math.abs(b.ours.total) - Math.abs(a.ours.total));

  if (rows.length === 0) {
    list.innerHTML =
      '<div class="opinion-empty">Nessuna relazione registrata.</div>';
    return;
  }

  const table = document.createElement("div");
  table.className = "opinion-table";
  const header = document.createElement("div");
  header.className = "opinion-table-row opinion-table-header";
  header.innerHTML = `
        <span class="opinion-family-name">Famiglia</span>
        <span class="opinion-total-header">Noi → Loro</span>
        <span class="opinion-total-header">Loro → Noi</span>
        ${showHandColumn ? `<span class="opinion-total-header">Loro → ${escHtml(PLAYER_FAMILY)}</span>` : ""}`;
  table.appendChild(header);

  rows.forEach(({ other, ours, theirs, theirsOfHand }) => {
    const row = document.createElement("div");
    row.className = "opinion-table-row";
    row.innerHTML = `
            <span class="opinion-family-name"><span class="opinion-dot" style="background:${familyColor(other)}"></span>${escHtml(other)}</span>
            <span class="opinion-total ${opinionTotalClass(ours.total)}">${fmtOpinionTotal(ours.total)}</span>
            <span class="opinion-total ${opinionTotalClass(theirs.total)}">${fmtOpinionTotal(theirs.total)}</span>
            ${showHandColumn ? `<span class="opinion-total ${opinionTotalClass(theirsOfHand.total)}">${fmtOpinionTotal(theirsOfHand.total)}</span>` : ""}`;

    const detail = document.createElement("div");
    detail.className = "opinion-detail";
    detail.innerHTML = `
            <div class="opinion-detail-block">
                <h4>Noi → Loro</h4>
                <div class="opinion-modifiers">${opinionBreakdownHtml(name, other, ours)}</div>
            </div>
            <div class="opinion-detail-block">
                <h4>Loro → Noi</h4>
                <div class="opinion-modifiers">${opinionBreakdownHtml(other, name, theirs)}</div>
            </div>
            ${
              showHandColumn
                ? `
            <div class="opinion-detail-block">
                <h4>Loro → ${escHtml(PLAYER_FAMILY)}</h4>
                <div class="opinion-modifiers">${opinionBreakdownHtml(other, PLAYER_FAMILY, theirsOfHand)}</div>
            </div>`
                : ""
            }`;

    row.addEventListener("click", () => {
      const isOpen = detail.classList.contains("open");
      table
        .querySelectorAll(".opinion-detail.open")
        .forEach((d) => d.classList.remove("open"));
      if (!isOpen) detail.classList.add("open");
    });
    row.querySelector(".opinion-family-name").addEventListener("click", (e) => {
      e.stopPropagation();
      showFamilyOverlay(other);
    });

    table.appendChild(row);
    table.appendChild(detail);
  });

  list.appendChild(table);
}

function closeFamilyOverlay() {
  document.getElementById("family-overlay").classList.remove("open");
  currentOverlayFamily = null;
}
document
  .getElementById("family-overlay-close")
  .addEventListener("click", closeFamilyOverlay);
document
  .getElementById("family-overlay-backdrop")
  .addEventListener("click", closeFamilyOverlay);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeFamilyOverlay();
});

// Maintainer-only "reveal all" toggle: bypasses reveals.json gating (and
// shows the GM-only Bonus Attivi section) client-side for prep/reference.
// Never persisted — resets on reload, doesn't touch the JSON. No visible
// button (players could stumble onto it) — Ctrl+Shift+G instead, with a
// brief toast so a GM still gets confirmation it toggled.
let gmToastTimeout = null;
function showGmToast(text) {
  const toast = document.getElementById("gm-toast");
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(gmToastTimeout);
  gmToastTimeout = setTimeout(() => toast.classList.remove("show"), 1800);
}
window.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "g") {
    e.preventDefault();
    devRevealAll = !devRevealAll;
    showGmToast(
      devRevealAll ? "👁 Modalità GM attiva" : "Modalità GM disattivata",
    );
    if (currentOverlayFamily) showFamilyOverlay(currentOverlayFamily);
  }
});

// ── PERSISTENT FAMILY LIST ────────────────────────────────────────────────────
function buildFamiliesPanel() {
  const list = document.getElementById("families-list");
  list.innerHTML = "";
  Object.keys(companiesByName)
    .sort()
    .forEach((name) => {
      const color = familyColor(name);
      const row = document.createElement("div");
      row.className = "families-list-row";
      row.style.borderLeftColor = color;
      row.style.setProperty("--row-accent", color);
      const crest = document.createElement("img");
      crest.className = "families-list-crest";
      const crestFile =
        CREST_OVERRIDES[name] || `${name.replace(/\s+/g, "")}Icon.png`;
      crest.src = `images/symbols/${crestFile}`;
      crest.alt = name;
      crest.onerror = () => {
        crest.onerror = null;
        crest.src = "images/court/Position Empty.webp";
      };
      row.appendChild(crest);
      const label = document.createElement("span");
      label.className = "families-list-name";
      label.textContent = name;
      row.appendChild(label);
      row.addEventListener("click", () => showFamilyOverlay(name));
      list.appendChild(row);
    });
}

// ── RESOURCES & ASSETS PANEL (merged Atlas + Craftable) ───────────────────────
// Atlas: resource -> which planets/bases have it -> owning family.
// Craftable: each craft asset, its required resources, and which families
// currently qualify (derived openly from public map ownership, not gated by
// infiltration -- the underlying planet ownership is already visible to all).
let resourcesById = {};
let craftData = [];

function familyResourceIds(name) {
  const ids = new Set();
  Object.values(byId).forEach((b) => {
    if (!b || typeof b !== "object" || Array.isArray(b) || !b.id) return;
    if (b.owner === name) (b.resourceIds || []).forEach((id) => ids.add(id));
  });
  return ids;
}
// Every body (planet/moon/base/point) a family controls, for the overlay's
// "Territori Controllati" list.
function familyTerritories(name) {
  return Object.values(byId).filter(
    (b) =>
      b &&
      typeof b === "object" &&
      !Array.isArray(b) &&
      b.id &&
      b.id !== "sun" &&
      b.owner === name,
  );
}
// Every resource id a family controls, grouped by category and deduped,
// each noting which owned body/bodies it comes from -- for the overlay's
// "Risorse Controllate" section. Unlike familyResourceIds() (a flat Set
// used for craft-asset qualification), this keeps the body attribution.
function familyResourceSummary(name) {
  const byResource = {}; // resourceId -> Set of body names
  Object.values(byId).forEach((b) => {
    if (!b || typeof b !== "object" || Array.isArray(b) || !b.id) return;
    if (b.owner !== name) return;
    (b.resourceIds || []).forEach((rid) => {
      (byResource[rid] = byResource[rid] || new Set()).add(b.name);
    });
  });
  const byCategory = {};
  Object.entries(byResource).forEach(([rid, bodies]) => {
    const res = resourcesById[rid];
    if (!res) return;
    (byCategory[res.category] = byCategory[res.category] || []).push({
      res,
      bodies: [...bodies],
    });
  });
  return byCategory;
}

// Where a family's ANONYMOUS fleets currently are: stationed at a body
// (byId's .fleets already includes the game-balance auto-fill-at-home
// default, so this matches what's actually drawn on the map). Named fleets
// are resolved separately, live, via getFleetState() -- see
// renderFleetLocations().
function familyFleetLocations(name) {
  const stationed = [];
  Object.values(byId).forEach((b) => {
    if (
      !b ||
      typeof b !== "object" ||
      Array.isArray(b) ||
      !b.id ||
      b.id === "sun"
    )
      return;
    const count = (b.fleets || []).filter((f) => f === name).length;
    if (count > 0) stationed.push({ body: b, count });
  });
  return { stationed };
}
function qualifiesFor(asset, resourceIdSet) {
  return (asset.requirementIds || []).every((rid) => resourceIdSet.has(rid));
}
// Craftable assets (all_info/assets.json's craftAssets) that a given family
// currently qualifies for -- same qualification logic as the global
// Craftable tab, just pre-filtered to one family for the overlay's Asset section.
function familyCraftableAssets(name) {
  const resourceIds = familyResourceIds(name);
  return craftData.filter((a) => qualifiesFor(a, resourceIds));
}

// ── TREATY-DERIVED BONUSES (all_info/treaties.json + treaty_types.json) ──────
// A treaty row's `type` string carries its own directional suffix (" su" =
// lord, " da" = vassal/recipient) for the two feudal pacts; every other type
// is symmetric. Stripping the suffix looks up the shared treaty_types.json
// entry; the suffix (if any) picks which side's modifiers apply.
function baseTreatyType(type) {
  for (const suf of [" su", " da"]) {
    if (type.endsWith(suf))
      return { base: type.slice(0, -suf.length), side: suf.trim() };
  }
  return { base: type, side: null };
}

// Opinion contribution from treaties is computed once here (not per-render):
// for every row in treaties.json, the SAME opinionValue is added to both
// directions, regardless of whether the mechanical effect is one-sided. If
// both sides independently hold their own row for the same treaty (e.g. a
// mutual rivalry declaration), each row contributes its own mirrored pair,
// so the totals simply stack -- no special-casing needed.
function computeTreatyOpinions(treaties) {
  const result = {};
  const add = (from, to, label, value) => {
    result[from] = result[from] || {};
    (result[from][to] = result[from][to] || []).push({ label, value });
  };
  treaties.forEach((t) => {
    const { base } = baseTreatyType(t.type);
    const info = treatyTypesByName[base];
    const value = info ? info.opinionValue || 0 : 0;
    add(t.from, t.to, t.type, value);
    add(t.to, t.from, t.type, value);
  });
  return result;
}

// Resolves which modifiers apply to the family on the `from` side of a
// treaties.json row: modifiersAsLord/modifiersAsVassal for the two feudal
// pacts (picked by the row's own su/da suffix), or the shared `modifiers`
// array for every symmetric type. Missing arrays default to [].
function resolvedTreatyModifiers(treatyRow) {
  const { base, side } = baseTreatyType(treatyRow.type);
  const info = treatyTypesByName[base];
  if (!info) return [];
  if (side === "su") return info.modifiersAsLord || [];
  if (side === "da") return info.modifiersAsVassal || [];
  return info.modifiers || [];
}

// Every currently-active flat/situational modifier a family has, from every
// source, flattened into one list for the "Bonus Attivi" section -- leader
// traits, treaty effects (resolved per-side), and asset effects (owned
// familyAssets, localizedAssets on owned bodies, qualifying craftAssets, and
// any grantsAsset from a currently-held unique treaty). Each entry carries
// its own `source` label so the UI can attribute it.
function familyActiveModifiers(name) {
  const out = [];

  (leadersByFamily[name] || []).forEach((leader) => {
    (leader.traits || []).forEach((traitId) => {
      const trait = traitsById[traitId];
      if (!trait) return;
      (trait.modifiers || []).forEach((m) => {
        out.push({
          source: `Leader: ${leader.name} — ${trait.label}`,
          modifier: m,
        });
      });
    });
  });

  (treatiesByFamily[name] || []).forEach((t) => {
    resolvedTreatyModifiers(t).forEach((m) => {
      out.push({ source: `Trattato: ${t.type} con ${t.to}`, modifier: m });
    });
    const { base } = baseTreatyType(t.type);
    const info = treatyTypesByName[base];
    if (info && info.grantsAsset && info.grantsAsset.effect) {
      out.push({
        source: `Trattato: ${t.type} con ${t.to}`,
        modifier: {
          stat: info.grantsAsset.name,
          amount: 0,
          situation: info.grantsAsset.effect,
          always: true,
          isAssetEffect: true,
        },
      });
    }
  });

  (familyAssetsByOwner[name] || []).forEach((a) => {
    (a.modifiers || []).forEach((m) =>
      out.push({ source: `Asset: ${a.name}`, modifier: m }),
    );
  });
  familyTerritories(name).forEach((b) => {
    (localizedAssetsByBody[b.id] || []).forEach((a) => {
      (a.modifiers || []).forEach((m) =>
        out.push({ source: `Asset: ${a.name} (${b.name})`, modifier: m }),
      );
    });
  });
  familyCraftableAssets(name).forEach((a) => {
    (a.modifiers || []).forEach((m) =>
      out.push({ source: `Asset: ${a.name}`, modifier: m }),
    );
  });

  return out;
}

function buildAtlasPanel(filter = "") {
  const host = document.getElementById("atlas-list");
  if (!host) return;
  host.innerHTML = "";
  const q = filter.toLowerCase().trim();

  resConfig.forEach((rc) => {
    const inCategory = Object.values(resourcesById).filter(
      (r) => r.category === rc.key,
    );
    const rows = inCategory
      .filter((res) => !q || res.name.toLowerCase().includes(q))
      .map((res) => {
        const holders = Object.values(byId).filter(
          (b) =>
            b &&
            typeof b === "object" &&
            !Array.isArray(b) &&
            b.id &&
            (b.resourceIds || []).includes(res.id),
        );
        return { res, holders };
      })
      .filter(({ holders }) => q || holders.length > 0);
    if (rows.length === 0) return;

    const card = document.createElement("div");
    card.className = "asset-card";
    card.innerHTML = `<div class="res-header" style="color:${rc.color}">${rc.icon} ${rc.label}</div>`;
    rows.forEach(({ res, holders }) => {
      const resBlock = document.createElement("div");
      resBlock.className = "atlas-resource";
      const usedBy = craftData
        .filter((a) => (a.requirementIds || []).includes(res.id))
        .map((a) => a.name);
      const tipText = usedBy.length
        ? `Ingrediente per: ${usedBy.join(", ")}`
        : "";
      resBlock.innerHTML = `<div class="atlas-resource-name" title="${escHtml(tipText)}">${escHtml(res.name)}</div>`;
      const holdersEl = document.createElement("div");
      holdersEl.className = "atlas-holders";
      if (holders.length === 0) {
        holdersEl.innerHTML =
          '<span class="atlas-none">Nessun pianeta noto</span>';
      } else {
        holders.forEach((b) => {
          const chip = document.createElement("span");
          chip.className = "atlas-holder-chip";
          chip.innerHTML = `<span class="owner-dot" style="background:${familyColor(b.owner)}"></span>${escHtml(b.name)}`;
          chip.title = b.owner || "";
          chip.addEventListener("click", () => {
            focusOnBody(b.id);
            showInfo(b);
          });
          holdersEl.appendChild(chip);
        });
      }
      resBlock.appendChild(holdersEl);
      card.appendChild(resBlock);
    });
    host.appendChild(card);
  });
}

function buildCraftPanel(filter = "") {
  const list = document.getElementById("craft-list");
  const empty = document.getElementById("craft-empty");
  if (!list) return;
  list.innerHTML = "";
  const q = filter.toLowerCase().trim();

  const familyResources = {};
  Object.keys(companiesByName).forEach((name) => {
    familyResources[name] = familyResourceIds(name);
  });

  const filtered = q
    ? craftData.filter(
        (r) =>
          (r.name || "").toLowerCase().includes(q) ||
          (r.type || "").toLowerCase().includes(q),
      )
    : craftData;

  if (filtered.length === 0) {
    if (empty) {
      empty.style.display = "block";
      empty.textContent = q ? "Nessun risultato." : "Nessun asset disponibile.";
    }
    return;
  }
  if (empty) empty.style.display = "none";

  filtered.forEach((r) => {
    const item = document.createElement("div");
    item.className = "craft-item";
    const reqPills = (r.requirementIds || [])
      .map((rid) => {
        const res = resourcesById[rid];
        return `<span class="craft-req-pill">${escHtml((res && res.name) || rid)}</span>`;
      })
      .join("");

    const qualifiers = Object.keys(companiesByName).filter((name) =>
      qualifiesFor(r, familyResources[name]),
    );
    const qualifiersHtml = qualifiers.length
      ? qualifiers
          .map(
            (name) =>
              `<span class="craft-qualifier-chip" style="border-color:${familyColor(name)}">${escHtml(name)}</span>`,
          )
          .join("")
      : '<span style="color:#444">Nessuna famiglia qualificata al momento</span>';

    item.innerHTML = `
            <div class="craft-item-header">
                <span class="craft-item-name">${escHtml(r.name || "—")}</span>
                <span class="craft-item-type">${escHtml(r.type || "")}</span>
                <span class="craft-item-chevron">▶</span>
            </div>
            <div class="craft-item-detail">
                <div class="craft-detail-row"><span class="craft-detail-label">⏱ Tempo</span><span class="craft-detail-value">${escHtml(r.generationTime || "—")}</span></div>
                <div class="craft-detail-row"><span class="craft-detail-label">🔩 Requisiti</span><div class="craft-req-list">${reqPills || '<span style="color:#444">—</span>'}</div></div>
                <div class="craft-detail-desc">${escHtml(r.description || "—")}</div>
                <div class="craft-detail-row"><span class="craft-detail-label">✅ Disponibile a</span><div class="craft-req-list">${qualifiersHtml}</div></div>
            </div>`;
    item.querySelector(".craft-item-header").addEventListener("click", () => {
      const wasOpen = item.classList.contains("expanded");
      list
        .querySelectorAll(".craft-item.expanded")
        .forEach((e) => e.classList.remove("expanded"));
      if (!wasOpen) item.classList.add("expanded");
    });
    list.appendChild(item);
  });
}

document.querySelectorAll(".res-subtab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document
      .querySelectorAll(".res-subtab-btn")
      .forEach((b) => b.classList.remove("active"));
    document
      .querySelectorAll(".res-subtab-panel")
      .forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document
      .getElementById(`${btn.dataset.subtab}-panel`)
      .classList.add("active");
  });
});
document
  .getElementById("resources-search-input")
  .addEventListener("input", (e) => {
    buildAtlasPanel(e.target.value);
    buildCraftPanel(e.target.value);
  });

// ── RULER ─────────────────────────────────────────────────────────────────────
let rulerActive = false,
  rulerStart = null;
const rulerBtn = document.getElementById("rulerBtn");
const rulerTooltip = document.getElementById("ruler-tooltip");
const rulerLayer = document.createElementNS(NS, "g");
rulerLayer.setAttribute("id", "ruler-layer");
svg.appendChild(rulerLayer);

rulerBtn.addEventListener("click", () => {
  rulerActive = !rulerActive;
  rulerBtn.classList.toggle("active", rulerActive);
  rulerStart = null;
  rulerLayer.innerHTML = "";
  rulerTooltip.style.display = "none";
  svg.style.cursor = rulerActive ? "crosshair" : "grab";
});

function svgPoint(e) {
  const rect = svg.getBoundingClientRect();
  const cx = e.clientX - rect.left,
    cy = e.clientY - rect.top;
  return {
    x: vb.x + (cx / rect.width) * vb.w,
    y: vb.y + (cy / rect.height) * vb.h,
  };
}
function pxToWeeks(dx, dy) {
  return (Math.hypot(dx, dy) / DIST_SCALE).toFixed(2);
}
// Keeps any fixed-position popup fully on-screen regardless of anchor position.
function clampToViewport(left, top, w, h, pad = 8) {
  return {
    left: Math.max(pad, Math.min(left, window.innerWidth - w - pad)),
    top: Math.max(pad, Math.min(top, window.innerHeight - h - pad)),
  };
}

svg.addEventListener("click", (e) => {
  if (!rulerActive) return;
  e.stopPropagation();
  const pt = svgPoint(e);
  if (!rulerStart) {
    rulerStart = pt;
    rulerLayer.innerHTML = "";
    rulerLayer.appendChild(
      el("circle", {
        cx: pt.x,
        cy: pt.y,
        r: 8,
        fill: "#ffc840",
        opacity: "0.9",
      }),
    );
  } else {
    drawRulerLine(rulerStart, pt, true);
    rulerStart = null;
  }
});
svg.addEventListener("mousemove", (e) => {
  if (!rulerActive || !rulerStart) return;
  const pt = svgPoint(e);
  drawRulerLine(rulerStart, pt, false);
  const weeks = pxToWeeks(pt.x - rulerStart.x, pt.y - rulerStart.y);
  rulerTooltip.style.display = "block";
  rulerTooltip.textContent = `${weeks} weeks`;
  const tipRect = rulerTooltip.getBoundingClientRect();
  const clamped = clampToViewport(
    e.clientX + 14,
    e.clientY - 10,
    tipRect.width,
    tipRect.height,
  );
  rulerTooltip.style.left = clamped.left + "px";
  rulerTooltip.style.top = clamped.top + "px";
});
function drawRulerLine(a, b, final) {
  rulerLayer.innerHTML = "";
  const weeks = pxToWeeks(b.x - a.x, b.y - a.y);
  rulerLayer.appendChild(
    el("circle", { cx: a.x, cy: a.y, r: 8, fill: "#ffc840", opacity: "0.9" }),
  );
  const line = el("line", {
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    stroke: "#ffc840",
    "stroke-width": "3",
    "stroke-dasharray": "12 8",
    opacity: "0.85",
  });
  rulerLayer.appendChild(line);
  rulerLayer.appendChild(
    el("circle", {
      cx: b.x,
      cy: b.y,
      r: 8,
      fill: "#ffc840",
      opacity: final ? "1" : "0.6",
    }),
  );
  if (final) {
    const mx = (a.x + b.x) / 2,
      my = (a.y + b.y) / 2;
    const bg = el("rect", {
      x: mx - 60,
      y: my - 22,
      width: 120,
      height: 28,
      rx: 6,
      fill: "rgba(8,8,22,0.88)",
      stroke: "rgba(255,200,80,0.4)",
      "stroke-width": "1.5",
    });
    const txt = el("text", {
      x: mx,
      y: my - 3,
      "text-anchor": "middle",
      "dominant-baseline": "middle",
      fill: "#ffc840",
      "font-size": "20",
      "font-family": "Courier New, monospace",
      "font-weight": "600",
    });
    txt.textContent = `${weeks} wk`;
    rulerLayer.appendChild(bg);
    rulerLayer.appendChild(txt);
    rulerTooltip.style.display = "none";
    rulerStart = null;
  }
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && rulerActive) {
    rulerActive = false;
    rulerBtn.classList.remove("active");
    rulerLayer.innerHTML = "";
    rulerStart = null;
    rulerTooltip.style.display = "none";
    svg.style.cursor = "grab";
  }
});

// ── GENERIC VIEWPORT-CLAMPED TOOLTIPS ──────────────────────────────────────────
// Resource chips, leader trait chips, the government line, and the opinion
// baseline pills (Governo/Popolazione/Religione) all attach a .trait-tooltip
// as a direct child and rely on CSS :hover for display, which gets silently
// clipped whenever the hovered chip sits inside a scrolling ancestor (e.g.
// the family overlay panel, or a Craftable item list) since position:absolute
// content can't escape an ancestor's overflow:auto/hidden. Delegate instead:
// on hover, switch the tooltip to position:fixed and place it with
// viewport-clamped coordinates, so it always escapes ancestor clipping and
// never runs off the edge of the screen.
const TOOLTIP_HOST_SELECTOR =
  ".trait-chip, #family-government, .opinion-mod, .treaty-row";
document.addEventListener("mouseover", (e) => {
  const host = e.target.closest(TOOLTIP_HOST_SELECTOR);
  if (!host) return;
  const tip = host.querySelector(".trait-tooltip");
  if (!tip || tip.style.display === "block") return;
  tip.style.display = "block";
  tip.style.position = "fixed";
  const hostRect = host.getBoundingClientRect();
  const tipRect = tip.getBoundingClientRect();
  let top = hostRect.top - tipRect.height - 8;
  if (top < 8) top = hostRect.bottom + 8;
  const left = hostRect.left + hostRect.width / 2 - tipRect.width / 2;
  const clamped = clampToViewport(left, top, tipRect.width, tipRect.height);
  tip.style.left = clamped.left + "px";
  tip.style.top = clamped.top + "px";
});
document.addEventListener("mouseout", (e) => {
  const host = e.target.closest(TOOLTIP_HOST_SELECTOR);
  if (!host || (e.relatedTarget && host.contains(e.relatedTarget))) return;
  const tip = host.querySelector(".trait-tooltip");
  if (tip) tip.style.display = "none";
});

// ── SEARCH ────────────────────────────────────────────────────────────────────
const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
let searchActiveIdx = -1;

function buildSearchIndex() {
  const index = [];
  Object.values(byId).forEach((b) => {
    if (!b || typeof b !== "object" || Array.isArray(b) || !b.id) return;
    index.push({
      type: "body",
      id: b.id,
      name: b.name || b.id,
      color: b.color || "#aaa",
      sub: b.type || "",
    });
  });
  (byId.__paths || []).forEach((p) => {
    const label = p.name || p.ids.join(" → ");
    index.push({
      type: "path",
      id: p.ids[0],
      name: label,
      color: p.color || "#aaa",
      sub: p.type,
      path: p,
    });
  });
  Object.keys(companiesByName).forEach((name) => {
    index.push({
      type: "company",
      id: name,
      name,
      color: familyColor(name),
      sub: "famiglia",
    });
  });
  Object.entries(leadersByFamily).forEach(([family, leaders]) => {
    (leaders || []).forEach((leader) => {
      index.push({
        type: "leader",
        id: family,
        name: leader.name,
        color: familyColor(family),
        sub: `${leader.role || "Leader"} — ${family}`,
        family,
      });
    });
  });
  namedFleets.forEach((fl) => {
    index.push({
      type: "fleet",
      id: fl.id || fl.name,
      name: fl.name,
      color: familyColor(fl.owner),
      sub: `Flotta — ${fl.owner}`,
      fleet: fl,
    });
  });
  return index;
}

function focusOnBody(id) {
  const positions = computeAllPositions(tick);
  const p = positions[id];
  if (!p) return;
  vb.x = p.x - vb.w / 2;
  vb.y = p.y - vb.h / 2;
  applyVB();
  const g = bodyGroups[id];
  if (g) {
    const halo = g.querySelector("circle");
    if (halo) {
      halo.setAttribute("opacity", "0.5");
      setTimeout(() => halo.setAttribute("opacity", "0.0"), 600);
    }
  }
}
function focusOnPoint(p) {
  if (!p) return;
  vb.x = p.x - vb.w / 2;
  vb.y = p.y - vb.h / 2;
  applyVB();
}
function focusOnPath(pathObj) {
  const positions = computeAllPositions(tick);
  const pts = pathObj.ids.map((id) => positions[id]).filter(Boolean);
  if (!pts.length) return;
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  const minX = Math.min(...xs),
    maxX = Math.max(...xs);
  const minY = Math.min(...ys),
    maxY = Math.max(...ys);
  const cx = (minX + maxX) / 2,
    cy = (minY + maxY) / 2;
  const pad = 200;
  const newW = Math.max(maxX - minX + pad * 2, vb.w);
  const newH = Math.max(maxY - minY + pad * 2, vb.h);
  vb.x = cx - newW / 2;
  vb.y = cy - newH / 2;
  vb.w = newW;
  vb.h = newH;
  applyVB();
}

function renderSearchResults(query) {
  searchResults.innerHTML = "";
  searchActiveIdx = -1;
  if (!query.trim() || !ready) {
    searchResults.style.display = "none";
    return;
  }
  const q = query.toLowerCase();
  const index = buildSearchIndex();
  const matches = index
    .filter(
      (item) =>
        item.id.toLowerCase().includes(q) ||
        item.name.toLowerCase().includes(q),
    )
    .slice(0, 12);
  if (!matches.length) {
    searchResults.style.display = "none";
    return;
  }
  matches.forEach((item, i) => {
    const div = document.createElement("div");
    div.className = "search-item";
    div.dataset.idx = i;
    div.innerHTML = `<span class="search-dot" style="background:${safeColor(item.color)}"></span><span class="search-name">${escHtml(item.name)}</span><span class="search-sub">${escHtml(item.sub)}</span>`;
    div.addEventListener("mousedown", (e) => {
      e.preventDefault();
      selectSearchItem(item);
    });
    searchResults.appendChild(div);
  });
  searchResults._matches = matches;
  searchResults.style.display = "block";
}
function selectSearchItem(item) {
  searchInput.value = item.name;
  searchResults.style.display = "none";
  if (item.type === "body") {
    focusOnBody(item.id);
    showInfo(byId[item.id]);
  } else if (item.type === "path") {
    focusOnPath(item.path);
    const positions = computeAllPositions(tick);
    const pts = item.path.ids.map((id) => positions[id]).filter(Boolean);
    let totalLen = 0;
    for (let i = 0; i < pts.length - 1; i++)
      totalLen += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
    showPathInfo(item.path, totalLen);
  } else if (item.type === "company") {
    showFamilyOverlay(item.id);
  } else if (item.type === "leader") {
    showFamilyOverlay(item.family);
  } else if (item.type === "fleet") {
    const res = getFleetState(item.fleet, tick);
    focusOnPoint(res.position);
    showFleetInfo(item.fleet, tick);
  }
}
searchInput.addEventListener("input", (e) =>
  renderSearchResults(e.target.value),
);
searchInput.addEventListener("focus", (e) =>
  renderSearchResults(e.target.value),
);
searchInput.addEventListener("blur", () =>
  setTimeout(() => {
    searchResults.style.display = "none";
  }, 150),
);
searchInput.addEventListener("keydown", (e) => {
  const items = searchResults.querySelectorAll(".search-item");
  if (!items.length) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    searchActiveIdx = Math.min(searchActiveIdx + 1, items.length - 1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    searchActiveIdx = Math.max(searchActiveIdx - 1, 0);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const idx = searchActiveIdx >= 0 ? searchActiveIdx : 0;
    if (searchResults._matches?.[idx])
      selectSearchItem(searchResults._matches[idx]);
    return;
  } else if (e.key === "Escape") {
    searchResults.style.display = "none";
    return;
  }
  items.forEach((elm, i) =>
    elm.classList.toggle("active", i === searchActiveIdx),
  );
});

// ── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener("resize", () => {
  vb.w = window.innerWidth;
  vb.h = window.innerHeight;
  applyVB();
});

async function init() {
  // Map data is split by how often it changes: bodies.json (planets/moons,
  // never change), points_of_interest.json (bases/points + trade lanes,
  // rarely change), fleets.json (where every family's military currently
  // is -- both stationed and in-transit -- changes constantly, kept in its
  // own small file so that's the only one touched most weeks).
  const [
    bodiesFile,
    poiFile,
    fleetsFile,
    companies,
    governi,
    timeline,
    traits,
    leaders,
    opinions,
    treatyTypes,
    treatiesFile,
    assetsFile,
    resourcesFile,
    diplomacy,
    reveals,
  ] = await Promise.all([
    loadJson("all_info/bodies.json", { bodies: [] }),
    loadJson("all_info/points_of_interest.json", {
      pointsOfInterest: [],
      tradePaths: [],
    }),
    loadJson("all_info/fleets.json", { stationed: [], fleets: [] }),
    loadJson("all_info/companies.json", { companies: [] }),
    loadJson("all_info/governi.json", { governi: [] }),
    loadJson("all_info/timeline.json", { currentMonth: 0, months: [] }),
    loadJson("all_info/traits.json", { traits: [] }),
    loadJson("all_info/leaders.json", { leaders: {} }),
    loadJson("all_info/opinions.json", { opinions: {} }),
    loadJson("all_info/treaty_types.json", { treatyTypes: {} }),
    loadJson("all_info/treaties.json", { treaties: [] }),
    loadJson("all_info/assets.json", {
      craftAssets: [],
      familyAssets: [],
      localizedAssets: [],
    }),
    loadJson("all_info/resources.json", { resources: [] }),
    loadJson("all_info/diplomacy.json", {
      governmentCompatibility: {},
      raceCompatibility: {},
      religionCompatibility: {},
      planetRaceComposition: {},
      planetReligionComposition: {},
    }),
    loadJson("all_info/reveals.json", { families: {} }),
  ]);
  showDataErrorBanner();

  companiesByName = {};
  (companies.companies || []).forEach((c) => {
    companiesByName[c.name] = c;
  });
  governiByName = {};
  (governi.governi || []).forEach((g) => {
    governiByName[g.nome] = g;
  });
  leadersByFamily = leaders.leaders || {};
  traitsById = {};
  (traits.traits || []).forEach((t) => {
    traitsById[t.id] = t;
  });
  opinionsByFamily = opinions.opinions || {};
  treatyTypesByName = treatyTypes.treatyTypes || {};
  treatiesByFamily = {};
  (treatiesFile.treaties || []).forEach((t) => {
    (treatiesByFamily[t.from] = treatiesByFamily[t.from] || []).push(t);
  });
  treatyOpinionsByFamily = computeTreatyOpinions(treatiesFile.treaties || []);
  craftData = assetsFile.craftAssets || [];
  resourcesById = {};
  (resourcesFile.resources || []).forEach((r) => {
    resourcesById[r.id] = r;
  });
  timelineByMonth = {};
  (timeline.months || []).forEach((m) => {
    timelineByMonth[m.month] = m;
  });
  familyAssetsByOwner = {};
  (assetsFile.familyAssets || []).forEach((a) => {
    (familyAssetsByOwner[a.owner] = familyAssetsByOwner[a.owner] || []).push(a);
  });
  localizedAssetsByBody = {};
  (assetsFile.localizedAssets || []).forEach((a) => {
    (localizedAssetsByBody[a.bodyId] =
      localizedAssetsByBody[a.bodyId] || []).push(a);
  });
  revealsByFamily = reveals.families || {};
  governmentCompatibility = diplomacy.governmentCompatibility || {};
  raceCompatibility = diplomacy.raceCompatibility || {};
  religionCompatibility = diplomacy.religionCompatibility || {};
  planetRaceComposition = diplomacy.planetRaceComposition || {};
  planetReligionComposition = diplomacy.planetReligionComposition || {};

  // Seed owner colors from companies too (in case a company owns no body yet).
  Object.keys(companiesByName).forEach((name) => {
    if (!ownerColors[name]) ownerColors[name] = "#888888";
  });
  buildFamiliesPanel();

  const bodies = [
    ...(bodiesFile.bodies || []),
    ...(poiFile.pointsOfInterest || []),
  ];
  const paths = poiFile.tradePaths || [];
  namedFleets = fleetsFile.fleets || [];
  fleetsById = {};
  namedFleets.forEach((fl) => {
    if (fl.id) fleetsById[fl.id] = fl;
  });
  if (bodies.length === 0) return;
  loadMap(bodies, paths, timeline, fleetsFile.stationed || []);
  // Atlas/Craftable both read byId (populated by loadMap), so build after.
  buildAtlasPanel();
  buildCraftPanel();
}

init();
