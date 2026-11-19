/* ===================================================
   WARSCROLL LIBRARY — scrolls.js
=================================================== */
'use strict';

const UNITS_FILE = 'warscrolls/units.json';
const CARDS_FILE = 'warscrolls/cards.json';
const SHARED_ABILITIES_FILE = 'warscrolls/shared-abilities.json';
const MAX_POINTS = 2000;

// Weapon-keyword definitions now live in all_info/glossary.json (loaded via
// shared.js's loadGlossary()/glossaryTerms), shown through the shared
// glossary tooltip component instead of a page-local hardcoded dict.

// ─── Phase map ───────────────────────────────────────────────────────────────
const PHASE_ALIASES = {
    'startturn': 'Start Turn',
    'power': 'Power',
    'movement': 'Movement',
    'shooting': 'Shooting',
    'charge': 'Charge',
    'fight': 'Fight',
    'endturn': 'End Turn',
    'passive': 'Passive',
    'deployment': 'Deployment'
};
function normalisePhase(raw) {
    if (!raw) return null;
    const key = raw.trim().toLowerCase();
    return PHASE_ALIASES[key] || raw.trim();
}

// ─── State ───────────────────────────────────────────────────────────────────
let allUnits = [];
let allCards = [];
let sharedAbilities = [];
let army = {};
let rollHistory = [];
let openUnitCard = null;
let activePhase = null;
let activePanel = null; // tracks which left panel is open

// ─── DOM ─────────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const dom = {
    armyTrigger: $('army-trigger'),
    armyPanel: $('army-panel'),
    closeArmyPanel: $('close-army-panel'),
    diceTrigger: $('dice-trigger'),
    dicePanel: $('dice-panel'),
    closeDicePanel: $('close-dice-panel'),
    rulesTrigger: $('rules-trigger'),
    rulesPanel: $('rules-panel'),
    closeRulesPanel: $('close-rules-panel'),
    overlay: $('panel-overlay'),
    unitsList: $('units-list'),
    armyUnitsList: $('army-units-list'),
    pointsFill: $('points-fill'),
    pointsLabel: $('points-label'),
    clearArmyBtn: $('clear-army-btn'),
    cardsDrawer: $('cards-drawer'),
    cardsToggle: $('cards-toggle'),
    cardsBody: $('cards-body'),
    cardScroller: $('card-scroller'),
    cardCountBadge: $('card-count-badge'),
    rollDiceBtn: $('roll-dice-btn'),
    rollResult: $('roll-result'),
    rollHistory: $('roll-history'),
    quickResult: $('quick-result'),
    tokInput: $('tok-input'),
    atkInput: $('atk-input'),
    hitInput: $('hit-input'),
    wndInput: $('wnd-input'),
    critThresholdInput: $('crit-threshold-input'),
    rndInput: $('rnd-input'),
    saveInput: $('save-input'),
    wardInput: $('ward-input'),
    dmgInput: $('dmg-input'),
    crit2HitsInput: $('crit-2-hits-input'),
    critAutoWoundInput: $('crit-auto-wound-input'),
    critMortalInput: $('crit-mortal-input'),
    phaseBar: $('phase-bar'),
    cardModal: $('card-modal'),
    cardModalBd: $('card-modal-backdrop'),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
// Alias to shared.js's escapeHtml (canonical version, also escapes single
// quotes) so every existing linkifyGlossaryTerms(...) call site here keeps working as-is.
const escHtml = escapeHtml;

function phaseClass(phase) {
    if (!phase) return '';
    const map = {
        'Start Turn': 'startturn',
        'Power': 'power',
        'Movement': 'movement',
        'Shooting': 'shooting',
        'Charge': 'charge',
        'Fight': 'fight',
        'End Turn': 'endturn',
        'Passive': 'passive',
        'Deployment': 'deployment',
    };
    return map[phase] || '';
}

