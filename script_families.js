// `qualities` (flavor-text phrase bank) is defined once in parser.js and shared
// with index.html via window.qualities, since both pages generate stat-based
// flavor text from the same phrase bank.
const qualities = window.qualities;

const treatyDescriptions = {
    "Alleanza Militare": {
        description: "Un patto di ferro che lega due famiglie nel sangue e nella guerra, giurando di difendersi reciprocamente contro ogni minaccia.",
        effects: "I due partiti difendono e assistono il proprio alleato in qualsiasi questione militare. L'attaccante deve affrontare entrambe le famiglie contemporaneamente.",
        category: "relational"
    },
    "Patto di Non-Aggressione": {
        description: "Un giuramento solenne che proibisce ai firmatari di alzare le armi l'uno contro l'altro, sigillato sotto gli occhi degli dei.",
        effects: "I due partiti non possono attaccarsi reciprocamente. Se trascinati in guerra da alleati, il patto è rotto. Blocca le opzioni di attacco diretto nelle scelte.",
        category: "relational"
    },
    "Trattato di Neutralità": {
        description: "Un accordo diplomatico che impone ai firmatari di rimanere imparziali nei conflitti che non li riguardano direttamente.",
        effects: "I partiti si impegnano a non aiutare fazioni nemiche o ostili l'uno dell'altro. Non possono essere trascinati in guerre contro altre famiglie.",
        category: "relational"
    },
    "Patto di Vassallaggio": {
        description: "Un vincolo feudale dove una famiglia si sottomette a un'altra in cambio di protezione e sostegno militare.",
        effects: "Signore: +2 Bonus Territory. Vassallo: +2 Bonus Might, massimo Sovereignty scende a 3. Include automaticamente alleanza militare e patto di non-aggressione.",
        category: "relational"
    },
    "Patto Tributario": {
        description: "Un vincolo feudale dove una famiglia si sottomette a un'altra in cambio di protezione e sostegno militare.",
        effects: "Signore: +2 Bonus Treasure. Vassallo: +2 Bonus Might, massimo Treasure scende a 3. Include automaticamente alleanza militare e patto di non-aggressione.",
        category: "relational"
    },
    "Rivalità": {
        description: "Una dichiarazione pubblica di rivalità, dove l'onore di una famiglia può essere restaurato solo attraverso la distruzione dell'altra.",
        effects: "+1 a tutti i limiti massimi delle statistiche. La famiglia rivale ottiene +1 bonus a tutte le azioni ostili contro di te.",
        category: "relational"
    },
    "Accordo Commerciale": {
        description: "Un'alleanza mercantile che apre le rotte commerciali e crea prosperità condivisa tra i firmatari.",
        effects: "+1 limite massimo Treasure per entrambi i partiti.",
        category: "benefit"
    },
    "Accordo di Migrazione": {
        description: "Un patto che regola il flusso di popolazioni tra territori, permettendo espansione controllata e crescita demografica.",
        effects: "+1 limite massimo Territory per entrambi i partiti.",
        category: "benefit"
    },
    "Matrimonio": {
        description: "Un'unione di sangue che lega due casate attraverso matrimoni strategici, aumentando il prestigio e l'influenza reciproca.",
        effects: "+1 limite massimo Influence per entrambi i partiti.",
        category: "benefit"
    },
    "Accordo Spelljammer": {
        description: "Un contratto esclusivo con i maestri costruttori che garantisce accesso alle loro avanzate tecnologie navali.",
        effects: "Sblocca azione 'Innalza la Flotta'.",
        category: "unique"
    },
    "Accordo di Finanziamento": {
        description: "Un patto faustiano con i signori della ricchezza che permette espansione immediata in cambio di debiti futuri.",
        effects: "Può aumentare Treasure di +1 istantaneamente. Ottieni risorsa 'Debiti' (conseguenze negative future).",
        category: "unique"
    },
    "Supporto Arcano": {
        description: "Un'alleanza con i custodi della magia antica che garantisce accesso ai segreti più profondi dell'arcano.",
        effects: "Ottieni asset 'Maghi di Ion'.",
        category: "unique"
    },
    "Patto Draconico": {
        description: "Un patto di sangue con i signori dei draghi che garantisce l'aiuto delle bestie più terribili dello spazio.",
        effects: "Ottieni asset 'Bestie di Tiamat'.",
        category: "unique"
    },
    "Rete Alternativa": {
        description: "Un accordo mercantile ricco di opportunitá non ovvie.",
        effects: "Ottieni asset 'Contatti con i Baroni'.",
        category: "unique"
    },
    "Autorità Giudiziaria": {
        description: "Un'alleanza con i custodi della giustizia che garantisce legittimità legale e precedenti giuridici.",
        effects: "Ottieni asset 'Purità Statale'.",
        category: "unique"
    },
    "Ricerca e Sviluppo": {
        description: "Una alleanza che garantisce accesso a oggetti e tecnologie avanzate.",
        effects: "Ottieni asset 'Ricerca e Sviluppo'.",
        category: "unique"
    }
};

