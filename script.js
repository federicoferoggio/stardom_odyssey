const actions = {
    "Attack": {
        description: "Engages enemy forces or defenses for raiding, annexation, or a symbolic victory. However you want to call it, it bolis down to attacking someone else's troops and defenses. The attacked defends with Might and Territory",
        rolls: ["might", "treasure"]
    },
    "Defend": {
        description: "When you are on the defensive, protecting your territory and people. The attacker will roll Might and Treasure.",
        rolls: ["might", "territory"]
    },
    "Espionage": {
        description: "Gathers intelligence on rivals or influences opinions covertly. Different from being informed, you are using subterfuge to convert opinions and gather information. The target will defend with Influence and Territory.",
        rolls: ["influence", "treasure"]
    },
    "Counter-Espionage": {
        description: "Detects and counters rival intelligence operations. This is when you are specifically hunting for infiltrators among your ranks. Your (perceived) enemies will defend with Influence and Treasure.",
        rolls: ["influence", "territory"]
    },
    "Policing": {
        description: "Addresses internal threats and maintains order. Refer to the rules for more information about this action, but it boils down to using direct force against a group inside your terriories, might them be bandits, rebels or infiltrators. The target will defend with Influence and Might.",
        rolls: ["might", "sovereignty"]
    },
    "Train and Levy Troops": {
        description: "Recruits and integrates troops into the company. Just like  Rise in Stature or Improve the Culture, you can get a permanent bonus if you hit a height equal to your current might, but you cannot get a temporary bonus with this action. Your might cannot increase beyond the number currently set by the spelljamming level.",
        rolls: ["sovereignty", "territory"]
    },
    "Build up the fleet": {
        description: "Increases the size and quality of your fleet. In a society of space faring, this is a must if you want to increase the might of your company. The difficulty of the roll is equal to the current spelljamming level of your company.",
        rolls: ["treasure", "influence"]
    },
    "Rise in Stature": {
        description: "Increases your company's prestige and influence, both at home and abroad. When you want a temporary increase, any set will give you a +1 bonus until the end of the next month. For a permanent bonus, you need to hit a height equal to your current influence.",
        rolls: ["sovereignty", "treasure"]
    },
    "Unconventional Warfare": {
        description: "Executes sabotage, assassinations, or other unconventional military actions. This is a dirty business, and getting caught spells disaster. For more complete information, refer to the rules. The target will defend with Might and Sovereignty.",
        rolls: ["influence", "might"]
    },
    "Improve the Culture": {
        description: "Invests in community and cultural projects to unify the populace. Culture here is not just about art and music, but also the quality of life and the sense of belonging. If you want a temporary bonus, any set will give you a +1 bonus until the end of the next month. For a permanent bonus, you need to hit a height equal to your current soverignty and a width equal to your current territory.",
        rolls: ["territory", "treasure"]
    },
    "Being informed": {
        description: "When you want to collect information about a company or a person. It isn't spying, that would be unpolite: just asking questions. If you roll against someone else, they use their Influence and Treasure to defend.",
        rolls: ["influence", "sovereignty"]
    }
    // Additional actions can be defined based on deeper analysis of the file.
};


// CSV file URL (replace with your actual URL)
const googleSheetCourtURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=2021236788&single=true&output=csv';

const courtPositions = [
    "Draconian Guard",
    "Beholdic Spymaster",
    "Fiendish General",
    "Empyrean Chaplain",
    "Haggish Diplomat",
    "Acerakkian Archmage",
    "Krakian Shipmaster",
    "Diabolic Coincount",
    "Modronic Minister",
    "The Enlightened"
];

let companyData = {};

let bonuses = [];

function fetchBonuses() {
    fetch("https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=237415455&single=true&output=csv")
        .then(response => response.text())
        .then(csv => {
            bonuses = csv.split("\n").slice(1).map(line => {
                const [bonus, score, situation, diceType, extra, always] = line.split(",");
                return {
                    bonus: bonus.trim(),
                    score: score.trim(),
                    situation: situation.trim(),
                    diceType: diceType.trim(),
                    extra: parseInt(extra, 10),
                    always: always.trim() === "Y"
                };
            });
            console.log("Parsed Bonuses:", bonuses); // Debug here
        })
        .catch(err => console.error("Failed to fetch bonuses:", err));
}

// Array to hold the orbital distances in months for each planet
const planetsData = [
    { name: 'Hellcoast', distanceFromSun: 0.2 },
    { name: 'Jetaras', distanceFromSun: 0.4 },
    { name: 'Void', distanceFromSun: 0.6 },
    { name: 'Draconia', distanceFromSun: 1.0 },
    { name: 'Ion', distanceFromSun: 3.5 },
    { name: 'Saltar', distanceFromSun: 4.0 },
    { name: 'Wandacker', distanceFromSun: 5.0 },
    { name: 'Xan', distanceFromSun: 12.0 },
    { name: 'Brion7', distanceFromSun: 20.0 }
];

