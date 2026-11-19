'use strict';

const HAND_NAME = 'La Mano';
const DATA_ROOT = 'all_info/';

const STAT_DEFINITIONS = [
  { key: 'might', label: 'Might' },
  { key: 'treasure', label: 'Treasure' },
  { key: 'influence', label: 'Influence' },
  { key: 'territory', label: 'Territory' },
  { key: 'sovereignty', label: 'Sovereignty' },
];

// ACTIONS, WAR_REASONS, FAMILY_QUALITIES, escapeHtml, loadJson, qualifiesFor,
// generateFamilyDescription, hasGovernmentEffect and applyGovernmentStatRules
// now live in shared.js (loaded before this file) so the Court and Strategic
// Map pages can't drift out of sync on them the way ACTIONS/ACTION_ROLLS and
// the government stat rules previously did.

let hand = null;
let government = null;
let currentMonth = 0;
let familyAssets = [];
let craftableAssets = [];
let localizedAssets = [];
let treatyGrantedAssets = [];
let resourceById = new Map();
let bodyById = new Map();
let companies = [];
let leaders = [];
let traitById = new Map();
let treatyTypes = {};
let activePacts = [];
let oneSidedPactsAgainstHand = [];
let fleetCount = 0;
let missingDataFiles = [];
let statChanges = [];
let activeModifierEntries = [];
let divineOutcome = 'none';

const $ = (id) => document.getElementById(id);

// escapeHtml and the generic loadJson fetch helper live in shared.js; this
// thin wrapper keeps script.js's existing call style (path, fallback,
// optional) and DATA_ROOT-prefixing/missingDataFiles tracking behavior.
function fetchGameData(path, fallback, optional = false) {
  return loadJson(path, fallback, {
    prefix: DATA_ROOT,
    optional,
    onError: (p) => missingDataFiles.push(p),
  });
}

function normalise(value) {
  return String(value ?? '').trim().toLocaleLowerCase('it');
}

function isTrue(value) {
  return value === true || String(value).toLowerCase() === 'true';
}

function statChangeIsActive(change, month) {
  const from = Number(change.from);
  const to = change.to == null || String(change.to).toLowerCase() === 'infinity'
    ? Infinity
    : Number(change.to);
  return Number.isFinite(from) && Number.isFinite(month) && month >= from && month < to;
}