function phaseTag(phase) {
    if (!phase) return '';
    const cls = phaseClass(phase);
    const label = phase === 'passive' ? 'Passive' : phase;
    return `<span class="phase-tag phase-tag--${cls}" data-phase="${escHtml(phase)}">${linkifyGlossaryTerms(label)}</span>`;
}

// ─── Data Loading ────────────────────────────────────────────────────────────
async function loadJSON(path) {
    const res = await fetch(path);
    if (!res.ok) throw new Error(`Impossibile caricare ${path}: ${res.status}`);
    return res.json();
}
async function loadAllWarscrolls() {
    return loadJson(UNITS_FILE, []);
}
async function loadAllCards() {
    return loadJson(CARDS_FILE, []);
}
async function loadSharedAbilities() {
    try { const d = await loadJSON(SHARED_ABILITIES_FILE); return d.abilities || []; }
    catch { return []; }
}

// ─── Unit Rendering ──────────────────────────────────────────────────────────
function createStatBlock(val, lbl, glossaryTerm = lbl) {
    return `<div class="stat-block">
    <span class="stat-value">${linkifyGlossaryTerms(String(val))}</span>
    <span class="stat-label glossary-term" data-glossary-term="${escHtml(glossaryTerm)}">${escHtml(lbl)}</span>
  </div>`;
}

/**
 * Renders a single unified weapon table.
 * - melee weapons: first column shows "Melee"
 * - ranged weapons: first column shows "Ranged" and an extra Range column is included
 * Both weapon sets are listed in one table if a unit has both types.
 */
function renderWeaponTables(meleeWeapons, rangedWeapons) {
    const hasMelee  = meleeWeapons  && meleeWeapons.length;
    const hasRanged = rangedWeapons && rangedWeapons.length;
    if (!hasMelee && !hasRanged) return '';

    // Show Range column only when there are ranged weapons
    const rangeHeader = hasRanged ? '<th class="glossary-term" data-glossary-term="Range">Rng</th>' : '';

    function weaponRow(w, type) {
        const propsHtml = (w.properties || []).map(p => {
            const key = p.trim();
            const hasDesc = glossaryTerms && glossaryTerms[key] !== undefined;
            return hasDesc
                ? `<span class="weapon-prop weapon-prop--keyword glossary-term" data-glossary-term="${escHtml(key)}">${escHtml(key)}</span>`
                : `<span class="weapon-prop">${escHtml(key)}</span>`;
        }).join('');

        const rangeCell = hasRanged
            ? `<td>${type === 'ranged' ? linkifyGlossaryTerms(String(w.range ?? '–')) + '"' : '–'}</td>`
            : '';

        return `<tr>
      <td class="weapon-type-cell weapon-type--${type}">${type === 'melee' ? 'Mischia' : 'Distanza'}</td>
      <td class="weapon-name-cell">${linkifyGlossaryTerms(w.name)}</td>
      ${rangeCell}
      <td>${linkifyGlossaryTerms(String(w.attack ?? '–'))}</td>
      <td>${linkifyGlossaryTerms(String(w.hit ?? '–'))}+</td>
      <td>${linkifyGlossaryTerms(String(w.wound ?? '–'))}+</td>
      <td>${linkifyGlossaryTerms(String(w.rend ?? '–'))}</td>
      <td>${linkifyGlossaryTerms(String(w.damage ?? '–'))}</td>
      <td><div class="weapon-properties">${propsHtml}</div></td>
    </tr>`;
    }

    const meleeRows  = hasMelee  ? meleeWeapons.map(w  => weaponRow(w,  'melee')).join('') : '';
    const rangedRows = hasRanged ? rangedWeapons.map(w => weaponRow(w, 'ranged')).join('') : '';

    return `<p class="detail-section-title">Armi</p>
    <table class="weapon-table">
      <thead>
        <tr>
          <th>Tipo</th>
          <th class="weapon-name-header">Arma</th>
          ${rangeHeader}
          <th class="glossary-term" data-glossary-term="Attack">Atk</th><th class="glossary-term" data-glossary-term="Hit">Hit</th><th class="glossary-term" data-glossary-term="Wound">Wnd</th><th class="glossary-term" data-glossary-term="Rend">Rnd</th><th class="glossary-term" data-glossary-term="Damage">Dmg</th><th>Propr.</th>
        </tr>
      </thead>
      <tbody>${meleeRows}${rangedRows}</tbody>
    </table>`;
}

