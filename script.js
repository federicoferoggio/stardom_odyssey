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
    }
};

// Ragioni di guerra disponibili per l'azione "Attacco"
const warReasons = [
    { nome: "Conquista", descrizione: "+1 al proprio territorio se avversario soccombe" },
    { nome: "Umiliazione", descrizione: "+1 alla propria influence se avversario soccombe" },
    { nome: "Razzia", descrizione: "+1 al proprio treasure se avversario soccombe" },
    { nome: "Destabilizzazione", descrizione: "-1 Sovereignty all'avversario" },
    { nome: "Difesa", descrizione: "-1 Might all'avversario" },
    { nome: "Conquista Risorsa", descrizione: "Acquisisci una risorsa dell'avversario" },
    { nome: "Disingaggio", descrizione: "Rimuovi una flotta nemica" }
];

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
            situation: row['Situation'],
            diceType: row['Dice Type'],
            extra: row['Extra'],
            always: row['Always'] === "Y"
        });
    });

    console.log("Parsed Bonuses:", bonuses); // Debug here
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

    // Generate checklist bonuses from CSV data
    const bonusesForRoll = bonuses.filter(bonus =>
        bonus.score.toLowerCase() === "all" || // Include bonuses with "all" as the score
        rolls.includes(bonus.score.toLowerCase())
    );

    const bonusChecklist = `
    <ul style="list-style: none; padding: 0;">
        ${bonusesForRoll.map(bonus => `
            <li style="margin-bottom: 5px;">
                <label style="display: flex; align-items: center; cursor: pointer;", title="${bonus.situation}">
                    <input type="checkbox" class="bonus-checkbox" value="${bonus.bonus}"
                           data-dice-type="${bonus.diceType}" data-extra="${bonus.extra}"
                           ${bonus.always ? "checked disabled" : ""}
                           style="margin-right: 10px; width: 20px; height: 20px;">
                    ${bonus.bonus} (${bonus.diceType}, +${bonus.extra})
                </label>
            </li>
        `).join("")}
    </ul>
    `;

    // Generate dropdown menu for bonus selection
    const bonusDropdown = `
        <label for="bonusDropdown">How useful were you in aiding your company?</label>
        <select id="bonusDropdown">
            <option value="none" selected>Did not do shit</option>
            <option value="-3d">We shat our pants! -3d</option>
            <option value="-2d">We only earned shame. -2d</option>
            <option value="-1d">Would have been better to do nothing. -1d</option>
            <option value="0">Waste of time. No effect</option>
            <option value="1d">Somewhat useful. +1d</option>
            <option value="ED">We did good! +ED</option>
            <option value="2d">Give us gold and give us glory. +2d</option>
            <option value="MD">We are kings, we are winners. +MD</option>
            <option value="3d">Legends of our greatness will be sung for centuries. +3d</option>
            <option value="1+MD">A success that few will ever see again. +1d and MD</option>
            <option value="2+MD">Gods step aside, for we have come. +2d and MD</option>
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
                ${warReasons.map(reason => `<option value="${reason.nome}" title="${reason.descrizione}">${reason.nome}</option>`).join("")}
            </select>
            <p id="warReasonDescription"></p>
        </div>
        `;
    }

    // Display action details, bonuses, and dice rolls
    actionDetails.innerHTML = `
        <p><strong>Description:</strong> ${description}</p>
        ${warReasonsMenu}
        <p id="rollDisplay"><strong>You are using:</strong> ${rolls.join(", ")}. Total roll is: ${baseRoll}d10</p>
        <div>
            <strong>Court Bonuses:</strong>
            <form id="bonusForm">
                ${bonusChecklist}
            </form>
        </div>
        <div>
            <strong>Completion Bonus:</strong>
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
        rollDisplay.innerHTML = `<strong>You are using:</strong> ${rolls.join(", ")}. Total roll is: ${totalNormalDice}d10${expertDice > 0 ? ` + ${expertDice} Expert Dice` : ""}${masterDice > 0 ? ` + ${masterDice} Master Dice` : ""}</strong>`;
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
        subtitleElement.innerHTML = `${government}`;
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
        ${governmentData.nome_italiano ? `${governmentData.nome} - ${governmentData.nome_italiano}` : governmentData.nome}
    `;

    // Gli effetti speciali del governo vengono mostrati qui, al posto dei vecchi limiti statistici
    if (effectsElement) {
        effectsElement.innerHTML = `
            <ul style="list-style: none; padding: 0;">
                ${effetti.map(effetto => `
                    <li style="margin-bottom: 5px;">
                        <strong>${effetto.nome}:</strong> ${effetto.descrizione}
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
        // bonusDescription.textContent = companyAssets[selectedBonus];

        // Find the selected asset and update the description
        let selectedAsset = assets.find(asset => asset['Name'] === selectedBonus);
        if (selectedAsset) {
            bonusDescription.textContent = selectedAsset['Bonus'];
        } else {
            console.log("Selected asset not found.");
            bonusDescription.textContent = "";
        }
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
            <img src="images/court/${name}.webp" alt="${name}" onerror="this.onerror=null; this.src='images/court/Position%20Empty.webp';">
            <h3>${name}</h3>
            <p><strong>Role:</strong> ${role}</p>
            <p><strong>Bonuses:</strong> ${bonuses || 'No bonuses available'}</p>
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
        mod = (mod || "").replace(/;/g, ' and ');
        const item = document.createElement("div");
        item.className = "timeline-item";
        item.innerHTML = `<h3>${event['Month']}</h3><strong>${name}</strong><p>${mod}</p>`;
        const descriptionDiv = document.createElement("div");
        descriptionDiv.className = "description-popup";
        descriptionDiv.textContent = event['Description'];

        // Append the description div to the item
        item.appendChild(descriptionDiv);

        item.addEventListener("mouseover", (e) => {
            descriptionDiv.style.display = "block";
        });

        // Update the popup position on mousemove
        item.addEventListener("mousemove", (e) => {
            descriptionDiv.style.left = e.pageX + 15 + "px"; // 15px to the right of the cursor
            descriptionDiv.style.top = e.pageY + 15 + "px"; // 15px below the cursor
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

function generateDescription() {
    const stats = {
        Might: parseInt(document.getElementById("might").value, 10),
        Treasure: parseInt(document.getElementById("treasure").value, 10),
        Influence: parseInt(document.getElementById("influence").value, 10),
        Territory: parseInt(document.getElementById("territory").value, 10),
        Sovereignty: parseInt(document.getElementById("sovereignty").value, 10)
    };
    const description = `
        Your reign\'s forces are ${qualities.Might[stats.Might - 1]}, and your subjects ${qualities.Sovereignty[stats.Sovereignty - 1]} your rule. You are ${qualities.Influence[stats.Influence - 1]} in the system, and your territory is ${qualities.Territory[stats.Territory - 1]}. In your court people deal in ${qualities.Treasure[stats.Treasure - 1]}.
    `.trim();
    document.getElementById("dynamicDescription").innerText = description;
}