function getCurrentFamilyStat(statKey) {
  if (!hand) return 0;
  const title = STAT_DEFINITIONS.find((item) => item.key === statKey)?.label || statKey;
  const base = Number(hand[statKey] ?? hand[title]) || 0;
  const adjustment = statChanges.reduce((total, change) => {
    if (normalise(change.family) !== normalise(HAND_NAME)) return total;
    if (normalise(change.stat) !== statKey) return total;
    if (!statChangeIsActive(change, currentMonth)) return total;
    const amount = Number(change.amount);
    return total + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  return base + adjustment;
}

function currentInputStats() {
  return Object.fromEntries(STAT_DEFINITIONS.map(({ key }) => {
    const value = Number.parseInt($(key).value, 10);
    return [key, Number.isFinite(value) ? value : 0];
  }));
}

// hasGovernmentEffect/applyGovernmentStatRules/generateFamilyDescription now
// live in shared.js (parameterized on an explicit effects array, instead of
// reading this page's `government` global directly) so the Strategic Map
// page applies the exact same government stat rules instead of silently
// skipping them.
function getEffectiveInputStats() {
  return applyGovernmentStatRules(currentInputStats(), government?.effetti_speciali);
}

function updateFamilyDescription() {
  const effective = getEffectiveInputStats();
  const statsByLabel = Object.fromEntries(STAT_DEFINITIONS.map(({ key, label }) => [label, effective[key]]));
  $('dynamicDescription').textContent = generateFamilyDescription(statsByLabel);
  updateGovernmentAdjustment();
}

function updateGovernmentAdjustment() {
  const host = $('government-adjustment');
  if (!hasGovernmentEffect(government?.effetti_speciali, 'Diritto Divino')) {
    host.textContent = '';
    return;
  }
  const stats = currentInputStats();
  if (stats.sovereignty <= 2) {
    host.textContent = 'Diritto Divino attivo: con Sovereignty ≤ 2, Might, Treasure, Influence e Territory subiscono ciascuna −1 nel calcolo dei tiri.';
  } else {
    host.textContent = 'Diritto Divino: nessuna penalità attiva finché Sovereignty resta sopra 2.';
  }
}

function renderGovernmentDetails() {
  const governmentName = hand?.government ?? hand?.Government ?? '';
  const governmentLabel = government?.nome_italiano
    ? `${government.nome} · ${government.nome_italiano}`
    : government?.nome || governmentName || 'Governo non disponibile';
  $('family-government').textContent = governmentLabel;

  const effects = Array.isArray(government?.effetti_speciali) ? government.effetti_speciali : [];
  $('government-effects').innerHTML = effects.length
    ? `<ul>${effects.map((effect) => `<li><strong>${linkifyGlossaryTerms(effect.nome || 'Effetto')}:</strong> ${linkifyGlossaryTerms(effect.descrizione || '')}</li>`).join('')}</ul>`
    : '';

  const caps = government?.statistiche || {};
  STAT_DEFINITIONS.forEach(({ key, label }) => {
    const configuredCap = Number(caps[label]);
    const cap = configuredCap > 0 ? configuredCap : 7;
    $(`${key}-cap`).textContent = `(max ${cap})`;
    $(key).max = String(cap);
  });
  updateGovernmentAdjustment();
}

function setFamilyStats() {
  if (!hand) return;
  STAT_DEFINITIONS.forEach(({ key }) => {
    $(key).value = String(getCurrentFamilyStat(key));
  });
  renderGovernmentDetails();
  updateFamilyDescription();
}

// Places (planets/moons/stations/waypoints) now live together in
// all_info/places.json -- no more need to concatenate two separate files.

function getLocalizedAssetsForOwner(assets, places) {
  const ownedPlaceIds = new Set((Array.isArray(places) ? places : [])
    .filter((place) => normalise(place.owner) === normalise(HAND_NAME))
    .map((place) => String(place.id)));
  return (Array.isArray(assets) ? assets : [])
    .filter((asset) => ownedPlaceIds.has(String(asset.bodyId)));
}

function getControlledResources(places) {
  const resourceIds = new Set();
  const ownedPlaces = places.filter((place) => normalise(place.owner) === normalise(HAND_NAME));
  ownedPlaces.forEach((place) => {
    (Array.isArray(place.resourceIds) ? place.resourceIds : []).forEach((id) => resourceIds.add(String(id)));
  });
  return { resourceIds, ownedPlaces };
}

function assetRequirements(asset) {
  return Array.isArray(asset.requirementIds) ? asset.requirementIds.map(String) : [];
}

// qualifiesFor (asset, resourceIds) now lives in shared.js.

function resourceName(resourceId) {
  return resourceById.get(String(resourceId))?.name || String(resourceId);
}

function diceKind(diceType) {
  const value = String(diceType || 'Normal Dice').trim().toLowerCase();
  if (value.includes('expert') || value === 'ed') return 'expert';
  if (value.includes('master') || value === 'md') return 'master';
  return 'normal';
}

function emptyDelta() {
  return { normal: 0, expert: 0, master: 0 };
}

function parseModifierAmount(amountValue, diceType) {
  const delta = emptyDelta();
  if (amountValue === null || amountValue === undefined || amountValue === '') return delta;

  if (typeof amountValue === 'number' || /^[-+]?\d+(?:\.\d+)?$/.test(String(amountValue).trim())) {
    const numeric = Number(amountValue);
    if (Number.isFinite(numeric)) delta[diceKind(diceType)] += numeric;
    return delta;
  }

  const text = String(amountValue).trim().toUpperCase().replace(/\s+/g, '');
  const expert = text.match(/^([+-]?)(\d*)ED$/);
  const master = text.match(/^([+-]?)(\d*)MD$/);
  const normalDice = text.match(/^([+-]?)(\d+)D(?:10)?$/);
  if (expert) delta.expert = (expert[1] === '-' ? -1 : 1) * Number(expert[2] || 1);
  else if (master) delta.master = (master[1] === '-' ? -1 : 1) * Number(master[2] || 1);
  else if (normalDice) delta.normal = (normalDice[1] === '-' ? -1 : 1) * Number(normalDice[2]);
  return delta;
}

function deltaIsZero(delta) {
  return delta.normal === 0 && delta.expert === 0 && delta.master === 0;
}

function formatDelta(delta) {
  if (deltaIsZero(delta)) return 'Effetto speciale · nessun dado';
  const parts = [];
  if (delta.normal) parts.push(`${delta.normal > 0 ? '+' : '−'}${Math.abs(delta.normal)}d10`);
  if (delta.expert) parts.push(`${delta.expert > 0 ? '+' : '−'}${Math.abs(delta.expert)} ED`);
  if (delta.master) parts.push(`${delta.master > 0 ? '+' : '−'}${Math.abs(delta.master)} MD`);
  return parts.join(' · ');
}

function formatRawModifier(amount, diceType) {
  return formatDelta(parseModifierAmount(amount, diceType));
}

function isDiceModifier(modifier) {
  return Boolean(modifier && (modifier.stat || modifier.action));
}

function matchesActionTarget(target, actionName, warReason) {
  const expected = normalise(target);
  const actual = normalise(actionName);
  if (!expected) return false;
  if (expected === actual) return true;
  if (expected === 'aumento stat' && actual.startsWith('aumento stat (')) return true;
  if (actual === 'attacco' && expected.startsWith('attacco (')) {
    const specificReason = expected.slice('attacco ('.length).replace(/\)$/, '');
    return normalise(warReason) === specificReason;
  }
  return false;
}

function modifierMatches(modifier, actionName, rollStats, warReason) {
  if (!modifier || !isDiceModifier(modifier)) return false;
  if (modifier.action) return matchesActionTarget(modifier.action, actionName, warReason);
  const target = normalise(modifier.stat);
  return target === 'all' || rollStats.some((stat) => normalise(stat) === target);
}

function getPactRole(holder) {
  const isFrom = normalise(holder.from) === normalise(HAND_NAME);
  const isTo = normalise(holder.to) === normalise(HAND_NAME);
  const bidirectional = holder.bidirectional !== false;
  if (isFrom) return { role: 'from', counterpart: holder.to, bidirectional };
  if (isTo && bidirectional) return { role: 'to', counterpart: holder.from, bidirectional };
  return null;
}

function getPactModifiers(pact, role) {
  const directionalKey = role === 'from' ? 'modifiersAsFrom' : 'modifiersAsTo';
  if (Array.isArray(pact[directionalKey])) return pact[directionalKey];
  return Array.isArray(pact.modifiers) ? pact.modifiers : [];
}

function collectRollModifiers(actionName, rollStats, context) {
  const entries = [];
  let nextId = 0;
  const push = (entry) => entries.push({ ...entry, id: `modifier-${nextId++}` });

  for (const asset of [...familyAssets, ...treatyGrantedAssets]) {
    for (const modifier of Array.isArray(asset.modifiers) ? asset.modifiers : []) {
      if (!modifierMatches(modifier, actionName, rollStats, context.warReason)) continue;
      push({
        group: 'assets',
        source: asset.treatyName
          ? `Asset da trattato · ${asset.treatyName} · ${asset.counterpart || ''}`.trim()
          : 'Asset della famiglia',
        name: asset.name || 'Asset senza nome',
        modifier,
        description: asset.description || '',
        effect: asset.effect || '',
      });
    }
  }

  for (const leader of leaders) {
    const traitIds = Array.isArray(leader.traits) && leader.traits.length
      ? leader.traits
      : [leader.trait1, leader.trait2].filter(Boolean);
    for (const traitId of traitIds) {
      const trait = traitById.get(String(traitId));
      if (!trait) continue;
      for (const modifier of Array.isArray(trait.modifiers) ? trait.modifiers : []) {
        // Army-phase modifiers are retained in the Court reference, not folded into a Company dice pool.
        if (modifier.armies || !modifierMatches(modifier, actionName, rollStats, context.warReason)) continue;
        push({
          group: 'court',
          source: `${leader.role || 'Corte'} · ${leader.name}`,
          name: trait.label || trait.name || traitId,
          modifier,
          description: trait.description || '',
          effect: '',
        });
      }
    }
  }

  for (const pact of activePacts) {
    const modifiers = getPactModifiers(pact.definition, pact.role);
    for (const modifier of modifiers) {
      if (!modifierMatches(modifier, actionName, rollStats, context.warReason)) continue;
      const needsCounterpart = /altro partito|altra parte|controparte/i.test(String(modifier.situation || ''));
      if (needsCounterpart && normalise(context.opponent) !== normalise(pact.counterpart)) continue;
      push({
        group: 'treaties',
        source: `Trattato · ${pact.name} · ${pact.counterpart}`,
        name: pact.name,
        modifier,
        description: pact.definition.description || '',
        effect: pact.definition.effects || '',
      });
    }
  }

  if (actionName === 'Difesa' && context.location) {
    for (const asset of localizedAssets.filter((item) => String(item.bodyId) === String(context.location))) {
      const parsed = parseLocalizedAsset(asset);
      const hasRelevantStat = !parsed.stat || rollStats.some((stat) => normalise(stat) === normalise(parsed.stat));
      if (!hasRelevantStat) continue;
      push({
        group: 'localized',
        source: `Asset del luogo · ${parsed.placeName}`,
        name: asset.name || 'Asset localizzato',
        modifier: {
          stat: parsed.stat || 'all',
          amount: parsed.conflict ? 0 : parsed.amount,
          diceType: 'Normal Dice',
          situation: parsed.situation,
          always: false,
        },
        description: asset.description || '',
        effect: asset.effect || '',
        conflict: parsed.conflict,
      });
    }
  }

  return entries;
}

function parseLocalizedAsset(asset) {
  const place = bodyById.get(String(asset.bodyId));
  const effectText = String(asset.effect || '');
  const descriptionText = String(asset.description || '');
  const effectMatch = effectText.match(/([+-])\s*(\d+)\s*d\b/i);
  const descriptionMatch = descriptionText.match(/([+-])\s*(\d+)\s*d\b/i);
  const effectAmount = effectMatch ? (effectMatch[1] === '-' ? -1 : 1) * Number(effectMatch[2]) : null;
  const descriptionAmount = descriptionMatch ? (descriptionMatch[1] === '-' ? -1 : 1) * Number(descriptionMatch[2]) : null;
  const conflict = effectAmount !== null && descriptionAmount !== null && effectAmount !== descriptionAmount;
  const statMatch = effectText.match(/\b(Might|Treasure|Influence|Territory|Sovereignty)\b/i);
  const placeName = place?.name || asset.bodyId || 'Luogo non identificato';
  const amount = effectAmount ?? descriptionAmount ?? 0;
  return {
    placeName,
    amount,
    stat: statMatch?.[1] || null,
    conflict,
    situation: conflict
      ? `Dati discordanti: effect indica ${effectAmount > 0 ? '+' : ''}${effectAmount}d, mentre description indica ${descriptionAmount > 0 ? '+' : ''}${descriptionAmount}d. Non viene applicato automaticamente.`
      : `Solo per un tiro di Difesa su ${placeName}. ${effectText || descriptionText}`,
  };
}

function modifierIsMandatory(modifier) {
  return isTrue(modifier?.always);
}

function modifierCardMarkup(entry) {
  const modifier = entry.modifier || {};
  const mandatory = modifierIsMandatory(modifier);
  const delta = parseModifierAmount(modifier.amount, modifier.diceType);
  const deltaClass = Object.values(delta).some((value) => value < 0) ? 'modifier-delta penalty' : 'modifier-delta';
  const badge = mandatory
    ? '<span class="badge-mandatory">Automatico</span>'
    : '<span class="badge-optional">Situazionale</span>';
  const checked = mandatory ? 'checked disabled' : '';
  const specialNote = deltaIsZero(delta)
    ? '<p class="modifier-note">Modifica il risultato o applica un effetto speciale; non aggiunge né rimuove dadi.</p>'
    : '';
  const conflictNote = entry.conflict
    ? '<p class="modifier-conflict">Il JSON contiene due valori incompatibili. Verificare la regola prima di applicare un bonus.</p>'
    : '';

  return `
    <article class="modifier-card${mandatory ? ' mandatory' : ''}${entry.conflict ? ' conflicting' : ''}">
      <label class="modifier-toggle">
        <input type="checkbox" class="modifier-checkbox" data-modifier-id="${escapeHtml(entry.id)}" ${checked}>
        <span class="modifier-title">${linkifyGlossaryTerms(entry.name)} ${badge}</span>
        <span class="${deltaClass}">${linkifyGlossaryTerms(formatDelta(delta))}</span>
      </label>
      <p class="modifier-source">${linkifyGlossaryTerms(entry.source)}</p>
      ${modifier.situation ? `<p class="modifier-situation"><strong>Quando applicarlo:</strong> ${linkifyGlossaryTerms(modifier.situation)}</p>` : ''}
      ${entry.effect ? `<p class="modifier-effect"><strong>Effetto:</strong> ${linkifyGlossaryTerms(entry.effect)}</p>` : ''}
      ${entry.description ? `<p class="modifier-asset-description">${linkifyGlossaryTerms(entry.description)}</p>` : ''}
      ${specialNote}${conflictNote}
    </article>`;
}

function renderModifierGroups() {
  const host = $('modifier-area');
  const groups = [
    ['assets', 'Asset della famiglia'],
    ['court', 'Tratti della Corte'],
    ['treaties', 'Trattati'],
    ['localized', 'Asset legati al luogo'],
  ];
  const rendered = groups.map(([key, title]) => {
    const entries = activeModifierEntries.filter((entry) => entry.group === key);
    if (!entries.length) return '';
    return `<div class="modifier-group"><h3>${title}</h3>${entries.map(modifierCardMarkup).join('')}</div>`;
  }).join('');

  host.innerHTML = rendered || '<p class="no-modifiers">Nessun modificatore strutturato di asset, Corte o trattati è associato a questo tiro. Controlla comunque gli effetti narrativi e le condizioni elencate nella scheda della famiglia.</p>';
  host.querySelectorAll('.modifier-checkbox').forEach((checkbox) => {
    checkbox.addEventListener('change', recalculateRoll);
  });
}

function buildWarReasonMarkup() {
  return `
    <div class="action-extra">
      <label for="warReasonsMenu">Obiettivo dell’attacco</label>
      <select id="warReasonsMenu">
        <option value="">Seleziona una ragione di guerra…</option>
        ${WAR_REASONS.map((reason) => `<option value="${escapeHtml(reason.name)}">${escapeHtml(reason.name)}</option>`).join('')}
      </select>
      <p id="warReasonDescription">La descrizione dell’obiettivo selezionato apparirà qui.</p>
    </div>`;
}

function buildOpponentMarkup() {
  const others = companies.filter((company) => normalise(company.name) !== normalise(HAND_NAME));
  return `
    <div class="action-extra">
      <label for="opponentMenu">Compagnia coinvolta (per i bonus legati alla controparte)</label>
      <select id="opponentMenu">
        <option value="">Seleziona una compagnia…</option>
        ${others.map((company) => `<option value="${escapeHtml(company.name)}">${escapeHtml(company.name)}</option>`).join('')}
      </select>
    </div>`;
}

function buildLocationMarkup() {
  const places = [...new Map(localizedAssets.map((asset) => {
    const body = bodyById.get(String(asset.bodyId));
    return [String(asset.bodyId), { id: asset.bodyId, name: body?.name || asset.bodyId }];
  })).values()];
  if (!places.length) return '';
  return `
    <div class="action-extra">
      <label for="locationMenu">Luogo del tiro di Difesa</label>
      <select id="locationMenu">
        <option value="">Nessun luogo selezionato</option>
        ${places.map((place) => `<option value="${escapeHtml(place.id)}">${escapeHtml(place.name)}</option>`).join('')}
      </select>
      <p>Gli asset locali vengono proposti solo se il luogo e l’azione corrispondono.</p>
    </div>`;
}

function buildTreatyMarkup() {
  const offerable = Object.entries(treatyTypes).filter(([, info]) => info?.category !== 'unique');
  if (!offerable.length) return '<div class="action-extra"><p>Le definizioni dei trattati non sono disponibili.</p></div>';
  return `
    <div class="action-extra">
      <label for="treatyTypeMenu">Tipo di trattato da proporre</label>
      <select id="treatyTypeMenu">
        <option value="">Seleziona un trattato…</option>
        ${offerable.map(([name]) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('')}
      </select>
      <div id="treatyTypeDetails"></div>
    </div>`;
}

function buildDivineWillMarkup() {
  if (!hasGovernmentEffect(government?.effetti_speciali, 'Volontà Divina')) return '';
  const effect = government.effetti_speciali.find((item) => normalise(item.nome) === normalise('Volontà Divina'));
  return `
    <div class="action-extra government-roll-control">
      <label for="divineOutcomeMenu">Volontà Divina · esito del tiro mensile</label>
      <select id="divineOutcomeMenu">
        <option value="none">Non applicare un esito</option>
        <option value="blessing">Benedizione · +2d a tutti i tiri</option>
        <option value="punishment">Castigo · −2d a tutti i tiri</option>
      </select>
      <p>${linkifyGlossaryTerms(effect?.descrizione || '')}</p>
      <p class="input-note">La pagina non tira il d10 mensile: seleziona l’esito effettivamente ottenuto.</p>
    </div>`;
}

function buildFleetDetails() {
  const cost = fleetCount * 2;
  const difficulty = fleetCount * 3;
  return `<div class="action-extra fleet-details"><strong>Flotte attualmente possedute:</strong> ${fleetCount}. <strong>Costo:</strong> Might −${cost} e Treasure −${cost} permanente. <strong>Difficoltà (3 volte il numero di flotte attuali possedute):</strong> Height ${difficulty}.</div>`;
}

function buildActionContext() {
  const actionName = $('actionsMenu').value;
  const action = ACTIONS[actionName];
  if (!action) return '';
  const pieces = [];
  if (action.hasWarReasons) pieces.push(buildWarReasonMarkup());
  if (action.needsOpponent) pieces.push(buildOpponentMarkup());
  if (action.hasLocation) pieces.push(buildLocationMarkup());
  if (action.hasTreatyMenu) pieces.push(buildTreatyMarkup());
  if (actionName === 'Genera Flotta') pieces.push(buildFleetDetails());
  return pieces.join('');
}

function renderActionDetails() {
  const actionName = $('actionsMenu').value;
  const action = ACTIONS[actionName];
  const host = $('actionDetails');
  if (!action) {
    activeModifierEntries = [];
    host.innerHTML = '<p class="empty-state">Seleziona un’azione per vedere la descrizione, i modificatori applicabili e la riserva di dadi.</p>';
    return;
  }

  host.innerHTML = `
    <p class="action-description">${linkifyGlossaryTerms(action.description)}</p>
    ${buildActionContext()}
    ${buildDivineWillMarkup()}
    <div class="action-extra modifier-extra">
      <div class="modifier-area-heading">
        <label>Bonus e malus applicabili</label>
        <span class="modifier-legend"><span class="legend-auto">Automatico</span> · <span class="legend-situational">Situazionale, da selezionare</span></span>
      </div>
      <div id="modifier-area"><p class="empty-state">Calcolo dei modificatori…</p></div>
    </div>
    <div class="action-control">
      <label for="bonusDropdown">Bonus / malus manuale (per effetti narrativi non strutturati)</label>
      <select id="bonusDropdown">
        <option value="none">Nessun modificatore</option>
        <option value="-3d">−3 dadi normali</option>
        <option value="-2d">−2 dadi normali</option>
        <option value="-1d">−1 dado normale</option>
        <option value="1d">+1 dado normale</option>
        <option value="2d">+2 dadi normali</option>
        <option value="3d">+3 dadi normali</option>
        <option value="ED">+1 dado esperto</option>
        <option value="-ED">−1 dado esperto</option>
        <option value="MD">+1 dado maestro</option>
        <option value="-MD">−1 dado maestro</option>
        <option value="1+MD">+1 dado normale e +1 dado maestro</option>
        <option value="2+MD">+2 dadi normali e +1 dado maestro</option>
      </select>
    </div>
    <div id="rollSummary" class="roll-summary" aria-live="polite">
      <span class="roll-summary-label">Riserva calcolata</span>
      <div id="rollTotal" class="roll-summary-total">—</div>
      <p id="rollBreakdown" class="roll-summary-breakdown"></p>
      <p id="rollWarning" class="roll-warning" hidden></p>
    </div>`;

  const warSelect = $('warReasonsMenu');
  if (warSelect) {
    warSelect.addEventListener('change', () => {
      const selected = WAR_REASONS.find((reason) => reason.name === warSelect.value);
      $('warReasonDescription').textContent = selected?.description || 'Seleziona una ragione di guerra.';
      refreshModifierEntries();
    });
  }

  const opponentMenu = $('opponentMenu');
  if (opponentMenu) opponentMenu.addEventListener('change', refreshModifierEntries);
  const locationMenu = $('locationMenu');
  if (locationMenu) locationMenu.addEventListener('change', refreshModifierEntries);

  const treatySelect = $('treatyTypeMenu');
  if (treatySelect) {
    treatySelect.addEventListener('change', () => {
      const info = treatyTypes[treatySelect.value];
      $('treatyTypeDetails').innerHTML = info
        ? `<p><strong>Descrizione:</strong> ${linkifyGlossaryTerms(info.description || '—')}</p>
           <p><strong>Effetti:</strong> ${linkifyGlossaryTerms(info.effects || '—')}</p>
           <p><strong>Costo di creazione:</strong> ${linkifyGlossaryTerms(info.diplomacyCost || '—')}</p>
           <p><strong>Costo di rottura:</strong> ${linkifyGlossaryTerms(info.breakupCost || '—')}</p>`
        : '';
    });
  }

  const divineSelect = $('divineOutcomeMenu');
  if (divineSelect) {
    divineSelect.value = divineOutcome;
    divineSelect.addEventListener('change', () => {
      divineOutcome = divineSelect.value;
      recalculateRoll();
    });
  }

  $('bonusDropdown').addEventListener('change', recalculateRoll);
  refreshModifierEntries();
}

function getActionContext() {
  return {
    warReason: $('warReasonsMenu')?.value || '',
    opponent: $('opponentMenu')?.value || '',
    location: $('locationMenu')?.value || '',
  };
}

function refreshModifierEntries() {
  const actionName = $('actionsMenu').value;
  const action = ACTIONS[actionName];
  if (!action) return;
  activeModifierEntries = collectRollModifiers(actionName, action.rolls, getActionContext());
  renderModifierGroups();
  recalculateRoll();
}

function parseManualBonus(value) {
  if (!value || value === 'none') return emptyDelta();
  if (value === '1+MD') return { normal: 1, expert: 0, master: 1 };
  if (value === '2+MD') return { normal: 2, expert: 0, master: 1 };
  return parseModifierAmount(value, 'Normal Dice');
}

function sumDeltas(deltas) {
  return deltas.reduce((total, delta) => ({
    normal: total.normal + delta.normal,
    expert: total.expert + delta.expert,
    master: total.master + delta.master,
  }), emptyDelta());
}

function calculateDicePool(baseDice, deltas) {
  const modifiers = sumDeltas(deltas);
  const rawTotals = {
    normal: baseDice + modifiers.normal,
    expert: modifiers.expert,
    master: modifiers.master,
  };
  const totals = {
    normal: Math.max(0, rawTotals.normal),
    expert: Math.max(0, rawTotals.expert),
    master: Math.max(0, rawTotals.master),
  };
  return { modifiers, rawTotals, totals };
}

function recalculateRoll() {
  const actionName = $('actionsMenu').value;
  const action = ACTIONS[actionName];
  if (!action || !$('rollTotal')) return;

  const effectiveStats = getEffectiveInputStats();
  const statValues = action.rolls.map((key) => ({
    key,
    label: STAT_DEFINITIONS.find((item) => item.key === key)?.label || key,
    value: effectiveStats[key] || 0,
  }));
  const baseDice = statValues.reduce((total, stat) => total + stat.value, 0);
  const deltas = [];
  const appliedNames = [];

  for (const entry of activeModifierEntries) {
    const checkbox = document.querySelector(`.modifier-checkbox[data-modifier-id="${entry.id}"]`);
    const selected = modifierIsMandatory(entry.modifier) || Boolean(checkbox?.checked);
    if (!selected) continue;
    deltas.push(parseModifierAmount(entry.modifier.amount, entry.modifier.diceType));
    appliedNames.push(`${entry.name} (${entry.source})`);
  }

  const manualDelta = parseManualBonus($('bonusDropdown')?.value || 'none');
  if (!deltaIsZero(manualDelta)) {
    deltas.push(manualDelta);
    appliedNames.push('Bonus / malus manuale');
  }
  if (divineOutcome === 'blessing') {
    deltas.push({ normal: 2, expert: 0, master: 0 });
    appliedNames.push('Volontà Divina · Benedizione');
  } else if (divineOutcome === 'punishment') {
    deltas.push({ normal: -2, expert: 0, master: 0 });
    appliedNames.push('Volontà Divina · Castigo');
  }

  const { modifiers, rawTotals, totals } = calculateDicePool(baseDice, deltas);
  const formatted = [`${totals.normal}d10`];
  if (totals.expert) formatted.push(`${totals.expert} ED`);
  if (totals.master) formatted.push(`${totals.master} MD`);
  $('rollTotal').textContent = formatted.join(' + ');

  const rollNames = statValues.map((stat) => `${stat.label} (${stat.value})`);
  const details = [`Base: ${rollNames.join(' + ')} = ${baseDice}d10.`];
  if (modifiers.normal || modifiers.expert || modifiers.master) {
    const changes = [];
    if (modifiers.normal) changes.push(`${modifiers.normal > 0 ? '+' : '−'}${Math.abs(modifiers.normal)} dadi normali`);
    if (modifiers.expert) changes.push(`${modifiers.expert > 0 ? '+' : '−'}${Math.abs(modifiers.expert)} ED`);
    if (modifiers.master) changes.push(`${modifiers.master > 0 ? '+' : '−'}${Math.abs(modifiers.master)} MD`);
    details.push(`Modificatori netti: ${changes.join(', ')}.`);
  } else {
    details.push('Nessun modificatore numerico selezionato.');
  }
  if (appliedNames.length) details.push(`Fonti applicate: ${appliedNames.join('; ')}.`);
  $('rollBreakdown').textContent = details.join(' ');

  const overReduced = rawTotals.normal < 0 || rawTotals.expert < 0 || rawTotals.master < 0;
  $('rollWarning').hidden = !overReduced;
  $('rollWarning').textContent = overReduced
    ? 'Una riduzione supera i dadi disponibili per quel tipo: la riserva è stata limitata a zero.'
    : '';
}

function populateActions() {
  const menu = $('actionsMenu');
  Object.keys(ACTIONS).forEach((name) => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    menu.appendChild(option);
  });
  menu.addEventListener('change', renderActionDetails);
}