function renderAbilityBlock(a, isShared = false) {
    const phase = normalisePhase(a.phase);
    const uses = (!a.uses_per_round || a.uses_per_round >= 999) ? '∞' : `${a.uses_per_round}×`;
    const sharedBadge = isShared
        ? `<div class="shared-badge">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
        </svg>Abilità condivisa</div>`
        : '';
    return `<div class="ability-block${isShared ? ' shared-ability' : ''}" data-phase="${escHtml(phase || '')}">
    ${sharedBadge}
    <div class="ability-header">
      <span class="ability-name">${linkifyGlossaryTerms(a.name)}</span>
      <div class="ability-meta">
        ${phase ? phaseTag(phase) : ''}
        <span class="ability-uses">${uses}</span>
      </div>
    </div>
    <p class="ability-desc">${linkifyGlossaryTerms(a.description)}</p>
  </div>`;
}

function buildUnitCard(unit) {
    const li = document.createElement('li');
    li.className = 'unit-card';
    li.dataset.unitId = unit.id;

    const top = document.createElement('div');
    top.className = 'unit-card-top';
    top.setAttribute('role', 'button');
    top.setAttribute('aria-expanded', 'false');
    top.setAttribute('tabindex', '0');

    const tagsHtml = (unit.tags || []).map(t => `<span class="unit-tag">${linkifyGlossaryTerms(t)}</span>`).join('');
    const statsHtml = [
        createStatBlock(unit.move ?? '–', 'Move'),
        createStatBlock(unit.health ?? '–', 'HP', 'Health'),
        createStatBlock(unit.save ?? '–', 'Save'),
        createStatBlock(unit.control ?? '–', 'Ctrl', 'Control'),
        createStatBlock(unit.morale ?? '–', 'Morale'),
    ].join('');

    top.innerHTML = `
    <div class="unit-card-info">
      <h3 class="unit-card-name">${linkifyGlossaryTerms(unit.name)}</h3>
      <div class="unit-tags">${tagsHtml}</div>
      <div class="unit-stats">${statsHtml}</div>
    </div>
    <div class="unit-card-actions">
      <span class="unit-pts">${linkifyGlossaryTerms(String(unit.points ?? 0))} pts</span>
      <button class="add-unit-btn" aria-label="Aggiungi ${escHtml(unit.name)} all'esercito">+</button>
      <svg class="expand-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>`;

    const weaponsHtml = renderWeaponTables(unit.melee_weapons, unit.ranged_weapons);
    const unitAbils = (unit.abilities || []).map(a => renderAbilityBlock(a, false)).join('');
    const sharedAbils = sharedAbilities.map(a => renderAbilityBlock(a, true)).join('');
    const abilitiesSection = (unitAbils || sharedAbils)
        ? `<p class="detail-section-title">Abilità</p>${unitAbils}${sharedAbils}` : '';

    li.appendChild(top);
    li._unitData = unit;

    function toggleCard(e) {
        if (e.target.closest('.add-unit-btn')) return;
        if (li.classList.contains('expanded')) { collapseCard(li); }
        else {
            if (openUnitCard && openUnitCard !== li) collapseCard(openUnitCard);
            expandCard(li, weaponsHtml, abilitiesSection);
        }
    }
    top.addEventListener('click', toggleCard);
    top.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCard(e); } });
    top.querySelector('.add-unit-btn').addEventListener('click', e => { e.stopPropagation(); addUnitToArmy(unit); });
    return li;
}

