const actions = {
    "Attacco": {
        description: "Coinvolge le forze nemiche o le difese per razziare, annettere territori o ottenere una vittoria simbolica. Comunque la si voglia chiamare, si tratta di attaccare le truppe e le difese di qualcun altro. Il difensore usa Potenza e Territorio.",
        rolls: ["might", "treasure"]
    },
    "Difesa": {
        description: "Quando si è sulla difensiva, proteggendo il proprio territorio e la propria gente. L'attaccante userà Potenza e Tesoro.",
        rolls: ["might", "territory"]
    },
    "Spionaggio": {
        description: "Raccoglie informazioni sui rivali o influenza le opinioni segretamente. Diverso dal semplice essere informati, qui si usa il sotterfugio per convertire opinioni e raccogliere informazioni. Il bersaglio si difenderà con Influenza e Territorio.",
        rolls: ["influence", "treasure"]
    },
    "Controspionaggio": {
        description: "Rileva e contrasta le operazioni di intelligence rivali. Questo è quando si sta specificamente cacciando infiltrati tra i propri ranghi. I nemici (percepiti) si difenderanno con Influenza e Tesoro.",
        rolls: ["influence", "territory"]
    },
    "Controllo dell'Ordine": {
        description: "Affronta le minacce interne e mantiene l'ordine. Si tratta essenzialmente di usare la forza diretta contro un gruppo all'interno dei propri territori, che siano banditi, ribelli o infiltrati. Il bersaglio si difenderà con Influenza e Potenza.",
        rolls: ["might", "sovereignty"]
    },
    "Guerra Non Convenzionale": {
        description: "Esegue sabotaggi, assassinii o altre azioni militari non convenzionali. È un affare sporco, e farsi scoprire significa disastro. Il bersaglio si difenderà con Potenza e Sovranità.",
        rolls: ["influence", "might"]
    },
    "Raccolta Informazioni": {
        description: "Quando si vogliono raccogliere informazioni su una compagnia o una persona. Non è spionaggio, quello sarebbe scortese: solo fare domande. Se si tira contro qualcun altro, userà Influenza e Tesoro per difendersi.",
        rolls: ["influence", "sovereignty"]
    },
    "Aumento: Might": {
        description: "Sviluppa e potenzia le capacità militari della compagnia. Richiede un tiro di Might contro una Difficoltà pari al livello attuale. Tempo necessario: da 1→2 (1 mese), da 2→3 (2 mesi), da 3→4 (4 mesi), da 4→5 (8 mesi). La width del tiro riduce la durata di 1 mese per ogni punto superiore a 2. Massimo livello: 5.",
        rolls: ["might"]
    },
    "Aumento: Influence": {
        description: "Espande la rete di contatti e il prestigio della compagnia. Richiede un tiro di Influence contro una Difficoltà pari al livello attuale. Tempo necessario: da 1→2 (1 mese), da 2→3 (2 mesi), da 3→4 (4 mesi), da 4→5 (8 mesi). La width del tiro riduce la durata di 1 mese per ogni punto superiore a 2. Massimo livello: 5.",
        rolls: ["influence"]
    },
    "Aumento: Treasure": {
        description: "Migliora l'infrastruttura economica e le risorse finanziarie della compagnia. Richiede un tiro di Treasure contro una Difficoltà pari al livello attuale. Tempo necessario: da 1→2 (1 mese), da 2→3 (2 mesi), da 3→4 (4 mesi), da 4→5 (8 mesi). La width del tiro riduce la durata di 1 mese per ogni punto superiore a 2. Massimo livello: 5.",
        rolls: ["treasure"]
    },
    "Aumento: Territory": {
        description: "Sviluppa e consolida il controllo territoriale della compagnia. Richiede un tiro di Territory contro una Difficoltà pari al livello attuale. Tempo necessario: da 1→2 (1 mese), da 2→3 (2 mesi), da 3→4 (4 mesi), da 4→5 (8 mesi). La width del tiro riduce la durata di 1 mese per ogni punto superiore a 2. Massimo livello: 5.",
        rolls: ["territory"]
    },
    "Aumento: Sovereignty": {
        description: "Rafforza la coesione interna e la lealtà dei membri della compagnia. Richiede un tiro di Sovereignty contro una Difficoltà pari al livello attuale. Tempo necessario: da 1→2 (1 mese), da 2→3 (2 mesi), da 3→4 (4 mesi), da 4→5 (8 mesi). La width del tiro riduce la durata di 1 mese per ogni punto superiore a 2. Massimo livello: 5.",
        rolls: ["sovereignty"]
    }
};