function renderFamilyAssets() {
  const host = $('family-assets');
  const visibleAssets = [...familyAssets, ...treatyGrantedAssets];
  $('owned-asset-count').textContent = String(visibleAssets.length);
  if (!visibleAssets.length) {
    host.innerHTML = '<p class="empty-state">Nessun asset unico registrato per La Mano.</p>';
    return;
  }
  host.innerHTML = visibleAssets.map((asset) => {
    const modifiers = Array.isArray(asset.modifiers) ? asset.modifiers : [];
    const modifierPills = modifiers.map((modifier) => {
      const delta = parseModifierAmount(modifier.amount, modifier.diceType);
      const category = modifierIsMandatory(modifier) ? 'Automatico' : 'Situazionale';
      return `<span class="meta-pill">${category} · ${linkifyGlossaryTerms(formatDelta(delta))}</span>`;
    }).join('');
    const notes = [];
    if (!modifiers.length) notes.push('<span class="meta-pill">Nessun modificatore dadi strutturato</span>');
    if (asset.treatyName) {
      notes.push(`<span class="meta-pill">Concesso dal trattato: ${linkifyGlossaryTerms(asset.treatyName)} · con ${linkifyGlossaryTerms(asset.counterpart || 'controparte non specificata')}</span>`);
    }
    return `
      <article class="asset-card">
        <div class="asset-card-header">
          <span class="asset-name">${linkifyGlossaryTerms(asset.name || 'Asset senza nome')}</span>
          <span class="asset-type">${linkifyGlossaryTerms(asset.type || 'Asset')}</span>
        </div>
        <p class="asset-description">${linkifyGlossaryTerms(asset.description || 'Descrizione non disponibile.')}</p>
        ${asset.effect ? `<p class="asset-effect">${linkifyGlossaryTerms(asset.effect)}</p>` : ''}
        <div class="asset-meta">${asset.generationTime ? `<span class="meta-pill">Tempo: ${linkifyGlossaryTerms(asset.generationTime)}</span>` : ''}${modifierPills}${notes.join('')}</div>
      </article>`;
  }).join('');
}

