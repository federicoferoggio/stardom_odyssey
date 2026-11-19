// ─── Shared utilities ────────────────────────────────────────────────────────
// Loaded by all 3 pages (Court/index.html, Army/scrolls.html, Strategic
// Map/strategic-map.html), same pattern as nav.js. Consolidates logic that
// used to exist as 3 independently-drifting copies, one per page script.
'use strict';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Case/whitespace-insensitive string comparison, used below for matching
// government effect names. Deliberately not named `normalise` -- that name
// is already a strategic-map.js global with an unrelated signature (it
// builds the body/POI `byId` map there), and both scripts share one scope.
function normaliseForMatch(value) {
  return String(value ?? '').trim().toLocaleLowerCase('it');
}

// Generic JSON fetch helper. `fallback` is returned (and, unless
// `optional` is set, reported via `onError`) if the fetch/parse fails.
// opts.prefix lets a page root every path under a common folder (e.g.
// index.html's `all_info/`) without repeating it at every call site.
async function loadJson(path, fallback = null, opts = {}) {
  const { prefix = '', optional = false, onError } = opts;
  const url = `${prefix}${path}`;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error(`Impossibile caricare ${url}`, error);
    if (!optional && typeof onError === 'function') onError(path, error);
    return fallback;
  }
}

// Does a craft-asset's requirementIds all appear among the given set of
// controlled resource ids?
function qualifiesFor(asset, resourceIds) {
  const requirementIds = Array.isArray(asset.requirementIds) ? asset.requirementIds.map(String) : [];
  return requirementIds.every((id) => resourceIds.has(id));
}

// ─── Family flavor-text description ─────────────────────────────────────────
// Flavor-text bank for generateFamilyDescription, keyed by English stat
// label then tier (0: low 1-2, 1: mid 3-4, 2: high 5-6).
const FAMILY_QUALITIES = {
  Might: [
    ['le loro truppe sono contadini con spade', 'il loro esercito è più simbolico che reale'],
    ['le loro forze sono ben addestrate e pronte alla battaglia', 'i loro soldati non temono lo scontro'],
    ['le loro forze sono terrificanti da affrontare in battaglia', 'il loro esercito semina il terrore ovunque'],
  ],
  Treasure: [
    ['hanno solo risparmi di poco valore', 'le loro casse contengono appena il necessario'],
    ['trattano in monete d’oro', 'la loro ricchezza è notevole'],
    ['commerciano in lingotti d’oro', 'il loro tesoro è inestimabile'],
  ],
  Influence: [
    ['a pochi interessa della loro esistenza', 'sono ignorati da tutti nel sistema'],
    ['sono rispettati nel sistema', 'godono di una discreta considerazione'],
    ['sono leggendari e riveriti in ogni angolo del sistema', 'la loro parola è legge'],
  ],
  Territory: [
    ['controllano una regione dimenticata', 'i loro territori sono insignificanti'],
    ['governano un pianeta vasto e sviluppato, e numerose colonie', 'le loro terre si espandono su più sistemi'],
    ['dominano pianeti, asteroidi, colonie e persino di più', 'il loro dominio si estende oltre l’immaginabile'],
  ],
  Sovereignty: [
    ['i loro sudditi li tollerano appena', 'sono mal sopportati dalla popolazione'],
    ['i loro sudditi li sostengono', 'hanno il supporto della popolazione'],
    ['i loro sudditi li venerano', 'il loro regno è visto come sacro'],
  ],
};