function navigateToPage() {
    const pageSelect = document.getElementById('pageSelect');
    const selectedPage = pageSelect.value;

    if (selectedPage) {
        window.location.href = selectedPage; // Navigate to the selected page
    }
}


// Function to show planet info when a planet is clicked
function showPlanetInfo(planetIndex) {
    const planet = planetsData[planetIndex];
    const planetNameElement = document.getElementById('planetName');
    const planetDistances = document.getElementById('planetDistances');

    planetNameElement.textContent = planet.name; // Set the planet's name in the modal
    planetDistances.innerHTML = ''; // Clear previous distances

    const currentMonth = parseInt(document.getElementById("monthInput").value, 10);

    planetsData.forEach((otherPlanet, otherIndex) => {
        if (planetIndex !== otherIndex) {
            const distance = calculateDistance(planet, otherPlanet, currentMonth, planetIndex, otherIndex);
            const listItem = document.createElement('li');
            listItem.textContent = `${otherPlanet.name}: ${distance.toFixed(2)} months`;
            planetDistances.appendChild(listItem);
        }
    });

    // Set the planet image dynamically based on the planet name
    const planetImageInfo = document.getElementById('planetImage');
    planetImageInfo.src = "images/" + planet.name.replace(/\s+/g, '') + ".webp";
    planetImageInfo.alt = planet.name;

    // Display the modal
    document.getElementById('planetInfo').style.display = 'block';
}

// Function to calculate the distance between two planets
function calculateDistance(planet1, planet2, month, index1, index2) {
    const totalMonths = 12; // Assuming a 12-month cycle

    // Calculate the angle of each planet in radians
    const angle1 = ((month / (index1 + 1)) % totalMonths) * (2 * Math.PI / totalMonths);
    const angle2 = ((month / (index2 + 1)) % totalMonths) * (2 * Math.PI / totalMonths);

    // Calculate the coordinates of each planet based on their angle and distance from the sun
    const x1 = planet1.distanceFromSun * Math.cos(angle1);
    const y1 = planet1.distanceFromSun * Math.sin(angle1);
    const x2 = planet2.distanceFromSun * Math.cos(angle2);
    const y2 = planet2.distanceFromSun * Math.sin(angle2);

    // Calculate the distance between the two planets using the distance formula
    const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));

    return distance;
}

function closeModal() {
    document.getElementById('planetInfo').style.display = 'none';
}

// Function to set planets' z-index to ensure they are on top
function setPlanetsOnTop() {
    const planets = document.querySelectorAll('.planet');
    planets.forEach(planet => {
        planet.style.zIndex = 1000; // A very high z-index value
    });
}

// Function to attach click event to each planet after the DOM is fully loaded
function attachPlanetClickListeners() {
    const planets = document.querySelectorAll('.planet img'); // Make sure you are selecting the correct element
    planets.forEach((planet, index) => {
        planet.addEventListener('click', () => showPlanetInfo(index));
    });
}

// Initialize the system when the DOM is fully loaded
document.addEventListener("DOMContentLoaded", () => {
    populateActions();
    fetchBonuses();
    attachPlanetClickListeners();
    setPlanetsOnTop();
    updateSystem(); // If this function updates planetary orbits or other dynamic behavior
    loadCompanyBonuses();
    loadFamilyStats();
    loadCourtMembers();
    fetchTimelineData();
});

// Function to update planetary system (rotation based on the month input)
function updateSystem() {
    loadFamilyStats();
    const month = parseInt(document.getElementById("monthInput").value, 10);
    const totalMonths = 12; // Assuming a 12-month cycle

    const orbits = document.querySelectorAll('.orbit');
    orbits.forEach((orbit, index) => {
        // Calculate the rotation angle based on the current month and orbit index
        const speedFactor = (index + 1); // Increase the factor with distance, so outer planets move slower
        const angle = ((month / speedFactor) % totalMonths) * (360 / totalMonths);
        orbit.style.transform = `rotate(${angle}deg)`;
    });

    setPlanetsOnTop();
}

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
            <option value="-3d">We shat in our pants! -3d</option>
            <option value="-2d">We only earned shame. -2d</option>
            <option value="-1d">Would have been better to do nothing. -1d</option>
            <option value="0">Waste of time. No effect</option>
            <option value="1d">Somewhat useful. +1d</option>
            <option value="ED">We did good! +Expert Dice</option>
            <option value="2d">Give us gold and give us glory. +2d</option>
            <option value="MD">We are kings, we are winners. +Master Dice</option>
            <option value="3d">We were chosen by the gods themselves! +3d</option>
            <option value="1+MD">PHD success right here! +1d and Master Dice</option>
            <option value="2+MD">Legends will be told of our greatness. +2d and Master Dice</option>
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




const googleSheetFamilyURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=0&single=true&output=csv';


