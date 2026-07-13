// Central parser and fetch utilities for the app.
// Provides functions to fetch game data, sourced from local all_info/*.json
// (this used to fetch a published Google Sheet CSV export of the same data).
(function(){
    const cacheInstance = (typeof BrowserCache !== 'undefined') ? new BrowserCache('stardom', 1) : null;

    // Shared flavor-text phrase bank, keyed by stat name then tier (0-2).
    // Used by index.html (script.js).
    const qualities = {
        Might: [
            ["le loro truppe sono contadini con spade", "il loro esercito è più simbolico che reale"], // 1–2
            ["le loro forze sono ben addestrate e pronte alla battaglia", "i loro soldati non temono lo scontro"], // 3–4
            ["le loro forze sono terrificanti da affrontare in battaglia", "il loro esercito semina il terrore ovunque"] // 5–6
        ],
        Treasure: [
            ["hanno solo risparmi di poco valore", "le loro casse contengono appena il necessario"], // 1–2
            ["trattano in monete d'oro", "la loro ricchezza è notevole"], // 3–4
            ["commerciano in lingotti d'oro", "il loro tesoro è inestimabile"] // 5–6
        ],
        Influence: [
            ["a pochi interessa della loro esistenza", "sono ignorati da tutti nel sistema"], // 1–2
            ["sono rispettati nel sistema", "godono di una discreta considerazione"], // 3–4
            ["sono leggendari e riveriti in ogni angolo del sistema", "la loro parola è legge"] // 5–6
        ],
        Territory: [
            ["controllano una regione dimenticata", "i loro territori sono insignificanti"], // 1–2
            ["governano un pianeta vasto e sviluppato, e numerose colonie", "le loro terre si espandono su più sistemi"], // 3–4
            ["dominano pianeti, asteroidi, colonie e persino di più", "il loro dominio si estende oltre l'immaginabile"] // 5–6
        ],
        Sovereignty: [
            ["i loro sudditi li tollerano appena", "sono mal sopportati dalla popolazione"], // 1–2
            ["i loro sudditi li sostengono", "hanno il supporto della popolazione"], // 3–4
            ["i loro sudditi li venerano", "il loro regno è visto come sacro"] // 5–6
        ]
    };

    // Local-JSON fetch helper for the six functions below -- these used to
    // hit a published Google Sheet (CSV export of the same data now checked
    // into all_info/*.json); local files are same-origin so no cache layer
    // is needed the way BrowserCache was for the old remote CSVs (that
    // cache is still used directly by map.js for its own remote data).
    async function myfetchJson(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        return res.json();
    }

    /**
     * Split a single CSV line into fields, respecting double-quoted fields
     * that may contain commas (e.g. `"Foo, Bar",baz`). Shared with map.js so
     * there is a single quote-aware CSV splitter for the whole site.
     * @param {string} line
     * @returns {Array<string>}
     */
    function splitCsvLine(line) {
        const result = [];
        let cur = '', inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (ch === '"') { inQuotes = !inQuotes; }
            else if (ch === ',' && !inQuotes) { result.push(cur); cur = ''; }
            else { cur += ch; }
        }
        result.push(cur);
        return result;
    }

    // Below: the six functions that used to fetch a published Google Sheet
    // (CSV) now read the equivalent all_info/*.json instead, reshaping each
    // record into the exact legacy row shape (capitalized keys etc.) so that
    // script.js / geopolitics.js need no changes at all.

    async function fetchTimelineData() {
        try {
            const data = await myfetchJson('all_info/timeline.json');
            // timeline.json is now { currentMonth, months: [{month,title,events:[{description,modifier}]}] }
            // (previously one flat CSV row per month) -- flatten each month's
            // events back into a single legacy row.
            return (data.months || []).map(m => ({
                Month: m.month,
                Event: m.title || '',
                Description: (m.events || []).map(e => e.description).filter(Boolean).join(' '),
                'Modifier (Inizio del Mese)': (m.events || []).map(e => e.modifier).filter(Boolean).join(';'),
            }));
        } catch (error) {
            console.error("Error fetching timeline data:", error);
            return [];
        }
    }

    async function fetchFamiliesData() {
        try {
            const data = await myfetchJson('all_info/companies.json');
            return (data.companies || []).map(c => ({
                Name: c.name,
                Might: c.might,
                Treasure: c.treasure,
                Influence: c.influence,
                Territory: c.territory,
                Sovereignty: c.sovereignty,
                Government: c.government,
                Planet: c.planet,
            }));
        } catch (error) {
            console.error("Error fetching families data:", error);
            return [];
        }
    }

    // index.html plays from La Mano's own perspective -- its Court and dice
    // calculator are both La Mano-specific views over the SAME shared
    // leaders.json/traits.json/assets.json every other family also uses,
    // rather than a separate bespoke file (that used to be
    // dice_bonuses.json/la_mano_court.json/bonus_descriptions.json, now
    // folded entirely into the shared files).
    const PLAYER_FAMILY = 'La Mano';

    async function fetchLaManoLeadersWithTraits() {
        const [leadersData, traitsData] = await Promise.all([
            myfetchJson('all_info/leaders.json'),
            myfetchJson('all_info/traits.json'),
        ]);
        const traitsById = {};
        (traitsData.traits || []).forEach(t => { traitsById[t.id] = t; });
        const leaders = (leadersData.leaders || {})[PLAYER_FAMILY] || [];
        return leaders.map(leader => ({
            ...leader,
            traitObjects: (leader.traits || []).map(id => traitsById[id]).filter(Boolean),
        }));
    }

    async function fetchCourtMembers() {
        try {
            const leaders = await fetchLaManoLeadersWithTraits();
            return leaders.map(l => ({
                Role: l.role,
                Name: l.name,
                Bonuses: l.traitObjects.map(t => `${t.label}: ${t.description}`).join(' '),
            }));
        } catch (error) {
            console.error("Error fetching court members data:", error);
            return [];
        }
    }

    // "Current Assets" dropdown: only what La Mano already owns (assets.json's
    // familyAssets entries with owner La Mano) plus what it could craft right
    // now from the resources on bodies/points of interest it currently
    // controls -- mirrors strategic-map.js's familyResourceIds()/qualifiesFor()
    // so both pages agree, instead of dumping the entire global craftAssets catalog.
    async function fetchCompanyAssets() {
        try {
            const [bodiesData, poiData, assetsData] = await Promise.all([
                myfetchJson('all_info/bodies.json'),
                myfetchJson('all_info/points_of_interest.json'),
                myfetchJson('all_info/assets.json'),
            ]);

            const resourceIds = new Set();
            const collectOwned = (list) => (list || []).forEach(b => {
                if (b && b.owner === PLAYER_FAMILY) (b.resourceIds || []).forEach(id => resourceIds.add(id));
            });
            collectOwned(bodiesData.bodies);
            collectOwned(poiData.pointsOfInterest);

            const craftable = (assetsData.craftAssets || [])
                .filter(a => (a.requirementIds || []).every(rid => resourceIds.has(rid)))
                .map(a => ({ Name: a.name, Bonus: a.description }));

            const owned = (assetsData.familyAssets || [])
                .filter(a => a.owner === PLAYER_FAMILY)
                .map(a => ({ Name: a.name, Bonus: [a.description, a.effect].filter(Boolean).join(' — ') }));

            return [...owned, ...craftable];
        } catch (error) {
            console.error("Error fetching company assets data:", error);
            return [];
        }
    }

    // Flattens every modifier from La Mano's 3 leaders' traits, plus every
    // modifier on La Mano's own assets.json familyAssets entries, into the
    // same checklist-row shape the action-roll calculator has always
    // expected. A modifier binds to EITHER a stat (Score, matched against
    // whichever qualities the selected action rolls) OR an action (Action,
    // matched exactly against one specific action name) -- Score defaults to
    // '' rather than undefined so script.js's filter never throws when only
    // Action is set.
    // treaties.json is keyed by pact type, each carrying a `holders` list of
    // {from, to, bidirectional}. Symmetric pacts share one `modifiers` array;
    // asymmetric ones (the two feudal pacts) use modifiersAsFrom/modifiersAsTo
    // instead, picked by which side PLAYER_FAMILY is on for that holder row.
    // Mirrors strategic-map.js's resolvedTreatyModifiers() so both pages
    // agree on which side's modifiers apply.
    function resolvedTreatyModifiers(treatyType, side, treatyTypesByName) {
        const info = treatyTypesByName[treatyType];
        if (!info) return [];
        if (info.modifiersAsFrom || info.modifiersAsTo) {
            return (side === 'from' ? info.modifiersAsFrom : info.modifiersAsTo) || [];
        }
        return info.modifiers || [];
    }

    // Annotates an asymmetric pact's display label with which side
    // PLAYER_FAMILY is on, since the type name no longer carries a su/da
    // suffix. Symmetric pacts get no annotation.
    function treatyDisplayLabel(treatyType, side, treatyTypesByName) {
        const info = treatyTypesByName[treatyType];
        if (info && (info.modifiersAsFrom || info.modifiersAsTo)) {
            return `${treatyType} (${side === 'from' ? 'Signore' : 'Vassallo'})`;
        }
        return treatyType;
    }

    async function fetchBonuses() {
        try {
            const [leaders, assetsData, treatiesData] = await Promise.all([
                fetchLaManoLeadersWithTraits(),
                myfetchJson('all_info/assets.json'),
                myfetchJson('all_info/treaties.json'),
            ]);
            const rows = [];
            const pushModifiers = (bonusName, modifiers) => {
                (modifiers || []).forEach(m => {
                    rows.push({
                        Bonus: bonusName,
                        Score: m.stat || '',
                        Action: m.action || '',
                        Situation: m.situation,
                        'Dice Type': m.diceType || 'Normal Dice',
                        Extra: m.amount,
                        Always: m.always ? 'Y' : 'N',
                    });
                });
            };
            leaders.forEach(l => {
                l.traitObjects.forEach(trait => pushModifiers(`${l.name} (${trait.label})`, trait.modifiers));
            });
            (assetsData.familyAssets || [])
                .filter(a => a.owner === PLAYER_FAMILY)
                .forEach(a => pushModifiers(a.name, a.modifiers));
            const treatyTypesByName = treatiesData.pacts || {};
            Object.entries(treatyTypesByName).forEach(([type, info]) => {
                (info.holders || []).forEach(h => {
                    let side = null, partner = null;
                    if (h.from === PLAYER_FAMILY) { side = 'from'; partner = h.to; }
                    else if (h.to === PLAYER_FAMILY && h.bidirectional !== false) { side = 'to'; partner = h.from; }
                    if (!side) return;
                    const label = treatyDisplayLabel(type, side, treatyTypesByName);
                    pushModifiers(`Trattato: ${label} con ${partner}`, resolvedTreatyModifiers(type, side, treatyTypesByName));
                });
            });
            return rows;
        } catch (error) {
            console.error("Error fetching bonuses data:", error);
            return [];
        }
    }

    // "Diplomazia" action (index.html): the list of available treaty types,
    // used to populate the treaty-type dropdown -- unique-category treaties
    // (tied to a specific named benefactor family, e.g. Supporto Arcano with
    // Ntsu) are excluded there, not here, so other consumers still see them.
    async function fetchTreatyTypes() {
        try {
            const data = await myfetchJson('all_info/treaties.json');
            return data.pacts || {};
        } catch (error) {
            console.error("Error fetching treaty types:", error);
            return {};
        }
    }

    async function fetchPactsData() {
        try {
            const data = await myfetchJson('all_info/treaties.json');
            const rows = [];
            Object.entries(data.pacts || {}).forEach(([type, info]) => {
                (info.holders || []).forEach(h => {
                    rows.push({ From: h.from, Pact: type, To: h.to });
                    if (h.bidirectional !== false) {
                        rows.push({ From: h.to, Pact: type, To: h.from });
                    }
                });
            });
            return rows;
        } catch (error) {
            console.error("Error fetching pacts data:", error);
            return {};
        }
    }

    // Exported variables
    window.cacheInstance = cacheInstance;
    window.qualities = qualities;
    window.splitCsvLine = splitCsvLine;
    window.fetchTimelineData = fetchTimelineData;
    window.fetchFamiliesData = fetchFamiliesData;
    window.fetchCourtMembers = fetchCourtMembers;
    window.fetchCompanyAssets = fetchCompanyAssets;
    window.fetchBonuses = fetchBonuses;
    window.fetchPactsData = fetchPactsData;
    window.fetchTreatyTypes = fetchTreatyTypes;

})();
