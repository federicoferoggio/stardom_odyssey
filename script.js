const actions = {
    "Attacco": {
        description: "Azione di Forza Militare. Prima del tiro, scegliere l'obbiettivo desiderato (vedi menu sotto).",
        rolls: ["might", "treasure"],
        hasWarReasons: true
    },
    "Difesa": {
        description: "Azione di Forza Militare. La difesa sceglie se usare logoramento (Gobble Dice) o contrattacco (Dynamic Contest, -1 Might nemica se successo, -1 might aggiuntiva per se stessi su fallimento).",
        rolls: ["might", "territory"]
    },
    "Spionaggio": {
        description: "Azione Diplomatica. Width determina il numero di informazioni ricevute, Height la loro qualità.",
        rolls: ["influence", "treasure"]
    },
    "Controspionaggio": {
        description: "Azione Diplomatica. La difesa sceglie se usare crittografia (Gobble Dice, non consuma risorse per il mese) o caccia (Dynamic Contest, rimuove 1 Influence all'avversario per un mese).",
        rolls: ["influence", "territory"]
    },
    "Controllo dell'Ordine": {
        description: "Azione di Forza Militare. Usa la polizia per contrattaccare guerra non convenzionale. Tira per fermare (Gobble, successo no malus) e tira per catturare (Dynamic Contest, successo leader catturato). Se conosci del plot in anticipo, hai un tiro aggiuntivo (gobble): su un successo la azione non prende luogo.",
        rolls: ["might", "sovereignty"]
    },
    "Guerra Non Convenzionale (richiede un leader)": {
        description: "Azione di Forza Militare. Usa violenza furba per attaccare. Tira per colpire (successo -2 stat a scelta per due mesi o leader fuori gioco per 6 mesi) e tira per scappare (Dynamic Contest, successo leader sfigge).",
        rolls: ["influence", "might"]
    },
    "Raccolta Informazioni": {
        description: "Azione Diplomatica. Rivela stat della famiglia (non individuali).",
        rolls: ["influence", "sovereignty"]
    },
    "Aumento Stat": {
        description: "Sviluppa e potenzia le capacità militari della compagnia. Richiede un tiro della stessa stat + una a scelta contro una Difficoltà pari al due volte il livello attuale della stat. Tempo necessario: da W2 (3 mesi), da W3 (2 mesi), da W4 (1 mese), da W5+ (Immediato).",
        rolls: ["might", "sovereignty", "influence", "territory", "treasure"]
    },
    "Diplomazia": {
        description: "Azione Diplomatica. Genera un nuovo trattato con un'altra Compagnia (vedi menu sotto).",
        rolls: ["influence", "treasure"],
        hasTreatyMenu: true
    },
    "Genera Flotta": {
        description: "Sviluppa e potenzia le capacità militari della compagnia. Forma una nuova flotta, che va nominata e assegnata dal GM (vedi all_info/fleets.json). Costa Might e Treasure pari al numero di flotte attualmente possedute moltiplicato per 2 (entrambe le risorse) e richiede un tiro contro una Difficoltà in Height pari al numero di flotte attualmente possedute moltiplicato per 3.",
        rolls: ["might", "treasure"]
    }
};

// Popolato da fetchTreatyTypes() (all_info/treaty_types.json) al caricamento
// della pagina, usato dal menu dei trattati dell'azione "Diplomazia".
let treatyTypes = {};

// Ragioni di guerra disponibili per l'azione "Attacco"
const warReasons = [
    { nome: "Conquista", descrizione: "+1 al proprio territorio se avversario soccombe" },
    { nome: "Umiliazione", descrizione: "+1 alla propria influence se avversario soccombe" },
    { nome: "Razzia", descrizione: "+1 al proprio treasure se avversario soccombe" },
    { nome: "Destabilizzazione", descrizione: "-1 Sovereignty all'avversario" },
    { nome: "Difesa", descrizione: "-1 Might all'avversario" },
    { nome: "Conquista Risorsa", descrizione: "Acquisisci una risorsa dell'avversario" },
    { nome: "Disingaggio", descrizione: "Disabilita una flotta nemica: Height determina per quanti mesi resta disabilitata, Width determina di quanto (in UA) deve ritirarsi" }
];

function escHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

let bonuses = [];
let governi = []; // Dati dei governi caricati da all_info/governi.json

// Mappa tra il nome della statistica (come usato in governi.json) e l'id dell'input corrispondente
const statInputMap = {
    Might: "might",
    Treasure: "treasure",
    Influence: "influence",
    Territory: "territory",
    Sovereignty: "sovereignty"
};