function renderCourt() {
  const host = $('court-members');
  $('court-member-count').textContent = String(leaders.length);
  if (!leaders.length) {
    host.innerHTML = '<p class="empty-state">Nessun leader registrato per La Mano in leaders.json.</p>';
    return;
  }
  host.innerHTML = leaders.map((leader) => {
    const traitIds = Array.isArray(leader.traits) && leader.traits.length
      ? leader.traits
      : [leader.trait1, leader.trait2].filter(Boolean);
    const traitMarkup = traitIds.map((traitId) => {
      const trait = traitById.get(String(traitId));
      if (!trait) return `<div class="trait-card"><strong>${linkifyGlossaryTerms(traitId)}</strong><p>Tratto non trovato in traits.json.</p></div>`;
      const modifiers = Array.isArray(trait.modifiers) ? trait.modifiers : [];
      const modifierMarkup = modifiers.map((modifier) => {
        const isArmyRule = Boolean(modifier.armies);
        const target = modifier.stat ? `Stat: ${modifier.stat}`
          : modifier.action ? `Azione: ${modifier.action}`
            : isArmyRule ? `Effetto armate: ${modifier.armies}` : 'Effetto speciale';
        const delta = modifier.amount === undefined ? ''
          : isArmyRule ? ` · Valore: ${modifier.amount}`
            : ` · ${formatRawModifier(modifier.amount, modifier.diceType)}`;
        const category = modifierIsMandatory(modifier) ? 'Automatico' : 'Situazionale';
        const scopeNote = isArmyRule ? ' (non incluso nella riserva della Compagnia)' : '';
        return `<li><strong>${linkifyGlossaryTerms(target)}${linkifyGlossaryTerms(delta)}</strong> <span class="trait-modifier-kind">${category}</span>${linkifyGlossaryTerms(scopeNote)}<br>${linkifyGlossaryTerms(modifier.situation || 'Nessuna condizione specificata.')}</li>`;
      }).join('');
      return `
        <div class="trait-card">
          <div class="trait-card-heading"><strong>${linkifyGlossaryTerms(trait.label || trait.name || traitId)}</strong><span class="trait-id">${linkifyGlossaryTerms(traitId)}</span></div>
          <p>${linkifyGlossaryTerms(trait.description || '')}</p>
          ${modifierMarkup ? `<ul class="trait-modifier-list">${modifierMarkup}</ul>` : '<p class="trait-no-modifiers">Nessun modificatore definito.</p>'}
        </div>`;
    }).join('');
    const portrait = leader.portrait
      ? `<img class="court-portrait" src="${escapeHtml(leader.portrait)}" alt="" loading="lazy" onerror="this.hidden=true">`
      : '';
    return `
      <article class="court-member">
        ${portrait}
        <div class="court-member-main">
          <div class="court-member-heading"><strong>${linkifyGlossaryTerms(leader.name || 'Leader senza nome')}</strong><span>${linkifyGlossaryTerms(leader.role || 'Ruolo non specificato')}</span></div>
          <div class="trait-list">${traitMarkup}</div>
        </div>
      </article>`;
  }).join('');
}