function expandCard(li, weaponsHtml, abilitiesSection) {
    li.classList.add('expanded');
    const wrap = document.createElement('div');
    wrap.className = 'card-detail-wrap';
    const detail = document.createElement('div');
    detail.className = 'card-detail';
    detail.innerHTML = `
    ${weaponsHtml}${abilitiesSection}`;
    wrap.appendChild(detail);
    li.appendChild(wrap);

    const top = li.querySelector('.unit-card-top');
    top.setAttribute('aria-expanded', 'true');
    top.addEventListener('click', () => collapseCard(li), { once: true });

    openUnitCard = li;
    applyPhaseFilter();
}

function collapseCard(li) {
    li.classList.remove('expanded');
    const wrap = li.querySelector('.card-detail-wrap');
    if (wrap) li.removeChild(wrap);
    li.querySelector('.unit-card-top').setAttribute('aria-expanded', 'false');
    if (openUnitCard === li) openUnitCard = null;
}

function renderUnits(units) {
    dom.unitsList.innerHTML = '';
    if (!units || !units.length) { dom.unitsList.innerHTML = '<li class="empty-list">Nessuna unità trovata.</li>'; return; }
    units.forEach(u => dom.unitsList.appendChild(buildUnitCard(u)));
}

// Keyword tooltips are now handled by shared.js's initGlossaryTooltips()
// (called from init() below), reading all_info/glossary.json instead of a
// page-local dict, and supporting tap as well as hover.

// ─── Card Modal ───────────────────────────────────────────────────────────────
function showCardModal(card) {
    const phase = normalisePhase(card.phase);
    const cls = phaseClass(phase);
    dom.cardModal.innerHTML = `
    <div class="cm-header phase-header--${cls}">
      <div class="cm-header-text">
        <h2 class="cm-name">${linkifyGlossaryTerms(card.name)}</h2>
        <div class="cm-meta">
          ${card.type ? `<span class="cm-type">${linkifyGlossaryTerms(card.type)}</span>` : ''}
          ${phase ? phaseTag(phase) : ''}
        </div>
      </div>
      <button class="cm-close" aria-label="Chiudi">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
    <div class="cm-body">
      ${card.cost ? `
        <div class="cm-row">
          <span class="cm-row-label">Costo</span>
          <p class="cm-row-value">${linkifyGlossaryTerms(card.cost)}</p>
        </div>` : ''}
      ${card.use ? `
        <div class="cm-row">
          <span class="cm-row-label">Uso</span>
          <p class="cm-row-value">${linkifyGlossaryTerms(card.use)}</p>
        </div>` : ''}
      ${card.effect ? `
        <div class="cm-row">
          <span class="cm-row-label">Effetto</span>
          <p class="cm-row-value cm-effect">${linkifyGlossaryTerms(card.effect)}</p>
        </div>` : ''}
    </div>`;

    dom.cardModal.querySelector('.cm-close').addEventListener('click', hideCardModal);
    dom.cardModalBd.classList.add('open');
}

function hideCardModal() {
    dom.cardModalBd.classList.remove('open');
}

// ─── Phase Filter ────────────────────────────────────────────────────────────
function applyPhaseFilter() {
    document.querySelectorAll('.ability-block').forEach(block => {
        if (!activePhase) { block.classList.remove('phase-hidden'); return; }
        const bp = (block.dataset.phase || '').toLowerCase();
        const ap = activePhase.toLowerCase();
        block.classList.toggle('phase-hidden', !(bp === 'passive' || bp === ap));
    });
    document.querySelectorAll('.card-item').forEach(item => {
        if (!activePhase) { item.style.display = ''; return; }
        const cp = (item.dataset.phase || '').toLowerCase();
        item.style.display = (cp === 'passive' || cp === activePhase.toLowerCase()) ? '' : 'none';
    });
}