function loadBonuses(csv) {
    csv.forEach(row => {
        bonuses.push({
            bonus: row['Bonus'],
            score: row['Score'],
            action: row['Action'],
            situation: row['Situation'],
            diceType: row['Dice Type'],
            extra: row['Extra'],
            always: row['Always'] === "Y"
        });
    });
}

// Carica il file all_info/governi.json contenente le definizioni dei governi
function fetchGoverni() {
    return fetch('all_info/governi.json')
        .then(response => response.json())
        .then(data => data.governi || [])
        .catch(err => {
            console.error("Errore nel caricamento di governi.json:", err);
            return [];
        });
}

// Initialize the system when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    populateActions();
    fetchBonuses().then(loadBonuses);
    fetchTreatyTypes().then(data => { treatyTypes = data; });
    fetchCompanyAssets().then(loadCompanyAssets);
    fetchGoverni().then(data => {
        governi = data;
        // Se i dati famiglia sono già stati caricati prima dei governi, ri-renderizza
        fetchFamiliesData().then(loadFamilyStats);
    });
    fetchCourtMembers().then(loadCourtMembers);
    fetchTimelineData().then(loadTimeline);
});

// Function to populate actions into the action menu
function populateActions() {
    const actionsMenu = document.getElementById("actionsMenu");
    Object.keys(actions).forEach(actionName => {
        const option = document.createElement("option");
        option.value = actionName;
        option.textContent = actionName;
        actionsMenu.appendChild(option);
    });
    actionsMenu.addEventListener("change", updateActionDetails);
}

