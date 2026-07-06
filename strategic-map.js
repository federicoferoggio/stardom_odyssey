// ── STRATEGIC MAP ────────────────────────────────────────────────────────────
// Self-contained: all data comes from local JSON under all_info/, no Google
// Sheets fetch, no localStorage cache. Ported/adapted from map.js + adds the
// family "empire screen" overlay (stats, leaders/traits, opinions).

const CANVAS = 10000, CENTER = CANVAS / 2, DIST_SCALE = 250, MOON_GAP = 60, MOON_START = 60, PLANET_R = 28, MOON_R = 12, SUN_R = 55;
const ZOOM_MIN = 400;
const ZOOM_MAX = 12000;

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
    { key: 'shards', label: 'Shards', color: '#88ccff', icon: '💎' },
    { key: 'gems', label: 'Gems', color: '#aaffaa', icon: '🟢' },
    { key: 'opals', label: 'Opals', color: '#ffddaa', icon: '🔶' },
    { key: 'resources', label: 'Resources', color: '#ffaacc', icon: '⚙️' },
];

// Flavor-text phrase bank, keyed by stat name then tier (0-2). Self-contained
// copy of the bank shared by parser.js, so this page has no dependency on it.
const qualities = {
    Might: [
        ["le loro truppe sono contadini con spade", "il loro esercito è più simbolico che reale"],
        ["le loro forze sono ben addestrate e pronte alla battaglia", "i loro soldati non temono lo scontro"],
        ["le loro forze sono terrificanti da affrontare in battaglia", "il loro esercito semina il terrore ovunque"]
    ],
    Treasure: [
        ["hanno solo risparmi di poco valore", "le loro casse contengono appena il necessario"],
        ["trattano in monete d'oro", "la loro ricchezza è notevole"],
        ["commerciano in lingotti d'oro", "il loro tesoro è inestimabile"]
    ],
    Influence: [
        ["a pochi interessa della loro esistenza", "sono ignorati da tutti nel sistema"],
        ["sono rispettati nel sistema", "godono di una discreta considerazione"],
        ["sono leggendari e riveriti in ogni angolo del sistema", "la loro parola è legge"]
    ],
    Territory: [
        ["controllano una regione dimenticata", "i loro territori sono insignificanti"],
        ["governano un pianeta vasto e sviluppato, e numerose colonie", "le loro terre si espandono su più sistemi"],
        ["dominano pianeti, asteroidi, colonie e persino di più", "il loro dominio si estende oltre l'immaginabile"]
    ],
    Sovereignty: [
        ["i loro sudditi li tollerano appena", "sono mal sopportati dalla popolazione"],
        ["i loro sudditi li sostengono", "hanno il supporto della popolazione"],
        ["i loro sudditi li venerano", "il loro regno è visto come sacro"]
    ]
};

function generateFamilyDescription(stats) {
    const relevant = Object.entries(stats).filter(([k]) => qualities[k]);
    if (!relevant.length) return '';
    const average = relevant.reduce((sum, [, v]) => sum + v, 0) / relevant.length;
    const getTier = value => (value <= 2 ? 0 : value <= 4 ? 1 : 2);
    const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const sentences = relevant.map(([key, value]) => ({ key, value, phrase: pick(qualities[key][getTier(value)]) }));
    const paired = [];
    for (let i = 0; i < sentences.length - 1; i += 2) {
        const a = sentences[i], b = sentences[i + 1];
        const conj = Math.abs(a.value - average) > 1 && Math.abs(b.value - average) > 1 &&
            ((a.value > average && b.value < average) || (a.value < average && b.value > average)) ? 'ma' : 'e';
        paired.push(`${a.phrase} ${conj} ${b.phrase}`);
    }
    if (sentences.length % 2 !== 0) paired.push(sentences[sentences.length - 1].phrase);
    const text = paired.join('. ') + '.';
    return text.replace(/(^\w|\.\s*\w)/g, c => c.toUpperCase());
}