// `statsByLabel`: object keyed by English stat label ("Might", "Treasure",
// "Influence", "Territory", "Sovereignty") -> numeric value.
function generateFamilyDescription(statsByLabel) {
  const entries = Object.entries(statsByLabel).filter(([label]) => FAMILY_QUALITIES[label]);
  if (!entries.length) return '';
  const average = entries.reduce((sum, [, value]) => sum + value, 0) / entries.length;
  const tierFor = (value) => (value <= 2 ? 0 : value <= 4 ? 1 : 2);
  const sentences = entries.map(([label, value]) => ({
    label,
    value,
    phrase: FAMILY_QUALITIES[label][tierFor(value)][Math.floor(Math.random() * 2)],
  }));
  const pairs = [];
  for (let index = 0; index < sentences.length - 1; index += 2) {
    const first = sentences[index];
    const second = sentences[index + 1];
    const contrast = Math.abs(first.value - average) > 1
      && Math.abs(second.value - average) > 1
      && ((first.value > average && second.value < average)
        || (first.value < average && second.value > average));
    pairs.push(`${first.phrase} ${contrast ? 'ma' : 'e'} ${second.phrase}`);
  }
  if (sentences.length % 2) pairs.push(sentences[sentences.length - 1].phrase);
  return `${pairs.join('. ')}.`.replace(/(^\w|\.\s*\w)/g, (letter) => letter.toUpperCase());
}

// ─── Government stat rules ───────────────────────────────────────────────────
// `effects`: a government's governi.json `effetti_speciali` array.
function hasGovernmentEffect(effects, name) {
  return (Array.isArray(effects) ? effects : [])
    .some((effect) => normaliseForMatch(effect.nome) === normaliseForMatch(name));
}

// Applies every government stat rule we know about to a lowercase-keyed
// stats object ({might, treasure, influence, territory, sovereignty}).
// Currently just "Diritto Divino" (Sovereignty <=2 drops every other stat
// by 1), but centralized here so both the Court page's roll calculator and
// the Strategic Map's family-overlay stats agree -- previously only the
// Court page applied this, so the two pages could show different numbers
// for the same family.
function applyGovernmentStatRules(stats, effects) {
  const adjusted = { ...stats };
  if (hasGovernmentEffect(effects, 'Diritto Divino') && adjusted.sovereignty <= 2) {
    ['might', 'treasure', 'influence', 'territory'].forEach((key) => {
      adjusted[key] = Math.max(0, (adjusted[key] || 0) - 1);
    });
  }
  return adjusted;
}