function getPactRecords() {
  const active = [];
  const unilateral = [];
  for (const [name, definition] of Object.entries(treatyTypes)) {
    for (const holder of Array.isArray(definition.holders) ? definition.holders : []) {
      const role = getPactRole(holder);
      if (role) active.push({ name, definition, ...role });
      else if (normalise(holder.to) === normalise(HAND_NAME) && holder.bidirectional === false) {
        unilateral.push({ name, definition, from: holder.from });
      }
    }
  }
  return { active, unilateral };
}

function getTreatyGrantedAssets(pacts) {
  return pacts.flatMap((pact) => {
    if (pact.bidirectional !== true) return [];
    const grantedAsset = pact.definition?.grantsAsset;
    if (!grantedAsset || typeof grantedAsset !== 'object' || Array.isArray(grantedAsset)) return [];
    return [{
      ...grantedAsset,
      id: `treaty-${normalise(pact.name)}-${normalise(pact.counterpart)}`,
      treatyName: pact.name,
      counterpart: pact.counterpart,
    }];
  });
}

function renderTreaties() {
  const host = $('family-treaties');
  const secondary = $('unilateral-treaties');
  $('treaty-count').textContent = String(activePacts.length);
  if (!activePacts.length) {
    host.innerHTML = '<p class="empty-state">Nessun trattato attivo registrato per La Mano.</p>';
  } else {
    host.innerHTML = activePacts.map((pact) => {
      const modifiers = getPactModifiers(pact.definition, pact.role);
      const modifierText = modifiers.length
        ? `${modifiers.length} modificatore/i definito/i per questo lato del trattato.`
        : 'Nessun bonus o malus diretto alla riserva di dadi.';
      return `
        <article class="asset-card treaty-card">
          <div class="asset-card-header"><span class="asset-name">${linkifyGlossaryTerms(pact.name)}</span><span class="asset-type">Con ${linkifyGlossaryTerms(pact.counterpart)}</span></div>
          <p class="asset-description">${linkifyGlossaryTerms(pact.definition.description || '')}</p>
          ${pact.definition.effects ? `<p class="asset-effect">${linkifyGlossaryTerms(pact.definition.effects)}</p>` : ''}
          <div class="asset-meta"><span class="meta-pill">${linkifyGlossaryTerms(modifierText)}</span></div>
        </article>`;
    }).join('');
  }

  secondary.innerHTML = oneSidedPactsAgainstHand.length
    ? oneSidedPactsAgainstHand.map((pact) => `
      <article class="asset-card treaty-one-sided">
        <div class="asset-card-header"><span class="asset-name">${linkifyGlossaryTerms(pact.name)}</span><span class="asset-type">Unilaterale</span></div>
        <p class="asset-description">Dichiarato da ${linkifyGlossaryTerms(pact.from)} verso La Mano, ma <strong>bidirectional: false</strong>. La Mano non è parte del patto e non riceve i suoi modificatori.</p>
      </article>`).join('')
    : '';
}