let byId = {}, tick = 0, ready = false;
let ownerColors = {};
let iconScaleGroups = {};
let satellitesByParent = {}; // parentId -> [satelliteId, ...], see MOON_COLLAPSE_VB_WIDTH above

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Data (all_info/*.json) is checked-in project data, not sanitized user input,
// but a stray value there still shouldn't be able to break out of a style
// attribute -- only accept a well-formed hex color, else fall back.
function safeColor(color) {
    return typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : '#888888';
}

// companies.json's own "color" field is the single source of truth for a
// family's color (map body colors are seeded from/consistent with it); this
// falls back to the map-derived ownerColors for non-family owners (e.g. an
// NPC faction with no companies.json entry).
function familyColor(name) {
    return safeColor((companiesByName[name] && companiesByName[name].color) || ownerColors[name]);
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
let stationedFleets = []; // all_info/fleets.json .stationed -- kept for familyFleetCount()
let allWarpaths = []; // all_info/fleets.json .warpaths -- kept for familyFleetCount()

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
const PLAYER_FAMILY = 'La Mano';

function familyReveal(name) {
    const r = (revealsByFamily && revealsByFamily[name]) || {};
    return { stats: r.stats || {}, leaders: r.leaders || {}, uniqueAssetsKnown: !!r.uniqueAssetsKnown };
}
function statKnown(name, statKey) {
    if (devRevealAll || name === PLAYER_FAMILY) return true;
    return !!familyReveal(name).stats[statKey];
}
function leaderTraitKnown(name, role, traitIndex) {
    if (devRevealAll || name === PLAYER_FAMILY) return true;
    const box = familyReveal(name).leaders[role] || {};
    return !!box[traitIndex === 0 ? 'trait1Known' : 'trait2Known'];
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
    if (devRevealAll || name === PLAYER_FAMILY) return { known: total, total, pct: 100 };
    let known = 0;
    STAT_KEYS.forEach(k => { if (statKnown(name, k)) known++; });
    leaders.forEach(l => { for (let i = 0; i < 2; i++) if (leaderTraitKnown(name, l.role, i)) known++; });
    if (assetsKnown(name)) known++;
    return { known, total, pct: total > 0 ? Math.round((known / total) * 100) : 100 };
}

function lockedBadge(message) {
    const span = document.createElement('span');
    span.className = 'locked-badge';
    span.textContent = '🔒';
    span.title = message || 'I giocatori non hanno ancora scoperto questa informazione';
    return span;
}

function hexToRgb(hex) { hex = hex.replace(/^#/, ''); if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); return { r: parseInt(hex.slice(0, 2), 16) || 0, g: parseInt(hex.slice(2, 4), 16) || 0, b: parseInt(hex.slice(4, 6), 16) || 0 }; }

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }

const svg = document.getElementById('solar-svg');
const bgStars = document.getElementById('bg-stars');
let vb = { x: CENTER - window.innerWidth / 2, y: CENTER - window.innerHeight / 2, w: window.innerWidth, h: window.innerHeight };
function applyVB() { svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); refreshIconScale(); }
function refreshIconScale() {
    const k = Math.min(MAX_ICON_SCALE, Math.max(1, vb.w / BASE_VB_WIDTH));
    const collapsed = vb.w >= MOON_COLLAPSE_VB_WIDTH;
    Object.entries(iconScaleGroups).forEach(([id, g]) => {
        const boost = (collapsed && satellitesByParent[id] && satellitesByParent[id].length) ? COLLAPSED_PLANET_BOOST : 1;
        g.setAttribute('transform', `scale(${(k * boost).toFixed(3)})`);
    });
    Object.values(satellitesByParent).flat().forEach(satId => {
        const g = bodyGroups[satId];
        if (g) g.style.display = collapsed ? 'none' : '';
    });
    document.querySelectorAll('#orbit-layer .moon-orbit-ring').forEach(ring => { ring.style.display = collapsed ? 'none' : ''; });
}
applyVB();

let panning = false, px = 0, py = 0;
svg.addEventListener('mousedown', e => { if (e.button !== 0) return; panning = true; px = e.clientX; py = e.clientY; });
svg.addEventListener('mousemove', e => { if (!panning) return; vb.x -= (e.clientX - px) * (vb.w / svg.clientWidth); vb.y -= (e.clientY - py) * (vb.h / svg.clientHeight); px = e.clientX; py = e.clientY; applyVB(); clampVB(); });
svg.addEventListener('mouseup', () => { panning = false; });
svg.addEventListener('mouseleave', () => { panning = false; });
svg.addEventListener('wheel', e => {
    e.preventDefault();
    const f = e.deltaY > 0 ? 1.04 : 0.96;
    const mx = e.offsetX / svg.clientWidth;
    const my = e.offsetY / svg.clientHeight;
    const prevW = vb.w, prevH = vb.h;
    vb.w *= f; vb.h *= f;
    clampVB();
    vb.x += (prevW - vb.w) * mx;
    vb.y += (prevH - vb.h) * my;
    applyVB();
}, { passive: false });
let lastTD = null;
svg.addEventListener('touchstart', e => { e.preventDefault(); if (e.touches.length === 1) { panning = true; px = e.touches[0].clientX; py = e.touches[0].clientY; } else if (e.touches.length === 2) { panning = false; lastTD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } }, { passive: false });
svg.addEventListener('touchmove', e => { e.preventDefault(); if (e.touches.length === 1 && panning) { vb.x -= (e.touches[0].clientX - px) * (vb.w / svg.clientWidth); vb.y -= (e.touches[0].clientY - py) * (vb.h / svg.clientHeight); px = e.touches[0].clientX; py = e.touches[0].clientY; clampVB(); applyVB(); } else if (e.touches.length === 2 && lastTD) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); vb.w *= lastTD / d; vb.h *= lastTD / d; lastTD = d; clampVB(); applyVB(); } }, { passive: false });
svg.addEventListener('touchend', () => { panning = false; lastTD = null; });

function clampVB() {
    // Clamp both axes by the SAME factor (not independently) so the viewBox's
    // aspect ratio never drifts from the actual element's on non-square
    // viewports. Independent clamping used to let one axis hit ZOOM_MIN/MAX
    // before the other at extreme zoom, distorting the viewBox and throwing
    // off click-coordinate math (e.g. the ruler). preserveAspectRatio="none"
    // on the <svg> makes the math exact regardless, but this also keeps the
    // content itself from visibly stretching at extreme zoom.
    const factorFor = v => (v > ZOOM_MAX ? ZOOM_MAX / v : (v < ZOOM_MIN ? ZOOM_MIN / v : 1));
    const fw = factorFor(vb.w), fh = factorFor(vb.h);
    const factor = Math.abs(fw - 1) > Math.abs(fh - 1) ? fw : fh;
    if (factor !== 1) { vb.w *= factor; vb.h *= factor; }
}

// ── LOAD LOCAL JSON ───────────────────────────────────────────────────────────
async function loadJson(path, fallback) {
    try {
        const res = await fetch(path);
        if (!res.ok) throw new Error(`${path}: ${res.status}`);
        return await res.json();
    } catch (err) {
        console.error('[STRATMAP] failed to load', path, err);
        return fallback;
    }
}

// ── NORMALISE MAP DATA ────────────────────────────────────────────────────────
function normalise(bodies, paths) {
    const map = {};
    map['sun'] = { id: 'sun', anchor: '', distance: 0, speed: 0, color: '#ffaa00', name: 'Sun', owner: '', fleets: [], descr: '', isNode: true, moonSlot: 0 };
    const moonCount = {};
    bodies.forEach(b => {
        const id = (b.id || '').trim().toLowerCase();
        if (!id) return;
        const anchor = (b.anchor || 'sun').trim().toLowerCase();
        let moonSlot = 0;
        if (!b.node && anchor !== 'sun') { if (moonCount[anchor] === undefined) moonCount[anchor] = 0; moonSlot = moonCount[anchor]++; }
        const color = safeColor(b.color || '#aaaaaa');
        map[id] = {
            id, anchor, distance: Number(b.distance) || 0, moonSlot, speed: Number(b.speed) || 1, offset: Number(b.offset) || 0,
            color, name: b.name || b.id, owner: b.owner || '', fleets: [], descr: b.descr || '',
            resourceIds: Array.isArray(b.resourceIds) ? b.resourceIds : [],
            type: b.type || 'planet', isNode: !!b.node,
        };
    });
    Object.values(map).forEach(b => { if (b.owner) ownerColors[b.owner.trim()] = b.color; });
    Object.values(map).forEach(b => { b.ownerColor = (b.owner && ownerColors[b.owner.trim()]) || b.color || '#aaaaaa'; });
    map.__paths = (paths || []).map(p => ({
        ids: (p.ids || []).map(s => s.trim().toLowerCase()),
        name: p.name || '',
        color: safeColor(p.color || '#aaaaaa'),
        type: (p.type || 'path').trim().toLowerCase(),
        owner: p.owner || '',
        fleets: Array.isArray(p.fleets) ? p.fleets : [],
        descr: p.descr || '',
        departure: Number(p.departure) || 0,
    }));
    return map;
}

// ── ORBITAL ENGINE ────────────────────────────────────────────────────────────
function computeAllPositions(t) {
    const cache = {};
    function pos(id) {
        if (cache[id]) return cache[id];
        const b = byId[id];
        if (!b || !b.anchor) { cache[id] = { x: CENTER, y: CENTER }; return cache[id]; }
        const parent = pos(b.anchor);
        const r = b.anchor === 'sun' ? b.distance * DIST_SCALE : MOON_START + b.moonSlot * MOON_GAP;
        const angle = b.type === 'point'
            ? (b.offset || 0) * Math.PI / 180
            : (b.speed > 0 ? (t / b.speed) * Math.PI * 2 : 0) + (b.offset || 0) * Math.PI / 180;
        cache[id] = { x: parent.x + r * Math.cos(angle), y: parent.y + r * Math.sin(angle), orbitR: r, parentX: parent.x, parentY: parent.y };
        return cache[id];
    }
    Object.keys(byId).filter(id => id !== '__paths').forEach(id => pos(id));
    return cache;
}

// ── GRADIENT / COLOR FILTER ───────────────────────────────────────────────────
function ensureColorFilter(id, color) {
    const defs = document.getElementById('svg-defs');
    const fId = `cf-${id}`;
    if (defs.querySelector(`#${fId}`)) return fId;
    const f = el('filter', { id: fId, 'color-interpolation-filters': 'sRGB', x: '-20%', y: '-20%', width: '140%', height: '140%' });
    f.appendChild(el('feFlood', { 'flood-color': color, 'flood-opacity': '1', result: 'flood' }));
    f.appendChild(el('feComposite', { in: 'flood', in2: 'SourceGraphic', operator: 'in', result: 'colored' }));
    f.appendChild(el('feGaussianBlur', { in: 'colored', stdDeviation: '3', result: 'glow' }));
    const merge = el('feMerge', {});
    merge.appendChild(el('feMergeNode', { in: 'glow' }));
    merge.appendChild(el('feMergeNode', { in: 'colored' }));
    f.appendChild(merge);
    defs.appendChild(f);
    return fId;
}

// ── BUILD SCENE ───────────────────────────────────────────────────────────────
let bodyGroups = {};
function buildScene() {
    document.getElementById('orbit-layer').innerHTML = '';
    const bodyLayer = document.getElementById('body-layer');
    bodyLayer.innerHTML = '';
    bodyGroups = {};
    iconScaleGroups = {};
    if (bgStars) bgStars.innerHTML = '';

    satellitesByParent = {};
    Object.values(byId).forEach(b => {
        if (b.id === 'sun' || b.isNode) return;
        if (b.anchor && b.anchor !== 'sun') (satellitesByParent[b.anchor] = satellitesByParent[b.anchor] || []).push(b.id);
    });

    const sunG = el('g', { 'data-id': 'sun', class: 'body-group' });
    const sunScale = el('g', { class: 'icon-scale' });
    sunScale.appendChild(el('circle', { r: SUN_R * 2.8, fill: 'url(#sunGrad)', opacity: '0.5', filter: 'url(#glow-strong)' }));
    sunScale.appendChild(el('circle', { r: SUN_R, fill: 'url(#sunGrad)', filter: 'url(#glow-strong)', stroke: 'rgba(255,240,180,0.3)', 'stroke-width': '2' }));
    const sunLbl = el('text', { x: SUN_R + 8, y: 0, class: 'body-label', 'dominant-baseline': 'middle' });
    sunLbl.textContent = 'Sun'; sunScale.appendChild(sunLbl);
    sunG.appendChild(sunScale);
    sunG.addEventListener('click', () => showInfo(byId['sun']));
    sunG.setAttribute('transform', `translate(${CENTER},${CENTER})`);
    bodyLayer.appendChild(sunG); bodyGroups['sun'] = sunG; iconScaleGroups['sun'] = sunScale;

    Object.values(byId).forEach(b => {
        if (b.id === 'sun') return;
        const isMain = b.anchor === 'sun' || b.type === 'planet';
        const r = { planet: PLANET_R, base: PLANET_R * 0.8, moon: MOON_R, point: MOON_R * 0.75 }[b.type] ?? MOON_R;
        const typeMap = { planet: 'images/planet.svg', moon: 'images/moon.svg', base: 'images/base.svg', point: 'images/point.svg' };
        const iconSrc = typeMap[b.type] || 'images/planet.svg';
        const cfId = ensureColorFilter(b.id, b.color);

        // Everything visual (halo/icon/label/fleet markers) lives inside an
        // inner "icon-scale" group so refreshIconScale() can grow it when
        // zoomed far out, without touching the outer group's world-space
        // position (set separately by updateScene()).
        const g = el('g', { 'data-id': b.id, class: 'body-group' });
        const scaleG = el('g', { class: 'icon-scale' });
        g.appendChild(scaleG);
        if (b.type === 'point' && b.speed > 0) {
            const zoneR = b.speed * DIST_SCALE;
            const { r: cr, g: cg, b: cb } = hexToRgb(b.color);
            const zone = el('circle', {
                r: zoneR,
                fill: `rgba(${Math.round(cr * 0.4)},${Math.round(cg * 0.4)},${Math.round(cb * 0.4)},0.18)`,
                stroke: `rgba(${Math.round(cr * 0.6)},${Math.round(cg * 0.6)},${Math.round(cb * 0.6)},0.35)`,
                'stroke-width': '2', 'stroke-dasharray': '8 6', 'pointer-events': 'none',
            });
            // The "zone of influence" ring is in world space (radius = speed *
            // DIST_SCALE, same unit as orbits), so it stays outside the scaled group.
            g.insertBefore(zone, g.firstChild);
        }
        const halo = el('circle', { r: r * 2.2, fill: b.color, opacity: '0.0', style: 'transition:opacity .2s' });
        scaleG.appendChild(halo);
        const icon = el('image', { href: iconSrc, x: -r, y: -r, width: r * 2, height: r * 2, filter: `url(#${cfId})` });
        scaleG.appendChild(icon);
        const lbl = el('text', { x: r + 7, y: 0, class: isMain ? 'body-label' : 'moon-label', 'dominant-baseline': 'middle' });
        lbl.textContent = b.name; scaleG.appendChild(lbl);
        g.addEventListener('mouseenter', () => { halo.setAttribute('opacity', '0.25'); icon.setAttribute('opacity', '1'); });
        g.addEventListener('mouseleave', () => { halo.setAttribute('opacity', '0.0'); icon.setAttribute('opacity', '0.85'); });
        icon.setAttribute('opacity', '0.85');
        g.addEventListener('click', e => { e.stopPropagation(); showInfo(b); });

        if (b.fleets && b.fleets.length) {
            const fleets = b.fleets;
            const iconSize = isMain ? 14 : 10;
            const iconGap = isMain ? 16 : 12;
            const startX = r - (fleets.length - 1) * iconGap / 2;
            const topY = -(r + 10);
            fleets.forEach((fleetOwner, i) => {
                const ownerColor = byId[Object.keys(byId).find(k => byId[k].owner === fleetOwner)]?.color || b.ownerColor || '#aaaaaa';
                const img = el('image', {
                    href: 'images/attack.svg', x: startX + i * iconGap - iconSize / 2, y: topY - iconSize / 2,
                    width: iconSize, height: iconSize, style: `filter: drop-shadow(0 0 2px ${ownerColor}); opacity: 0.9;`,
                });
                const colorDot = el('circle', {
                    cx: startX + i * iconGap, cy: topY, r: iconSize / 2 + 1, fill: ownerColor, opacity: '0.6',
                    stroke: 'rgba(255,255,255,0.4)', 'stroke-width': '1',
                });
                scaleG.appendChild(colorDot);
                scaleG.appendChild(img);
            });
        }
        bodyLayer.appendChild(g); bodyGroups[b.id] = g; iconScaleGroups[b.id] = scaleG;
    });

    (function injectMapBackground() {
        const existing = document.getElementById('map-bg-image');
        if (existing) existing.remove();
        const brion = byId['brion7'];
        if (!brion) return;
        const orbitR = brion.distance * DIST_SCALE;
        const side = orbitR * 2;
        const x = CENTER - orbitR;
        const y = CENTER - orbitR;
        const bgImg = document.createElementNS(NS, 'image');
        bgImg.setAttribute('id', 'map-bg-image');
        bgImg.setAttribute('href', 'images/maponlyasteroids.svg');
        bgImg.setAttribute('x', x);
        bgImg.setAttribute('y', y);
        bgImg.setAttribute('width', side);
        bgImg.setAttribute('height', side);
        bgImg.setAttribute('opacity', '1');
        bgImg.setAttribute('pointer-events', 'none');
        const orbitLayer = document.getElementById('orbit-layer');
        svg.insertBefore(bgImg, orbitLayer);
    })();
}

// ── UPDATE SCENE ──────────────────────────────────────────────────────────────
function updateScene(t) {
    if (!ready) return;
    const positions = computeAllPositions(t);
    const orbitLayer = document.getElementById('orbit-layer');
    orbitLayer.innerHTML = '';
    const satellitesCollapsed = vb.w >= MOON_COLLAPSE_VB_WIDTH;
    Object.values(byId).forEach(b => {
        if (b.id === 'sun') return;
        const p = positions[b.id]; if (!p) return;
        if (b.type !== 'base' && b.type !== 'point') {
            const isMoonRing = b.anchor !== 'sun';
            const ring = el('circle', { cx: p.parentX, cy: p.parentY, r: p.orbitR, class: isMoonRing ? 'moon-orbit-ring' : 'orbit-ring' });
            if (isMoonRing && satellitesCollapsed) ring.style.display = 'none';
            orbitLayer.appendChild(ring);
        }
        const g = bodyGroups[b.id];
        if (g) g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
    });
    if (bodyGroups['sun']) bodyGroups['sun'].setAttribute('transform', `translate(${CENTER},${CENTER})`);

    const pathLayer = document.getElementById('path-layer');
    pathLayer.innerHTML = '';
    const defs = document.getElementById('svg-defs');
    defs.querySelectorAll('[id^="mp-"]').forEach(e => e.remove());
    defs.querySelectorAll('[id^="arrow-"]').forEach(e => e.remove());

    (byId.__paths || []).forEach((path, pi) => {
        const isWar = path.type === 'warpath';
        const arrowId = `arrow-${pi}`;
        if (!isWar && !defs.querySelector(`#${arrowId}`)) {
            const marker = el('marker', { id: arrowId, markerWidth: '8', markerHeight: '8', refX: '6', refY: '3', orient: 'auto' });
            marker.appendChild(el('polygon', { points: '0,0 0,6 8,3', fill: path.color, opacity: '0.85' }));
            defs.appendChild(marker);
        }
        const pts = path.ids.map(id => positions[id]).filter(Boolean);
        if (pts.length < 2) return;
        const segments = [];
        let totalLen = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
            segments.push({ a: pts[i], b: pts[i + 1], len });
            totalLen += len;
        }
        const pathG = el('g', { class: 'path-group', style: 'cursor:pointer' });
        pathG.addEventListener('click', e => { e.stopPropagation(); showPathInfo(path, totalLen); });

        // Warpaths only define a departure + arrival id; the fleet always
        // aims at wherever the target currently is (segments/totalLen above
        // are already recomputed fresh from *live* positions every tick).
        // But pacing "how much of the trip is done" against that same live
        // (orbiting, non-monotonic) distance made arrival flicker as the two
        // endpoints' mutual distance oscillated. Instead, freeze the pacing
        // distance once at departure (cached on the path object -- paths are
        // rebuilt fresh on every loadMap(), so this can't go stale) and only
        // use the live totalLen to place the fleet marker visually.
        let progress = 1;
        if (isWar) {
            if (path._totalLenAtDeparture === undefined) {
                const depPositions = computeAllPositions(path.departure);
                const depPts = path.ids.map(id => depPositions[id]).filter(Boolean);
                let depLen = 0;
                for (let i = 0; i < depPts.length - 1; i++) {
                    depLen += Math.hypot(depPts[i + 1].x - depPts[i].x, depPts[i + 1].y - depPts[i].y);
                }
                path._totalLenAtDeparture = depLen;
            }
            const elapsed = tick - path.departure;
            const travelledSVG = elapsed * 4 * DIST_SCALE;
            progress = path._totalLenAtDeparture > 0 ? travelledSVG / path._totalLenAtDeparture : 1;
            if (elapsed < 0 || progress >= 1) return;
        }

        for (let i = 0; i < segments.length; i++) {
            const { a, b, len } = segments[i];
            const dx = b.x - a.x, dy = b.y - a.y;
            const ux = dx / len, uy = dy / len;
            const trim = isWar ? 5 : Math.min(PLANET_R + 10, len * 0.2);
            const lineAttrs = {
                x1: a.x + ux * trim, y1: a.y + uy * trim,
                x2: b.x - ux * (trim + (isWar ? 5 : 10)), y2: b.y - uy * (trim + (isWar ? 5 : 10)),
                stroke: path.color, 'stroke-width': isWar ? '2' : '2.5', opacity: isWar ? '0.5' : '0.7',
            };
            if (isWar) lineAttrs['stroke-dasharray'] = '12 8';
            else if (i === segments.length - 1) lineAttrs['marker-end'] = `url(#${arrowId})`;
            const hitAttrs = { ...lineAttrs };
            delete hitAttrs['marker-end'];
            const hit = el('line', { ...hitAttrs, stroke: 'transparent', 'stroke-width': '18' });
            pathG.appendChild(hit);
            pathG.appendChild(el('line', lineAttrs));
        }

        if (isWar && path.fleets && path.fleets.length) {
            // Map the departure-paced progress fraction onto the live
            // (current-position) segment lengths, so the token still visually
            // tracks the target as it orbits, without the pacing itself
            // flickering (see progress computation above).
            let remaining = Math.max(0, progress) * totalLen;
            let tokenPos = null, tokenAngle = 0;
            for (const seg of segments) {
                if (remaining <= seg.len) {
                    const frac = remaining / seg.len;
                    const dx = seg.b.x - seg.a.x, dy = seg.b.y - seg.a.y;
                    tokenPos = { x: seg.a.x + dx * frac, y: seg.a.y + dy * frac };
                    tokenAngle = Math.atan2(dy, dx) * 180 / Math.PI;
                    break;
                }
                remaining -= seg.len;
            }
            if (tokenPos) {
                const fleetList = path.fleets;
                const iconSize = 20;
                fleetList.forEach((fleetOwner, fi) => {
                    const ownerColor = Object.values(byId).find(b => b.owner === fleetOwner)?.color || path.color;
                    const offsetY = fi * (iconSize + 4) - ((fleetList.length - 1) * (iconSize + 4)) / 2;
                    const iconG = el('g', { transform: `translate(${tokenPos.x.toFixed(1)},${tokenPos.y.toFixed(1)}) rotate(${tokenAngle.toFixed(1)})` });
                    iconG.appendChild(el('circle', { r: iconSize / 2 + 2, cx: 0, cy: offsetY, fill: ownerColor, opacity: '0.55', stroke: 'rgba(255,255,255,0.5)', 'stroke-width': '1.5' }));
                    iconG.appendChild(el('image', { href: 'images/attack.svg', x: -iconSize / 2, y: offsetY - iconSize / 2, width: iconSize, height: iconSize, style: `filter: drop-shadow(0 0 6px ${ownerColor}) brightness(1.8); opacity: 1;` }));
                    pathG.appendChild(iconG);
                });
            }
        }
        pathLayer.appendChild(pathG);
    });
}

// ── TICK CONTROLS ─────────────────────────────────────────────────────────────
let baseTick = 0;
let tickHoldInterval = null;
function stepTick(delta) { onTickChange(tick + delta * .03); }
function startHold(delta) { stepTick(delta); tickHoldInterval = setInterval(() => stepTick(delta), 150); }
function stopHold() { clearInterval(tickHoldInterval); tickHoldInterval = null; }

const tickPrevBtn = document.getElementById('tickPrevBtn');
const tickNextBtn = document.getElementById('tickNextBtn');
tickPrevBtn.addEventListener('mousedown', () => startHold(-1));
tickNextBtn.addEventListener('mousedown', () => startHold(1));
window.addEventListener('mouseup', stopHold);
tickPrevBtn.addEventListener('mouseleave', stopHold);
tickNextBtn.addEventListener('mouseleave', stopHold);
tickPrevBtn.addEventListener('touchstart', e => { e.preventDefault(); startHold(-1); }, { passive: false });
tickNextBtn.addEventListener('touchstart', e => { e.preventDefault(); startHold(1); }, { passive: false });
tickPrevBtn.addEventListener('touchend', stopHold);
tickNextBtn.addEventListener('touchend', stopHold);

const tickSlider = document.getElementById('tickSlider');
function onTickChange(val) {
    tick = Math.round(parseFloat(val) * 100) / 100 || 0;
    const min = parseFloat(tickSlider.min), max = parseFloat(tickSlider.max);
    if (!Number.isNaN(min)) tick = Math.max(min, tick);
    if (!Number.isNaN(max)) tick = Math.min(max, tick);
    tickSlider.value = tick;
    document.querySelector('#tick-label span').textContent = tick;
    updateScene(tick);
    renderTimelinePanel(tick);
}
tickSlider.addEventListener('input', e => onTickChange(e.target.value));
document.getElementById('resetBtn').addEventListener('click', () => onTickChange(baseTick));

function loadMap(bodies, paths, timeline, stationedFleets) {
    byId = normalise(bodies, paths);
    (stationedFleets || []).forEach(s => {
        const body = byId[s.bodyId];
        if (body) body.fleets = Array.isArray(s.fleets) ? s.fleets : [];
    });

    // Game-balance default: any family short of its ceil(might/2) cap (after
    // counting explicit fleets.json entries via familyFleetCount) is assumed
    // to keep the remainder at its companies.json home planet -- so
    // fleets.json only needs to record deviations (fleets away from home, or
    // in transit), not a full roster for every family.
    const bodyIdByName = {};
    Object.values(byId).forEach(b => { if (b && b.name) bodyIdByName[b.name.trim().toLowerCase()] = b.id; });
    Object.keys(companiesByName).forEach(name => {
        const company = companiesByName[name];
        if (!company.planet) return;
        const homeId = bodyIdByName[company.planet.trim().toLowerCase()];
        if (!homeId) { console.warn(`Fleet auto-fill: "${name}"'s planet "${company.planet}" matches no known body.`); return; }
        const cap = Math.ceil((company.might || 0) / 2);
        const remainder = Math.max(0, cap - familyFleetCount(name));
        const home = byId[homeId];
        home.fleets = home.fleets || [];
        for (let i = 0; i < remainder; i++) home.fleets.push(name);
    });

    currentMonth = (timeline && timeline.currentMonth) || 0;
    tick = currentMonth; baseTick = currentMonth;
    tickSlider.min = baseTick - 24;
    tickSlider.max = baseTick + 24;
    tickSlider.step = 0.03125;
    tickSlider.value = tick;
    document.querySelector('#tick-label span').textContent = tick;
    buildScene(); ready = true; updateScene(tick); refreshIconScale();
    renderTimelinePanel(tick);
}

// ── TIMELINE PANEL ───────────────────────────────────────────────────────────────
// all_info/timeline.json: { currentMonth, months: [{month, title, events:[{description,modifier}]}] }.
// One toolbar panel, one month per "page" -- two-way synced with the map's
// tick slider: dragging the slider flips the page, and the prev/next buttons
// here jump the map's tick to that whole month.
function renderTimelinePanel(currentTick) {
    const monthEl = document.getElementById('timeline-panel-month');
    if (!monthEl) return;
    const monthNum = Math.round(currentTick);
    const month = timelineByMonth[monthNum];
    const titleEl = document.getElementById('timeline-panel-title');
    const eventsEl = document.getElementById('timeline-panel-events');
    monthEl.textContent = `Mese ${monthNum}`;
    if (!month) {
        titleEl.textContent = 'Nessun evento registrato per questo mese.';
        eventsEl.innerHTML = '';
        return;
    }
    titleEl.textContent = month.title || '—';
    eventsEl.innerHTML = '';
    const realEvents = (month.events || []).filter(ev => ev.description || ev.modifier);
    if (realEvents.length === 0) {
        eventsEl.innerHTML = '<div class="opinion-empty">Nessun evento registrato per questo mese.</div>';
        return;
    }
    realEvents.forEach(ev => {
        const row = document.createElement('div');
        row.className = 'timeline-event-row';
        row.innerHTML = `
            ${ev.description ? `<div class="timeline-event-desc">${escHtml(ev.description)}</div>` : ''}
            ${ev.modifier ? `<div class="timeline-event-modifier">⚙ ${escHtml(ev.modifier)}</div>` : ''}`;
        eventsEl.appendChild(row);
    });
}
document.getElementById('timeline-prev-btn').addEventListener('click', () => onTickChange(Math.round(tick) - 1));
document.getElementById('timeline-next-btn').addEventListener('click', () => onTickChange(Math.round(tick) + 1));

// ── UNIFIED TOP TOOLBAR ────────────────────────────────────────────────────────
// One dropdown open at a time (Famiglie / Risorse & Asset / Info), replacing
// the three independently-positioned drawers from earlier iterations.
const TOOLBAR_PANELS = ['families', 'resources', 'info', 'timeline'];
function closeAllToolbarPanels() {
    TOOLBAR_PANELS.forEach(name => {
        document.getElementById(`${name}-panel`).classList.remove('open');
        document.getElementById(`toolbar-${name}-btn`).classList.remove('active');
    });
}
function openToolbarPanel(name) {
    closeAllToolbarPanels();
    document.getElementById(`${name}-panel`).classList.add('open');
    document.getElementById(`toolbar-${name}-btn`).classList.add('active');
}
function toggleToolbarPanel(name) {
    const isOpen = document.getElementById(`${name}-panel`).classList.contains('open');
    if (isOpen) closeAllToolbarPanels();
    else openToolbarPanel(name);
}
TOOLBAR_PANELS.forEach(name => {
    document.getElementById(`toolbar-${name}-btn`).addEventListener('click', () => toggleToolbarPanel(name));
});

// ── PLANET INFO PANEL ─────────────────────────────────────────────────────────
function showInfo(b) {
    document.getElementById('info-name').textContent = b.name || b.id;
    const oe = document.getElementById('info-owner');
    oe.innerHTML = '';
    oe.style.color = b.color || '#aaa';
    if (b.owner) {
        const link = document.createElement('span');
        link.textContent = `⚑ ${b.owner}`;
        link.className = 'owner-link';
        link.title = 'Vedi la famiglia';
        link.addEventListener('click', e => { e.stopPropagation(); showFamilyOverlay(b.owner); });
        oe.appendChild(link);
    }
    document.getElementById('info-desc').textContent = b.descr || '—';
    let meta = ''; if (b.type) meta += `⬡ Type: ${b.type}\n`; if (b.fleets && b.fleets.length) meta += `⚔ Fleets: ${b.fleets.join(', ')}\n`; if (b.anchor) meta += `↩ Orbits: ${b.anchor}`;
    document.getElementById('info-meta').textContent = meta;

    renderResourceChips(b.resourceIds);
    renderComposition(b.name);
    renderLocalizedAssets(b.id);
    renderFamilyQuickView(b.owner);

    openToolbarPanel('info');
}

// Top 3 races + top 3 religions for a body (all_info/diplomacy.json), when
// that body's name matches one of the 20 planets with composition data.
// Moons/bases/points without a matching entry just hide the section.
function renderComposition(bodyName) {
    const host = document.getElementById('info-composition');
    const raceComp = planetRaceComposition[bodyName];
    const religionComp = planetReligionComposition[bodyName];
    if (!raceComp && !religionComp) { host.innerHTML = ''; host.style.display = 'none'; return; }
    host.style.display = 'block';
    const raceRows = topComposition(raceComp).map(([n, p]) => `<span class="composition-pill">${p}% ${escHtml(n)}</span>`).join('');
    const religionRows = topComposition(religionComp).map(([n, p]) => `<span class="composition-pill">${p}% ${escHtml(n)}</span>`).join('');
    host.innerHTML = `
        ${raceRows ? `<div class="composition-row"><span class="composition-label">Popolazione</span>${raceRows}</div>` : ''}
        ${religionRows ? `<div class="composition-row"><span class="composition-label">Religione</span>${religionRows}</div>` : ''}`;
}

// Every resource/property a body has (all_info/resources.json) is inert by
// itself -- it only gates which craftable assets a controlling family can
// use. Shown as chips (name, colored by category) with the list of
// craftAssets it's an ingredient for in the hover tooltip, so the
// resource-vs-asset split is visible in the UI itself. Same place also feeds
// the Resources & Assets panel.
function renderResourceChips(resourceIds) {
    const host = document.getElementById('info-bonuses');
    host.innerHTML = '';
    if (!resourceIds || resourceIds.length === 0) { host.style.display = 'none'; return; }
    host.style.display = 'flex';
    resourceIds.forEach(rid => {
        const res = resourcesById[rid];
        if (!res) return;
        const cat = resConfig.find(rc => rc.key === res.category);
        const chip = document.createElement('div');
        chip.className = 'trait-chip';
        chip.style.borderColor = (cat && cat.color) || undefined;
        chip.textContent = `${(cat && cat.icon) || ''} ${res.name}`;
        const tip = document.createElement('div');
        tip.className = 'trait-tooltip';
        const usedBy = craftData.filter(a => (a.requirementIds || []).includes(rid)).map(a => a.name);
        tip.textContent = usedBy.length
            ? `Ingrediente per: ${usedBy.join(', ')}`
            : 'Nessun asset craftabile registrato per questa risorsa.';
        chip.appendChild(tip);
        host.appendChild(chip);
    });
}

function showPathInfo(path, totalLen) {
    document.getElementById('info-name').textContent = path.name || path.ids.join(' → ');
    const oe = document.getElementById('info-owner');
    oe.innerHTML = '';
    oe.style.color = path.color || '#aaa';
    if (path.owner) {
        const link = document.createElement('span');
        link.textContent = `⚑ ${path.owner}`;
        link.className = 'owner-link';
        link.addEventListener('click', e => { e.stopPropagation(); showFamilyOverlay(path.owner); });
        oe.appendChild(link);
    }
    document.getElementById('info-desc').textContent = path.descr || '—';
    let meta = '';
    meta += `⬡ Type: ${path.type}\n`;
    if (path.fleets && path.fleets.length) meta += `⚔ Fleets: ${path.fleets.join(', ')}\n`;
    meta += `→ Route: ${path.ids.join(' → ')}`;
    if (path.type === 'warpath') {
        // Pace against the distance frozen at departure (see updateScene),
        // not the live orbiting distance, so this doesn't wobble/go negative
        // as the two endpoints' mutual distance oscillates over time.
        const pacingLen = path._totalLenAtDeparture ?? totalLen;
        if (pacingLen !== undefined) {
            const elapsed = tick - path.departure;
            const travelledSVG = elapsed * 4 * DIST_SCALE;
            const remainingSVG = Math.max(0, pacingLen - travelledSVG);
            const remainingWeeks = (remainingSVG / DIST_SCALE).toFixed(1);
            const remainingMonths = (remainingSVG / (DIST_SCALE * 4)).toFixed(1);
            meta += `\n📍 Partita al mese ${path.departure}`;
            meta += `\n⏱ Distanza rimanente: ${remainingWeeks} wk (~${remainingMonths} mesi)`;
        }
    }
    document.getElementById('info-meta').textContent = meta;
    renderResourceChips(null);
    renderComposition(null);
    renderLocalizedAssets(null);
    renderFamilyQuickView(path.owner);
    openToolbarPanel('info');
}

// Compact family preview shown inline right under a planet/path's own info, so
// a single click on the map surfaces both "what is this place" and "who runs
// it" together — "Espandi" opens the full empire-screen overlay on demand.
function renderFamilyQuickView(ownerName) {
    const host = document.getElementById('info-family-quickview');
    host.innerHTML = '';
    if (!ownerName) { host.style.display = 'none'; return; }
    ownerName = canonicalFamilyName(ownerName);
    host.style.display = 'block';

    const company = companiesByName[ownerName];

    const header = document.createElement('div');
    header.className = 'quickview-header';
    const crestFile = CREST_OVERRIDES[ownerName] || `${ownerName.replace(/\s+/g, '')}Icon.png`;
    const crest = document.createElement('img');
    crest.className = 'quickview-crest';
    crest.style.borderColor = familyColor(ownerName);
    crest.src = `images/symbols/${crestFile}`;
    crest.alt = ownerName;
    crest.onerror = () => { crest.onerror = null; crest.src = 'images/court/Position Empty.webp'; };
    header.appendChild(crest);

    const textCol = document.createElement('div');
    const nameEl = document.createElement('div');
    nameEl.className = 'quickview-name';
    nameEl.textContent = ownerName;
    textCol.appendChild(nameEl);
    const govEl = document.createElement('div');
    govEl.className = 'quickview-gov';
    govEl.textContent = company ? (company.government || '') : 'Entità indipendente';
    textCol.appendChild(govEl);
    header.appendChild(textCol);
    host.appendChild(header);

    if (company) {
        const statsMini = document.createElement('div');
        statsMini.className = 'quickview-stats';
        STAT_KEYS.forEach(k => {
            const pill = document.createElement('span');
            pill.className = 'quickview-stat-pill';
            if (statKnown(ownerName, k)) {
                pill.textContent = `${STAT_LABELS[k].slice(0, 3)} ${company[k] || 0}`;
            } else {
                pill.classList.add('locked');
                pill.textContent = `${STAT_LABELS[k].slice(0, 3)} 🔒`;
            }
            statsMini.appendChild(pill);
        });
        host.appendChild(statsMini);
    }

    const expandBtn = document.createElement('button');
    expandBtn.className = 'quickview-expand';
    expandBtn.textContent = 'Espandi ▸';
    expandBtn.addEventListener('click', e => { e.stopPropagation(); showFamilyOverlay(ownerName); });
    host.appendChild(expandBtn);
}

// ── FAMILY / EMPIRE SCREEN OVERLAY ────────────────────────────────────────────
const STAT_KEYS = ['might', 'treasure', 'influence', 'territory', 'sovereignty'];
const STAT_LABELS = { might: 'Might', treasure: 'Treasure', influence: 'Influence', territory: 'Territory', sovereignty: 'Sovereignty' };

// A handful of family names don't match their crest filename 1:1 (e.g. "La
// Mano" ships as HandIcon.png, an in-fiction translation) — override those,
// default to "<NameNoSpaces>Icon.png" for everyone else.
const CREST_OVERRIDES = { 'La Mano': 'HandIcon.png' };

// The map data spells a couple of owners differently than companies.json
// (same in-fiction naming inconsistency as La Mano/Hand above) — canonicalize
// before any companiesByName/ownerColors lookup.
const OWNER_NAME_ALIASES = { 'Heretics': 'Eretici' };
function canonicalFamilyName(name) { return OWNER_NAME_ALIASES[name] || name; }

function renderInfiltrationBar(name) {
    const host = document.getElementById('family-infiltration');
    host.innerHTML = '';
    const { known, total, pct } = familyKnowledgeSummary(name);
    const label = document.createElement('div');
    label.className = 'infiltration-label';
    label.textContent = `Conoscenza: ${known}/${total} (${pct}%)`;
    host.appendChild(label);
    const bar = document.createElement('div');
    bar.className = 'infiltration-bar';
    for (let i = 1; i <= total; i++) {
        const seg = document.createElement('div');
        seg.className = 'infiltration-seg' + (i <= known ? ' filled' : '');
        bar.appendChild(seg);
    }
    host.appendChild(bar);
    if (total > 0 && known >= total) {
        const badge = document.createElement('div');
        badge.className = 'full-knowledge-badge';
        badge.textContent = '🎲 Conoscenza Piena';
        badge.title = "I giocatori conoscono tutto ciò che è tracciato su questa famiglia: i tiri vengono ora dichiarati apertamente.";
        host.appendChild(badge);
    }
}

function showFamilyOverlay(name) {
    name = canonicalFamilyName(name);
    currentOverlayFamily = name;
    const overlay = document.getElementById('family-overlay');
    const company = companiesByName[name];
    const accent = familyColor(name);
    document.getElementById('family-overlay-panel').style.setProperty('--family-accent', accent);

    document.getElementById('family-name').textContent = name;
    const mottoEl = document.getElementById('family-motto');
    mottoEl.textContent = (company && company.motto) ? `"${company.motto}"` : '';
    mottoEl.style.display = (company && company.motto) ? 'block' : 'none';
    const crestEl = document.getElementById('family-crest');
    const crestFile = CREST_OVERRIDES[name] || `${name.replace(/\s+/g, '')}Icon.png`;
    crestEl.src = `images/symbols/${crestFile}`;
    crestEl.alt = name;
    crestEl.onerror = () => { crestEl.onerror = null; crestEl.src = 'images/court/Position Empty.webp'; };

    const statsRow = document.getElementById('family-stats-row');
    const govEl = document.getElementById('family-government');
    const planetEl = document.getElementById('family-planet');
    const historyEl = document.getElementById('family-history');
    const descEl = document.getElementById('family-description');
    const infilHost = document.getElementById('family-infiltration');
    statsRow.innerHTML = '';
    descEl.innerHTML = '';
    historyEl.textContent = (company && company.description) || '';
    historyEl.style.display = (company && company.description) ? 'block' : 'none';

    const fleetWarningEl = document.getElementById('family-fleet-warning');
    if (!company) {
        infilHost.innerHTML = '';
        govEl.textContent = 'Entità indipendente';
        planetEl.textContent = '';
        fleetWarningEl.style.display = 'none';
    } else {
        renderInfiltrationBar(name);
        planetEl.textContent = company.planet ? `Sede: ${company.planet}` : '';
        govEl.textContent = company.government || '';

        // Game-balance rule: a family should never field more fleets at once
        // than ceil(might/2) (all_info/fleets.json is the source for both
        // stationed and in-transit fleets).
        const fleetCount = familyFleetCount(name);
        const fleetCap = Math.ceil((company.might || 0) / 2);
        if (fleetCount > fleetCap) {
            fleetWarningEl.textContent = `⚠ ${fleetCount}/${fleetCap} flotte — oltre il limite (ceil(Might/2))`;
            fleetWarningEl.style.display = 'block';
        } else {
            fleetWarningEl.style.display = 'none';
        }

        const govDef = governiByName[company.government];
        const caps = govDef ? govDef.statistiche : null;

        // Hover the government name for its short description + both special
        // effects (governi.json already has everything needed for this).
        govEl.querySelectorAll('.trait-tooltip').forEach(e => e.remove());
        if (govDef) {
            govEl.style.position = 'relative';
            const tip = document.createElement('div');
            tip.className = 'trait-tooltip';
            tip.innerHTML = `<div>${escHtml(govDef.nome_italiano || '')}</div>` +
                (govDef.effetti_speciali || []).map(fx => `<div class="modline"><strong>${escHtml(fx.nome)}</strong> — ${escHtml(fx.descrizione)}</div>`).join('');
            govEl.appendChild(tip);
        }

        STAT_KEYS.forEach(k => {
            const card = document.createElement('div');
            card.className = 'family-stat';
            if (!statKnown(name, k)) {
                card.classList.add('locked');
                card.innerHTML = `<div class="family-stat-label">${STAT_LABELS[k]}</div>`;
                card.appendChild(lockedBadge('I giocatori non conoscono ancora questo valore'));
                statsRow.appendChild(card);
                return;
            }
            const value = company[k] || 0;
            const cap = caps ? (caps[STAT_LABELS[k]] || 7) : 7;
            // Current can exceed the government's cap -- shown as-is, only the
            // bar fill itself stays visually capped at 100%.
            const pct = Math.max(0, Math.min(100, (value / Math.max(cap, value, 1)) * 100));
            card.innerHTML = `
                <div class="family-stat-label">${STAT_LABELS[k]}</div>
                <div class="family-stat-value">${value} <span class="family-stat-cap">(${cap})</span></div>
                <div class="family-stat-bar"><div class="family-stat-bar-fill" style="width:${pct}%"></div></div>`;
            statsRow.appendChild(card);
        });

        if (STAT_KEYS.every(k => statKnown(name, k))) {
            const statObj = {};
            STAT_KEYS.forEach(k => { statObj[STAT_LABELS[k]] = company[k] || 0; });
            descEl.textContent = generateFamilyDescription(statObj);
        } else {
            descEl.appendChild(lockedBadge());
            descEl.appendChild(document.createTextNode(' Serve profilare tutte le statistiche per capire il carattere attuale di questa famiglia.'));
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

    overlay.classList.add('open');
}

const TERRITORY_TYPE_ICON = { planet: '🪐', moon: '🌙', base: '🛰', point: '📍' };
function renderTerritories(name) {
    const list = document.getElementById('family-territories-list');
    list.innerHTML = '';
    const territories = familyTerritories(name);
    if (territories.length === 0) {
        list.innerHTML = '<div class="opinion-empty">Nessun territorio noto.</div>';
        return;
    }
    territories
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .forEach(b => {
            const row = document.createElement('div');
            row.className = 'territory-row';
            const resCount = (b.resourceIds || []).length;
            row.innerHTML = `
                <span class="territory-icon">${TERRITORY_TYPE_ICON[b.type] || '⬡'}</span>
                <span class="territory-name">${escHtml(b.name)}</span>
                <span class="territory-type">${escHtml(b.type || '')}</span>
                ${resCount ? `<span class="territory-res-count">${resCount} risorse</span>` : ''}`;
            row.addEventListener('click', () => {
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
    const host = document.getElementById('family-resources-summary');
    const byCategory = familyResourceSummary(name);
    const cats = Object.keys(byCategory);
    if (cats.length === 0) {
        host.innerHTML = '<div class="opinion-empty">Nessuna risorsa controllata.</div>';
        return;
    }
    host.innerHTML = resConfig
        .filter(rc => byCategory[rc.key])
        .map(rc => `
            <div class="resource-summary-group">
                <div class="resource-summary-label" style="color:${rc.color}">${rc.icon} ${escHtml(rc.label)}</div>
                <div class="resource-summary-chips">
                    ${byCategory[rc.key].map(({ res, bodies }) => `
                        <div class="trait-chip" style="border-color:${rc.color}">
                            ${escHtml(res.name)}
                            <div class="trait-tooltip">${escHtml(bodies.join(', '))}</div>
                        </div>`).join('')}
                </div>
            </div>`).join('');
}

// "Flotte": stationed-by-planet counts (byId already folds in the
// auto-fill-at-home default, so this matches what's actually drawn on the
// map) plus in-transit warpaths with remaining time (same math as
// showPathInfo()). Rows are clickable, same jump-to-map pattern as
// renderTerritories().
function renderFleetLocations(name) {
    const host = document.getElementById('family-fleet-locations');
    const { stationed, transit } = familyFleetLocations(name);
    if (stationed.length === 0 && transit.length === 0) {
        host.innerHTML = '<div class="opinion-empty">Nessuna flotta rilevata.</div>';
        return;
    }
    const positions = computeAllPositions(tick);
    const stationedHtml = stationed.map(({ body, count }) => `
        <div class="fleet-row" data-body="${escHtml(body.id)}">
            <span class="fleet-icon">🛰</span>
            <span class="fleet-location">${escHtml(body.name)}</span>
            <span class="fleet-count">${count} flott${count === 1 ? 'a' : 'e'}</span>
        </div>`).join('');
    const transitHtml = transit.map((path, i) => {
        const pts = path.ids.map(id => positions[id]).filter(Boolean);
        let totalLen = 0;
        for (let j = 0; j < pts.length - 1; j++) totalLen += Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y);
        const pacingLen = path._totalLenAtDeparture ?? totalLen;
        const elapsed = tick - path.departure;
        const remainingSVG = Math.max(0, pacingLen - elapsed * 4 * DIST_SCALE);
        const remainingMonths = (remainingSVG / (DIST_SCALE * 4)).toFixed(1);
        const routeName = path.name || path.ids.map(id => (byId[id] && byId[id].name) || id).join(' → ');
        return `
            <div class="fleet-row" data-transit-idx="${i}">
                <span class="fleet-icon">⚔</span>
                <span class="fleet-location">${escHtml(routeName)}</span>
                <span class="fleet-count">~${remainingMonths} mesi rimanenti</span>
            </div>`;
    }).join('');
    host.innerHTML = `
        ${stationed.length ? `<h3 class="family-subsection-label">In stazionamento</h3>${stationedHtml}` : ''}
        ${transit.length ? `<h3 class="family-subsection-label">In transito</h3>${transitHtml}` : ''}`;

    host.querySelectorAll('.fleet-row[data-body]').forEach(row => {
        row.addEventListener('click', () => {
            const id = row.dataset.body;
            closeFamilyOverlay();
            focusOnBody(id);
            showInfo(byId[id]);
        });
    });
    host.querySelectorAll('.fleet-row[data-transit-idx]').forEach(row => {
        row.addEventListener('click', () => {
            const path = transit[Number(row.dataset.transitIdx)];
            closeFamilyOverlay();
            focusOnPath(path);
            const pts = path.ids.map(id => positions[id]).filter(Boolean);
            let totalLen = 0;
            for (let j = 0; j < pts.length - 1; j++) totalLen += Math.hypot(pts[j + 1].x - pts[j].x, pts[j + 1].y - pts[j].y);
            showPathInfo(path, totalLen);
        });
    });
}

// "Trattati": every treaty this family currently holds, with who -- plain
// clickable list (treatiesByFamily is otherwise only consumed internally
// for opinion/modifier computation, never rendered on its own).
function renderFamilyTreaties(name) {
    const host = document.getElementById('family-treaties-list');
    const treaties = treatiesByFamily[name] || [];
    if (treaties.length === 0) {
        host.innerHTML = '<div class="opinion-empty">Nessun trattato in essere.</div>';
        return;
    }
    host.innerHTML = treaties.map((t, i) => {
        const { base } = baseTreatyType(t.type);
        const info = treatyTypesByName[base];
        return `
            <div class="treaty-row" data-idx="${i}">
                <span class="treaty-type">${escHtml(t.type)}</span>
                <span class="treaty-partner">con ${escHtml(t.to)}</span>
                ${info ? `<div class="trait-tooltip">${escHtml(info.description)}</div>` : ''}
            </div>`;
    }).join('');
    host.querySelectorAll('.treaty-row').forEach((row, i) => {
        row.addEventListener('click', () => showFamilyOverlay(treaties[i].to));
    });
}

// Family overlay "Asset" section: auto-computed craftable assets this family
// currently qualifies for (all_info/assets.json's craftAssets, same
// qualification logic as the global Craftable tab) plus any one-of-a-kind
// assets unique to this family (assets.json's familyAssets, e.g. heirlooms).
function renderAssets(name) {
    const craftHost = document.getElementById('family-craftable-list');
    const uniqueHost = document.getElementById('family-unique-assets-list');

    const craftable = familyCraftableAssets(name);
    craftHost.innerHTML = craftable.length === 0
        ? '<div class="opinion-empty">Nessun asset craftabile con le risorse attuali.</div>'
        : craftable.map(a => {
            const reqPills = (a.requirementIds || []).map(rid => {
                const res = resourcesById[rid];
                return `<span class="craft-req-pill">${escHtml((res && res.name) || rid)}</span>`;
            }).join('');
            return `
                <div class="family-asset-item">
                    <div class="family-asset-header">
                        <span class="family-asset-name">${escHtml(a.name || '—')}</span>
                        <span class="family-asset-type">${escHtml(a.type || '')}</span>
                    </div>
                    <div class="family-asset-desc">${escHtml(a.description || '')}</div>
                    <div class="craft-req-list">${reqPills}</div>
                </div>`;
        }).join('');

    // Treaty-granted assets (unique-category treaties, e.g. Supporto Arcano
    // -> "Maghi di Ion") have no fixed owner in assets.json -- multiple
    // families can hold the same treaty type at once, so whoever currently
    // has the treaty gets the asset, resolved here rather than pinned to a
    // static owner.
    const treatyGranted = (treatiesByFamily[name] || [])
        .map(t => {
            const { base } = baseTreatyType(t.type);
            const info = treatyTypesByName[base];
            return info && info.grantsAsset ? { ...info.grantsAsset, _via: t.type, _with: t.to } : null;
        })
        .filter(Boolean);

    const unique = [...(familyAssetsByOwner[name] || []), ...treatyGranted];
    if (!assetsKnown(name)) {
        uniqueHost.innerHTML = '<div class="opinion-empty locked">🔒 I giocatori non hanno ancora scoperto gli asset unici di questa famiglia.</div>';
        return;
    }
    uniqueHost.innerHTML = unique.length === 0
        ? '<div class="opinion-empty">Nessun asset unico registrato.</div>'
        : unique.map(a => `
            <div class="family-asset-item unique">
                <div class="family-asset-header">
                    <span class="family-asset-name">${escHtml(a.name || '—')}</span>
                    <span class="family-asset-type">${escHtml(a.type || '')}</span>
                </div>
                ${a._via ? `<div class="family-asset-via">Da ${escHtml(a._via)} con ${escHtml(a._with)}</div>` : ''}
                <div class="family-asset-desc">${escHtml(a.description || '')}</div>
                ${a.effect ? `<div class="family-asset-effect">✦ ${escHtml(a.effect)}</div>` : ''}
            </div>`).join('');
}

// Planet info panel: assets tied to this specific place (all_info/assets.json's
// localizedAssets), shown regardless of who currently owns it -- unlike
// family assets, these follow the place if it's ever conquered.
function renderLocalizedAssets(bodyId) {
    const host = document.getElementById('info-localized-assets');
    if (!host) return;
    const list = (bodyId && localizedAssetsByBody[bodyId]) || [];
    if (list.length === 0) { host.innerHTML = ''; host.style.display = 'none'; return; }
    host.style.display = 'block';
    host.innerHTML = list.map(a => `
        <div class="family-asset-item">
            <div class="family-asset-header">
                <span class="family-asset-name">${escHtml(a.name || '—')}</span>
                <span class="family-asset-type">${escHtml(a.type || '')}</span>
            </div>
            <div class="family-asset-desc">${escHtml(a.description || '')}</div>
            ${a.effect ? `<div class="family-asset-effect">✦ ${escHtml(a.effect)}</div>` : ''}
        </div>`).join('');
}

function renderLeaders(name) {
    const row = document.getElementById('family-leaders-row');
    row.innerHTML = '';
    const leaders = leadersByFamily[name] || [];
    for (let i = 0; i < 3; i++) {
        const leader = leaders[i];
        if (!leader) {
            const card = document.createElement('div');
            card.className = 'leader-card empty';
            card.textContent = 'Posizione vacante';
            row.appendChild(card);
            continue;
        }
        const card = document.createElement('div');
        card.className = 'leader-card';
        const img = document.createElement('img');
        img.className = 'leader-portrait';
        img.src = leader.portrait;
        img.alt = leader.name;
        img.onerror = () => { img.onerror = null; img.src = 'images/court/Position Empty.webp'; };
        card.appendChild(img);
        const nameEl = document.createElement('div');
        nameEl.className = 'leader-name';
        nameEl.textContent = leader.name;
        card.appendChild(nameEl);
        const roleEl = document.createElement('div');
        roleEl.className = 'leader-role';
        roleEl.textContent = leader.role || '';
        card.appendChild(roleEl);
        const traitsEl = document.createElement('div');
        traitsEl.className = 'leader-traits';
        (leader.traits || []).forEach((traitId, traitIdx) => {
            const trait = traitsById[traitId];
            if (!trait) return;
            if (!leaderTraitKnown(name, leader.role, traitIdx)) {
                const chip = document.createElement('div');
                chip.className = 'trait-chip locked';
                chip.textContent = '🔒 ???';
                chip.title = 'I giocatori non hanno ancora scoperto questo tratto';
                traitsEl.appendChild(chip);
                return;
            }
            const chip = document.createElement('div');
            chip.className = 'trait-chip';
            chip.textContent = trait.label;
            const tip = document.createElement('div');
            tip.className = 'trait-tooltip';
            tip.innerHTML = `<div>${escHtml(trait.description || '')}</div>` +
                (trait.modifiers || []).map(formatModifierLine).join('');
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
function modifierLabel(m) { return m.stat || m.action || m.armies || ''; }
function formatModifierLine(m) {
    const isArmies = !!m.armies;
    const sign = (typeof m.amount === 'number' && m.amount > 0) ? '+' : '';
    const marker = isArmies ? '⚔ ' : '';
    return `<div class="modline${isArmies ? ' armies-mod' : ''}">${marker}${sign}${escHtml(m.amount)} ${escHtml(modifierLabel(m))} — ${escHtml(m.situation || 'Always')}</div>`;
}

// Mirrors script.js's `actions` object (the canonical 9-action list) so
// this page can group modifiers by which roll they'd actually apply to,
// without loading script.js itself (this page has no dice-roll UI of its
// own). Keep in sync if the action list or its rolled stats ever change.
const ACTION_ROLLS = {
    "Attacco": ["might", "treasure"],
    "Difesa": ["might", "territory"],
    "Spionaggio": ["influence", "treasure"],
    "Controspionaggio": ["influence", "territory"],
    "Controllo dell'Ordine": ["might", "sovereignty"],
    "Guerra Non Convenzionale (richiede un leader)": ["influence", "might"],
    "Raccolta Informazioni": ["influence", "sovereignty"],
    "Aumento Stat": ["might", "sovereignty", "influence", "territory", "treasure"],
    "Diplomazia": ["influence", "treasure"],
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
    Object.keys(ACTION_ROLLS).forEach(action => { groups[action] = []; });
    const nonRoll = [];
    mods.forEach(entry => {
        const m = entry.modifier;
        if (m.armies) { nonRoll.push(entry); return; }
        if (m.action) {
            // A handful of trait actions are war-reason-qualified variants
            // of a base action ("Attacco (Conquista)", "Attacco
            // (Umiliazione)") rather than one of the 9 standardized names
            // verbatim -- strip the "(...)" qualifier to find the base
            // action to bucket under; the qualifier itself stays visible in
            // the rendered line via modifierLabel(m).
            const baseAction = m.action.replace(/\s*\(.*\)\s*$/, '');
            const target = groups[m.action] ? m.action : (groups[baseAction] ? baseAction : null);
            if (target) groups[target].push(entry);
            else nonRoll.push(entry);
            return;
        }
        const stat = (m.stat || '').toLowerCase();
        Object.entries(ACTION_ROLLS).forEach(([action, rolls]) => {
            if (stat === 'all' || rolls.includes(stat)) groups[action].push(entry);
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
    const section = document.getElementById('family-bonuses-section');
    if (section) section.style.display = devRevealAll ? '' : 'none';
    if (!devRevealAll) return;
    const host = document.getElementById('family-active-bonuses');
    if (!host) return;
    const mods = familyActiveModifiers(name);
    if (mods.length === 0) {
        host.innerHTML = '<div class="opinion-empty">Nessun bonus attivo registrato.</div>';
        return;
    }
    const { groups, nonRoll } = groupModifiersByAction(mods);
    const renderRows = list => list.map(({ source, modifier }) => `
        <div class="active-bonus-row${modifier.armies ? ' armies-mod' : ''}">
            <span class="active-bonus-source">${escHtml(source)}</span>
            <span class="active-bonus-line">${formatModifierLine(modifier)}</span>
        </div>`).join('');

    const sections = Object.entries(groups)
        .filter(([, list]) => list.length > 0)
        .map(([action, list]) => `
            <div class="active-bonus-group">
                <h3 class="family-subsection-label">${escHtml(action)}</h3>
                ${renderRows(list)}
            </div>`);

    if (nonRoll.length > 0) {
        sections.push(`
            <div class="active-bonus-group">
                <h3 class="family-subsection-label">Altri bonus (non legati a un tiro)</h3>
                ${renderRows(nonRoll)}
            </div>`);
    }

    host.innerHTML = sections.length
        ? sections.join('')
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
            if (contribution) pairs.push({ a, b, pctA, pctB, matrixVal, contribution });
        }
    }
    pairs.sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));
    return pairs.slice(0, n);
}
// Returns null when either family lacks the government/planet data this
// needs (e.g. an NPC faction with no companies.json entry).
function computeDiplomaticBaseline(nameA, nameB) {
    const a = companiesByName[nameA], b = companiesByName[nameB];
    if (!a || !b) return null;
    const planetA = planetRaceComposition[a.planet] ? a.planet : null;
    const planetB = planetRaceComposition[b.planet] ? b.planet : null;
    const government = (governmentCompatibility[a.government] || {})[b.government] ?? 0;
    const race = planetA && planetB
        ? weightedCompatibility(raceCompatibility, planetRaceComposition[planetA], planetRaceComposition[planetB]) : 0;
    const religion = planetA && planetB
        ? weightedCompatibility(religionCompatibility, planetReligionComposition[planetA], planetReligionComposition[planetB]) : 0;
    return { government, race, religion, total: government + race + religion };
}
function fmtBaselineNum(v) {
    const n = Math.round(v * 10) / 10;
    return (n > 0 ? '+' : '') + (Number.isInteger(n) ? n : n.toFixed(1));
}

// Curated total for one direction = live treaty-derived opinion
// (treatyOpinionsByFamily, mirrored both ways per treaty edge at load time)
// + opinions.json's hand-authored story-beat modifiers for this pair (now
// the only thing that file holds) + the diplomatic baseline.
function computeOpinionBreakdown(from, to) {
    const mods = [...((treatyOpinionsByFamily[from] || {})[to] || []), ...((opinionsByFamily[from] || {})[to] || [])];
    const curatedTotal = mods.reduce((sum, m) => sum + (m.value || 0), 0);
    const baseline = computeDiplomaticBaseline(from, to);
    const total = curatedTotal + (baseline ? baseline.total : 0);
    return { mods, baseline, total };
}

// Renders the baseline (Governo/Popolazione/Religione) + curated modifier
// pills for one direction as an HTML string -- shared by every column of
// the opinions table's expanded row detail.
function opinionBreakdownHtml(from, to, { mods, baseline }) {
    let html = '';
    const a = companiesByName[from], b = companiesByName[to];
    if (baseline && a && b) {
        const topA = topComposition(planetRaceComposition[a.planet]).map(([n, p]) => `${p}% ${escHtml(n)}`).join(', ');
        const topB = topComposition(planetRaceComposition[b.planet]).map(([n, p]) => `${p}% ${escHtml(n)}`).join(', ');
        const raceContribs = topContributingPairs(raceCompatibility, planetRaceComposition[a.planet], planetRaceComposition[b.planet])
            .map(c => `${escHtml(c.a)} (${c.pctA}%) × ${escHtml(c.b)} (${c.pctB}%) × ${c.matrixVal} = ${fmtBaselineNum(c.contribution)}`);
        const topRelA = topComposition(planetReligionComposition[a.planet]).map(([n, p]) => `${p}% ${escHtml(n)}`).join(', ');
        const topRelB = topComposition(planetReligionComposition[b.planet]).map(([n, p]) => `${p}% ${escHtml(n)}`).join(', ');
        const religionContribs = topContributingPairs(religionCompatibility, planetReligionComposition[a.planet], planetReligionComposition[b.planet])
            .map(c => `${escHtml(c.a)} (${c.pctA}%) × ${escHtml(c.b)} (${c.pctB}%) × ${c.matrixVal} = ${fmtBaselineNum(c.contribution)}`);
        html += `<span class="opinion-mod baseline ${baseline.government >= 0 ? 'positive' : 'negative'}">Governo ${fmtBaselineNum(baseline.government)}
            <div class="trait-tooltip"><div>${escHtml(a.government)} (${escHtml(from)}) ↔ ${escHtml(b.government)} (${escHtml(to)})</div><div class="modline">Totale = ${fmtBaselineNum(baseline.government)}</div></div></span>`;
        html += `<span class="opinion-mod baseline ${baseline.race >= 0 ? 'positive' : 'negative'}">Popolazione ${fmtBaselineNum(baseline.race)}
            <div class="trait-tooltip"><div>${escHtml(from)}: ${topA || '—'}</div><div>${escHtml(to)}: ${topB || '—'}</div>${(raceContribs.length ? raceContribs : ['(nessun contributo significativo)']).map(l => `<div class="modline">${l}</div>`).join('')}<div class="modline">Totale = ${fmtBaselineNum(baseline.race)}</div></div></span>`;
        html += `<span class="opinion-mod baseline ${baseline.religion >= 0 ? 'positive' : 'negative'}">Religione ${fmtBaselineNum(baseline.religion)}
            <div class="trait-tooltip"><div>${escHtml(from)}: ${topRelA || '—'}</div><div>${escHtml(to)}: ${topRelB || '—'}</div>${(religionContribs.length ? religionContribs : ['(nessun contributo significativo)']).map(l => `<div class="modline">${l}</div>`).join('')}<div class="modline">Totale = ${fmtBaselineNum(baseline.religion)}</div></div></span>`;
    }
    mods.forEach(m => {
        const typeInfo = treatyTypesByName[m.label] || treatyTypesByName[(m.label || '').replace(/ (su|da)$/, '')];
        html += `<span class="opinion-mod ${m.value >= 0 ? 'positive' : 'negative'}">${escHtml(m.label)} ${m.value > 0 ? '+' : ''}${m.value}${typeInfo ? `<div class="trait-tooltip">${escHtml(typeInfo.description)}</div>` : ''}</span>`;
    });
    return html || '<div class="opinion-empty">Nessun modificatore.</div>';
}

const fmtOpinionTotal = t => (t > 0 ? '+' : '') + (Number.isInteger(t) ? t : t.toFixed(1));
const opinionTotalClass = t => t > 0 ? 'positive' : t < 0 ? 'negative' : 'neutral';

// Opinions table: one row per other family with three columns -- Noi→Loro,
// Loro→Noi, and Loro→La Mano (a constant reference column showing how much
// every other family likes/dislikes the player family, regardless of whose
// overlay you're viewing -- omitted when already viewing La Mano's own
// overlay, since it would just repeat column 2). Row click toggles a detail
// panel below it with the full breakdown for all three directions;
// clicking the family name itself jumps straight to their overlay instead.
function renderOpinions(name) {
    const list = document.getElementById('family-opinions-list');
    list.innerHTML = '';

    const otherNames = Object.keys(companiesByName).filter(n => n !== name);
    const showHandColumn = name !== PLAYER_FAMILY;

    const rows = otherNames.map(other => ({
        other,
        ours: computeOpinionBreakdown(name, other),
        theirs: computeOpinionBreakdown(other, name),
        theirsOfHand: showHandColumn ? computeOpinionBreakdown(other, PLAYER_FAMILY) : null,
    }));
    rows.sort((a, b) => Math.abs(b.ours.total) - Math.abs(a.ours.total));

    if (rows.length === 0) {
        list.innerHTML = '<div class="opinion-empty">Nessuna relazione registrata.</div>';
        return;
    }

    const table = document.createElement('div');
    table.className = 'opinion-table';
    const header = document.createElement('div');
    header.className = 'opinion-table-row opinion-table-header';
    header.innerHTML = `
        <span class="opinion-family-name">Famiglia</span>
        <span class="opinion-total-header">Noi → Loro</span>
        <span class="opinion-total-header">Loro → Noi</span>
        ${showHandColumn ? `<span class="opinion-total-header">Loro → ${escHtml(PLAYER_FAMILY)}</span>` : ''}`;
    table.appendChild(header);

    rows.forEach(({ other, ours, theirs, theirsOfHand }) => {
        const row = document.createElement('div');
        row.className = 'opinion-table-row';
        row.innerHTML = `
            <span class="opinion-family-name"><span class="opinion-dot" style="background:${familyColor(other)}"></span>${escHtml(other)}</span>
            <span class="opinion-total ${opinionTotalClass(ours.total)}">${fmtOpinionTotal(ours.total)}</span>
            <span class="opinion-total ${opinionTotalClass(theirs.total)}">${fmtOpinionTotal(theirs.total)}</span>
            ${showHandColumn ? `<span class="opinion-total ${opinionTotalClass(theirsOfHand.total)}">${fmtOpinionTotal(theirsOfHand.total)}</span>` : ''}`;

        const detail = document.createElement('div');
        detail.className = 'opinion-detail';
        detail.innerHTML = `
            <div class="opinion-detail-block">
                <h4>Noi → Loro</h4>
                <div class="opinion-modifiers">${opinionBreakdownHtml(name, other, ours)}</div>
            </div>
            <div class="opinion-detail-block">
                <h4>Loro → Noi</h4>
                <div class="opinion-modifiers">${opinionBreakdownHtml(other, name, theirs)}</div>
            </div>
            ${showHandColumn ? `
            <div class="opinion-detail-block">
                <h4>Loro → ${escHtml(PLAYER_FAMILY)}</h4>
                <div class="opinion-modifiers">${opinionBreakdownHtml(other, PLAYER_FAMILY, theirsOfHand)}</div>
            </div>` : ''}`;

        row.addEventListener('click', () => {
            const isOpen = detail.classList.contains('open');
            table.querySelectorAll('.opinion-detail.open').forEach(d => d.classList.remove('open'));
            if (!isOpen) detail.classList.add('open');
        });
        row.querySelector('.opinion-family-name').addEventListener('click', e => {
            e.stopPropagation();
            showFamilyOverlay(other);
        });

        table.appendChild(row);
        table.appendChild(detail);
    });

    list.appendChild(table);
}

function closeFamilyOverlay() {
    document.getElementById('family-overlay').classList.remove('open');
    currentOverlayFamily = null;
}
document.getElementById('family-overlay-close').addEventListener('click', closeFamilyOverlay);
document.getElementById('family-overlay-backdrop').addEventListener('click', closeFamilyOverlay);
window.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeFamilyOverlay();
});

// Maintainer-only "reveal all" toggle: bypasses reveals.json gating (and
// shows the GM-only Bonus Attivi section) client-side for prep/reference.
// Never persisted — resets on reload, doesn't touch the JSON. No visible
// button (players could stumble onto it) — Ctrl+Shift+G instead, with a
// brief toast so a GM still gets confirmation it toggled.
let gmToastTimeout = null;
function showGmToast(text) {
    const toast = document.getElementById('gm-toast');
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(gmToastTimeout);
    gmToastTimeout = setTimeout(() => toast.classList.remove('show'), 1800);
}
window.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        devRevealAll = !devRevealAll;
        showGmToast(devRevealAll ? '👁 Modalità GM attiva' : 'Modalità GM disattivata');
        if (currentOverlayFamily) showFamilyOverlay(currentOverlayFamily);
    }
});

// ── PERSISTENT FAMILY LIST ────────────────────────────────────────────────────
function buildFamiliesPanel() {
    const list = document.getElementById('families-list');
    list.innerHTML = '';
    Object.keys(companiesByName).sort().forEach(name => {
        const color = familyColor(name);
        const row = document.createElement('div');
        row.className = 'families-list-row';
        row.style.borderLeftColor = color;
        row.style.setProperty('--row-accent', color);
        const crest = document.createElement('img');
        crest.className = 'families-list-crest';
        const crestFile = CREST_OVERRIDES[name] || `${name.replace(/\s+/g, '')}Icon.png`;
        crest.src = `images/symbols/${crestFile}`;
        crest.alt = name;
        crest.onerror = () => { crest.onerror = null; crest.src = 'images/court/Position Empty.webp'; };
        row.appendChild(crest);
        const label = document.createElement('span');
        label.className = 'families-list-name';
        label.textContent = name;
        row.appendChild(label);
        row.addEventListener('click', () => showFamilyOverlay(name));
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
    Object.values(byId).forEach(b => {
        if (!b || typeof b !== 'object' || Array.isArray(b) || !b.id) return;
        if (b.owner === name) (b.resourceIds || []).forEach(id => ids.add(id));
    });
    return ids;
}
// Every body (planet/moon/base/point) a family controls, for the overlay's
// "Territori Controllati" list.
function familyTerritories(name) {
    return Object.values(byId).filter(b =>
        b && typeof b === 'object' && !Array.isArray(b) && b.id && b.id !== 'sun' && b.owner === name);
}
// Total fleets a family currently has anywhere on the map -- stationed at a
// body plus in transit on a warpath -- compared against the game-balance
// rule that a family should never field more than ceil(might/2) at once
// (all_info/fleets.json is the single source for both categories).
function familyFleetCount(name) {
    let count = 0;
    stationedFleets.forEach(s => { (s.fleets || []).forEach(f => { if (f === name) count++; }); });
    allWarpaths.forEach(w => { (w.fleets || []).forEach(f => { if (f === name) count++; }); });
    return count;
}

// Every resource id a family controls, grouped by category and deduped,
// each noting which owned body/bodies it comes from -- for the overlay's
// "Risorse Controllate" section. Unlike familyResourceIds() (a flat Set
// used for craft-asset qualification), this keeps the body attribution.
function familyResourceSummary(name) {
    const byResource = {}; // resourceId -> Set of body names
    Object.values(byId).forEach(b => {
        if (!b || typeof b !== 'object' || Array.isArray(b) || !b.id) return;
        if (b.owner !== name) return;
        (b.resourceIds || []).forEach(rid => {
            (byResource[rid] = byResource[rid] || new Set()).add(b.name);
        });
    });
    const byCategory = {};
    Object.entries(byResource).forEach(([rid, bodies]) => {
        const res = resourcesById[rid];
        if (!res) return;
        (byCategory[res.category] = byCategory[res.category] || []).push({ res, bodies: [...bodies] });
    });
    return byCategory;
}

// Where a family's fleets currently are: stationed at a body (byId's
// .fleets already includes the game-balance auto-fill-at-home default, so
// this matches what's actually drawn on the map) plus in transit on a
// warpath (byId.__paths, which already has _totalLenAtDeparture cached by
// updateScene() for the remaining-time math, same as showPathInfo()).
function familyFleetLocations(name) {
    const stationed = [];
    Object.values(byId).forEach(b => {
        if (!b || typeof b !== 'object' || Array.isArray(b) || !b.id || b.id === 'sun') return;
        const count = (b.fleets || []).filter(f => f === name).length;
        if (count > 0) stationed.push({ body: b, count });
    });
    const transit = (byId.__paths || []).filter(p => p.type === 'warpath' && (p.fleets || []).includes(name));
    return { stationed, transit };
}
function qualifiesFor(asset, resourceIdSet) {
    return (asset.requirementIds || []).every(rid => resourceIdSet.has(rid));
}
// Craftable assets (all_info/assets.json's craftAssets) that a given family
// currently qualifies for -- same qualification logic as the global
// Craftable tab, just pre-filtered to one family for the overlay's Asset section.
function familyCraftableAssets(name) {
    const resourceIds = familyResourceIds(name);
    return craftData.filter(a => qualifiesFor(a, resourceIds));
}

// ── TREATY-DERIVED BONUSES (all_info/treaties.json + treaty_types.json) ──────
// A treaty row's `type` string carries its own directional suffix (" su" =
// lord, " da" = vassal/recipient) for the two feudal pacts; every other type
// is symmetric. Stripping the suffix looks up the shared treaty_types.json
// entry; the suffix (if any) picks which side's modifiers apply.
function baseTreatyType(type) {
    for (const suf of [' su', ' da']) {
        if (type.endsWith(suf)) return { base: type.slice(0, -suf.length), side: suf.trim() };
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
        (result[from] = result[from] || {});
        (result[from][to] = result[from][to] || []).push({ label, value });
    };
    treaties.forEach(t => {
        const { base } = baseTreatyType(t.type);
        const info = treatyTypesByName[base];
        const value = info ? (info.opinionValue || 0) : 0;
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
    if (side === 'su') return info.modifiersAsLord || [];
    if (side === 'da') return info.modifiersAsVassal || [];
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

    (leadersByFamily[name] || []).forEach(leader => {
        (leader.traits || []).forEach(traitId => {
            const trait = traitsById[traitId];
            if (!trait) return;
            (trait.modifiers || []).forEach(m => {
                out.push({ source: `Leader: ${leader.name} — ${trait.label}`, modifier: m });
            });
        });
    });

    (treatiesByFamily[name] || []).forEach(t => {
        resolvedTreatyModifiers(t).forEach(m => {
            out.push({ source: `Trattato: ${t.type} con ${t.to}`, modifier: m });
        });
        const { base } = baseTreatyType(t.type);
        const info = treatyTypesByName[base];
        if (info && info.grantsAsset && info.grantsAsset.effect) {
            out.push({
                source: `Trattato: ${t.type} con ${t.to}`,
                modifier: { stat: info.grantsAsset.name, amount: 0, situation: info.grantsAsset.effect, always: true, isAssetEffect: true },
            });
        }
    });

    (familyAssetsByOwner[name] || []).forEach(a => {
        (a.modifiers || []).forEach(m => out.push({ source: `Asset: ${a.name}`, modifier: m }));
    });
    familyTerritories(name).forEach(b => {
        (localizedAssetsByBody[b.id] || []).forEach(a => {
            (a.modifiers || []).forEach(m => out.push({ source: `Asset: ${a.name} (${b.name})`, modifier: m }));
        });
    });
    familyCraftableAssets(name).forEach(a => {
        (a.modifiers || []).forEach(m => out.push({ source: `Asset: ${a.name}`, modifier: m }));
    });

    return out;
}

function buildAtlasPanel(filter = '') {
    const host = document.getElementById('atlas-list');
    if (!host) return;
    host.innerHTML = '';
    const q = filter.toLowerCase().trim();

    resConfig.forEach(rc => {
        const inCategory = Object.values(resourcesById).filter(r => r.category === rc.key);
        const rows = inCategory
            .filter(res => !q || res.name.toLowerCase().includes(q))
            .map(res => {
                const holders = Object.values(byId).filter(b =>
                    b && typeof b === 'object' && !Array.isArray(b) && b.id && (b.resourceIds || []).includes(res.id));
                return { res, holders };
            })
            .filter(({ holders }) => q || holders.length > 0);
        if (rows.length === 0) return;

        const card = document.createElement('div');
        card.className = 'asset-card';
        card.innerHTML = `<div class="res-header" style="color:${rc.color}">${rc.icon} ${rc.label}</div>`;
        rows.forEach(({ res, holders }) => {
            const resBlock = document.createElement('div');
            resBlock.className = 'atlas-resource';
            const usedBy = craftData.filter(a => (a.requirementIds || []).includes(res.id)).map(a => a.name);
            const tipText = usedBy.length ? `Ingrediente per: ${usedBy.join(', ')}` : '';
            resBlock.innerHTML = `<div class="atlas-resource-name" title="${escHtml(tipText)}">${escHtml(res.name)}</div>`;
            const holdersEl = document.createElement('div');
            holdersEl.className = 'atlas-holders';
            if (holders.length === 0) {
                holdersEl.innerHTML = '<span class="atlas-none">Nessun pianeta noto</span>';
            } else {
                holders.forEach(b => {
                    const chip = document.createElement('span');
                    chip.className = 'atlas-holder-chip';
                    chip.innerHTML = `<span class="owner-dot" style="background:${familyColor(b.owner)}"></span>${escHtml(b.name)}`;
                    chip.title = b.owner || '';
                    chip.addEventListener('click', () => { focusOnBody(b.id); showInfo(b); });
                    holdersEl.appendChild(chip);
                });
            }
            resBlock.appendChild(holdersEl);
            card.appendChild(resBlock);
        });
        host.appendChild(card);
    });
}

function buildCraftPanel(filter = '') {
    const list = document.getElementById('craft-list');
    const empty = document.getElementById('craft-empty');
    if (!list) return;
    list.innerHTML = '';
    const q = filter.toLowerCase().trim();

    const familyResources = {};
    Object.keys(companiesByName).forEach(name => { familyResources[name] = familyResourceIds(name); });

    const filtered = q
        ? craftData.filter(r => (r.name || '').toLowerCase().includes(q) || (r.type || '').toLowerCase().includes(q))
        : craftData;

    if (filtered.length === 0) {
        if (empty) { empty.style.display = 'block'; empty.textContent = q ? 'Nessun risultato.' : 'Nessun asset disponibile.'; }
        return;
    }
    if (empty) empty.style.display = 'none';

    filtered.forEach(r => {
        const item = document.createElement('div');
        item.className = 'craft-item';
        const reqPills = (r.requirementIds || []).map(rid => {
            const res = resourcesById[rid];
            return `<span class="craft-req-pill">${escHtml((res && res.name) || rid)}</span>`;
        }).join('');

        const qualifiers = Object.keys(companiesByName).filter(name => qualifiesFor(r, familyResources[name]));
        const qualifiersHtml = qualifiers.length
            ? qualifiers.map(name => `<span class="craft-qualifier-chip" style="border-color:${familyColor(name)}">${escHtml(name)}</span>`).join('')
            : '<span style="color:#444">Nessuna famiglia qualificata al momento</span>';

        item.innerHTML = `
            <div class="craft-item-header">
                <span class="craft-item-name">${escHtml(r.name || '—')}</span>
                <span class="craft-item-type">${escHtml(r.type || '')}</span>
                <span class="craft-item-chevron">▶</span>
            </div>
            <div class="craft-item-detail">
                <div class="craft-detail-row"><span class="craft-detail-label">⏱ Tempo</span><span class="craft-detail-value">${escHtml(r.generationTime || '—')}</span></div>
                <div class="craft-detail-row"><span class="craft-detail-label">🔩 Requisiti</span><div class="craft-req-list">${reqPills || '<span style="color:#444">—</span>'}</div></div>
                <div class="craft-detail-desc">${escHtml(r.description || '—')}</div>
                <div class="craft-detail-row"><span class="craft-detail-label">✅ Disponibile a</span><div class="craft-req-list">${qualifiersHtml}</div></div>
            </div>`;
        item.querySelector('.craft-item-header').addEventListener('click', () => {
            const wasOpen = item.classList.contains('expanded');
            list.querySelectorAll('.craft-item.expanded').forEach(e => e.classList.remove('expanded'));
            if (!wasOpen) item.classList.add('expanded');
        });
        list.appendChild(item);
    });
}

document.querySelectorAll('.res-subtab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.res-subtab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.res-subtab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${btn.dataset.subtab}-panel`).classList.add('active');
    });
});
document.getElementById('resources-search-input').addEventListener('input', e => {
    buildAtlasPanel(e.target.value);
    buildCraftPanel(e.target.value);
});

// ── RULER ─────────────────────────────────────────────────────────────────────
let rulerActive = false, rulerStart = null;
const rulerBtn = document.getElementById('rulerBtn');
const rulerTooltip = document.getElementById('ruler-tooltip');
const rulerLayer = document.createElementNS(NS, 'g');
rulerLayer.setAttribute('id', 'ruler-layer');
svg.appendChild(rulerLayer);

rulerBtn.addEventListener('click', () => {
    rulerActive = !rulerActive;
    rulerBtn.classList.toggle('active', rulerActive);
    rulerStart = null;
    rulerLayer.innerHTML = '';
    rulerTooltip.style.display = 'none';
    svg.style.cursor = rulerActive ? 'crosshair' : 'grab';
});

function svgPoint(e) {
    const rect = svg.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    return { x: vb.x + (cx / rect.width) * vb.w, y: vb.y + (cy / rect.height) * vb.h };
}
function pxToWeeks(dx, dy) { return (Math.hypot(dx, dy) / DIST_SCALE).toFixed(2); }
// Keeps any fixed-position popup fully on-screen regardless of anchor position.
function clampToViewport(left, top, w, h, pad = 8) {
    return {
        left: Math.max(pad, Math.min(left, window.innerWidth - w - pad)),
        top: Math.max(pad, Math.min(top, window.innerHeight - h - pad)),
    };
}

svg.addEventListener('click', e => {
    if (!rulerActive) return;
    e.stopPropagation();
    const pt = svgPoint(e);
    if (!rulerStart) {
        rulerStart = pt;
        rulerLayer.innerHTML = '';
        rulerLayer.appendChild(el('circle', { cx: pt.x, cy: pt.y, r: 8, fill: '#ffc840', opacity: '0.9' }));
    } else {
        drawRulerLine(rulerStart, pt, true);
        rulerStart = null;
    }
});
svg.addEventListener('mousemove', e => {
    if (!rulerActive || !rulerStart) return;
    const pt = svgPoint(e);
    drawRulerLine(rulerStart, pt, false);
    const weeks = pxToWeeks(pt.x - rulerStart.x, pt.y - rulerStart.y);
    rulerTooltip.style.display = 'block';
    rulerTooltip.textContent = `${weeks} weeks`;
    const tipRect = rulerTooltip.getBoundingClientRect();
    const clamped = clampToViewport(e.clientX + 14, e.clientY - 10, tipRect.width, tipRect.height);
    rulerTooltip.style.left = clamped.left + 'px';
    rulerTooltip.style.top = clamped.top + 'px';
});
function drawRulerLine(a, b, final) {
    rulerLayer.innerHTML = '';
    const weeks = pxToWeeks(b.x - a.x, b.y - a.y);
    rulerLayer.appendChild(el('circle', { cx: a.x, cy: a.y, r: 8, fill: '#ffc840', opacity: '0.9' }));
    const line = el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, stroke: '#ffc840', 'stroke-width': '3', 'stroke-dasharray': '12 8', opacity: '0.85' });
    rulerLayer.appendChild(line);
    rulerLayer.appendChild(el('circle', { cx: b.x, cy: b.y, r: 8, fill: '#ffc840', opacity: final ? '1' : '0.6' }));
    if (final) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const bg = el('rect', { x: mx - 60, y: my - 22, width: 120, height: 28, rx: 6, fill: 'rgba(8,8,22,0.88)', stroke: 'rgba(255,200,80,0.4)', 'stroke-width': '1.5' });
        const txt = el('text', { x: mx, y: my - 3, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#ffc840', 'font-size': '20', 'font-family': 'Courier New, monospace', 'font-weight': '600' });
        txt.textContent = `${weeks} wk`;
        rulerLayer.appendChild(bg);
        rulerLayer.appendChild(txt);
        rulerTooltip.style.display = 'none';
        rulerStart = null;
    }
}
window.addEventListener('keydown', e => {
    if (e.key === 'Escape' && rulerActive) {
        rulerActive = false;
        rulerBtn.classList.remove('active');
        rulerLayer.innerHTML = '';
        rulerStart = null;
        rulerTooltip.style.display = 'none';
        svg.style.cursor = 'grab';
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
const TOOLTIP_HOST_SELECTOR = '.trait-chip, #family-government, .opinion-mod, .treaty-row';
document.addEventListener('mouseover', e => {
    const host = e.target.closest(TOOLTIP_HOST_SELECTOR);
    if (!host) return;
    const tip = host.querySelector('.trait-tooltip');
    if (!tip || tip.style.display === 'block') return;
    tip.style.display = 'block';
    tip.style.position = 'fixed';
    const hostRect = host.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    let top = hostRect.top - tipRect.height - 8;
    if (top < 8) top = hostRect.bottom + 8;
    const left = hostRect.left + hostRect.width / 2 - tipRect.width / 2;
    const clamped = clampToViewport(left, top, tipRect.width, tipRect.height);
    tip.style.left = clamped.left + 'px';
    tip.style.top = clamped.top + 'px';
});
document.addEventListener('mouseout', e => {
    const host = e.target.closest(TOOLTIP_HOST_SELECTOR);
    if (!host || (e.relatedTarget && host.contains(e.relatedTarget))) return;
    const tip = host.querySelector('.trait-tooltip');
    if (tip) tip.style.display = 'none';
});

// ── SEARCH ────────────────────────────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
let searchActiveIdx = -1;

function buildSearchIndex() {
    const index = [];
    Object.values(byId).forEach(b => {
        if (!b || typeof b !== 'object' || Array.isArray(b) || !b.id) return;
        index.push({ type: 'body', id: b.id, name: b.name || b.id, color: b.color || '#aaa', sub: b.type || '' });
    });
    (byId.__paths || []).forEach(p => {
        const label = p.name || p.ids.join(' → ');
        index.push({ type: 'path', id: p.ids[0], name: label, color: p.color || '#aaa', sub: p.type, path: p });
    });
    Object.keys(companiesByName).forEach(name => {
        index.push({ type: 'company', id: name, name, color: familyColor(name), sub: 'famiglia' });
    });
    Object.entries(leadersByFamily).forEach(([family, leaders]) => {
        (leaders || []).forEach(leader => {
            index.push({
                type: 'leader', id: family, name: leader.name,
                color: familyColor(family), sub: `${leader.role || 'Leader'} — ${family}`, family,
            });
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
        const halo = g.querySelector('circle');
        if (halo) { halo.setAttribute('opacity', '0.5'); setTimeout(() => halo.setAttribute('opacity', '0.0'), 600); }
    }
}
function focusOnPath(pathObj) {
    const positions = computeAllPositions(tick);
    const pts = pathObj.ids.map(id => positions[id]).filter(Boolean);
    if (!pts.length) return;
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const pad = 200;
    const newW = Math.max(maxX - minX + pad * 2, vb.w);
    const newH = Math.max(maxY - minY + pad * 2, vb.h);
    vb.x = cx - newW / 2; vb.y = cy - newH / 2;
    vb.w = newW; vb.h = newH;
    applyVB();
}

function renderSearchResults(query) {
    searchResults.innerHTML = '';
    searchActiveIdx = -1;
    if (!query.trim() || !ready) { searchResults.style.display = 'none'; return; }
    const q = query.toLowerCase();
    const index = buildSearchIndex();
    const matches = index.filter(item => item.id.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)).slice(0, 12);
    if (!matches.length) { searchResults.style.display = 'none'; return; }
    matches.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'search-item';
        div.dataset.idx = i;
        div.innerHTML = `<span class="search-dot" style="background:${safeColor(item.color)}"></span><span class="search-name">${escHtml(item.name)}</span><span class="search-sub">${escHtml(item.sub)}</span>`;
        div.addEventListener('mousedown', e => { e.preventDefault(); selectSearchItem(item); });
        searchResults.appendChild(div);
    });
    searchResults._matches = matches;
    searchResults.style.display = 'block';
}
function selectSearchItem(item) {
    searchInput.value = item.name;
    searchResults.style.display = 'none';
    if (item.type === 'body') {
        focusOnBody(item.id);
        showInfo(byId[item.id]);
    } else if (item.type === 'path') {
        focusOnPath(item.path);
        const positions = computeAllPositions(tick);
        const pts = item.path.ids.map(id => positions[id]).filter(Boolean);
        let totalLen = 0;
        for (let i = 0; i < pts.length - 1; i++) totalLen += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        showPathInfo(item.path, totalLen);
    } else if (item.type === 'company') {
        showFamilyOverlay(item.id);
    } else if (item.type === 'leader') {
        showFamilyOverlay(item.family);
    }
}
searchInput.addEventListener('input', e => renderSearchResults(e.target.value));
searchInput.addEventListener('focus', e => renderSearchResults(e.target.value));
searchInput.addEventListener('blur', () => setTimeout(() => { searchResults.style.display = 'none'; }, 150));
searchInput.addEventListener('keydown', e => {
    const items = searchResults.querySelectorAll('.search-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); searchActiveIdx = Math.min(searchActiveIdx + 1, items.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); searchActiveIdx = Math.max(searchActiveIdx - 1, 0); }
    else if (e.key === 'Enter') {
        e.preventDefault();
        const idx = searchActiveIdx >= 0 ? searchActiveIdx : 0;
        if (searchResults._matches?.[idx]) selectSearchItem(searchResults._matches[idx]);
        return;
    } else if (e.key === 'Escape') { searchResults.style.display = 'none'; return; }
    items.forEach((elm, i) => elm.classList.toggle('active', i === searchActiveIdx));
});

// ── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener('resize', () => { vb.w = window.innerWidth; vb.h = window.innerHeight; applyVB(); });

async function init() {
    // Map data is split by how often it changes: bodies.json (planets/moons,
    // never change), points_of_interest.json (bases/points + trade lanes,
    // rarely change), fleets.json (where every family's military currently
    // is -- both stationed and in-transit -- changes constantly, kept in its
    // own small file so that's the only one touched most weeks).
    const [bodiesFile, poiFile, fleetsFile, companies, governi, timeline, traits, leaders, opinions, treatyTypes, treatiesFile, assetsFile, resourcesFile, diplomacy, reveals] = await Promise.all([
        loadJson('all_info/bodies.json', { bodies: [] }),
        loadJson('all_info/points_of_interest.json', { pointsOfInterest: [], tradePaths: [] }),
        loadJson('all_info/fleets.json', { stationed: [], warpaths: [] }),
        loadJson('all_info/companies.json', { companies: [] }),
        loadJson('all_info/governi.json', { governi: [] }),
        loadJson('all_info/timeline.json', { currentMonth: 0, months: [] }),
        loadJson('all_info/traits.json', { traits: [] }),
        loadJson('all_info/leaders.json', { leaders: {} }),
        loadJson('all_info/opinions.json', { opinions: {} }),
        loadJson('all_info/treaty_types.json', { treatyTypes: {} }),
        loadJson('all_info/treaties.json', { treaties: [] }),
        loadJson('all_info/assets.json', { craftAssets: [], familyAssets: [], localizedAssets: [] }),
        loadJson('all_info/resources.json', { resources: [] }),
        loadJson('all_info/diplomacy.json', { governmentCompatibility: {}, raceCompatibility: {}, religionCompatibility: {}, planetRaceComposition: {}, planetReligionComposition: {} }),
        loadJson('all_info/reveals.json', { families: {} }),
    ]);

    companiesByName = {};
    (companies.companies || []).forEach(c => { companiesByName[c.name] = c; });
    governiByName = {};
    (governi.governi || []).forEach(g => { governiByName[g.nome] = g; });
    leadersByFamily = leaders.leaders || {};
    traitsById = {};
    (traits.traits || []).forEach(t => { traitsById[t.id] = t; });
    opinionsByFamily = opinions.opinions || {};
    treatyTypesByName = treatyTypes.treatyTypes || {};
    treatiesByFamily = {};
    (treatiesFile.treaties || []).forEach(t => {
        (treatiesByFamily[t.from] = treatiesByFamily[t.from] || []).push(t);
    });
    treatyOpinionsByFamily = computeTreatyOpinions(treatiesFile.treaties || []);
    craftData = assetsFile.craftAssets || [];
    resourcesById = {};
    (resourcesFile.resources || []).forEach(r => { resourcesById[r.id] = r; });
    timelineByMonth = {};
    (timeline.months || []).forEach(m => { timelineByMonth[m.month] = m; });
    familyAssetsByOwner = {};
    (assetsFile.familyAssets || []).forEach(a => {
        (familyAssetsByOwner[a.owner] = familyAssetsByOwner[a.owner] || []).push(a);
    });
    localizedAssetsByBody = {};
    (assetsFile.localizedAssets || []).forEach(a => {
        (localizedAssetsByBody[a.bodyId] = localizedAssetsByBody[a.bodyId] || []).push(a);
    });
    revealsByFamily = reveals.families || {};
    governmentCompatibility = diplomacy.governmentCompatibility || {};
    raceCompatibility = diplomacy.raceCompatibility || {};
    religionCompatibility = diplomacy.religionCompatibility || {};
    planetRaceComposition = diplomacy.planetRaceComposition || {};
    planetReligionComposition = diplomacy.planetReligionComposition || {};

    // Seed owner colors from companies too (in case a company owns no body yet).
    Object.keys(companiesByName).forEach(name => { if (!ownerColors[name]) ownerColors[name] = '#888888'; });
    buildFamiliesPanel();

    const bodies = [...(bodiesFile.bodies || []), ...(poiFile.pointsOfInterest || [])];
    const paths = [...(poiFile.tradePaths || []), ...(fleetsFile.warpaths || [])];
    stationedFleets = fleetsFile.stationed || [];
    allWarpaths = fleetsFile.warpaths || [];
    if (bodies.length === 0) return;
    loadMap(bodies, paths, timeline, stationedFleets);
    // Atlas/Craftable both read byId (populated by loadMap), so build after.
    buildAtlasPanel();
    buildCraftPanel();
}

init();
