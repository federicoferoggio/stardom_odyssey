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
        ["governano un pianeta ricco di anime e numerose colonie", "le loro terre si espandono su più sistemi"], // 3–4
        ["dominano pianeti, asteroidi, colonie e persino di più", "il loro dominio si estende oltre l'immaginabile"] // 5–6
    ],
    Sovereignty: [
        ["i loro sudditi li tollerano appena", "sono mal sopportati dalla popolazione"], // 1–2
        ["i loro sudditi li sostengono", "hanno il supporto della popolazione"], // 3–4
        ["i loro sudditi li venerano", "il loro regno è visto come sacro"] // 5–6
    ]
};
document.addEventListener('DOMContentLoaded', async () => {
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

    const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=0&single=true&output=csv";

    // Fetch and parse the CSV data
    async function fetchFamilyData(url) {
        const response = await fetch(url);
        const csvText = await response.text();
        const rows = csvText.split("\n").map(row => row.split(","));
        const headers = rows[0].map(header => header.trim());
        const data = rows.slice(1).map(row => {
            const obj = {};
            row.forEach((value, index) => {
                const trimmedValue = value.trim();
                obj[headers[index]] = isNaN(trimmedValue) || trimmedValue === "" ? trimmedValue : parseInt(trimmedValue, 10);
            });
            return obj;
        });
        return data.filter(row => row.Name); // Exclude empty rows
    }

    // Fetch and process the data
    const familyData = await fetchFamilyData(csvUrl);

    // Function to capitalize the first letter of each sentence
    function capitalizeSentences(description) {
        return description.replace(/(^\w|\.\s*\w)/g, char => char.toUpperCase());
    }

    // Function to generate description dynamically
    function generateFamilyDescription(stats) {
        const averageStat = Object.values(stats).reduce((sum, stat) => sum + stat, 0) / 5;

        const getTier = value => (value <= 2 ? 0 : value <= 4 ? 1 : 2);
        const getRandomPhrase = (statArray, level) =>
            statArray[level][Math.floor(Math.random() * statArray[level].length)];

        const sentences = [];
        for (let [key, value] of Object.entries(stats)) {
            const phrase = getRandomPhrase(qualities[key], getTier(value));
            sentences.push({ key, value, phrase });
        }

        const pairedSentences = [];
        for (let i = 0; i < sentences.length - 1; i += 2) {
            const first = sentences[i];
            const second = sentences[i + 1];
            const conjunction = Math.abs(first.value - averageStat) > 1 &&
                Math.abs(second.value - averageStat) > 1 &&
                ((first.value > averageStat && second.value < averageStat) ||
                    (first.value < averageStat && second.value > averageStat))
                ? "ma"
                : "e";
            pairedSentences.push(`${first.phrase} ${conjunction} ${second.phrase}`);
        }

        // Handle the standalone final quality if the number of stats is odd
        if (sentences.length % 2 !== 0) {
            const last = sentences[sentences.length - 1];
            pairedSentences.push(last.phrase);
        }

        const description = pairedSentences.join(". ") + ".";
        return capitalizeSentences(description);
    }

    // Process each family
    familyData.forEach(family => {
        const familyName = family.Name;
        const familyElement = Array.from(document.querySelectorAll('.family-entry'))
            .find(entry => entry.querySelector('.family-name').textContent.trim() === familyName);

        if (familyElement) {
            const totalPowerElement = familyElement.querySelector('.family-total-power');
            const descriptionElement = familyElement.querySelector('.family-generated-description');

            const relevantStats = ["Might", "Treasure", "Influence", "Territory", "Sovereignty"];
            const totalPower = relevantStats.reduce((sum, stat) => {
                const value = family[stat];
                return typeof value === "number" ? sum + value : sum;
            }, 0);

            const stats = relevantStats.reduce((obj, stat) => {
                obj[stat] = family[stat];
                return obj;
            }, {});

            const descriptionPhrase = generateFamilyDescription(stats);

            // Assuming totalPowerElement is the image element (e.g., <img> element)
            if (totalPower <= 10) {
                totalPowerElement.src = 'images/deadlyness/10.svg';
            } else if (totalPower <= 15) {
                totalPowerElement.src = 'images/deadlyness/11.svg';
            } else if (totalPower <= 20) {
                totalPowerElement.src = 'images/deadlyness/16.svg';
            } else if (totalPower <= 25) {
                totalPowerElement.src = 'images/deadlyness/21.svg';
            } else {
                totalPowerElement.src = 'images/deadlyness/26.svg';
            }

            // Set the title of the element to the totalPower value
            totalPowerElement.title = `Total Power: ${totalPower}`;
            descriptionElement.textContent = descriptionPhrase;
        }
    });
});