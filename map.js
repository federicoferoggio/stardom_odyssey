const CANVAS = 10000, CENTER = CANVAS / 2, DIST_SCALE = 250, MOON_GAP = 60, MOON_START = 60, PLANET_R = 28, MOON_R = 12, SUN_R = 55;
const ZOOM_MIN = 400;     // max zoom in: viewport di 400 SVG units (~un pianeta riempie lo schermo)
const ZOOM_MAX = 12000;   // max zoom out: poco più del canvas intero (10000)
const PAN_MARGIN = 20000;
const SHEET_BODIES_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=204162722&single=true&output=csv';
const SHEET_TIMELINE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=1188539103&single=true&output=csv';

const resConfig = [
    { key: 'shards', label: 'Shards', color: '#88ccff', icon: '💎' },
    { key: 'gems', label: 'Gems', color: '#aaffaa', icon: '🟢' },
    { key: 'opals', label: 'Opals', color: '#ffddaa', icon: '🔶' },
    { key: 'resources', label: 'Resources', color: '#ffaacc', icon: '⚙️' },
];

let byId = {}, tick = 0, ready = false;
let ownerColors = {};

function dbg(msg) { console.log('[MAP]', msg); document.getElementById('debug').textContent = msg; }

function hexToRgb(hex) { hex = hex.replace(/^#/, ''); if (hex.length === 3) hex = hex.split('').map(c => c + c).join(''); return { r: parseInt(hex.slice(0, 2), 16) || 0, g: parseInt(hex.slice(2, 4), 16) || 0, b: parseInt(hex.slice(4, 6), 16) || 0 }; }
function darken(hex, f = 0.35) { const { r, g, b } = hexToRgb(hex); return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`; }
function lighten(hex, f = 1.6) { const { r, g, b } = hexToRgb(hex); return `rgb(${Math.min(255, Math.round(r * f))},${Math.min(255, Math.round(g * f))},${Math.min(255, Math.round(b * f))})`; }

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }

const svg = document.getElementById('solar-svg');
const bgStars = document.getElementById('bg-stars');
let vb = { x: CENTER - window.innerWidth / 2, y: CENTER - window.innerHeight / 2, w: window.innerWidth, h: window.innerHeight };
function applyVB() { svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); }
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

    const newW = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, vb.w * f));
    const newH = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, vb.h * f));

    vb.x += (vb.w - newW) * mx;
    vb.y += (vb.h - newH) * my;
    vb.w = newW;
    vb.h = newH;

    clampVB();
    applyVB();
}, { passive: false });
let lastTD = null;
svg.addEventListener('touchstart', e => { e.preventDefault(); if (e.touches.length === 1) { panning = true; px = e.touches[0].clientX; py = e.touches[0].clientY; } else if (e.touches.length === 2) { panning = false; lastTD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); } }, { passive: false });
svg.addEventListener('touchmove', e => { e.preventDefault(); if (e.touches.length === 1 && panning) { vb.x -= (e.touches[0].clientX - px) * (vb.w / svg.clientWidth); vb.y -= (e.touches[0].clientY - py) * (vb.h / svg.clientHeight); px = e.touches[0].clientX; py = e.touches[0].clientY; clampVB(); applyVB(); } else if (e.touches.length === 2 && lastTD) { const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); vb.w *= lastTD / d; vb.h *= lastTD / d; lastTD = d; clampVB(); applyVB(); } }, { passive: false });
svg.addEventListener('touchend', () => { panning = false; lastTD = null; });

function clampVB() {
    vb.w = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, vb.w));
    vb.h = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, vb.h));
}


function splitRes(val) {
    if (!val || !val.trim()) return [];
    return val.split('---').map(s => s.trim()).filter(s => s);
}


// ── TSV/CSV PARSER ────────────────────────────────────────────────────────────
function parsePaste(text) {
    if (!text || !text.trim()) return [];
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const sep = lines[0].includes('\t') ? '\t' : ',';
    const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split(sep);
        if (cells.every(c => !c.trim())) continue;
        const obj = {};
        headers.forEach((h, j) => { obj[h] = (cells[j] || '').trim(); });
        rows.push(obj);
    }
    return rows;
}

// ── FETCH GOOGLE SHEET HTML ───────────────────────────────────────────────────
async function fetchTable(url) {
    const res = await fetch(url, { cache: 'no-store' });
    const text = await res.text();
    return parseCsv(text);
}

function parseCsv(text) {
    if (!text || !text.trim()) return [];
    // Gestisce \r\n e \n
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = splitCsvLine(lines[i]);
        if (cells.every(c => !c.trim())) continue;
        const obj = {};
        headers.forEach((h, j) => { obj[h] = (cells[j] || '').trim(); });
        rows.push(obj);
    }
    return rows;
}

// Split CSV rispettando le virgolette (es. celle con virgola dentro)
function splitCsvLine(line) {
    const result = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQ = !inQ; }
        else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
        else { cur += ch; }
    }
    result.push(cur);
    return result;
}

// ── NORMALISE ─────────────────────────────────────────────────────────────────
function getF(r, ...keys) { for (const k of keys) { if (r[k] !== undefined && r[k] !== '') return r[k]; const lk = k.toLowerCase(); if (r[lk] !== undefined && r[lk] !== '') return r[lk]; } return ''; }

function normalise(rows) {
    const map = {};
    map['sun'] = { id: 'sun', anchor: '', distance: 0, speed: 0, color: '#ffaa00', name: 'Sun', owner: '', fleets: '', descr: '', isNode: true, moonSlot: 0 };
    const moonCount = {};
    rows.forEach(r => {
        const rawId = getF(r, 'id', 'ID', 'Id'); if (!rawId) return;
        const rowType = (getF(r, 'type', 'Type') || '').trim().toLowerCase();
        if (rowType === 'path' || rowType === 'warpath') return;
        const id = rawId.trim().toLowerCase();
        const anchor = (getF(r, 'anchor', 'Anchor') || 'sun').trim().toLowerCase();
        const nodeVal = getF(r, 'node', 'Node', 'isNode').trim().toLowerCase();
        const isNode = ['x', 'yes', 'true', '1', '✓', '✔'].includes(nodeVal);
        let moonSlot = 0;
        if (!isNode && anchor !== 'sun') { if (moonCount[anchor] === undefined) moonCount[anchor] = 0; moonSlot = moonCount[anchor]++; }
        const rawColor = getF(r, 'color', 'Color', 'colour', 'Colour') || '#aaaaaa';
        const color = rawColor.startsWith('#') ? rawColor : '#aaaaaa';
        map[id] = { id, anchor, distance: parseFloat(getF(r, 'distance', 'Distance') || '0') || 0, moonSlot, speed: parseFloat(getF(r, 'speed', 'Speed') || '1') || 1, offset: parseFloat(getF(r, 'offset', 'Offset') || '0') || 0, color, name: getF(r, 'name', 'Name') || rawId, owner: getF(r, 'owner', 'Owner'), fleets: getF(r, 'fleets', 'Fleets'), descr: getF(r, 'descr', 'description', 'Description', 'desc', 'Desc'), shards: getF(r, 'shards', 'Shards'), gems: getF(r, 'gems', 'Gems'), opals: getF(r, 'opals', 'Opals'), resources: getF(r, 'resources', 'Resources'), type: getF(r, 'type', 'Type') || 'planet', isNode };
    });
    const planets = Object.values(map).filter(b => b.anchor === 'sun' && b.id !== 'sun').length;
    const moons = Object.values(map).filter(b => b.anchor !== 'sun' && b.anchor !== '').length;
    const ownerColorMap = {};
    Object.values(map).forEach(b => {
        if (b.owner) ownerColors[b.owner.trim()] = b.color;
    });
    // Assegna ownerColor a ogni corpo
    Object.values(map).forEach(b => { b.ownerColor = ownerColorMap[b.owner.trim()] || b.color || '#aaaaaa'; });
    map.__paths = rows
        .filter(r => ['path', 'warpath'].includes((getF(r, 'type', 'Type') || '').trim().toLowerCase()))
        .map(r => ({
            ids: getF(r, 'id', 'ID').split(':').map(s => s.trim().toLowerCase()),
            name: getF(r, 'name', 'Name'),
            color: (getF(r, 'color', 'Color') || '#aaaaaa'),
            type: (getF(r, 'type', 'Type') || 'path').trim().toLowerCase(),
            owner: getF(r, 'owner', 'Owner'),
            fleets: getF(r, 'fleets', 'Fleets'),
            descr: getF(r, 'descr', 'description', 'Description', 'desc', 'Desc'),
            departure: parseFloat(getF(r, 'distance', 'Distance') || '0') || 0,
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

        // ← Points are static: use only offset as fixed angle, ignore speed for movement
        const angle = b.type === 'point'
            ? (b.offset || 0) * Math.PI / 180
            : (b.speed > 0 ? (t / b.speed) * Math.PI * 2 : 0) + (b.offset || 0) * Math.PI / 180;

        cache[id] = { x: parent.x + r * Math.cos(angle), y: parent.y + r * Math.sin(angle), orbitR: r, parentX: parent.x, parentY: parent.y };
        return cache[id];
    }
    Object.keys(byId).filter(id => id !== '__paths').forEach(id => pos(id));
    return cache;
}

// ── GRADIENT ──────────────────────────────────────────────────────────────────
function ensureColorFilter(id, color) {
    const defs = document.getElementById('svg-defs');
    const fId = `cf-${id}`;
    if (defs.querySelector(`#${fId}`)) return fId;
    const f = el('filter', {
        id: fId, 'color-interpolation-filters': 'sRGB',
        x: '-20%', y: '-20%', width: '140%', height: '140%'
    });
    // Flood fill con il colore del corpo
    f.appendChild(el('feFlood', { 'flood-color': color, 'flood-opacity': '1', result: 'flood' }));
    // Prende l'alpha dell'immagine sorgente (sagoma SVG) e la colora
    f.appendChild(el('feComposite', { in: 'flood', in2: 'SourceGraphic', operator: 'in', result: 'colored' }));
    // Glow: blur del colorato
    const blur = el('feGaussianBlur', { in: 'colored', stdDeviation: '3', result: 'glow' });
    f.appendChild(blur);
    // Merge: glow sotto + colorato sopra
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

    // --- SFONDO STELLATO DENTRO L'SVG ---
    if (bgStars) {
        bgStars.innerHTML = '';
    }

    const sunG = el('g', { 'data-id': 'sun', class: 'body-group' });
    sunG.appendChild(el('circle', { r: SUN_R * 2.8, fill: 'url(#sunGrad)', opacity: '0.5', filter: 'url(#glow-strong)' }));
    sunG.appendChild(el('circle', { r: SUN_R, fill: 'url(#sunGrad)', filter: 'url(#glow-strong)', stroke: 'rgba(255,240,180,0.3)', 'stroke-width': '2' }));
    const sunLbl = el('text', { x: SUN_R + 8, y: 0, class: 'body-label', 'dominant-baseline': 'middle' });
    sunLbl.textContent = 'Sun'; sunG.appendChild(sunLbl);
    sunG.addEventListener('click', () => showInfo(byId['sun']));
    sunG.setAttribute('transform', `translate(${CENTER},${CENTER})`);
    bodyLayer.appendChild(sunG); bodyGroups['sun'] = sunG;

    Object.values(byId).forEach(b => {
        if (b.id === 'sun') return;
        const isMain = b.anchor === 'sun' || b.type === 'planet';
        const r = {
            planet: PLANET_R, base: PLANET_R * 0.8,
            moon: MOON_R, point: MOON_R * 0.75
        }[b.type] ?? MOON_R;
        const typeMap = {
            planet: 'images/planet.svg', moon: 'images/moon.svg',
            base: 'images/base.svg', point: 'images/point.svg'
        };
        const iconSrc = typeMap[b.type] || 'images/planet.svg';
        const cfId = ensureColorFilter(b.id, b.color);

        const g = el('g', { 'data-id': b.id, class: 'body-group' });
        if (b.type === 'point' && b.speed > 0) {
            const zoneR = b.speed * DIST_SCALE;
            const { r: cr, g: cg, b: cb } = hexToRgb(b.color);
            const zone = el('circle', {
                r: zoneR,
                fill: `rgba(${Math.round(cr * 0.4)},${Math.round(cg * 0.4)},${Math.round(cb * 0.4)},0.18)`,
                stroke: `rgba(${Math.round(cr * 0.6)},${Math.round(cg * 0.6)},${Math.round(cb * 0.6)},0.35)`,
                'stroke-width': '2',
                'stroke-dasharray': '8 6',
                'pointer-events': 'none',
            });
            g.insertBefore(zone, g.firstChild); // render behind everything else in the group
        }
        const halo = el('circle', {
            r: r * 2.2, fill: b.color, opacity: '0.0',
            style: 'transition:opacity .2s'
        });
        g.appendChild(halo);

        // Icona colorata tramite filtro SVG
        const icon = el('image', {
            href: iconSrc,
            x: -r, y: -r,
            width: r * 2, height: r * 2,
            filter: `url(#${cfId})`,
        });
        g.appendChild(icon);
        const lbl = el('text', { x: r + 7, y: 0, class: isMain ? 'body-label' : 'moon-label', 'dominant-baseline': 'middle' });
        lbl.textContent = b.name; g.appendChild(lbl);
        g.addEventListener('mouseenter', () => { halo.setAttribute('opacity', '0.25'); icon.setAttribute('opacity', '1'); });
        g.addEventListener('mouseleave', () => { halo.setAttribute('opacity', '0.0'); icon.setAttribute('opacity', '0.85'); });
        icon.setAttribute('opacity', '0.85'); // default
        g.addEventListener('click', e => { e.stopPropagation(); showInfo(b); });
        // Fleet icons
        if (b.fleets && b.fleets.trim()) {
            const fleets = b.fleets.split('-').map(f => f.trim()).filter(f => f);
            const iconSize = isMain ? 14 : 10;
            const iconGap = isMain ? 16 : 12;
            const startX = r - (fleets.length - 1) * iconGap / 2;
            const topY = -(r + 10);
            fleets.forEach((fleetOwner, i) => {
                const ownerColor = byId[Object.keys(byId).find(k => byId[k].owner === fleetOwner)]?.color || b.ownerColor || '#aaaaaa';
                const img = el('image', {
                    href: 'images/attack.svg',
                    x: startX + i * iconGap - iconSize / 2,
                    y: topY - iconSize / 2,
                    width: iconSize,
                    height: iconSize,
                    style: `filter: drop-shadow(0 0 2px ${ownerColor}); opacity: 0.9;`,
                });
                // Colora l'SVG via CSS color-override con un rect colorato sottostante
                const colorDot = el('circle', {
                    cx: startX + i * iconGap,
                    cy: topY,
                    r: iconSize / 2 + 1,
                    fill: ownerColor,
                    opacity: '0.6',
                    stroke: 'rgba(255,255,255,0.4)',
                    'stroke-width': '1',
                });
                g.appendChild(colorDot);
                g.appendChild(img);
            });
        }
        bodyLayer.appendChild(g); bodyGroups[b.id] = g;
    });
    // ── BACKGROUND MAP IMAGE ────────────────────────────────────────────────────
    // Allinea images/maponlyasteroid.svg usando il sole (CENTER,CENTER)
    // e l'orbita di brion7 come riferimento di scala.
    (function injectMapBackground() {
        // Rimuovi eventuale background precedente
        const existing = document.getElementById('map-bg-image');
        if (existing) existing.remove();

        // Trova brion7 nel byId
        const brion = byId['brion7'];
        if (!brion) return; // se il corpo non esiste, salta

        // Il raggio dell'orbita di brion7 in unità SVG
        // (stessa formula usata in computeAllPositions per pianeti principali)
        const orbitR = brion.distance * DIST_SCALE;

        // Il SVG della mappa è un quadrato centrato sul sole:
        // il punto a4 è sul bordo dell'orbita di brion7,
        // quindi il lato del quadrato = orbitR * 2
        const side = orbitR * 2;
        const x = CENTER - orbitR;
        const y = CENTER - orbitR;

        // Crea l'elemento <image> e inseriscilo PRIMA di tutto nel body-layer
        // (oppure in un layer dedicato sotto orbit-layer)
        const svg = document.getElementById('solar-svg');
        const bgImg = document.createElementNS(NS, 'image');

        bgImg.setAttribute('id', 'map-bg-image');
        bgImg.setAttribute('href', 'images/maponlyasteroids.svg');
        bgImg.setAttribute('x', x);
        bgImg.setAttribute('y', y);
        bgImg.setAttribute('width', side);
        bgImg.setAttribute('height', side);
        bgImg.setAttribute('opacity', '1');
        bgImg.setAttribute('pointer-events', 'none');

        // Inserisci come primo figlio di orbit-layer (sotto le orbite e i pianeti)
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
            orbitLayer.appendChild(el('circle', {
                cx: p.parentX, cy: p.parentY, r: p.orbitR,
                class: b.anchor === 'sun' ? 'orbit-ring' : 'moon-orbit-ring'
            }));
        } const g = bodyGroups[b.id];
        if (g) g.setAttribute('transform', `translate(${p.x.toFixed(1)},${p.y.toFixed(1)})`);
    });
    if (bodyGroups['sun']) bodyGroups['sun'].setAttribute('transform', `translate(${CENTER},${CENTER})`);
    const pathLayer = document.getElementById('path-layer');
    pathLayer.innerHTML = '';
    const defs = document.getElementById('svg-defs');

    // Rimuovi tutti i motionPath e marker precedenti dalle defs
    defs.querySelectorAll('[id^="mp-"]').forEach(e => e.remove());
    defs.querySelectorAll('[id^="arrow-"]').forEach(e => e.remove());

    (byId.__paths || []).forEach((path, pi) => {
        const isWar = path.type === 'warpath';
        const arrowId = `arrow-${pi}`;

        // Marker freccia (solo per path normale)
        if (!isWar && !defs.querySelector(`#${arrowId}`)) {
            const marker = el('marker', { id: arrowId, markerWidth: '8', markerHeight: '8', refX: '6', refY: '3', orient: 'auto' });
            marker.appendChild(el('polygon', { points: '0,0 0,6 8,3', fill: path.color, opacity: '0.85' }));
            defs.appendChild(marker);
        }

        const pts = path.ids.map(id => positions[id]).filter(Boolean);
        if (pts.length < 2) return;

        // Calcola lunghezze segmenti per animazione
        const segments = [];
        let totalLen = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
            segments.push({ a: pts[i], b: pts[i + 1], len });
            totalLen += len;
        }

        // Gruppo cliccabile per tutto il path
        // Gruppo cliccabile per tutto il path
        const pathG = el('g', { class: 'path-group', style: 'cursor:pointer' });
        pathG.addEventListener('click', e => { e.stopPropagation(); showPathInfo(path, totalLen); });

        // ── VISIBILITÀ WARPATH: controlla prima di disegnare ──────────────────────
        if (isWar) {
            const elapsed = tick - path.departure;
            const travelledSVG = elapsed * 4 * DIST_SCALE;
            if (elapsed < 0 || travelledSVG > totalLen) return; // nascosto: non ancora partito o già arrivato
        }

        // Disegna segmenti
        for (let i = 0; i < segments.length; i++) {
            const { a, b, len } = segments[i];
            const dx = b.x - a.x, dy = b.y - a.y;
            const ux = dx / len, uy = dy / len;
            const trim = isWar ? 5 : Math.min(PLANET_R + 10, len * 0.2);

            const lineAttrs = {
                x1: a.x + ux * trim, y1: a.y + uy * trim,
                x2: b.x - ux * (trim + (isWar ? 5 : 10)),
                y2: b.y - uy * (trim + (isWar ? 5 : 10)),
                stroke: path.color, 'stroke-width': isWar ? '2' : '2.5',
                opacity: isWar ? '0.5' : '0.7',
            };
            if (isWar) {
                lineAttrs['stroke-dasharray'] = '12 8';
            } else if (i === segments.length - 1) {
                lineAttrs['marker-end'] = `url(#${arrowId})`;
            }
            const hitAttrs = { ...lineAttrs };
            delete hitAttrs['marker-end'];
            const hit = el('line', { ...hitAttrs, stroke: 'transparent', 'stroke-width': '18' });
            pathG.appendChild(hit);
            pathG.appendChild(el('line', lineAttrs));
        }

        // Token flotta (solo warpath)
        if (isWar && path.fleets) {
            const elapsed = tick - path.departure;
            const travelledSVG = elapsed * 4 * DIST_SCALE;
            // (qui elapsed e travelledSVG sono già stati validati sopra, arriviamo solo se visibili)
            let remaining = travelledSVG;
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
                const fleetList = path.fleets.split('-').map(f => f.trim()).filter(f => f);
                const iconSize = 20;
                fleetList.forEach((fleetOwner, fi) => {
                    const ownerColor = Object.values(byId).find(b => b.owner === fleetOwner)?.color || path.color;
                    const offsetY = fi * (iconSize + 4) - ((fleetList.length - 1) * (iconSize + 4)) / 2;
                    const iconG = el('g', {
                        transform: `translate(${tokenPos.x.toFixed(1)},${tokenPos.y.toFixed(1)}) rotate(${tokenAngle.toFixed(1)})`
                    });
                    iconG.appendChild(el('circle', { r: iconSize / 2 + 2, cx: 0, cy: offsetY, fill: ownerColor, opacity: '0.55', stroke: 'rgba(255,255,255,0.5)', 'stroke-width': '1.5' }));
                    iconG.appendChild(el('image', {
                        href: 'images/attack.svg',
                        x: -iconSize / 2, y: offsetY - iconSize / 2,
                        width: iconSize, height: iconSize,
                        style: `filter: drop-shadow(0 0 6px ${ownerColor}) brightness(1.8); opacity: 1;`
                    }));
                    pathG.appendChild(iconG);
                });
            }
        }

        pathLayer.appendChild(pathG);
    });
}