// ─── Canonical action list ───────────────────────────────────────────────────
// Single source of truth for the 9 standardized actions and which stats
// each one rolls. Used directly by the Court page's roll calculator, and
// by the Strategic Map's "Bonus Attivi" grouping (see ACTION_ROLLS in
// strategic-map.js, derived from this instead of hand-copied).
const ACTIONS = {
  Attacco: {
    description: "Azione di Forza Militare. Prima del tiro, scegli l'obiettivo desiderato. Un attacco è considerato Spelljammer se l'attaccante ha una flotta in orbita, altrimenti è terrestre. Un attacco spelljammer garantisce +1d per ogni flotta alleata in orbita in eccesso rispetto a quelle neutrali o nemiche, se la difesa non è Spelljammer.",
    rolls: ['might', 'treasure'],
    hasWarReasons: true,
    needsOpponent: true,
  },
  Difesa: {
    description: 'Azione di Forza Militare. La difesa sceglie se usare logoramento (Gobble Dice) o contrattacco (Dynamic Contest: -1 Might nemica in caso di successo; in caso di fallimento, -1 Might aggiuntiva per sé). Se il numero di flotte alleate del difensore che orbitano il pianeta è superiore a quelle a quelle neutrali o nemiche, la difesa è considerata Spelljammer.',
    rolls: ['might', 'territory'],
    needsOpponent: true,
    hasLocation: true,
  },
  "Controllo dell'Ordine": {
    description: 'Azione di Forza Militare. Usa la polizia per contrastare la guerra non convenzionale. Tira per fermare (Gobble: in caso di successo non subisci malus) e per catturare (Dynamic Contest: in caso di successo il leader viene catturato). Se conosci il piano in anticipo, hai un tiro Gobble aggiuntivo: in caso di successo l’azione non ha luogo.',
    rolls: ['might', 'sovereignty'],
    needsOpponent: true,
  },
  'Guerra Non Convenzionale (richiede un leader)': {
    description: 'Azione di Forza Militare. Usa la violenza in modo strategico per attaccare. Tira per colpire (in caso di successo: -2 a una statistica a scelta per due mesi oppure leader fuori gioco per sei mesi) e per scappare (Dynamic Contest: in caso di successo il leader fugge).',
    rolls: ['influence', 'might'],
    needsOpponent: true,
  },
  Spionaggio: {
    description: 'Azione Diplomatica. La Width determina il numero di informazioni ricevute; la Height ne determina la qualità.',
    rolls: ['influence', 'treasure'],
    needsOpponent: true,
  },
  Controspionaggio: {
    description: 'Azione Diplomatica. La difesa sceglie se usare crittografia (Gobble Dice, senza consumare risorse per il mese) o caccia (Dynamic Contest: rimuove 1 Influence all’avversario per un mese).',
    rolls: ['influence', 'territory'],
    needsOpponent: true,
  },
  'Raccolta Informazioni': {
    description: 'Azione Diplomatica. Rivela le statistiche della famiglia, non quelle individuali.',
    rolls: ['influence', 'sovereignty'],
    needsOpponent: true,
  },
  Diplomazia: {
    description: 'Azione Diplomatica. Genera un nuovo trattato con un’altra Compagnia.',
    rolls: ['influence', 'treasure'],
    hasTreatyMenu: true,
    needsOpponent: true,
  },
  'Genera Flotta': {
    description: 'Sviluppa e potenzia le capacità militari della Compagnia. Forma una nuova flotta, che dovrà essere nominata e assegnata dal GM.',
    rolls: ['might', 'treasure'],
  },
  'Aumento Stat (Might)': {
    description: 'Sviluppa e potenzia le capacità militari della Compagnia. Richiede un tiro di Might + Sovereignty con una Difficoltà pari al doppio del livello attuale della statistica. Tempo necessario: da W2 (3 mesi), da W3 (2 mesi), da W4 (1 mese), da W5+ (immediato).',
    rolls: ['might', 'sovereignty'],
  },
  'Aumento Stat (Influence)': {
    description: 'Sviluppa e potenzia le capacità della Compagnia. Richiede un tiro di Influence + Sovereignty con una Difficoltà pari al doppio del livello attuale della statistica. Tempo necessario: da W2 (3 mesi), da W3 (2 mesi), da W4 (1 mese), da W5+ (immediato).',
    rolls: ['influence', 'sovereignty'],
  },
  'Aumento Stat (Territory)': {
    description: 'Sviluppa e potenzia il territorio della Compagnia. Richiede un tiro di Territory + Sovereignty con una Difficoltà pari al doppio del livello attuale della statistica. Tempo necessario: da W2 (3 mesi), da W3 (2 mesi), da W4 (1 mese), da W5+ (immediato).',
    rolls: ['territory', 'sovereignty'],
  },
  'Aumento Stat (Treasure)': {
    description: 'Sviluppa e potenzia le risorse della Compagnia. Richiede un tiro di Treasure + Sovereignty con una Difficoltà pari al doppio del livello attuale della statistica. Tempo necessario: da W2 (3 mesi), da W3 (2 mesi), da W4 (1 mese), da W5+ (immediato).',
    rolls: ['treasure', 'sovereignty'],
  },
};

const WAR_REASONS = [
  { name: 'Conquista', description: '+1 al proprio Territory in caso di vittoria se il Territory avversario è superiore.' },
  { name: 'Umiliazione', description: '+1 alla propria Influence in caso di vittoria se l’Influence avversaria è superiore.' },
  { name: 'Razzia', description: '+1 al proprio Treasure in caso di vittoria se il Treasure avversario è superiore.' },
  { name: 'Destabilizzazione', description: '-1 Sovereignty all’avversario in caso di vittoria.' },
  { name: 'Preattacco', description: 'Riduzione della Might avversaria in caso di vittoria: Height / 2 determina di quanto scende la Might; Width determina per quanti mesi resta ridotta.' },
  { name: 'Conquista Risorsa', description: 'Acquisisci una risorsa dell’avversario se è narrativamente conquistabile.' },
  { name: 'Disingaggio', description: 'Disabilita una flotta nemica: Height determina per quanti mesi resta disabilitata; Width determina di quanto (in UA) deve ritirarsi.' },
];