function updateActionDetails() {
    const actionsMenu = document.getElementById("actionsMenu");
    const actionDetails = document.getElementById("actionDetails");
    const selectedAction = actionsMenu.value;

    if (!selectedAction || !actions[selectedAction]) {
        actionDetails.innerHTML = ""; // Clear details if no action is selected
        return;
    }

    const action = actions[selectedAction];
    const description = action.description;
    const rolls = action.rolls;

    // Base roll calculation
    let baseRoll = 0;
    rolls.forEach(stat => {
        const statValue = parseInt(document.getElementById(stat).value, 10) || 0;
        baseRoll += statValue;
    });

    // Generate checklist bonuses from CSV data. A bonus binds to EITHER a
    // specific action by name (Barda's Iron Order: only "Controllo
    // dell'Ordine", regardless of which qualities that action rolls) OR a
    // quality/score (every other bonus: shown whenever the selected action
    // rolls that quality, or unconditionally if the score is "all").
    const bonusesForRoll = bonuses.filter(bonus =>
        (bonus.action && bonus.action === selectedAction) ||
        (!bonus.action && (bonus.score.toLowerCase() === "all" || rolls.includes(bonus.score.toLowerCase())))
    );

    const bonusChecklist = `
    <ul style="list-style: none; padding: 0;">
        ${bonusesForRoll.map(bonus => `
            <li style="margin-bottom: 5px;">
                <label style="display: flex; align-items: center; cursor: pointer;", title="${escHtml(bonus.situation)}">
                    <input type="checkbox" class="bonus-checkbox" value="${escHtml(bonus.bonus)}"
                           data-dice-type="${escHtml(bonus.diceType)}" data-extra="${escHtml(bonus.extra)}"
                           ${bonus.always ? "checked disabled" : ""}
                           style="margin-right: 10px; width: 20px; height: 20px;">
                    ${escHtml(bonus.bonus)} (${escHtml(bonus.diceType)}, +${escHtml(bonus.extra)})
                </label>
            </li>
        `).join("")}
    </ul>
    `;

    // Generate dropdown menu for bonus selection
    const bonusDropdown = `
        <label for="bonusDropdown">Quanto sei stato utile nell'aiutare la tua compagnia?</label>
        <select id="bonusDropdown">
            <option value="none" selected>Non hai fatto un cazzo</option>
            <option value="-3d">Ce la siamo fatta sotto! -3d</option>
            <option value="-2d">Ci siamo solo guadagnati la vergogna. -2d</option>
            <option value="-1d">Sarebbe stato meglio non fare niente. -1d</option>
            <option value="0">Tempo sprecato. Nessun effetto</option>
            <option value="1d">Abbastanza utile. +1d</option>
            <option value="ED">Abbiamo fatto bene! +ED</option>
            <option value="2d">Datemi oro e datemi gloria. +2d</option>
            <option value="MD">Siamo re, siamo vincitori. +MD</option>
            <option value="3d">Leggende della nostra grandezza saranno cantate per secoli. +3d</option>
            <option value="1+MD">Un successo che pochi rivedranno mai più. +1d e MD</option>
            <option value="2+MD">Gli dei si facciano da parte, perché siamo arrivati noi. +2d e MD</option>
        </select>
    `;

    // Genera il menu delle ragioni di guerra, solo se l'azione lo richiede (es. Attacco)
    let warReasonsMenu = "";
    if (action.hasWarReasons) {
        warReasonsMenu = `
        <div id="warReasonsContainer">
            <label for="warReasonsMenu"><strong>Scegli l'obbiettivo dell'Attacco:</strong></label>
            <select id="warReasonsMenu">
                <option value="" disabled selected>Seleziona una ragione di guerra</option>
                ${warReasons.map(reason => `<option value="${escHtml(reason.nome)}" title="${escHtml(reason.descrizione)}">${escHtml(reason.nome)}</option>`).join("")}
            </select>
            <p id="warReasonDescription"></p>
        </div>
        `;
    }

    // Genera il menu dei trattati, solo per l'azione "Diplomazia". Esclude i
    // trattati "unique" (legati a una specifica famiglia benefattrice, es.
    // Supporto Arcano con gli Ntsu) -- quelli non sono liberamente proponibili
    // a qualsiasi Compagnia come i trattati relational/benefit.
    let treatyMenu = "";
    if (action.hasTreatyMenu) {
        const offerable = Object.entries(treatyTypes).filter(([, info]) => info.category !== "unique");
        treatyMenu = `
        <div id="treatyMenuContainer">
            <label for="treatyTypeMenu"><strong>Scegli il tipo di trattato:</strong></label>
            <select id="treatyTypeMenu">
                <option value="" disabled selected>Seleziona un trattato</option>
                ${offerable.map(([name]) => `<option value="${escHtml(name)}">${escHtml(name)}</option>`).join("")}
            </select>
            <div id="treatyTypeDetails"></div>
        </div>
        `;
    }

    // Display action details, bonuses, and dice rolls
    actionDetails.innerHTML = `
        <p><strong>Descrizione:</strong> ${escHtml(description)}</p>
        ${warReasonsMenu}
        ${treatyMenu}
        <p id="rollDisplay"><strong>Stai usando:</strong> ${rolls.join(", ")}. Il tiro totale è: ${baseRoll}d10</p>
        <div>
            <strong>Bonus di Corte:</strong>
            <form id="bonusForm">
                ${bonusChecklist}
            </form>
        </div>
        <div>
            <strong>Bonus di Completamento:</strong>
            ${bonusDropdown}
        </div>
    `;

    // Se presente il menu delle ragioni di guerra, mostra la descrizione al cambio
    const warReasonsSelect = document.getElementById("warReasonsMenu");
    if (warReasonsSelect) {
        warReasonsSelect.addEventListener("change", () => {
            const selected = warReasons.find(r => r.nome === warReasonsSelect.value);
            document.getElementById("warReasonDescription").textContent = selected ? selected.descrizione : "";
        });
    }

    // Se presente il menu dei trattati, mostra descrizione/costi al cambio
    const treatyTypeMenu = document.getElementById("treatyTypeMenu");
    if (treatyTypeMenu) {
        treatyTypeMenu.addEventListener("change", () => {
            const info = treatyTypes[treatyTypeMenu.value];
            const detailsEl = document.getElementById("treatyTypeDetails");
            detailsEl.innerHTML = info ? `
                <p><strong>Descrizione:</strong> ${escHtml(info.description)}</p>
                <p><strong>Costo di creazione:</strong> ${escHtml(info.diplomacyCost || "—")}</p>
                <p><strong>Costo di rottura:</strong> ${escHtml(info.breakupCost || "—")}</p>
            ` : "";
        });
    }

    // Attach event listeners to recalculate roll
    document.querySelectorAll(".bonus-checkbox, #bonusDropdown").forEach(element => {
        element.addEventListener("change", recalculateRoll);
    });

    // Function to recalculate the total roll
    function recalculateRoll() {
        let totalNormalDice = baseRoll;
        let expertDice = 0;
        let masterDice = 0;

        // Add checklist bonuses
        document.querySelectorAll(".bonus-checkbox").forEach(checkbox => {
            if (checkbox.checked) {
                const extra = parseInt(checkbox.dataset.extra, 10);
                const diceType = checkbox.dataset.diceType.trim();
                if (diceType === "Normal Dice") {
                    totalNormalDice += extra;
                } else if (diceType === "Expert Dice") {
                    expertDice += extra;
                } else if (diceType === "Master Dice") {
                    masterDice += extra;
                }
            }
        });

        // Add dropdown bonus
        const dropdownValue = document.getElementById("bonusDropdown").value;
        if (dropdownValue.endsWith("d")) {
            totalNormalDice += parseInt(dropdownValue, 10);
        } else if (dropdownValue === "ED") {
            expertDice += 1;
        } else if (dropdownValue === "MD") {
            masterDice += 1;
        } else if (dropdownValue.includes("+MD")) {
            const [normalDiceBonus] = dropdownValue.split("+");
            totalNormalDice += parseInt(normalDiceBonus, 10);
            masterDice += 1;
        }

        // Update roll display
        const rollDisplay = actionDetails.querySelector("#rollDisplay");
        rollDisplay.innerHTML = `<strong>Stai usando:</strong> ${rolls.join(", ")}. Il tiro totale è: ${totalNormalDice}d10${expertDice > 0 ? ` + ${expertDice} Expert Dice` : ""}${masterDice > 0 ? ` + ${masterDice} Master Dice` : ""}</strong>`;
    }

    // Trigger initial evaluation to account for always-checked bonuses
    recalculateRoll();
}