function renderLocalizedAssets() {
  const host = $('localized-assets');
  $('localized-asset-count').textContent = String(localizedAssets.length);
  if (!localizedAssets.length) {
    host.innerHTML = '<p class="empty-state">Nessun asset localizzato registrato.</p>';
    return;
  }
  host.innerHTML = localizedAssets.map((asset) => {
    const place = bodyById.get(String(asset.bodyId));
    const delta = parseLocalizedAsset(asset);
    const conflictText = delta.conflict
      ? '<p class="modifier-conflict">Descrizione ed effect riportano bonus differenti: il calcolatore non applica automaticamente questo bonus.</p>'
      : '';
    return `
      <article class="asset-card">
        <div class="asset-card-header"><span class="asset-name">${linkifyGlossaryTerms(asset.name || 'Asset localizzato')}</span><span class="asset-type">${linkifyGlossaryTerms(place?.name || asset.bodyId || 'Luogo')}</span></div>
        <p class="asset-description">${linkifyGlossaryTerms(asset.description || '')}</p>
        ${asset.effect ? `<p class="asset-effect">${linkifyGlossaryTerms(asset.effect)}</p>` : ''}
        <div class="asset-meta"><span class="meta-pill">Controllo del luogo: ${linkifyGlossaryTerms(place?.owner || 'non specificato')}</span>${delta.conflict ? '<span class="meta-pill">Dato da verificare</span>' : `<span class="meta-pill">Bonus contestuale: ${linkifyGlossaryTerms(formatDelta({ normal: delta.amount, expert: 0, master: 0 }))}</span>`}</div>
        ${conflictText}
      </article>`;
  }).join('');
}