function initPhaseBar() {
    dom.phaseBar.querySelectorAll('.phase-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const phase = btn.dataset.phase;
            if (activePhase === phase) {
                activePhase = null;
                btn.setAttribute('aria-pressed', 'false');
            } else {
                dom.phaseBar.querySelectorAll('.phase-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
                activePhase = phase;
                btn.setAttribute('aria-pressed', 'true');
            }
            applyPhaseFilter();
        });
    });
}

// ─── Cards Drawer ────────────────────────────────────────────────────────────
function renderCards(cards) {
    dom.cardCountBadge.textContent = cards.length;
    dom.cardScroller.innerHTML = '';
    if (!cards || !cards.length) { dom.cardScroller.innerHTML = '<p class="empty-panel">Nessuna carta trovata.</p>'; return; }

    cards.forEach(card => {
        const phase = normalisePhase(card.phase);
        const cls = phaseClass(phase);
        const el = document.createElement('div');
        el.className = `card-item card-item--${cls}`;
        el.dataset.phase = (phase || '').toLowerCase();
        el.innerHTML = `
      <p class="card-item-name">${linkifyGlossaryTerms(card.name)}</p>
      <div class="card-item-footer">
        ${card.type ? `<span class="card-item-type">${linkifyGlossaryTerms(card.type)}</span>` : ''}
        ${phase ? phaseTag(phase) : ''}
      </div>`;
        el.addEventListener('click', () => showCardModal(card));
        dom.cardScroller.appendChild(el);
    });
}

// ─── Army Builder ────────────────────────────────────────────────────────────
function addUnitToArmy(unit) {
    army[unit.id] ? army[unit.id].qty++ : (army[unit.id] = { unit, qty: 1 });
    updateArmyPanel();
}
function removeUnitFromArmy(id) { delete army[id]; updateArmyPanel(); }
function changeUnitQty(id, d) {
    if (!army[id]) return;
    army[id].qty = Math.max(0, army[id].qty + d);
    if (!army[id].qty) delete army[id];
    updateArmyPanel();
}
function updateArmyPanel() {
    const entries = Object.values(army);
    const totalPts = entries.reduce((s, e) => s + e.unit.points * e.qty, 0);
    dom.pointsFill.style.width = Math.min(100, (totalPts / MAX_POINTS) * 100) + '%';
    dom.pointsFill.classList.toggle('over-budget', totalPts > MAX_POINTS);
    dom.pointsLabel.textContent = `${totalPts} / ${MAX_POINTS} pts`;
    dom.armyUnitsList.innerHTML = '';
    if (!entries.length) {
        dom.armyUnitsList.innerHTML = '<li class="empty-panel">Nessuna unità ancora.<br>Clicca <strong>+</strong> su qualsiasi unità.</li>';
        return;
    }
    entries.forEach(({ unit, qty }) => {
        const li = document.createElement('li');
        li.className = 'army-unit-row';
        li.innerHTML = `
      <span class="army-unit-name">${linkifyGlossaryTerms(unit.name)}</span>
      <span class="army-unit-pts">${unit.points * qty} pts</span>
      <div class="qty-controls">
        <button class="qty-btn" data-action="dec">−</button>
        <span class="qty-val">${qty}</span>
        <button class="qty-btn" data-action="inc">+</button>
      </div>
      <button class="remove-unit-btn">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>`;
        li.querySelector('[data-action="dec"]').addEventListener('click', () => changeUnitQty(unit.id, -1));
        li.querySelector('[data-action="inc"]').addEventListener('click', () => changeUnitQty(unit.id, 1));
        li.querySelector('.remove-unit-btn').addEventListener('click', () => removeUnitFromArmy(unit.id));
        dom.armyUnitsList.appendChild(li);
    });
}