// Aggiorna le label degli input statistici nella sezione "Your Family" mostrando il valore massimo
// consentito dal governo attuale, accanto al nome della statistica.
function setStatMaxes(stats) {
    Object.keys(statInputMap).forEach(statName => {
        const inputId = statInputMap[statName];
        const input = document.getElementById(inputId);
        const label = document.querySelector(`label[for="${inputId}"]`);
        if (!input) return;

        if (stats && stats[statName] !== undefined) {
            input.max = stats[statName];
            if (label) {
                label.textContent = `${statName} (max ${stats[statName]}):`;
            }
        } else {
            // Nessun governo o statistica non presente: ripristina il default originale (max 6)
            input.max = 6;
            if (label) {
                label.textContent = `${statName}:`;
            }
        }
    });
}

// Update the `loadFamilyStats` function to use the governi.json data
function loadFamilyStats(families) {
    const lamano = families.find(family => family['Name'] === 'La Mano');

    if (!lamano) return;

    document.getElementById('might').value = lamano['Might'];
    document.getElementById('treasure').value = lamano['Treasure'];
    document.getElementById('influence').value = lamano['Influence'];
    document.getElementById('territory').value = lamano['Territory'];
    document.getElementById('sovereignty').value = lamano['Sovereignty'];

    let government = lamano['Government'];

    // Trova il governo corrispondente nei dati caricati da governi.json
    const governmentData = governi.find(g => g.nome === government);

    const subtitleElement = document.getElementById('laManoSubtitle');
    const effectsElement = document.getElementById('governmentEffects');

    if (!governmentData) {
        subtitleElement.innerHTML = `${escHtml(government)}`;
        if (effectsElement) effectsElement.innerHTML = "";
        setStatMaxes(null); // Nessun governo trovato: ripristina i max di default
        return;
    }

    const stats = governmentData.statistiche || {};
    const effetti = governmentData.effetti_speciali || [];

    // Imposta i valori massimi delle statistiche accanto agli input nella sezione "Your Family"
    setStatMaxes(stats);

    // Nel sottotitolo mostriamo solo il nome del governo (senza la lista delle statistiche)
    subtitleElement.innerHTML = `
        ${governmentData.nome_italiano ? `${escHtml(governmentData.nome)} - ${escHtml(governmentData.nome_italiano)}` : escHtml(governmentData.nome)}
    `;

    // Gli effetti speciali del governo vengono mostrati qui, al posto dei vecchi limiti statistici
    if (effectsElement) {
        effectsElement.innerHTML = `
            <ul style="list-style: none; padding: 0;">
                ${effetti.map(effetto => `
                    <li style="margin-bottom: 5px;">
                        <strong>${escHtml(effetto.nome)}:</strong> ${escHtml(effetto.descrizione)}
                    </li>
                `).join("")}
            </ul>
        `;
    }
}

// Function to load company assets from Google Sheets
function loadCompanyAssets(assets) {
    // const lines = data.split('\n');
    const companyAssetsMenu = document.getElementById("companyBonus");
    companyAssetsMenu.addEventListener('change', () => {
        const selectedBonus = document.getElementById("companyBonus").value;
        const bonusDescription = document.getElementById("bonusDescription");

        // Find the selected asset and update the description
        let selectedAsset = assets.find(asset => asset['Name'] === selectedBonus);
        bonusDescription.textContent = selectedAsset ? selectedAsset['Bonus'] : "";
    });
    assets.forEach(asset => {
        const name = asset['Name'];

        // Create dropdown options
        let option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        companyAssetsMenu.appendChild(option);
    });
}

