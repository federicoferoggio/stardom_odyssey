// Simulate Reign actions based on your Reign file
const reignActions = {
    "Attack": `Roll: Might + Treasure. Opposed By: Might + Territory.\nDescription: Engage in various forms of attacks, including Raiding, Annexation, Symbolism, or Pre-Emptive Defense. Objectives include reducing the enemy's Treasure, Might, or Territory or gaining symbolic victories.`,

    "Defend": `Roll: Might + Territory. Opposed By: Might + Treasure.\nDescription: Defend your company from enemy attacks, preventing them from seizing resources or territory.`,

    "Espionage": `Roll: Influence + Treasure. Opposed By: Influence + Territory.\nDescription: Gather intelligence on rivals or spread misinformation. Success allows you to learn vital information or destabilize the opponent.`,

    "Counter espionage": `Roll: Influence + Territory. Opposed By: Influence + Treasure.\nDescription: Protect your company from enemy spies. Success helps you uncover and neutralize espionage activities.`,

    "Total Conquest": `Description: If you can reduce a rival Company’s Sovereignty to zero, it collapses. If you reduce two of a Company’s Qualities to zero in one month, including either Sovereignty or Territory, you completely overwhelm and subsume that Company.`,

    "Being Informed": `Roll: Influence + Sovereignty. Opposed By: Influence + Treasure or a Difficulty set by the GM.\nDescription: Gather information about what’s going on, whether general news or obscure information about hidden activities.`,

    "Improve culture": `Roll: Territory + Treasure. Opposed By: Difficulty equal to current Sovereignty.\nDescription: Improve your Company's culture by building infrastructure, supporting arts, and fostering community. Success can temporarily or permanently increase Sovereignty.`,

    "Policing": `Roll: Might + Sovereignty. Opposed By: Influence + Might.\nDescription: Address internal threats and maintain order within your Company by dealing with infiltrators or dissidents.`,

    "Rise in stature": `Roll: Sovereignty + Treasure. Opposed By: Difficulty equal to current Influence.\nDescription: Increase your Company's prestige and influence through social or financial means. Success can temporarily or permanently raise Influence.`,

    "Train and levy troops": `Roll: Sovereignty + Territory. Opposed By: Difficulty equal to current Might.\nDescription: Raise and integrate new troops to increase your Company's Might. This action can permanently raise Might but cannot exceed a certain limit.`,

    "Unconventional warfare": `Roll: Influence + Might. Opposed By: Might + Sovereignty.\nDescription: Engage in unconventional tactics such as sabotage, assassination, or other covert operations. Success can damage the enemy’s Qualities like Might, Territory, Influence, or Treasure.`
};

let companyData = {};

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
    loadRivalCompanies(); // Load rival companies from CSV on load
    attachPlanetClickListeners();
    setPlanetsOnTop();
    updateSystem(); // If this function updates planetary orbits or other dynamic behavior
    loadCompanyBonuses();
    loadFamilyStats();
    loadCourtMembers();
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
    Object.keys(reignActions).forEach(action => {
        let option = document.createElement("option");
        option.value = action;
        option.textContent = action.charAt(0).toUpperCase() + action.slice(1);
        actionsMenu.appendChild(option);
    });
}

function updateActionDetails() {
    const action = document.getElementById("actionsMenu").value;
    const actionDetails = document.getElementById("actionDetails");
    const companyStatsTable = document.getElementById("companyStatsTable");
    
    actionDetails.innerHTML = `<p>${reignActions[action]}</p>`;

    if (action === "Attack" || action === "Influence" || action === "Espionage" || action === "Counter espionage") {
        document.getElementById("rivalSelection").style.display = "block";
        companyStatsTable.style.display = "table";  // Show the table for these actions
    } else {
        document.getElementById("rivalSelection").style.display = "none";
        companyStatsTable.style.display = "none";  // Hide the table for other actions
    }
    actionDetails.innerHTML = `<p>${reignActions[action]}</p>`;

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
}


// Update the loadRivalCompanies function to load the CSV from Google Sheets
function loadRivalCompanies() {
    // Replace this URL with your published Google Sheets CSV link
    const googleSheetURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=0&single=true&output=csv';

    fetch(googleSheetURL)
        .then(response => response.text())
        .then(data => {
            const lines = data.split('\n');
            const rivalsMenu = document.getElementById("rivalsMenu");
            lines.forEach((line, index) => {
                if (index === 0) return; // Skip the header row
                const [name, might, treasure, influence, territory, sovereignty] = line.split(',');

                // Store company data in an object
                companyData[name] = {
                    might: might.trim(),
                    treasure: treasure.trim(),
                    influence: influence.trim(),
                    territory: territory.trim(),
                    sovereignty: sovereignty.trim()
                };

                // Create dropdown options
                let option = document.createElement("option");
                option.value = name.trim();
                option.textContent = name.trim();
                rivalsMenu.appendChild(option);
            });

            // Set event listener for when a company is selected
            rivalsMenu.addEventListener('change', updateCompanyStats);
        })
        .catch(error => console.error('Error loading Google Sheets CSV:', error));
}

// Store the original stats when the company is selected
function updateCompanyStats() {
    const selectedCompany = document.getElementById("rivalsMenu").value;
    const stats = companyData[selectedCompany];

    if (stats) {
        // Store the original stats so they can be reset
        originalStats = {
            might: stats.might,
            treasure: stats.treasure,
            influence: stats.influence,
            territory: stats.territory,
            sovereignty: stats.sovereignty
        };

        // Show the company stats table
        document.getElementById("companyStatsTable").style.display = "table";

        // Update the table values
        document.getElementById("statMight").textContent = stats.might;
        document.getElementById("statTreasure").textContent = stats.treasure;
        document.getElementById("statInfluence").textContent = stats.influence;
        document.getElementById("statTerritory").textContent = stats.territory;
        document.getElementById("statSovereignty").textContent = stats.sovereignty;
    }
}

function activateAction() {
    const action = document.getElementById("actionsMenu").value;

    if (!action) {
        alert("Please select an action first.");
        return;
    }

    // Get current company stats
    let might = parseInt(document.getElementById("might").value);
    let treasure = parseInt(document.getElementById("treasure").value);
    let influence = parseInt(document.getElementById("influence").value);
    let territory = parseInt(document.getElementById("territory").value);
    let sovereignty = parseInt(document.getElementById("sovereignty").value);

    // Degrade the relevant qualities based on the action
    switch (action) {
        case 'Attack':
            // Degrade Might and Treasure
            if (might > 0) might -= 1;
            if (treasure > 0) treasure -= 1;
            break;
        case 'Defend':
            // Degrade Might and Territory
            if (might > 0) might -= 1;
            if (territory > 0) territory -= 1;
            break;
        case 'Espionage':
            // Degrade Influence and Treasure
            if (influence > 0) influence -= 1;
            if (treasure > 0) treasure -= 1;
            break;
        case 'Counter espionage':
            // Degrade Influence and Territory
            if (influence > 0) influence -= 1;
            if (territory > 0) territory -= 1;
            break;
        case 'Total conquest':
            // Degrade Sovereignty and another quality
            if (sovereignty > 0) sovereignty -= 1;
            break;
        // Add more cases for other actions
        default:
            alert("No degradation rules for this action.");
            return;
    }

    // Update the values in the form
    document.getElementById("might").value = might;
    document.getElementById("treasure").value = treasure;
    document.getElementById("influence").value = influence;
    document.getElementById("territory").value = territory;
    document.getElementById("sovereignty").value = sovereignty;
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