// ── LOAD MAP ──────────────────────────────────────────────────────────────────
let baseTick = 0;  // ← NEW: stores the "current" month from timeline

// ── TICK PREV/NEXT BUTTONS ────────────────────────────────────────────────────
let tickHoldInterval = null;

function stepTick() {
    onTickChange(tick + .03);
}

function startHold(delta) {
    stepTick(delta); // primo step immediato al click
    tickHoldInterval = setInterval(() => stepTick(delta), 150);
}

function stopHold() {
    clearInterval(tickHoldInterval);
    tickHoldInterval = null;
}

const tickPrevBtn = document.getElementById('tickPrevBtn');
const tickNextBtn = document.getElementById('tickNextBtn');

tickPrevBtn.addEventListener('mousedown', () => startHold(-1));
tickNextBtn.addEventListener('mousedown', () => startHold(1));

// Stop su mouseup/mouseleave ovunque
window.addEventListener('mouseup', stopHold);
tickPrevBtn.addEventListener('mouseleave', stopHold);
tickNextBtn.addEventListener('mouseleave', stopHold);

// Touch support
tickPrevBtn.addEventListener('touchstart', e => { e.preventDefault(); startHold(-1); }, { passive: false });
tickNextBtn.addEventListener('touchstart', e => { e.preventDefault(); startHold(1); }, { passive: false });
tickPrevBtn.addEventListener('touchend', stopHold);
tickNextBtn.addEventListener('touchend', stopHold);