// ─── Glossary tooltips ────────────────────────────────────────────────────────
// Powers every `[data-glossary-term]` element on all 3 pages: hovering OR
// tapping it shows that term's Italian definition (from
// all_info/glossary.json) in one shared floating tooltip. Generalizes the
// mechanism that used to exist only on the Army page (scrolls.js's
// KEYWORD_DESCRIPTIONS + #keyword-tooltip, hover-only). Call
// initGlossaryTooltips() once per page, after DOMContentLoaded.
let glossaryTerms = null;
let glossaryTooltipEl = null;
let glossaryActiveTapEl = null;

async function loadGlossary() {
  if (glossaryTerms) return glossaryTerms;
  // Hardcoded root-relative path: all 3 pages live at the site root, so no
  // per-page prefix is needed here (unlike script.js's other data files,
  // which are referenced by bare filename and need DATA_ROOT prepended).
  const data = await loadJson('all_info/glossary.json', { terms: {} }, { optional: true });
  const terms = { ...(data.terms || {}) };
  // Company Actions (e.g. "Attacco", the roll-calculator Action -- distinct
  // from "Attack", the English weapon stat) and War Reasons are themselves
  // well-defined game-rule concepts that show up constantly in narrative
  // JSON text (treaty effects, trait situations...). Rather than
  // hand-duplicating their descriptions into glossary.json, pull them
  // straight from the already-canonical ACTIONS/WAR_REASONS above -- one
  // source of truth, no drift risk.
  Object.entries(ACTIONS).forEach(([name, action]) => {
    if (!(name in terms)) terms[name] = action.description;
  });
  WAR_REASONS.forEach((reason) => {
    if (!(reason.name in terms)) terms[reason.name] = reason.description;
  });
  glossaryTerms = terms;
  return glossaryTerms;
}

// Builds (and caches) one big case-sensitive alternation regex matching any
// known glossary term as a whole word/phrase, longest term first so e.g.
// "Aumento Stat (Treasure)" wins over a bare "Treasure" inside it. The
// boundary check is a manual Latin-accented-letter class rather than `\b`,
// since `\b` doesn't treat accented Italian letters as word characters.
let glossaryMatchRegex = null;
const GLOSSARY_WORD_CHAR = "A-Za-z0-9À-ÖØ-öø-ÿ";

