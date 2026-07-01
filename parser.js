// Central parser and fetch utilities for the app
// Provides functions to fetch and parse data from Google Sheets
(function(){
    const cacheInstance = (typeof BrowserCache !== 'undefined') ? new BrowserCache('stardom', 1) : null;

    // Shared flavor-text phrase bank, keyed by stat name then tier (0-2).
    // Used by index.html (script.js) and families.html (script_families.js).
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

    async function myfetch(url) {
        if (cacheInstance && cacheInstance.fetchAndCache) {
            return cacheInstance.fetchAndCache(url);
        } else {
            console.log("Fetching without cache for URL:", url);
            const res = await fetch(url);
            return res.text();
        }
    };


    // All URLs
    const googleSheetBaseURL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub';
    
    // script.js
    const googleSheetBonusesURL = `${googleSheetBaseURL}?gid=237415455&single=true&output=csv`;
    const googleSheetFamiliesURL = `${googleSheetBaseURL}?gid=0&single=true&output=csv`;
    const googleSheetCourtURL = `${googleSheetBaseURL}?gid=2021236788&single=true&output=csv`;
    const googleSheetAssetsURL = `${googleSheetBaseURL}?gid=549477368&single=true&output=csv`;
    const googleSheetTimelinedataURL = `${googleSheetBaseURL}?gid=1188539103&single=true&output=csv`;

    // script_families.js
    const pactsUrl = `${googleSheetBaseURL}?gid=1375108331&single=true&output=csv`;


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

    /**
     * Parse a CSV text into a dataframe-like structure (array of objects).
     * @param {*} csvText - The CSV text to parse. The first row should contain headers.
     * @returns {Array<Object>} - Parsed data.
     */
    function parseDataframe(csvText) {
        const rows = csvText.split("\n").map(row => splitCsvLine(row));
        const headers = rows[0].map(header => header.trim());
        const data = rows.slice(1).map(row => {
            const obj = {};
            row.forEach((value, index) => {
                const trimmedValue = (value || '').trim();
                obj[headers[index]] = isNaN(trimmedValue) || trimmedValue === "" ? trimmedValue : parseInt(trimmedValue, 10);
            });
            return obj;
        });
        return data;
    }

    async function fetchTimelineData() {
        return myfetch(googleSheetTimelinedataURL)
            .then(parseDataframe)
            .catch(error => {
                console.error("Error fetching timeline data:", error);
                return [];
            });
    }

    async function fetchFamiliesData() {
        return myfetch(googleSheetFamiliesURL)
            .then(parseDataframe)
            .catch(error => {
                console.error("Error fetching families data:", error);
                return [];
            });
    }

    async function fetchCourtMembers() {
        return myfetch(googleSheetCourtURL)
            .then(parseDataframe)
            .catch(error => {
                console.error("Error fetching court members data:", error);
                return [];
            });
    }

    async function fetchCompanyAssets() {
        return myfetch(googleSheetAssetsURL)
            .then(parseDataframe)
            .catch(error => {
                console.error("Error fetching company assets data:", error);
                return [];
            });
    }

    async function fetchBonuses() {
        return myfetch(googleSheetBonusesURL)
            .then(parseDataframe)
            .catch(error => {
                console.error("Error fetching bonuses data:", error);
                return [];
            });
    }


    async function fetchPactsData() {
        try {
            const csvText = await myfetch(pactsUrl);

            // Example of a row:
            // Ntsu,Supporto Arcano (Carxus),Supporto Arcano (Caillot),Patto di Vassallaggio su (Carxus),...
            // I want to use regex to parse this into:
            // [
            //   { From: "Ntsu", Pact: "Supporto Arcano", To: "Carxus" },
            //   { From: "Ntsu", Pact: "Supporto Arcano", To: "Caillot" },
            //   ...
            // ]

            let data = [];
            const rows = csvText.split("\n");
            const headers = rows[0].split(",").map(h => h.trim());

            rows.slice(1).forEach(row => {
                // Split at first comma to separate company from pacts
                const firstCommaIndex = row.indexOf(",");
                const company = row.slice(0, firstCommaIndex).trim();
                row.slice(firstCommaIndex + 1)
                    .matchAll(/\s*(.+?)\s*\((.+?)\),/g)
                    .forEach(pactEntry => {
                        data.push({
                            From: company,
                            Pact: pactEntry[1].trim(),
                            To: pactEntry[2].trim()
                        });
                    });
            });
            return data;
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

})();