function loadCourtMembers(courtmembers) {
    const courtContainer = document.querySelector('.court-container');
    courtmembers.forEach(member => {
        const role = member['Role'];
        const name = member['Name'];
        const bonuses = member['Bonuses'];

        // If name is empty, skip this role
        if (!name) return;

        // Create a court member element
        const memberDiv = document.createElement('div');
        memberDiv.classList.add('court-member');

        // Set the court member's image, name, and bonuses
        memberDiv.innerHTML = `
            <img src="images/court/${escHtml(name)}.webp" alt="${escHtml(name)}" onerror="this.onerror=null; this.src='images/court/Position%20Empty.webp';">
            <h3>${escHtml(name)}</h3>
            <p><strong>Ruolo:</strong> ${escHtml(role)}</p>
            <p><strong>Bonus:</strong> ${escHtml(bonuses || 'Nessun bonus disponibile')}</p>
        `;

        courtContainer.appendChild(memberDiv);
    });
}

function loadTimeline(events) {
    const container = document.getElementById("timelineContainer");
    container.innerHTML = ""; // Clear previous events

    events.forEach(event => {
        let name = event['Event'];
        let mod = event['Modifier (Inizio del Mese)'];
        // Skip rows without a valid event name (handles undefined, null, and empty string)
        if (!name) {
            return; // Skip the current month / invalid row
        }
        // Safely normalize modifier to a string before using replace
        mod = (mod || "").replace(/;/g, ' e ');
        const item = document.createElement("div");
        item.className = "timeline-item";
        item.innerHTML = `<h3>${escHtml(event['Month'])}</h3><strong>${escHtml(name)}</strong><p>${escHtml(mod)}</p>`;
        const descriptionDiv = document.createElement("div");
        descriptionDiv.className = "description-popup";
        descriptionDiv.textContent = event['Description'];

        // Append the description div to the item
        item.appendChild(descriptionDiv);

        item.addEventListener("mouseover", (e) => {
            descriptionDiv.style.position = "fixed";
            descriptionDiv.style.display = "block";
        });

        // Update the popup position on mousemove, clamped to the viewport
        // (fixed positioning + clientX/Y, not pageX/Y, so it can't be pushed
        // off-screen when the page is scrolled or the popup is measured
        // near the window's right/bottom edge).
        item.addEventListener("mousemove", (e) => {
            const pad = 8;
            const rect = descriptionDiv.getBoundingClientRect();
            const left = Math.max(pad, Math.min(e.clientX + 15, window.innerWidth - rect.width - pad));
            const top = Math.max(pad, Math.min(e.clientY + 15, window.innerHeight - rect.height - pad));
            descriptionDiv.style.left = left + "px";
            descriptionDiv.style.top = top + "px";
        });

        // Hide the popup on mouseout
        item.addEventListener("mouseout", () => {
            descriptionDiv.style.display = "none";
        });

        container.appendChild(item);
    });

    container.scrollLeft = container.scrollWidth;
}

["might", "treasure", "influence", "territory", "sovereignty"].forEach(id => {
    document.getElementById(id).addEventListener("input", generateDescription);
});

// qualities (parser.js) is keyed by stat name then tier (0-2), each tier a
// pair of interchangeable phrase variants -- same tier-clamping approach as
// strategic-map.js's generateFamilyDescription(), reused here so the input
// stat value (1-6) always resolves to a real phrase instead of indexing
// past the array.
function generateDescription() {
    const stats = {
        Might: parseInt(document.getElementById("might").value, 10),
        Treasure: parseInt(document.getElementById("treasure").value, 10),
        Influence: parseInt(document.getElementById("influence").value, 10),
        Territory: parseInt(document.getElementById("territory").value, 10),
        Sovereignty: parseInt(document.getElementById("sovereignty").value, 10)
    };
    const getTier = value => (value <= 2 ? 0 : value <= 4 ? 1 : 2);
    const phrase = key => qualities[key][getTier(stats[key])][0];
    const sentence = [phrase("Might"), phrase("Treasure"), phrase("Influence"), phrase("Territory"), phrase("Sovereignty")]
        .join(". ") + ".";
    const description = sentence.replace(/(^\w|\.\s*\w)/g, c => c.toUpperCase());
    document.getElementById("dynamicDescription").innerText = description;
}