function buildGlossaryMatchRegex() {
  if (glossaryMatchRegex) return glossaryMatchRegex;
  if (!glossaryTerms) return null;
  const keys = Object.keys(glossaryTerms).sort((a, b) => b.length - a.length);
  if (!keys.length) return null;
  const escaped = keys.map((key) => key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  glossaryMatchRegex = new RegExp(
    `(?<![${GLOSSARY_WORD_CHAR}])(${escaped.join('|')})(?![${GLOSSARY_WORD_CHAR}])`,
    'g',
  );
  return glossaryMatchRegex;
}

// Drop-in replacement for escapeHtml() when rendering narrative/descriptive
// JSON text into innerHTML: escapes first, then wraps every recognized
// glossary term in a `.glossary-term` span so the existing hover/tap
// tooltip (initGlossaryTooltips(), delegated on `document`) picks it up
// automatically -- no per-call-site wiring needed. Safe to use anywhere
// escapeHtml(...) was used for *content*; do NOT use it inside an HTML
// attribute value (the injected <span> markup would break the attribute).
function linkifyGlossaryTerms(value) {
  const escaped = escapeHtml(value);
  const regex = buildGlossaryMatchRegex();
  if (!regex) return escaped;
  regex.lastIndex = 0;
  return escaped.replace(regex, (match) => `<span class="glossary-term" data-glossary-term="${match}">${match}</span>`);
}

function ensureGlossaryTooltipEl() {
  if (glossaryTooltipEl) return glossaryTooltipEl;
  glossaryTooltipEl = document.createElement('div');
  glossaryTooltipEl.className = 'glossary-tooltip';
  glossaryTooltipEl.setAttribute('role', 'tooltip');
  glossaryTooltipEl.setAttribute('aria-hidden', 'true');
  document.body.appendChild(glossaryTooltipEl);
  return glossaryTooltipEl;
}

function positionGlossaryTooltip(anchor, tooltip) {
  const rect = anchor.getBoundingClientRect();
  const tipW = tooltip.offsetWidth || 240;
  const tipH = tooltip.offsetHeight || 60;
  const pad = 8;
  const left = Math.max(pad, Math.min(rect.left + rect.width / 2 - tipW / 2, window.innerWidth - tipW - pad));
  const top = rect.top - tipH - pad >= pad ? rect.top - tipH - pad : rect.bottom + pad;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showGlossaryTooltip(el) {
  const term = el.dataset.glossaryTerm;
  const definition = glossaryTerms && glossaryTerms[term];
  if (!definition) return;
  const tooltip = ensureGlossaryTooltipEl();
  tooltip.textContent = definition;
  tooltip.setAttribute('aria-hidden', 'false');
  tooltip.classList.add('visible');
  positionGlossaryTooltip(el, tooltip);
}

function hideGlossaryTooltip() {
  if (!glossaryTooltipEl) return;
  glossaryTooltipEl.classList.remove('visible');
  glossaryTooltipEl.setAttribute('aria-hidden', 'true');
}

function initGlossaryTooltips() {
  loadGlossary();

  document.addEventListener('mouseover', (event) => {
    const el = event.target.closest('[data-glossary-term]');
    if (el) showGlossaryTooltip(el);
  });
  document.addEventListener('mouseout', (event) => {
    const el = event.target.closest('[data-glossary-term]');
    if (el && !el.contains(event.relatedTarget)) hideGlossaryTooltip();
  });
  document.addEventListener('mousemove', (event) => {
    if (!glossaryTooltipEl || !glossaryTooltipEl.classList.contains('visible')) return;
    const el = event.target.closest('[data-glossary-term]');
    if (el) positionGlossaryTooltip(el, glossaryTooltipEl);
  });

  // Tap/click support -- hover alone doesn't work on touch devices. Tapping
  // a term toggles its tooltip; tapping anywhere else dismisses it. No
  // preventDefault here: some glossary terms sit inside a <label>, and
  // blocking the click would break that label's native click-to-focus
  // behavior on its associated input.
  document.addEventListener('click', (event) => {
    const el = event.target.closest('[data-glossary-term]');
    if (el) {
      if (glossaryActiveTapEl === el) {
        hideGlossaryTooltip();
        glossaryActiveTapEl = null;
      } else {
        showGlossaryTooltip(el);
        glossaryActiveTapEl = el;
      }
      return;
    }
    if (glossaryActiveTapEl) {
      hideGlossaryTooltip();
      glossaryActiveTapEl = null;
    }
  });
}

// ─── Page transition fallback ────────────────────────────────────────────
// stylesheet.css's `@view-transition { navigation: auto; }` already handles
// cross-document transitions natively on Chrome/Edge 126+ and Safari
// 18.2+. Browsers without that (Firefox, as of this writing) get a manual
// fade-out before navigating instead, so every browser gets some
// transition rather than a silent hard cut. Checking for
// `startViewTransition` is a reasonable proxy for cross-document support
// too: no browser currently ships one without the other.
(function initPageTransitions() {
  if ('startViewTransition' in document) return;

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link || (link.target && link.target !== '_self')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin || url.href === location.href) return;

    event.preventDefault();
    document.documentElement.classList.add('page-leaving');
    setTimeout(() => { location.href = url.href; }, 140);
  });
})();