function renderCraftableAssets(resourceIds) {
  const host = $('craftable-assets');
  $('craftable-asset-count').textContent = String(craftableAssets.length);
  const resources = [...resourceIds].map(resourceName).sort((a, b) => a.localeCompare(b, 'it'));
  $('controlled-resources').textContent = resources.length
    ? `Risorse controllate (${resources.length}): ${resources.join(', ')}.`
    : 'La Mano non risulta controllare risorse utilizzabili per il crafting.';

  if (!craftableAssets.length) {
    host.innerHTML = '<p class="empty-state">Nessun asset craftabile soddisfa tutti i requisiti con le risorse attualmente controllate da La Mano.</p>';
    return;
  }
  host.innerHTML = craftableAssets.map((asset) => {
    const required = assetRequirements(asset);
    const requirements = required.length
      ? required.map((id) => `<span class="requirement-pill">${linkifyGlossaryTerms(resourceName(id))}</span>`).join('')
      : '<span class="requirement-pill">Nessuna risorsa richiesta</span>';
    return `
      <article class="asset-card">
        <div class="asset-card-header"><span class="asset-name">${linkifyGlossaryTerms(asset.name || 'Asset senza nome')}</span><span class="asset-type">${linkifyGlossaryTerms(asset.type || 'Craftabile')}</span></div>
        <p class="asset-description">${linkifyGlossaryTerms(asset.description || 'Descrizione non disponibile.')}</p>
        <div class="requirement-list">${requirements}</div>
        ${asset.generationTime ? `<div class="asset-meta"><span class="meta-pill">Tempo di creazione: ${linkifyGlossaryTerms(asset.generationTime)}</span></div>` : ''}
        <p class="input-note">Disponibile alla creazione, ma non conteggiato nei tiri finché non compare tra gli asset posseduti in familyAssets.</p>
      </article>`;
  }).join('');
}