// ─── Dice Roller ─────────────────────────────────────────────────────────────
function rollD(s) { return Math.floor(Math.random() * s) + 1; }
function readIntInput(input, fallback, min, max) {
    const parsed = Number.parseInt(input?.value, 10);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, parsed));
}
function simulateAttack(tokensNum, atk, hit, wnd, dmg = 1, critThreshold = 6, crit2Hits = false, critAutoWound = false, critMortal = false) {
    const attackRolls = tokensNum * atk;
    let hitRolls = 0;
    let woundRolls = 0;
    let wounds = 0;
    let damage = 0;
    let mortalDamage = 0;
    let crits = 0;
    let autoWounds = 0;
    let extraHits = 0;

    for (let i = 0; i < attackRolls; i++) {
        let hitCount = 1;
        const hitRoll = rollD(6);

        if (hitRoll < hit) continue;
        hitRolls++;

        if (hitRoll >= critThreshold) {
            crits++;

            if (critMortal) {
                mortalDamage += dmg;
                continue;
            }

            if (critAutoWound) {
                damage += dmg;
                autoWounds++;
                continue;
            }

            if (crit2Hits) {
                hitCount = 2;
                extraHits++;
            }
        }

        for (let j = 0; j < hitCount; j++) {
            woundRolls++;
            if (rollD(6) < wnd) continue;
            wounds++;
            damage += dmg;
        }
    }

    return { attackRolls, hitRolls, woundRolls, wounds, damage, mortalDamage, crits, autoWounds, extraHits };
}
function simulateDefense(damage, mortalDamage, save, ward, rend = 0) {
    let toBeWardedDamage = mortalDamage;
    let failedSaves = 0;
    let armorSaves = 0;
    const effectiveSave = Math.min(save + rend, 6);

    for (let i = 0; i < damage; i++) {
        if (rollD(6) < effectiveSave) {
            toBeWardedDamage++;
            failedSaves++;
        } else {
            armorSaves++;
        }
    }

    let finalDamage = 0;
    let wardSaves = 0;
    for (let i = 0; i < toBeWardedDamage; i++) {
        if (rollD(6) < ward) {
            finalDamage++;
        } else {
            wardSaves++;
        }
    }

    return { effectiveSave, failedSaves, armorSaves, wardRolls: toBeWardedDamage, wardSaves, finalDamage };
}
function addToHistory(t) {
    rollHistory.unshift(t);
    if (rollHistory.length > 20) rollHistory.pop();
    dom.rollHistory.innerHTML = rollHistory.map(h => `<li class="roll-history-item">${linkifyGlossaryTerms(h)}</li>`).join('');
}
function initDiceRoller() {
    document.querySelectorAll('.dice-quick-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const s = parseInt(btn.dataset.sides, 10), r = rollD(s);
            dom.quickResult.textContent = r; addToHistory(`D${s}: ${r}`);
        });
    });
    dom.rollDiceBtn.addEventListener('click', () => {
        const tok = readIntInput(dom.tokInput, 10, 1, 100);
        const atk = readIntInput(dom.atkInput, 2, 1, 20);
        const hit = readIntInput(dom.hitInput, 3, 2, 6);
        const wnd = readIntInput(dom.wndInput, 4, 2, 6);
        const critThreshold = readIntInput(dom.critThresholdInput, 6, 1, 6);
        const rnd = readIntInput(dom.rndInput, 0, 0, 6);
        const save = readIntInput(dom.saveInput, 4, 2, 6);
        const ward = readIntInput(dom.wardInput, 7, 2, 7);
        const dmg = readIntInput(dom.dmgInput, 1, 1, 10);
        const attack = simulateAttack(
            tok,
            atk,
            hit,
            wnd,
            dmg,
            critThreshold,
            dom.crit2HitsInput.checked,
            dom.critAutoWoundInput.checked,
            dom.critMortalInput.checked
        );
        const defense = simulateDefense(attack.damage, attack.mortalDamage, save, ward, rnd);
        const critFlags = [
            dom.crit2HitsInput.checked ? '2 Hits' : '',
            dom.critAutoWoundInput.checked ? 'Auto-wound' : '',
            dom.critMortalInput.checked ? 'Mortal' : '',
        ].filter(Boolean);
        const wardLabel = ward === 7 ? 'none' : `${ward}+`;

        dom.rollResult.innerHTML = `
            <strong>${attack.attackRolls}</strong> attacks → <strong>${attack.hitRolls}</strong> hits
            (<strong>${attack.crits}</strong> crits on ${critThreshold}+) → <strong>${attack.wounds}</strong> wounds
            ${attack.autoWounds ? `+ <strong>${attack.autoWounds}</strong> auto` : ''}
            → <strong>${attack.damage}</strong> normal + <strong>${attack.mortalDamage}</strong> mortal dmg<br>
            Save <strong>${defense.effectiveSave}+</strong> blocked <strong>${defense.armorSaves}</strong>;
            Ward <strong>${wardLabel}</strong> blocked <strong>${defense.wardSaves}</strong>
            → <strong>${defense.finalDamage}</strong> final dmg`;
        addToHistory(`${tok}×${atk} ${hit}+/${wnd}+ crit ${critThreshold}+ rend ${rnd} save ${save}+ ward ${wardLabel}${critFlags.length ? ` [Crit ${critFlags.join(', ')}]` : ''} → ${defense.finalDamage} dmg`);
    });
}

