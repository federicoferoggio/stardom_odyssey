// Function to load CSV file from the provided URL and parse it
function loadFamilyData() {
    const csvUrl = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?output=csv';

    fetch(csvUrl)
        .then(response => response.text())
        .then(data => {
            const familiesData = parseCSV(data); // Parse the CSV data
            populateFamilySelector(familiesData);
        })
        .catch(error => console.error('Error loading family data:', error));
}

// Function to parse CSV file data into an array
function parseCSV(data) {
    const lines = data.split('\n');
    const result = [];

    lines.forEach(line => {
        const values = line.split(',');
        result.push(values);
    });

    return result;
}

// Function to populate family selector dropdown
function populateFamilySelector(familiesData) {
    const familySelect = document.getElementById('familySelect');

    familiesData.forEach((family, index) => {
        if (index === 0) return; // Skip the header row
        const option = document.createElement('option');
        option.value = index;
        option.textContent = family[0]; // Family name is in the first column
        familySelect.appendChild(option);
    });

    // Save the parsed data globally for access when displaying family details
    window.familiesData = familiesData;
}

// Function to display family details when a family is selected
function displayFamilyDetails() {
    const familySelect = document.getElementById('familySelect');
    const selectedIndex = familySelect.value;
    const family = window.familiesData[selectedIndex];

    // Map columns to the corresponding data: 0 = Name, 1 = Might, 2 = Treasure, 3 = Influence, 4 = Territory, 5 = Sovereignty
    const familyName = family[0];
    const familyBannerSrc = `images/symbols/${familyName}Icon.png`; // Construct the image path

    document.getElementById('familyBanner').src = familyBannerSrc; // Set the banner image
    document.getElementById('mightStat').textContent = family[1];
    document.getElementById('treasureStat').textContent = family[2];
    document.getElementById('influenceStat').textContent = family[3];
    document.getElementById('territoryStat').textContent = family[4];
    document.getElementById('sovereigntyStat').textContent = family[5];

    // Assuming the description and members would be populated separately in future, or can be static content
    document.getElementById('descriptionText').textContent = `Family ${familyName} is known for its unique strengths.`;

    // Show the family details section
    document.getElementById('familyDetails').style.display = 'block';
}

// Initialize the page by loading family data on window load
window.onload = function() {
    loadFamilyData();
};

// Get the menu button and container
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