function showDataWarnings() {
  const messages = [];
  if (missingDataFiles.length) messages.push(`File non caricati: ${[...new Set(missingDataFiles)].join(', ')}.`);
  if (!hand) messages.push(`La famiglia “${HAND_NAME}” non è presente in companies.json.`);
  if (!leaders.length) messages.push('Nessun leader trovato per La Mano in leaders.json.');
  $('data-status').hidden = !messages.length;
  $('data-status').textContent = messages.length
    ? `${messages.join(' ')} Verifica che i file richiesti siano nella cartella all_info e che la pagina sia servita tramite HTTP.`
    : '';
}

async function init() {
  populateActions();

  const files = [
    ['companies.json', { companies: [] }],
    ['governi.json', { governi: [] }],
    ['timeline.json', { currentMonth: 0, months: [] }],
    ['assets.json', { craftAssets: [], familyAssets: [], localizedAssets: [] }],
    ['resources.json', { resources: [] }],
    ['places.json', { places: [], tradePaths: [] }],
    ['leaders.json', { leaders: {} }],
    ['traits.json', { traits: [] }],
    ['treaties.json', { pacts: {} }],
    ['fleets.json', { fleets: {} }],
    ['action_log.json', { entries: [] }],
  ];
  // loadGlossary() is awaited alongside the rest of the data so
  // glossaryTerms/linkifyGlossaryTerms() are ready before the first
  // family-description render -- otherwise inline glossary highlighting
  // in narrative text can silently no-op on first paint.
  const [results] = await Promise.all([
    Promise.all(files.map(async ([file, fallback]) => ({
      file,
      data: await fetchGameData(file, fallback),
    }))),
    loadGlossary(),
  ]);
  const data = Object.fromEntries(results.map(({ file, data: contents }) => [file, contents]));

  companies = Array.isArray(data['companies.json'].companies) ? data['companies.json'].companies : [];
  hand = companies.find((company) => normalise(company.name ?? company.Name) === normalise(HAND_NAME)) || null;
  const governments = Array.isArray(data['governi.json'].governi) ? data['governi.json'].governi : [];
  government = governments.find((item) => normalise(item.nome) === normalise(hand?.government ?? hand?.Government)) || null;

  currentMonth = Math.round(Number(data['timeline.json'].currentMonth) || 0);
  $('current-month').textContent = String(currentMonth);
  // Structured stat deltas now live in action_log.json (category:"stat")
  // instead of timeline.json's old months[].statChanges; re-attach `from`
  // from the entry's own `month` field so getCurrentFamilyStat()/
  // statChangeIsActive() -- which expect {family,stat,amount,to,from} --
  // stay unchanged.
  const logEntries = Array.isArray(data['action_log.json'].entries) ? data['action_log.json'].entries : [];
  statChanges = logEntries
    .filter((entry) => entry.category === 'stat')
    .map((entry) => ({ ...entry, from: entry.month }));
  if (hand) setFamilyStats();
  else renderGovernmentDetails();

  const assets = data['assets.json'];
  familyAssets = (Array.isArray(assets.familyAssets) ? assets.familyAssets : [])
    .filter((asset) => normalise(asset.owner) === normalise(HAND_NAME));

  const resourceEntries = Array.isArray(data['resources.json'].resources) ? data['resources.json'].resources : [];
  resourceById = new Map(resourceEntries.map((resource) => [String(resource.id), resource]));

  const places = Array.isArray(data['places.json'].places) ? data['places.json'].places : [];
  bodyById = new Map(places.map((place) => [String(place.id), place]));
  localizedAssets = getLocalizedAssetsForOwner(assets.localizedAssets, places);
  const { resourceIds } = getControlledResources(places);
  const craftCatalog = Array.isArray(assets.craftAssets) ? assets.craftAssets : [];
  craftableAssets = craftCatalog.filter((asset) => qualifiesFor(asset, resourceIds));

  leaders = Array.isArray(data['leaders.json'].leaders?.[HAND_NAME]) ? data['leaders.json'].leaders[HAND_NAME] : [];
  const traits = Array.isArray(data['traits.json'].traits) ? data['traits.json'].traits : [];
  traitById = new Map(traits.map((trait) => [String(trait.id), trait]));
  treatyTypes = data['treaties.json'].pacts && typeof data['treaties.json'].pacts === 'object'
    ? data['treaties.json'].pacts
    : {};
  const pactRecords = getPactRecords();
  activePacts = pactRecords.active;
  oneSidedPactsAgainstHand = pactRecords.unilateral;
  // Treaty-granted assets are shown only for bidirectional pacts. A one-way
  // pact's `to` side is not a party and is excluded from activePacts entirely.
  treatyGrantedAssets = getTreatyGrantedAssets(activePacts);
  const fleetsByOwner = data['fleets.json'].fleets || {};
  const handFleetsKey = Object.keys(fleetsByOwner).find((owner) => normalise(owner) === normalise(HAND_NAME));
  fleetCount = handFleetsKey ? fleetsByOwner[handFleetsKey].length : 0;

  renderFamilyAssets();
  renderCourt();
  renderTreaties();
  renderLocalizedAssets();
  renderCraftableAssets(resourceIds);
  showDataWarnings();

  STAT_DEFINITIONS.forEach(({ key }) => {
    $(key).addEventListener('input', () => {
      updateFamilyDescription();
      recalculateRoll();
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('[La Compagnia] Errore inizializzazione', error);
    $('data-status').hidden = false;
    $('data-status').textContent = `Errore durante il caricamento dei dati: ${error.message}`;
  });
  initGlossaryTooltips();
});
