// Central parser and fetch utilities for the app
// Provides functions to fetch and parse data from Google Sheets
(function(){
    const cacheInstance = (typeof BrowserCache !== 'undefined') ? new BrowserCache('stardom', 1) : null;

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
     * Parse a CSV text into a dataframe-like structure (array of objects).
     * @param {*} csvText - The CSV text to parse. The first row should contain headers.
     * @returns {Array<Object>} - Parsed data.
     */
    function parseDataframe(csvText) {
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
    window.fetchTimelineData = fetchTimelineData;
    window.fetchFamiliesData = fetchFamiliesData;
    window.fetchCourtMembers = fetchCourtMembers;
    window.fetchCompanyAssets = fetchCompanyAssets;
    window.fetchBonuses = fetchBonuses;
    window.fetchPactsData = fetchPactsData;

})();