function loadMap(bodyRows, timelineRows) {
    byId = normalise(bodyRows);
    if (timelineRows && timelineRows.length > 0) {
        const cur = timelineRows.find(r => Object.values(r).some(v => v.toLowerCase() === 'current'));
        if (cur) {
            const mk = Object.keys(cur).find(k => ['month', 'Month', 'tick'].includes(k));
            if (mk) { tick = parseInt(cur[mk], 10) || 0; baseTick = tick; }  // ← saves baseTick
        }
    }
    // ← NEW: slider range centered on current month ±12
    tickSlider.min = baseTick - 24;
    tickSlider.max = baseTick + 24;
    tickSlider.step = 0.03125;
    tickSlider.value = tick;
    document.querySelector('#tick-label span').textContent = tick;
    buildScene(); buildAssetsPanel(); ready = true; updateScene(tick);
}

document.getElementById('resetBtn').addEventListener('click', () => {
    onTickChange(baseTick);
});

// ── INFO PANEL ────────────────────────────────────────────────────────────────

function showInfo(b) {
    document.getElementById('info-name').textContent = b.name || b.id;
    const oe = document.getElementById('info-owner'); oe.textContent = b.owner ? `⚑ ${b.owner}` : ''; oe.style.color = b.color || '#aaa';
    document.getElementById('info-desc').textContent = b.descr || '—';
    let meta = ''; if (b.type) meta += `⬡ Type: ${b.type}\n`; if (b.fleets) meta += `⚔ Fleets: ${b.fleets}\n`; if (b.anchor) meta += `↩ Orbits: ${b.anchor}`;
    document.getElementById('info-meta').textContent = meta;
    document.getElementById('info-meta').querySelectorAll('.res-block').forEach(e => e.remove());

    // ── Risorse ──────────────────────────────────────────────────────────────
    const resLines = resConfig.filter(rc => b[rc.key] && b[rc.key].trim());
    if (resLines.length > 0) {
        const resMeta = document.getElementById('info-meta');
        const resDiv = document.createElement('div');
        resDiv.className = 'res-block';
        resDiv.style.cssText = 'margin-top:8px; border-top:1px solid rgba(255,255,255,0.07); padding-top:8px; font-size:11px; display:flex; flex-direction:column; gap:3px;';
        resLines.forEach(rc => {
            const items = splitRes(b[rc.key]);
            items.forEach(item => {
                const row = document.createElement('div');
                row.innerHTML = `<span style="color:${rc.color}">${rc.icon} ${rc.label}:</span> <span style="color:#ddd">${item}</span>`;
                resDiv.appendChild(row);
            });
        });
        resMeta.appendChild(resDiv);
    }

    document.getElementById('info-handle-label').textContent = `⬡ ${b.name || b.id}`;
    const tab = document.getElementById('info-tab');
    tab.classList.add('open');
    document.getElementById('info-toggle-label').textContent = '◀ chiudi';
}
function showPathInfo(path, totalLen) {
    document.getElementById('info-name').textContent = path.name || path.ids.join(' → ');
    const oe = document.getElementById('info-owner');
    oe.textContent = path.owner ? `⚑ ${path.owner}` : '';
    oe.style.color = path.color || '#aaa';
    document.getElementById('info-desc').textContent = path.descr || '—';
    let meta = '';
    meta += `⬡ Type: ${path.type}\n`;
    if (path.fleets) meta += `⚔ Fleets: ${path.fleets}\n`;
    meta += `→ Route: ${path.ids.join(' → ')}`;
    if (path.type === 'warpath' && totalLen !== undefined) {
        const elapsed = tick - path.departure;
        const travelledSVG = elapsed * 4 * DIST_SCALE;
        const remainingSVG = totalLen - travelledSVG;
        const remainingWeeks = (remainingSVG / DIST_SCALE).toFixed(1);
        const remainingMonths = (remainingSVG / (DIST_SCALE * 4)).toFixed(1);
        meta += `\n📍 Partita al mese ${path.departure}`;
        meta += `\n⏱ Distanza rimanente: ${remainingWeeks} wk (~${remainingMonths} mesi)`;
    }
    document.getElementById('info-meta').textContent = meta;
    document.getElementById('info-handle-label').textContent = `→ ${path.name || path.ids.join('→')}`;
    const tab = document.getElementById('info-tab');
    tab.classList.add('open');
    document.getElementById('info-toggle-label').textContent = '◀ chiudi';
}
document.getElementById('info-handle').addEventListener('click', () => {
    const open = document.getElementById('info-tab').classList.toggle('open');
    document.getElementById('info-toggle-label').textContent = open ? '◀ chiudi' : '▶ apri';
});