let pactsData = {};
let familyStats = {};

document.addEventListener('DOMContentLoaded', async () => {

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

    // Get treaty info
    function getTreatyInfo(treatyName) {
        // Try exact match first
        if (treatyDescriptions[treatyName]) {
            return treatyDescriptions[treatyName];
        }
        
        // Try partial matches for common variations
        for (let key in treatyDescriptions) {
            if (treatyName.includes(key) || key.includes(treatyName)) {
                return treatyDescriptions[key];
            }
        }
        
        return {
            description: "Trattato specifico della famiglia.",
            effects: "Effetti da determinare.",
            category: "unique"
        };
    }

    // Create modal for showing pacts
    function createPactsModal() {
        const modal = document.createElement('div');
        modal.id = 'pactsModal';
        modal.className = 'pacts-modal';
        modal.innerHTML = `
            <div class="pacts-modal-content">
                <span class="pacts-close">&times;</span>
                <h2 id="pactsTitle">Trattati</h2>
                <div id="pactsList"></div>
            </div>
        `;
        document.body.appendChild(modal);

        // Close modal events
        modal.querySelector('.pacts-close').onclick = () => {
            modal.style.display = 'none';
        };
        
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };

        return modal;
    }

    // Show pacts modal
    function showPacts(familyName, pacts, totalPower) {
        let modal = document.getElementById('pactsModal');
        if (!modal) {
            modal = createPactsModal();
        }

        const title = modal.querySelector('#pactsTitle');
        const list = modal.querySelector('#pactsList');

        title.textContent = `Trattati ${familyName} (Forza totale: ${totalPower})`;
        
        if (pacts && pacts.length > 0) {
            list.innerHTML = pacts.map((pact, index) => {
                const treatyName = pact.Pact;
                const treatyInfo = getTreatyInfo(treatyName);
                
                return `
                    <div class="pact-item ${treatyInfo.category}" onclick="toggleDescription(${index})">
                        <div class="pact-header">
                            <span class="pact-title">${pact.Pact} (${pact.To})</span>
                            <span class="pact-toggle">▼</span>
                        </div>
                        <div class="pact-description" id="desc-${index}" style="display: none;">
                            <div class="pact-desc-text"><strong>Descrizione:</strong> ${treatyInfo.description}</div>
                            <div class="pact-effects"><strong>Effetti:</strong> ${treatyInfo.effects}</div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            list.innerHTML = '<div class="pact-item">Nessun trattato attivo</div>';
        }

        modal.style.display = 'block';
    }

    // Toggle description visibility
    window.toggleDescription = function(index) {
        const desc = document.getElementById(`desc-${index}`);
        const toggle = desc.parentElement.querySelector('.pact-toggle');
        
        if (desc.style.display === 'none') {
            desc.style.display = 'block';
            toggle.textContent = '▲';
        } else {
            desc.style.display = 'none';
            toggle.textContent = '▼';
        }
    };

    // Fetch both datasets
    const familyData = await window.fetchFamiliesData();
    pactsData = await window.fetchPactsData();

    // Process each family
    familyData.forEach(family => {
        const familyName = (family.Name || "").trim().toLowerCase();
        const entry = Array.from(document.querySelectorAll('.family-entry')).find(e =>
            e.querySelector('.family-name') &&
            e.querySelector('.family-name').textContent.trim().toLowerCase() === familyName
        );
        if (entry) {
            // Set government type
            const govElem = entry.querySelector('.family-government')
            const familyGovernment = family.Government
            const familyPlanet = family.Planet
            if (govElem) govElem.textContent = `${familyGovernment} of ${familyPlanet}` || "";

            // Existing logic for total power and description
            const totalPowerElement = entry.querySelector('.family-total-power');
            const descriptionElement = entry.querySelector('.family-generated-description');

            const relevantStats = ["Might", "Treasure", "Influence", "Territory", "Sovereignty"];
            const totalPower = relevantStats.reduce((sum, stat) => {
                const value = family[stat];
                return typeof value === "number" ? sum + value : sum;
            }, 0);

            const stats = relevantStats.reduce((obj, stat) => {
                obj[stat] = family[stat];
                return obj;
            }, {});

            // Store family stats for modal
            familyStats[family.Name] = totalPower;

            const descriptionPhrase = generateFamilyDescription(stats);

            if (totalPowerElement) {
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
                
                // Add click event for showing pacts (no hover tooltip)
                totalPowerElement.style.cursor = 'pointer';
                totalPowerElement.onclick = () => {
                    const displayName = entry.querySelector('.family-name').textContent.trim();
                    const pacts = pactsData.filter(p => p['From'].trim().toLowerCase() === displayName.trim().toLowerCase());
                    showPacts(displayName, pacts, totalPower);
                };
            }
            if (descriptionElement) descriptionElement.textContent = descriptionPhrase;
        }
    });
});