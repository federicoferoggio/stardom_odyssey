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

// ── FOG OF WAR / INFILTRATION ─────────────────────────────────────────────────
// A family's `infiltration` (0-9, from companies.json, everyone starts at 2)
// progressively unlocks what's shown about them:
//   0/1/2  -> leader 1/2/3 identity (all already visible at the starting value)
//   3/4/5  -> Territory/Treasure/Might + that leader's first trait
//   6/7    -> Influence/Sovereignty + leader 1/2's second trait
//   8      -> every remaining leader trait (catch-all)
//   9      -> "Conoscenza Piena": the GM now rolls fully in the open for them
// Government type and opinions toward other families are never gated.
const MAX_INFILTRATION = 9;
const LEADER_IDENTITY_LEVEL = [0, 1, 2];
const STAT_REVEAL_LEVEL = { territory: 3, treasure: 4, might: 5, influence: 6, sovereignty: 7 };
const LEADER_TRAIT_EXTRA_LEVEL = [6, 7, 8];
const ALL_TRAITS_LEVEL = 8;
const FULL_KNOWLEDGE_LEVEL = 9;

let devRevealAll = false;
let currentOverlayFamily = null;

// The site is played from La Mano's own perspective (that's the player-run
// family) -- a family always knows everything about itself, so infiltration
// never gates its own info, independent of the GM-only reveal-all toggle.
const PLAYER_FAMILY = 'La Mano';

function effectiveInfiltration(company) {
    if (devRevealAll) return MAX_INFILTRATION;
    if (company && company.name === PLAYER_FAMILY) return MAX_INFILTRATION;
    return (company && Number(company.infiltration)) || 0;
}
function statUnlocked(infil, statKey) { return infil >= STAT_REVEAL_LEVEL[statKey]; }
function leaderIdentityUnlocked(infil, leaderIndex) { return infil >= (LEADER_IDENTITY_LEVEL[leaderIndex] ?? 0); }
function leaderTraitUnlockLevel(leaderIndex, traitIndex) {
    if (traitIndex === 0) return STAT_REVEAL_LEVEL[['territory', 'treasure', 'might'][leaderIndex]] ?? ALL_TRAITS_LEVEL;
    if (traitIndex === 1) return LEADER_TRAIT_EXTRA_LEVEL[leaderIndex] ?? ALL_TRAITS_LEVEL;
    return ALL_TRAITS_LEVEL;
}