// ── TICK ──────────────────────────────────────────────────────────────────────
const tickSlider = document.getElementById('tickSlider');

function onTickChange(val) {
    tick = Math.round(parseFloat(val) * 100) / 100 || 0;
    tickSlider.value = tick;
    document.querySelector('#tick-label span').textContent = tick;
    updateScene(tick);
}

tickSlider.addEventListener('input', e => onTickChange(e.target.value));

// ── BUILD PANEL ───────────────────────────────────────────────────────────────
function buildAssetsPanel() {
    const grid = document.getElementById('assets-grid');
    grid.innerHTML = '';

    resConfig.forEach(rc => {
        // Raccogli ogni singolo elemento (post-split) con il suo owner/colore
        const entries = [];
        Object.values(byId).forEach(b => {
            if (!b || typeof b !== 'object' || Array.isArray(b) || !b.id) return;
            splitRes(b[rc.key]).forEach(item => {
                entries.push({ item, name: b.name, owner: b.owner || '(nessuno)', color: b.color });
            });
        });
        if (entries.length === 0) return;

        const card = document.createElement('div');
        card.className = 'asset-card';
        card.innerHTML = `<div class="res-header" style="color:${rc.color}">${rc.icon} ${rc.label} <span style="color:#444;font-weight:normal">(${entries.length})</span></div>`;

        entries.forEach(({ item, name, owner, color }) => {
            const ownerColor = ownerColors[owner] || color || '#666';
            const row = document.createElement('div');
            row.className = 'res-row';
            row.innerHTML = `
                <span style="color:#ddd">${item}</span>
                <span><span class="owner-dot" style="background:${ownerColor}"></span>${name}</span>
            `;
            card.appendChild(row);
        });

        grid.appendChild(card);
    });
}

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
    return {
        x: vb.x + (cx / rect.width) * vb.w,
        y: vb.y + (cy / rect.height) * vb.h,
    };
}