let bonuses = [];

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

// Initialize the system when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    populateActions();
    fetchBonuses().then(loadBonuses);
    fetchCompanyAssets().then(loadCompanyAssets);
    fetchFamiliesData().then(loadFamilyStats);
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
        (bonus.always && rolls.includes(bonus.score.toLowerCase())) || 
        (!bonus.always && rolls.includes(bonus.score.toLowerCase()))
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

    // Display action details, bonuses, and dice rolls
    actionDetails.innerHTML = `
        <p><strong>Description:</strong> ${description}</p>
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


// Update the `loadFamilyStats` function to include the "Government" column
function loadFamilyStats(families) {
    const lamano = families.find(family => family['Name'] === 'La Mano');
    
    if (!lamano) return;

    document.getElementById('might').value = lamano['Might'];
    document.getElementById('treasure').value = lamano['Treasure'];
    document.getElementById('influence').value = lamano['Influence'];
    document.getElementById('territory').value = lamano['Territory'];
    document.getElementById('sovereignty').value = lamano['Sovereignty'];

    let government = lamano['Government'];

    // Map of government types to their associated stats
    const governmentStats = {
        "Stratocracy": ["Might", "Territory", "Sovereignty"],
        "Martial Empire": ["Might", "Treasure", "Territory"],
        "Space Crusaders": ["Territory", "Sovereignty", "Influence"],
        "Feudal Realm": ["Territory", "Might", "Treasure"],
        "Megacorporation": ["Treasure", "Influence", "Territory"],
        "Plutocratic Oligarchy": ["Treasure", "Territory", "Sovereignty"],
        "Fanatic Purifiers": ["Sovereignty", "Might", "Territory"],
        "Divine Mandate": ["Sovereignty", "Influence", "Treasure"],
        "Hegemonic Imperialists": ["Influence", "Territory", "Might"],
        "Enigmatic Wizards": ["Influence", "Treasure", "Sovereignty"]
    };

    // Get the associated stats for the government type
    const associatedStats = governmentStats[government] || [];

    // Generate the subtitle content
    const subtitleElement = document.getElementById('laManoSubtitle');
    subtitleElement.innerHTML = `
        ${government}<br>
        ${associatedStats.map(stat => `${stat}`).join(", ")}
    `;
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
            <img src="images/court/${name}.webp" alt="${name}" onerror="this.onerror=null; this.src='images/court/placeholder.webp';">
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

const qualities = {
    Might: [
        "little more than farmers",       // 1
        "comparable to well armed militias",     // 2
        "well trained and prepared",     // 3
        "tough to battle for almost everyone",       // 4
        "a deadly challenge to anyone",        // 5
        "terrifying to face in battle"               // 6
    ],
    Treasure: [
        "copper coins",           // 1
        "silver coins",           // 2
        "gold coins",             // 3
        "platinum coins",         // 4
        "gold ingots",            // 5
        "trucks of platinum"             // 6
    ],
    Influence: [
        "unknown",            // 1
        "irrelevant",         // 2
        "respected",          // 3
        "influential",        // 4
        "a cornerstone",      // 5
        "legendary"           // 6
    ],
    Territory: [
        "a barely populated El-Beth-El",               // 1
        "a sparsely populated El-Beth-El",             // 2
        "El-Beth-El and some colonies", // 3
        "El-Beth-El and numerous colonies",              // 4
        "densly poupulated lands that stretch through planets and colonies",               // 5
        "planets, stars, colonies, and even more"             // 6
    ],
    Sovereignty: [
        "hate",             // 1
        "resent",          // 2
        "accept",          // 3
        "support",          // 4
        "love",          // 5
        "worship"             // 6
    ]
};

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