function lockedBadge(message) {
    const span = document.createElement('span');
    span.className = 'locked-badge';
    span.textContent = '🔒';
    span.title = message || 'Serve più infiltrazione per scoprirlo';
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
    const scaleAttr = `scale(${k.toFixed(3)})`;
    Object.values(iconScaleGroups).forEach(g => g.setAttribute('transform', scaleAttr));
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
    Object.values(byId).forEach(b => {
        if (b.id === 'sun') return;
        const p = positions[b.id]; if (!p) return;
        if (b.type !== 'base' && b.type !== 'point') {
            orbitLayer.appendChild(el('circle', { cx: p.parentX, cy: p.parentY, r: p.orbitR, class: b.anchor === 'sun' ? 'orbit-ring' : 'moon-orbit-ring' }));
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

// Every resource/property a body has (all_info/resources.json) grants its own
// bonus — shown as chips (name, colored by category) with the effect text in
// the hover tooltip. Same place also feeds the Resources & Assets panel.
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
        tip.textContent = res.effect || '';
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
    const infil = effectiveInfiltration(company);

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
            if (statUnlocked(infil, k)) {
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

function renderInfiltrationBar(infil) {
    const host = document.getElementById('family-infiltration');
    host.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'infiltration-label';
    label.textContent = `Infiltrazione: ${infil}/${MAX_INFILTRATION}`;
    host.appendChild(label);
    const bar = document.createElement('div');
    bar.className = 'infiltration-bar';
    for (let i = 1; i <= MAX_INFILTRATION; i++) {
        const seg = document.createElement('div');
        seg.className = 'infiltration-seg' + (i <= infil ? ' filled' : '');
        bar.appendChild(seg);
    }
    host.appendChild(bar);
    if (infil >= FULL_KNOWLEDGE_LEVEL) {
        const badge = document.createElement('div');
        badge.className = 'full-knowledge-badge';
        badge.textContent = '🎲 Conoscenza Piena';
        badge.title = "L'infiltrazione è completa: i tiri di questa famiglia vengono ora dichiarati apertamente ai giocatori.";
        host.appendChild(badge);
    }
}

function showFamilyOverlay(name) {
    name = canonicalFamilyName(name);
    currentOverlayFamily = name;
    const overlay = document.getElementById('family-overlay');
    const company = companiesByName[name];
    const infil = effectiveInfiltration(company);
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
        renderInfiltrationBar(infil);
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
            const stepLevel = STAT_REVEAL_LEVEL[k];
            const card = document.createElement('div');
            card.className = 'family-stat';
            if (!statUnlocked(infil, k)) {
                card.classList.add('locked');
                card.innerHTML = `<div class="family-stat-label">${STAT_LABELS[k]}</div>`;
                card.appendChild(lockedBadge(`Serve infiltrazione ${stepLevel}+`));
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

        if (statUnlocked(infil, 'sovereignty')) {
            const statObj = {};
            STAT_KEYS.forEach(k => { statObj[STAT_LABELS[k]] = company[k] || 0; });
            descEl.textContent = generateFamilyDescription(statObj);
        } else {
            descEl.appendChild(lockedBadge());
            descEl.appendChild(document.createTextNode(' Serve profilare tutte le statistiche per capire il carattere attuale di questa famiglia.'));
        }
    }

    renderLeaders(name, infil);
    renderTerritories(name);
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
                return `<span class="craft-req-pill" title="${escHtml((res && res.effect) || '')}">${escHtml((res && res.name) || rid)}</span>`;
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

    const unique = familyAssetsByOwner[name] || [];
    uniqueHost.innerHTML = unique.length === 0
        ? '<div class="opinion-empty">Nessun asset unico registrato.</div>'
        : unique.map(a => `
            <div class="family-asset-item unique">
                <div class="family-asset-header">
                    <span class="family-asset-name">${escHtml(a.name || '—')}</span>
                    <span class="family-asset-type">${escHtml(a.type || '')}</span>
                </div>
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

function renderLeaders(name, infil) {
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
        if (infil !== undefined && !leaderIdentityUnlocked(infil, i)) {
            const card = document.createElement('div');
            card.className = 'leader-card empty locked';
            card.appendChild(lockedBadge(`Serve infiltrazione ${LEADER_IDENTITY_LEVEL[i]}+ per identificare questo leader`));
            const msg = document.createElement('div');
            msg.textContent = 'Sconosciuto';
            card.appendChild(msg);
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
            const unlockLevel = leaderTraitUnlockLevel(i, traitIdx);
            if (infil !== undefined && infil < unlockLevel) {
                const chip = document.createElement('div');
                chip.className = 'trait-chip locked';
                chip.textContent = '🔒 ???';
                chip.title = `Serve infiltrazione ${unlockLevel}+ per scoprire questo tratto`;
                traitsEl.appendChild(chip);
                return;
            }
            const chip = document.createElement('div');
            chip.className = 'trait-chip';
            chip.textContent = trait.label;
            const tip = document.createElement('div');
            tip.className = 'trait-tooltip';
            tip.innerHTML = `<div>${escHtml(trait.description || '')}</div>` +
                (trait.modifiers || []).map(m => `<div class="modline">${m.amount > 0 ? '+' : ''}${m.amount} ${escHtml(m.stat || m.action)} — ${escHtml(m.situation || 'Always')}</div>`).join('');
            chip.appendChild(tip);
            traitsEl.appendChild(chip);
        });
        card.appendChild(traitsEl);
        row.appendChild(card);
    }
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

const OPINION_COLLAPSED_COUNT = 5;
function renderOpinions(name) {
    const list = document.getElementById('family-opinions-list');
    list.innerHTML = '';

    const opinionsOfOthers = opinionsByFamily[name] || {};
    const otherNames = Object.keys(companiesByName).filter(n => n !== name);

    const rows = otherNames.map(other => {
        const mods = opinionsOfOthers[other] || [];
        const curatedTotal = mods.reduce((sum, m) => sum + (m.value || 0), 0);
        const baseline = computeDiplomaticBaseline(name, other);
        const total = curatedTotal + (baseline ? baseline.total : 0);
        return { other, mods, baseline, total };
    });

    rows.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

    if (rows.length === 0) {
        list.innerHTML = '<div class="opinion-empty">Nessuna relazione registrata.</div>';
        return;
    }

    const buildRow = ({ other, mods, baseline, total }) => {
        const row = document.createElement('div');
        row.className = 'opinion-row';
        const dot = document.createElement('span');
        dot.className = 'opinion-dot';
        dot.style.background = familyColor(other);
        row.appendChild(dot);
        const nameEl = document.createElement('span');
        nameEl.className = 'opinion-family-name';
        nameEl.textContent = other;
        row.appendChild(nameEl);
        const totalEl = document.createElement('span');
        totalEl.className = `opinion-total ${total > 0 ? 'positive' : total < 0 ? 'negative' : 'neutral'}`;
        totalEl.textContent = (total > 0 ? '+' : '') + (Number.isInteger(total) ? total : total.toFixed(1));
        row.appendChild(totalEl);
        const modsEl = document.createElement('div');
        modsEl.className = 'opinion-modifiers';

        if (baseline) {
            const a = companiesByName[name], b = companiesByName[other];

            const govPill = document.createElement('span');
            govPill.className = `opinion-mod baseline ${baseline.government >= 0 ? 'positive' : 'negative'}`;
            govPill.textContent = `Governo ${fmtBaselineNum(baseline.government)}`;
            const govTip = document.createElement('div');
            govTip.className = 'trait-tooltip';
            govTip.innerHTML = `<div>${escHtml(a.government)} (${escHtml(name)}) ↔ ${escHtml(b.government)} (${escHtml(other)})</div><div class="modline">Totale = ${fmtBaselineNum(baseline.government)}</div>`;
            govPill.appendChild(govTip);
            modsEl.appendChild(govPill);

            const popPill = document.createElement('span');
            popPill.className = `opinion-mod baseline ${baseline.race >= 0 ? 'positive' : 'negative'}`;
            popPill.textContent = `Popolazione ${fmtBaselineNum(baseline.race)}`;
            const topA = topComposition(planetRaceComposition[a.planet]).map(([n, p]) => `${p}% ${escHtml(n)}`).join(', ');
            const topB = topComposition(planetRaceComposition[b.planet]).map(([n, p]) => `${p}% ${escHtml(n)}`).join(', ');
            const raceContribs = topContributingPairs(raceCompatibility, planetRaceComposition[a.planet], planetRaceComposition[b.planet])
                .map(c => `${escHtml(c.a)} (${c.pctA}%) × ${escHtml(c.b)} (${c.pctB}%) × ${c.matrixVal} = ${fmtBaselineNum(c.contribution)}`);
            const popTip = document.createElement('div');
            popTip.className = 'trait-tooltip';
            popTip.innerHTML = `<div>${escHtml(name)}: ${topA || '—'}</div><div>${escHtml(other)}: ${topB || '—'}</div>` +
                (raceContribs.length ? raceContribs : ['(nessun contributo significativo)']).map(l => `<div class="modline">${l}</div>`).join('') +
                `<div class="modline">Totale = ${fmtBaselineNum(baseline.race)}</div>`;
            popPill.appendChild(popTip);
            modsEl.appendChild(popPill);

            const relPill = document.createElement('span');
            relPill.className = `opinion-mod baseline ${baseline.religion >= 0 ? 'positive' : 'negative'}`;
            relPill.textContent = `Religione ${fmtBaselineNum(baseline.religion)}`;
            const topRelA = topComposition(planetReligionComposition[a.planet]).map(([n, p]) => `${p}% ${escHtml(n)}`).join(', ');
            const topRelB = topComposition(planetReligionComposition[b.planet]).map(([n, p]) => `${p}% ${escHtml(n)}`).join(', ');
            const religionContribs = topContributingPairs(religionCompatibility, planetReligionComposition[a.planet], planetReligionComposition[b.planet])
                .map(c => `${escHtml(c.a)} (${c.pctA}%) × ${escHtml(c.b)} (${c.pctB}%) × ${c.matrixVal} = ${fmtBaselineNum(c.contribution)}`);
            const relTip = document.createElement('div');
            relTip.className = 'trait-tooltip';
            relTip.innerHTML = `<div>${escHtml(name)}: ${topRelA || '—'}</div><div>${escHtml(other)}: ${topRelB || '—'}</div>` +
                (religionContribs.length ? religionContribs : ['(nessun contributo significativo)']).map(l => `<div class="modline">${l}</div>`).join('') +
                `<div class="modline">Totale = ${fmtBaselineNum(baseline.religion)}</div>`;
            relPill.appendChild(relTip);
            modsEl.appendChild(relPill);
        }

        mods.forEach(m => {
            const pill = document.createElement('span');
            pill.className = `opinion-mod ${m.value >= 0 ? 'positive' : 'negative'}`;
            pill.textContent = `${m.label} ${m.value > 0 ? '+' : ''}${m.value}`;
            const typeInfo = treatyTypesByName[m.label] || treatyTypesByName[(m.label || '').replace(/ (su|da)$/, '')];
            if (typeInfo) {
                const tip = document.createElement('div');
                tip.className = 'trait-tooltip';
                tip.textContent = typeInfo.description;
                pill.appendChild(tip);
            }
            modsEl.appendChild(pill);
        });
        row.appendChild(modsEl);
        row.addEventListener('click', () => showFamilyOverlay(other));
        return row;
    };

    rows.slice(0, OPINION_COLLAPSED_COUNT).forEach(r => list.appendChild(buildRow(r)));

    if (rows.length > OPINION_COLLAPSED_COUNT) {
        const rest = rows.slice(OPINION_COLLAPSED_COUNT);
        const restHost = document.createElement('div');
        restHost.className = 'opinion-rest-host';
        rest.forEach(r => restHost.appendChild(buildRow(r)));
        list.appendChild(restHost);

        const toggleBtn = document.createElement('button');
        toggleBtn.className = 'opinion-toggle-all';
        toggleBtn.textContent = `Mostra tutte (${rows.length}) ▾`;
        toggleBtn.addEventListener('click', () => {
            const expanded = restHost.classList.contains('open');
            restHost.classList.toggle('open', !expanded);
            toggleBtn.textContent = expanded ? `Mostra tutte (${rows.length}) ▾` : 'Mostra meno ▴';
        });
        list.appendChild(toggleBtn);
    }
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

// Maintainer-only "reveal all" toggle: bypasses infiltration client-side for
// prep/reference. Never persisted — resets on reload, doesn't touch the JSON.
// No visible button (players could stumble onto it) — Ctrl+Shift+G instead,
// with a brief toast so a GM still gets confirmation it toggled.
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
            resBlock.innerHTML = `<div class="atlas-resource-name" title="${escHtml(res.effect || '')}">${escHtml(res.name)}</div>`;
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
            return `<span class="craft-req-pill" title="${escHtml((res && res.effect) || '')}">${escHtml((res && res.name) || rid)}</span>`;
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
const TOOLTIP_HOST_SELECTOR = '.trait-chip, #family-government, .opinion-mod';
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
    const [bodiesFile, poiFile, fleetsFile, companies, governi, timeline, traits, leaders, opinions, treatyTypes, assetsFile, resourcesFile, diplomacy] = await Promise.all([
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
        loadJson('all_info/assets.json', { craftAssets: [], familyAssets: [], localizedAssets: [] }),
        loadJson('all_info/resources.json', { resources: [] }),
        loadJson('all_info/diplomacy.json', { governmentCompatibility: {}, raceCompatibility: {}, religionCompatibility: {}, planetRaceComposition: {}, planetReligionComposition: {} }),
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