// ─── Panels ──────────────────────────────────────────────────────────────────
const ALL_PANELS = ['armyPanel', 'dicePanel', 'rulesPanel'];

function openPanel(panelKey) {
    ALL_PANELS.forEach(k => dom[k].classList.remove('open'));
    dom[panelKey].classList.add('open');
    dom.overlay.classList.add('visible');
    activePanel = panelKey;
}

function closeAllPanels() {
    ALL_PANELS.forEach(k => dom[k].classList.remove('open'));
    dom.overlay.classList.remove('visible');
    activePanel = null;
}

function initPanels() {
    dom.armyTrigger.addEventListener('click', () => openPanel('armyPanel'));
    dom.closeArmyPanel.addEventListener('click', closeAllPanels);
    dom.diceTrigger.addEventListener('click', () => openPanel('dicePanel'));
    dom.closeDicePanel.addEventListener('click', closeAllPanels);
    dom.rulesTrigger.addEventListener('click', () => openPanel('rulesPanel'));
    dom.closeRulesPanel.addEventListener('click', closeAllPanels);
    dom.overlay.addEventListener('click', closeAllPanels);
    dom.clearArmyBtn.addEventListener('click', () => { army = {}; updateArmyPanel(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            closeAllPanels();
            hideCardModal();
            if (openUnitCard) collapseCard(openUnitCard);
        }
    });
}

function initCardsDrawer() {
    dom.cardsToggle.addEventListener('click', () => {
        const o = dom.cardsDrawer.classList.toggle('open');
        dom.cardsToggle.setAttribute('aria-expanded', o);
        dom.cardsBody.setAttribute('aria-hidden', !o);
    });
    dom.cardModalBd.addEventListener('click', e => {
        if (e.target === dom.cardModalBd) hideCardModal();
    });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
async function init() {
    initPanels();
    initCardsDrawer();
    initDiceRoller();
    initPhaseBar();
    initGlossaryTooltips();
    try {
        // loadGlossary() is awaited alongside the rest so glossaryTerms is
        // populated before renderUnits() decides which weapon properties
        // get the glossary-term treatment.
        [allUnits, allCards, sharedAbilities] = await Promise.all([
            loadAllWarscrolls(), loadAllCards(), loadSharedAbilities(), loadGlossary()
        ]);
        renderUnits(allUnits);
        renderCards(allCards);
        updateArmyPanel();
    } catch (err) {
        dom.unitsList.innerHTML = `<li class="error-block">Impossibile caricare i warscroll.<br>${linkifyGlossaryTerms(err.message)}</li>`;
        console.error(err);
    }
}
document.addEventListener('DOMContentLoaded', init);