function pxToWeeks(dx, dy) {
    const dist = Math.hypot(dx, dy);          // SVG units
    return (dist / DIST_SCALE).toFixed(2);    // 1 unit = 1 week
}

svg.addEventListener('click', e => {
    if (!rulerActive) return;
    e.stopPropagation();
    const pt = svgPoint(e);
    if (!rulerStart) {
        rulerStart = pt;
        rulerLayer.innerHTML = '';
        // start dot
        const dot = el('circle', { cx: pt.x, cy: pt.y, r: 8, fill: '#ffc840', opacity: '0.9' });
        rulerLayer.appendChild(dot);
    } else {
        // draw final line + label, then reset
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
    rulerTooltip.style.left = (e.clientX + 14) + 'px';
    rulerTooltip.style.top = (e.clientY - 10) + 'px';
    rulerTooltip.textContent = `${weeks} weeks`;
});

function drawRulerLine(a, b, final) {
    rulerLayer.innerHTML = '';
    const weeks = pxToWeeks(b.x - a.x, b.y - a.y);

    // start dot
    rulerLayer.appendChild(el('circle', { cx: a.x, cy: a.y, r: 8, fill: '#ffc840', opacity: '0.9' }));

    // dashed line
    const line = el('line', {
        x1: a.x, y1: a.y, x2: b.x, y2: b.y,
        stroke: '#ffc840', 'stroke-width': '3',
        'stroke-dasharray': '12 8', opacity: '0.85',
    });
    rulerLayer.appendChild(line);

    // end dot
    rulerLayer.appendChild(el('circle', { cx: b.x, cy: b.y, r: 8, fill: '#ffc840', opacity: final ? '1' : '0.6' }));

    if (final) {
        // midpoint label pinned on the map
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        const bg = el('rect', { x: mx - 60, y: my - 22, width: 120, height: 28, rx: 6, fill: 'rgba(8,8,22,0.88)', stroke: 'rgba(255,200,80,0.4)', 'stroke-width': '1.5' });
        const txt = el('text', { x: mx, y: my - 3, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#ffc840', 'font-size': '20', 'font-family': 'Courier New, monospace', 'font-weight': '600' });
        txt.textContent = `${weeks} wk`;
        rulerLayer.appendChild(bg);
        rulerLayer.appendChild(txt);
        rulerTooltip.style.display = 'none';

        // click again anywhere to clear
        rulerStart = null;
    }
}

// clear ruler on Escape
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

// ── SEARCH ───────────────────────────────────────────────────────────────────
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
let searchActiveIdx = -1;

function buildSearchIndex() {
    const index = [];
    // Bodies
    Object.values(byId).forEach(b => {
        if (!b || typeof b !== 'object' || Array.isArray(b) || !b.id) return;
        index.push({ type: 'body', id: b.id, name: b.name || b.id, color: b.color || '#aaa', sub: b.type || '' });
    });
    // Paths
    (byId.__paths || []).forEach(p => {
        const label = p.name || p.ids.join(' → ');
        index.push({ type: 'path', id: p.ids[0], name: label, color: p.color || '#aaa', sub: p.type, path: p });
    });
    return index;
}

function focusOnBody(id) {
    const positions = computeAllPositions(tick);
    const p = positions[id];
    if (!p) return;
    const margin = 300;
    vb.x = p.x - vb.w / 2;
    vb.y = p.y - vb.h / 2;
    applyVB();
    // Flash highlight
    const g = bodyGroups[id];
    if (g) {
        const halo = g.querySelector('circle');
        if (halo) {
            halo.setAttribute('opacity', '0.5');
            setTimeout(() => halo.setAttribute('opacity', '0.0'), 600);
        }
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
    const matches = index.filter(item =>
        item.id.toLowerCase().includes(q) || item.name.toLowerCase().includes(q)
    ).slice(0, 12);

    if (!matches.length) { searchResults.style.display = 'none'; return; }

    matches.forEach((item, i) => {
        const div = document.createElement('div');
        div.className = 'search-item';
        div.dataset.idx = i;
        div.innerHTML = `
            <span class="search-dot" style="background:${item.color}"></span>
            <span class="search-name">${item.name}</span>
            <span class="search-sub">${item.sub}</span>`;
        div.addEventListener('mousedown', e => {
            e.preventDefault();
            selectSearchItem(item);
        });
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
    } else {
        focusOnPath(item.path);
        // compute totalLen for path info
        const positions = computeAllPositions(tick);
        const pts = item.path.ids.map(id => positions[id]).filter(Boolean);
        let totalLen = 0;
        for (let i = 0; i < pts.length - 1; i++)
            totalLen += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
        showPathInfo(item.path, totalLen);
    }
}

searchInput.addEventListener('input', e => renderSearchResults(e.target.value));
searchInput.addEventListener('focus', e => renderSearchResults(e.target.value));
searchInput.addEventListener('blur', () => setTimeout(() => { searchResults.style.display = 'none'; }, 150));

searchInput.addEventListener('keydown', e => {
    const items = searchResults.querySelectorAll('.search-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchActiveIdx = Math.min(searchActiveIdx + 1, items.length - 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        searchActiveIdx = Math.max(searchActiveIdx - 1, 0);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        const idx = searchActiveIdx >= 0 ? searchActiveIdx : 0;
        if (searchResults._matches?.[idx]) selectSearchItem(searchResults._matches[idx]);
        return;
    } else if (e.key === 'Escape') {
        searchResults.style.display = 'none'; return;
    }
    items.forEach((el, i) => el.classList.toggle('active', i === searchActiveIdx));
});

// ── INIT ──────────────────────────────────────────────────────────────────────
async function init() {
    try {
        const [bodyRows, timelineRows] = await Promise.all([fetchTable(SHEET_BODIES_URL), fetchTable(SHEET_TIMELINE_URL)]);
        if (bodyRows.length === 0) { return; }
        loadMap(bodyRows, timelineRows);
    } catch (err) {
    }
}
window.addEventListener('resize', () => { vb.w = window.innerWidth; vb.h = window.innerHeight; applyVB(); });
const assetsTab = document.getElementById('assets-tab');
const assetsLabel = document.getElementById('assets-toggle-label');
document.getElementById('assets-handle').addEventListener('click', () => {
    const open = assetsTab.classList.toggle('open');
    assetsLabel.textContent = open ? '▼ chiudi' : '▲ apri';
});

// Asset tab

// ── CRAFTABLE ASSETS TAB ─────────────────────────────────────────────────────
const SHEET_CRAFT_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=913311695&single=true&output=tsv';

let craftData = [];

async function fetchCraftAssets() {
    try {
        const res = await fetch(SHEET_CRAFT_URL, { cache: 'no-store' });
        const text = await res.text();
        craftData = parseTsv(text);
        buildCraftPanel();
    } catch (err) {
        console.warn('[MAP] craft fetch error', err);
    }
}

function parseTsv(text) {
    if (!text || !text.trim()) return [];
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = lines[0].split('\t').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cells = lines[i].split('\t');
        if (cells.every(c => !c.trim())) continue;
        const obj = {};
        headers.forEach((h, j) => { obj[h] = (cells[j] || '').trim(); });
        rows.push(obj);
    }
    return rows;
}

function buildCraftPanel(filter = '') {
    const list = document.getElementById('craft-list');
    const empty = document.getElementById('craft-empty');
    if (!list) return;
    list.innerHTML = '';

    const q = filter.toLowerCase().trim();
    const filtered = q
        ? craftData.filter(r =>
            (r.name || '').toLowerCase().includes(q) ||
            (r.type || '').toLowerCase().includes(q) ||
            (r.requirements || '').toLowerCase().includes(q))
        : craftData;

    if (filtered.length === 0) {
        if (empty) { empty.style.display = 'block'; empty.textContent = q ? 'Nessun risultato.' : 'Nessun asset disponibile.'; }
        return;
    }
    if (empty) empty.style.display = 'none';

    filtered.forEach(r => {
        const item = document.createElement('div');
        item.className = 'craft-item';
        const reqs = (r.requirements || '').split(',').map(s => s.trim()).filter(Boolean);
        const pillsHtml = reqs.map(req => `<span class="craft-req-pill">${req}</span>`).join('');

        item.innerHTML = `
            <div class="craft-item-header">
                <span class="craft-item-name">${r.name || '—'}</span>
                <span class="craft-item-type">${r.type || ''}</span>
                <span class="craft-item-chevron">▶</span>
            </div>
            <div class="craft-item-detail">
                <div class="craft-detail-row">
                    <span class="craft-detail-label">⏱ Tempo</span>
                    <span class="craft-detail-value">${r.generation_time || '—'}</span>
                </div>
                <div class="craft-detail-row">
                    <span class="craft-detail-label">🔩 Requisiti</span>
                    <div class="craft-req-list">${pillsHtml || '<span style="color:#444">—</span>'}</div>
                </div>
                <div class="craft-detail-desc">${r.description || '—'}</div>
            </div>`;

        item.querySelector('.craft-item-header').addEventListener('click', () => {
            const wasOpen = item.classList.contains('expanded');
            list.querySelectorAll('.craft-item.expanded').forEach(el => el.classList.remove('expanded'));
            if (!wasOpen) item.classList.add('expanded');
        });

        list.appendChild(item);
    });
}

document.getElementById('craft-handle').addEventListener('click', () => {
    const open = document.getElementById('craft-tab').classList.toggle('open');
    document.getElementById('craft-toggle-label').textContent = open ? '◀ chiudi' : '▶ apri';
});

document.getElementById('craft-search-input').addEventListener('input', e => {
    buildCraftPanel(e.target.value);
});

fetchCraftAssets();

init();