function loadFamilyStats() {
    fetch(googleSheetFamilyURL)
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n');
            lines.forEach((line, index) => {
                if (index === 0) return; // Skip the header row

                const [familyName, might, treasure, influence, territory, sovereignty] = line.split(',');

                // Check if the family is "Virtanen"
                if (familyName.trim() === 'Virtanen') {
                    loadVirtanenFamilyStats(might, treasure, influence, territory, sovereignty);
                }
            });
        })
        .catch(error => console.error('Error loading family stats:', error));
}


function loadVirtanenFamilyStats(might, treasure, influence, territory, sovereignty) {
    document.getElementById('might').value = might.trim();
    document.getElementById('treasure').value = treasure.trim();
    document.getElementById('influence').value = influence.trim();
    document.getElementById('territory').value = territory.trim();
    document.getElementById('sovereignty').value = sovereignty.trim();

    generateDescription();
}

// Google Sheet URL to fetch company bonuses
const googleSheetBonusURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=549477368&single=true&output=csv';

let companyBonuses = {};

// Function to load company bonuses from Google Sheets
function loadCompanyBonuses() {
    fetch(googleSheetBonusURL)
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n');
            const companyBonusMenu = document.getElementById("companyBonus");

            lines.forEach((line, index) => {
                if (index === 0) return; // Skip the header row
                const [name, bonus] = line.split(',');

                // Store company bonuses in an object
                companyBonuses[name.trim()] = bonus.trim();

                // Create dropdown options
                let option = document.createElement("option");
                option.value = name.trim();
                option.textContent = name.trim();
                companyBonusMenu.appendChild(option);
            });

            // Set event listener to show bonus description when a bonus is selected
            companyBonusMenu.addEventListener('change', updateBonusDescription);
        })
        .catch(error => console.error('Error loading company bonuses:', error));
}

// Function to update the bonus description based on the selected bonus
function updateBonusDescription() {
    const selectedBonus = document.getElementById("companyBonus").value;
    const bonusDescription = document.getElementById("bonusDescription");
    bonusDescription.textContent = companyBonuses[selectedBonus];
}

function loadCourtMembers() {
    fetch(googleSheetCourtURL)
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n');
            const courtContainer = document.querySelector('.court-container');
            lines.forEach((line, index) => {
                if (index === 0) return; // Skip header row

                const [role, name, bonuses] = line.split(',');

                // If name is empty, skip this role
                if (!name.trim()) return;

                // Create a court member element
                const memberDiv = document.createElement('div');
                memberDiv.classList.add('court-member');

                // Set the court member's image, name, and bonuses
                memberDiv.innerHTML = `
                    <img src="images/court/${name.trim()}.webp" alt="${name.trim()}" onerror="this.onerror=null; this.src='images/court/placeholder.webp';">
                    <h3>${name.trim()}</h3>
                    <p><strong>Role:</strong> ${role.trim()}</p>
                    <p><strong>Bonuses:</strong> ${bonuses.trim() || 'No bonuses available'}</p>
                `;

                courtContainer.appendChild(memberDiv);
            });
        })
        .catch(error => console.error('Error loading court members:', error));
}


const menuButton = document.querySelector('.menu-button');
const menuContainer = document.querySelector('.menu-container');

// Toggle the dropdown menu when clicking the button
menuButton.addEventListener('click', () => {
    menuContainer.classList.toggle('active');
});

// Close the dropdown if clicked outside
window.addEventListener('click', (e) => {
    if (!menuContainer.contains(e.target) && !menuButton.contains(e.target)) {
        menuContainer.classList.remove('active');
    }
});

async function fetchTimelineData() {
    const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=1188539103&single=true&output=csv";

    try {
        const response = await fetch(url);
        const data = await response.text();

        // Parse CSV
        const rows = data.split("\n").slice(1); // Skip the header row
        const events = rows.map(row => {
            const [month, event, description] = row.split(",");
            return { month, event, description };
        });

        populateTimeline(events);
    } catch (error) {
        console.error("Error fetching timeline data:", error);
    }
}

function scrollToLastEvent() {
    const container = document.getElementById("timelineContainer");
    container.scrollLeft = container.scrollWidth; // Scroll to the far right
}

function updateCurrentMonth(month) {
    const monthInput = document.getElementById("monthInput");
    monthInput.value = month; // Set the input value to the last month
    monthInput.dispatchEvent(new Event("input")); // Trigger the update event
}

function populateTimeline(events) {
    const container = document.getElementById("timelineContainer");
    container.innerHTML = ""; // Clear previous events

    events.forEach(({ month, event, description }) => {
        const item = document.createElement("div");
        item.className = "timeline-item";
        item.innerHTML = `<h3>${month}</h3><strong>${event}</strong><p>${description}</p>`;
        container.appendChild(item);
    });

    const lastEvent = events[events.length - 1]; // Get the last event
    if (lastEvent) {
        updateCurrentMonth(lastEvent.month); // Update the input box to the last month
    }

    scrollToLastEvent(); // Scroll to the last event
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
        "denly poupulated lands that stretch through planets and colonies",               // 5
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
