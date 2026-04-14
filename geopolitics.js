const STATS = ["Might", "Treasure", "Influence", "Territory", "Sovereignty"];
const GOVERNMENT_LIMITS = {
    Stratocracy: [5, 2, 3, 4, 4],
    "Martial Empire": [5, 4, 2, 4, 3],
    "Space Crusaders": [3, 2, 4, 5, 4],
    "Feudal Realm": [4, 4, 2, 5, 3],
    Megacorporation: [3, 5, 4, 4, 2],
    "Plutocratic Oligarchy": [3, 5, 2, 4, 4],
    "Fanatic Purifiers": [4, 2, 3, 4, 5],
    "Divine Mandate": [2, 4, 4, 3, 5],
    "Hegemonic Imperialists": [4, 2, 5, 4, 3],
    "Enigmatic Observers": [2, 4, 5, 3, 4],
};

const PACT_DESCRIPTIONS = {
    "Patto di Non-Aggressione": "Mutual promise to avoid direct conflict.",
    "Patto di Vassallaggio": "A feudal bond where one family rules and one submits.",
    "Patto Tributario": "A tributary pact exchanging autonomy for protection.",
    Rivalità: "An open rivalry that hardens both houses against each other.",
    "Accordo Commerciale": "A trade pact improving both houses' prosperity.",
    "Accordo di Migrazione": "A migration agreement supporting demographic growth.",
    Matrimonio: "A dynastic marriage strengthening diplomatic influence.",
    "Accordo Spelljammer": "Exclusive access to Carxus spelljamming expertise.",
    "Accordo di Finanziamento": "Preferential financing from Grayshine interests.",
    "Autorità Giudiziaria": "Judicial backing from Zolinath.",
    "Ricerca e Sviluppo": "Advanced research support from Shawel.",
    "Supporto Arcano": "Arcane aid from Ntsu.",
    "Patto Draconico": "Draconic support granted by Wueng.",
};

const PACT_COLORS = {
    Rivalità: "#ff7b72",
    "Patto di Vassallaggio": "#f6bd60",
    "Patto Tributario": "#ffd166",
    "Patto di Non-Aggressione": "#7bdff2",
    "Accordo Commerciale": "#90f1b8",
    "Accordo di Migrazione": "#bdb2ff",
    Matrimonio: "#ffafcc",
    "Accordo Spelljammer": "#a0c4ff",
    "Accordo di Finanziamento": "#caffbf",
    "Autorità Giudiziaria": "#fde68a",
    "Ricerca e Sviluppo": "#9bf6ff",
    "Supporto Arcano": "#cdb4db",
    "Patto Draconico": "#ffadad",
};

let familyData = [];
let pactsData = [];
let selectedFamilyName = null;

const familyStatsTable = document.getElementById("family-stats-table");
const graphSvg = document.getElementById("geopolitics-graph");
const graphCard = document.getElementById("geopolitics-graph-card");
const graphEmptyState = document.getElementById("graph-empty-state");
const selectedFamilyTitle = document.getElementById("graph-selected-family");
const selectedFamilySummary = document.getElementById("graph-selected-summary");
const selectedFamilyMeta = document.getElementById("graph-selected-meta");
const selectedFamilyPactsCount = document.getElementById("graph-pacts-count");
const selectedFamilyPactsList = document.getElementById("graph-pacts-list");
const addPactFormHost = document.getElementById("graph-add-pact-form");
const globalFiltersCount = document.getElementById("graph-global-count");
const globalFiltersList = document.getElementById("graph-global-filters-list");
const globalCallout = document.getElementById("graph-global-callout");

if (!familyStatsTable) {
    throw new Error("Element with id 'family-stats-table' not found.");
}

if (!graphSvg) {
    throw new Error("Element with id 'geopolitics-graph' not found.");
}

function sorterCallback(key) {
    if (key === "Government" || key === "Name") {
        familyData.sort((a, b) => (a[key] || "").localeCompare(b[key] || ""));
    } else {
        familyData.sort((a, b) => (b[key] || 0) - (a[key] || 0));
    }
    fillTableWithFamilyStats();
}

function totalPowerForFamily(family) {
    return STATS.reduce((sum, stat) => sum + (family[stat] || 0), 0);
}

function fillTableWithFamilyStats() {
    familyStatsTable.innerHTML = "";

    const rowHeader = document.createElement("tr");
    const nameHeader = document.createElement("th");
    nameHeader.textContent = "Family Name";
    nameHeader.style.cursor = "pointer";
    nameHeader.addEventListener("click", () => sorterCallback("Name"));
    rowHeader.appendChild(nameHeader);

    STATS.forEach(stat => {
        const statHeader = document.createElement("th");
        statHeader.textContent = stat;
        statHeader.style.cursor = "pointer";
        statHeader.addEventListener("click", () => sorterCallback(stat));
        rowHeader.appendChild(statHeader);
    });

    const rankHeader = document.createElement("th");
    rankHeader.textContent = "Rank";
    rankHeader.style.cursor = "pointer";
    rankHeader.addEventListener("click", () => sorterCallback("Rank"));
    rowHeader.appendChild(rankHeader);

    const governmentHeader = document.createElement("th");
    governmentHeader.textContent = "Government Type";
    governmentHeader.style.cursor = "pointer";
    governmentHeader.addEventListener("click", () => sorterCallback("Government"));
    rowHeader.appendChild(governmentHeader);

    familyStatsTable.appendChild(rowHeader);

    familyData.forEach(family => {
        const row = document.createElement("tr");
        const nameCell = document.createElement("td");
        nameCell.textContent = family.Name;
        nameCell.style.textAlign = "left";
        nameCell.onmouseover = () => {
            const relatedPacts = pactsData.filter(p => p.From === family.Name || p.To === family.Name);
            nameCell.title = [
                `Family: ${family.Name}`,
                `Planet: ${family.Planet || "N/A"}`,
                `Race: ${family.Race || "N/A"}`,
                ...relatedPacts.map(pact => `Pact: ${pact.Pact} (${pact.From} -> ${pact.To})`)
            ].join("\n");
        };
        row.appendChild(nameCell);

        STATS.forEach(stat => {
            const statCell = document.createElement("td");
            statCell.textContent = family[stat] || 0;
            const govLimit = family[`${stat}_goverment_limit`] || 0;
            const pactBonus = family[`${stat}_bonus_limit_from_pacts`] || 0;
            const totalLimit = govLimit + pactBonus;

            if ((family[stat] || 0) > totalLimit) {
                statCell.style.color = "gold";
            } else if ((family[stat] || 0) === totalLimit) {
                statCell.style.color = "#9ff0a4";
            }

            if ((family[stat] || 0) > govLimit && pactBonus > 0) {
                statCell.style.backgroundColor = "rgba(255, 255, 255, 0.08)";
            }

            statCell.onmouseover = () => {
                statCell.title = `${stat}: ${family[stat] || 0} (Limit: ${totalLimit} [Gov: ${govLimit} + Pacts: ${pactBonus}])`;
            };
            row.appendChild(statCell);
        });

        const rankCell = document.createElement("td");
        rankCell.textContent = totalPowerForFamily(family);
        row.appendChild(rankCell);

        const governmentCell = document.createElement("td");
        governmentCell.textContent = family.Government || "N/A";
        row.appendChild(governmentCell);

        familyStatsTable.appendChild(row);
    });
}

function checkSymmetry(pacts) {
    pacts.forEach(pact => {
        const reversePact = pacts.find(
            p => p.From === pact.To && p.To === pact.From && p.Pact === pact.Pact
        );
        if (!reversePact) {
            throw new Error(`Asymmetric pact found: ${pact.From} -> ${pact.To} (${pact.Pact}) has no reverse pact.`);
        }
    });
}

function chooseOneOfEachPair(pacts) {
    const seen = new Set();
    return pacts.filter(pact => {
        const pairKey = `${[pact.From, pact.To].sort().join("|")}|${pact.Pact}`;
        if (seen.has(pairKey)) {
            return false;
        }
        seen.add(pairKey);
        return true;
    });
}

function enforceDirection(pacts, from) {
    return pacts.filter(p => p.From === from);
}

function cleanPacts(rawPacts) {
    const normalized = rawPacts.map(pact => {
        if (pact.Pact === "Ricerca e Sviluppo da") {
            return { From: pact.From, Pact: "Ricerca e Sviluppo", To: pact.To };
        }

        if (pact.From === "Rasaily" && pact.Pact === "Patto di Vassallaggio su" && pact.To === "Wueng") {
            return { From: "Rasaily", Pact: "Patto di Vassallaggio da", To: "Wueng" };
        }

        return pact;
    });

    const cleaned = [];

    [
        "Accordo Commerciale",
        "Matrimonio",
        "Patto di Non-Aggressione",
        "Accordo di Migrazione"
    ].forEach(pactType => {
        const subset = normalized.filter(p => p.Pact === pactType);
        checkSymmetry(subset);
        cleaned.push(...chooseOneOfEachPair(subset));
    });

    [
        ["Accordo Spelljammer", "Carxus"],
        ["Accordo di Finanziamento", "Grayshine"],
        ["Autorità Giudiziaria", "Zolinath"],
        ["Ricerca e Sviluppo", "Shawel"],
        ["Supporto Arcano", "Ntsu"],
        ["Patto Draconico", "Wueng"],
    ].forEach(([pactType, familyFrom]) => {
        const subset = normalized.filter(p => p.Pact === pactType);
        checkSymmetry(subset);
        cleaned.push(...enforceDirection(subset, familyFrom));
    });

    ["Patto Tributario", "Patto di Vassallaggio"].forEach(pactType => {
        const fromPacts = normalized.filter(p => p.Pact === `${pactType} da`);
        const toPacts = normalized.filter(p => p.Pact === `${pactType} su`);

        const fromSet = new Set(fromPacts.map(p => `${p.From}|${p.To}`));
        const toSet = new Set(toPacts.map(p => `${p.To}|${p.From}`));
        if (fromSet.size !== toSet.size || ![...fromSet].every(item => toSet.has(item))) {
            throw new Error(`Asymmetric da/su pacts found for type: ${pactType}`);
        }

        cleaned.push(
            ...toPacts.map(p => ({
                From: p.To,
                Pact: pactType,
                To: p.From
            }))
        );
    });

    cleaned.push(...normalized.filter(p => p.Pact === "Rivalità"));
    return cleaned;
}

function enrichFamilies(families, cleanedPacts) {
    families.forEach(family => {
        const governmentType = family.Government;
        if (!governmentType || !GOVERNMENT_LIMITS[governmentType]) {
            return;
        }

        const relatedPacts = cleanedPacts.filter(p => p.From === family.Name || p.To === family.Name);
        const bonusLimits = [0, 0, 0, 0, 0];

        relatedPacts.forEach(pact => {
            switch (pact.Pact) {
                case "Rivalità":
                    if (family.Name === pact.From) {
                        bonusLimits[0] += 1;
                        bonusLimits[1] += 1;
                        bonusLimits[2] += 1;
                        bonusLimits[3] += 1;
                        bonusLimits[4] += 1;
                    }
                    break;
                case "Accordo Commerciale":
                    bonusLimits[1] += 1;
                    break;
                case "Accordo di Migrazione":
                    bonusLimits[3] += 1;
                    break;
                case "Matrimonio":
                    bonusLimits[2] += 1;
                    break;
                default:
                    break;
            }
        });

        STATS.forEach((stat, index) => {
            family[`${stat}_goverment_limit`] = GOVERNMENT_LIMITS[governmentType][index];
            family[`${stat}_bonus_limit_from_pacts`] = bonusLimits[index];
        });

        family.Rank = totalPowerForFamily(family);
    });
}

function pactColor(pactName) {
    return PACT_COLORS[pactName] || "#9ed0ff";
}

function pactDescription(pactName) {
    return PACT_DESCRIPTIONS[pactName] || "Diplomatic link between two families.";
}

function createToggleControl(checked, disabled = false) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "geo-toggle-input";
    checkbox.checked = checked;
    checkbox.disabled = disabled;

    const indicator = document.createElement("span");
    indicator.className = "geo-toggle-check";
    indicator.setAttribute("aria-hidden", "true");

    return { checkbox, indicator };
}

function createGraph(families, pacts) {
    const svgNS = "http://www.w3.org/2000/svg";
    graphSvg.innerHTML = "";

    const defs = document.createElementNS(svgNS, "defs");
    const edgeGlowFilter = document.createElementNS(svgNS, "filter");
    edgeGlowFilter.setAttribute("id", "edge-glow");
    edgeGlowFilter.innerHTML = '<feGaussianBlur stdDeviation="1.8" result="blur"></feGaussianBlur><feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>';
    defs.appendChild(edgeGlowFilter);
    graphSvg.appendChild(defs);

    const edgeLayer = document.createElementNS(svgNS, "g");
    const nodeLayer = document.createElementNS(svgNS, "g");
    graphSvg.appendChild(edgeLayer);
    graphSvg.appendChild(nodeLayer);

    const familyMap = new Map(families.map(family => [family.Name, family]));
    const baseWidth = Math.max(graphCard.clientWidth, 720);
    const baseHeight = 640;
    const centerX = baseWidth / 2;
    const centerY = baseHeight / 2;
    const radius = Math.min(baseWidth, baseHeight) * 0.34;

    const nodes = families.map((family, index) => {
        const angle = (Math.PI * 2 * index) / Math.max(families.length, 1);
        return {
            id: family.Name,
            family,
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
            vx: 0,
            vy: 0,
            radius: 18 + totalPowerForFamily(family) * 0.9,
            element: null,
            isDragging: false,
        };
    });

    const nodeMap = new Map(nodes.map(node => [node.id, node]));
    const globallyEnabledPacts = new Set([...new Set(pacts.map(pact => pact.Pact))]);
    const availablePactTypes = new Set([
        ...Object.keys(PACT_DESCRIPTIONS),
        ...pacts.map(pact => pact.Pact)
    ]);

    const edges = pacts
        .filter(pact => nodeMap.has(pact.From) && nodeMap.has(pact.To))
        .map((pact, index) => {
            return createEdgeRecord(pact, index);
        });

    const pactTypeCounts = edges.reduce((counts, edge) => {
        counts.set(edge.pact.Pact, (counts.get(edge.pact.Pact) || 0) + 1);
        return counts;
    }, new Map());

    function createEdgeRecord(pact, index) {
        const line = document.createElementNS(svgNS, "line");
        line.classList.add("graph-edge");
        line.style.stroke = pactColor(pact.Pact);
        line.style.filter = "url(#edge-glow)";
        line.dataset.edgeId = String(index);
        edgeLayer.appendChild(line);

        return {
            id: `${pact.From}|${pact.Pact}|${pact.To}|${index}`,
            pact,
            source: nodeMap.get(pact.From),
            target: nodeMap.get(pact.To),
            enabled: true,
            line,
        };
    }

    nodes.forEach(node => {
        const group = document.createElementNS(svgNS, "g");
        group.classList.add("graph-node");
        group.dataset.family = node.id;

        const circle = document.createElementNS(svgNS, "circle");
        circle.setAttribute("r", String(node.radius));

        const label = document.createElementNS(svgNS, "text");
        label.setAttribute("y", "4");
        label.textContent = node.id;

        const subtitle = document.createElementNS(svgNS, "text");
        subtitle.setAttribute("y", String(node.radius + 16));
        subtitle.setAttribute("class", "graph-node-subtitle");
        subtitle.textContent = node.family.Planet || "";

        group.appendChild(circle);
        group.appendChild(label);
        group.appendChild(subtitle);
        nodeLayer.appendChild(group);
        node.element = group;
    });

    let width = baseWidth;
    let height = baseHeight;
    let animationFrame = null;
    let activeDragNode = null;
    let suppressNextClick = false;

    function isEdgeActive(edge) {
        return edge.enabled && globallyEnabledPacts.has(edge.pact.Pact);
    }

    function reheatLayout(amount = 1.6) {
        nodes.forEach(node => {
            if (!node.isDragging) {
                node.vx *= amount;
                node.vy *= amount;
            }
        });
    }

    function updateViewBox() {
        width = Math.max(graphCard.clientWidth, 320);
        height = graphSvg.clientHeight || baseHeight;
        graphSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    }

    function clampNode(node) {
        const margin = node.radius + 16;
        node.x = Math.max(margin, Math.min(width - margin, node.x));
        node.y = Math.max(margin, Math.min(height - margin, node.y));
    }

    function updateEdgeAppearance() {
        edges.forEach(edge => {
            const touchesSelection = !selectedFamilyName
                || edge.pact.From === selectedFamilyName
                || edge.pact.To === selectedFamilyName;
            const isVisible = isEdgeActive(edge);
            edge.line.style.display = isVisible ? "block" : "none";
            edge.line.classList.toggle("is-dimmed", !touchesSelection);
            edge.line.classList.toggle("is-highlighted", !!selectedFamilyName && touchesSelection && isVisible);
        });

        nodes.forEach(node => {
            node.element.classList.toggle("is-selected", node.id === selectedFamilyName);
        });
    }

    function relatedEdgesForFamily(familyName) {
        return edges.filter(edge => edge.pact.From === familyName || edge.pact.To === familyName);
    }

    function renderAddPactForm(familyName) {
        if (!familyName) {
            addPactFormHost.innerHTML = '<p class="geo-add-pact-note">Select a family to create a new pact.</p>';
            return;
        }

        const familyOptions = families
            .filter(family => family.Name !== familyName)
            .sort((a, b) => a.Name.localeCompare(b.Name))
            .map(family => `<option value="${family.Name}">${family.Name}</option>`)
            .join("");

        const pactTypeOptions = [...availablePactTypes]
            .sort((a, b) => a.localeCompare(b))
            .map(pactType => `<option value="${pactType}">${pactType}</option>`)
            .join("");

        addPactFormHost.innerHTML = `
            <form id="graph-add-pact-form-inner" class="geo-add-pact-form">
                <label>
                    Counterparty
                    <select id="graph-add-pact-target">${familyOptions}</select>
                </label>
                <label>
                    Pact type
                    <select id="graph-add-pact-type">${pactTypeOptions}</select>
                </label>
                <button type="submit">Add pact</button>
                <p class="geo-add-pact-note">This updates the current graph locally and does not write back to Google Drive.</p>
            </form>
        `;

        const form = document.getElementById("graph-add-pact-form-inner");
        const targetSelect = document.getElementById("graph-add-pact-target");
        const pactTypeSelect = document.getElementById("graph-add-pact-type");

        form.addEventListener("submit", event => {
            event.preventDefault();

            const targetFamily = targetSelect.value;
            const pactType = pactTypeSelect.value;
            const duplicateEdge = edges.find(edge =>
                edge.pact.From === familyName &&
                edge.pact.To === targetFamily &&
                edge.pact.Pact === pactType
            );

            if (!targetFamily || !pactType || duplicateEdge) {
                return;
            }

            const newPact = {
                From: familyName,
                Pact: pactType,
                To: targetFamily
            };

            pactsData.push(newPact);
            availablePactTypes.add(pactType);
            globallyEnabledPacts.add(pactType);
            pactTypeCounts.set(pactType, (pactTypeCounts.get(pactType) || 0) + 1);
            edges.push(createEdgeRecord(newPact, edges.length));

            updateEdgeAppearance();
            renderGlobalFilters();
            reheatLayout(2.2);
            renderFamilyDetails(familyName);
        });
    }

    function renderFamilyDetails(familyName) {
        selectedFamilyName = familyName;
        updateEdgeAppearance();

        if (!familyName) {
            selectedFamilyTitle.textContent = "Choose a family";
            selectedFamilySummary.textContent = "Click a node in the graph to inspect its government, world, statistics, and active pacts.";
            selectedFamilyMeta.innerHTML = "";
            selectedFamilyPactsCount.textContent = "0";
            selectedFamilyPactsList.innerHTML = '<p class="geo-empty-copy">No family selected.</p>';
            renderAddPactForm(null);
            return;
        }

        const family = familyMap.get(familyName);
        const relatedEdges = relatedEdgesForFamily(familyName);

        selectedFamilyTitle.textContent = familyName;
        selectedFamilySummary.textContent = `${family.Government || "Unknown government"} on ${family.Planet || "an unknown world"}${family.Race ? `, led by the ${family.Race}.` : "."}`;
        const statLine = STATS.map(stat => `${stat}: ${family[stat] || 0}`).join("  ");
        selectedFamilyMeta.innerHTML = [
            ["Race", family.Race || "N/A"],
            ["Planet", family.Planet || "N/A"],
            ["Government", family.Government || "N/A"],
            ["Total Power", totalPowerForFamily(family)],
            ["Stats", statLine]
        ].map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join("");
        selectedFamilyPactsCount.textContent = String(relatedEdges.length);

        if (relatedEdges.length === 0) {
            selectedFamilyPactsList.innerHTML = '<p class="geo-empty-copy">This family has no visible pacts.</p>';
            renderAddPactForm(familyName);
            return;
        }

        selectedFamilyPactsList.innerHTML = "";
        relatedEdges
            .sort((a, b) => {
                const counterpartyA = a.pact.From === familyName ? a.pact.To : a.pact.From;
                const counterpartyB = b.pact.From === familyName ? b.pact.To : b.pact.From;
                return a.pact.Pact.localeCompare(b.pact.Pact) || counterpartyA.localeCompare(counterpartyB);
            })
            .forEach(edge => {
                const item = document.createElement("label");
                item.className = "geo-pact-toggle";

                const globallyDisabled = !globallyEnabledPacts.has(edge.pact.Pact);
                const isEffectiveEnabled = isEdgeActive(edge);
                const { checkbox, indicator } = createToggleControl(isEffectiveEnabled, globallyDisabled);
                checkbox.addEventListener("change", () => {
                    edge.enabled = checkbox.checked;
                    updateEdgeAppearance();
                    reheatLayout();
                    renderFamilyDetails(familyName);
                });

                const text = document.createElement("div");
                const counterparty = edge.pact.From === familyName ? edge.pact.To : edge.pact.From;
                text.innerHTML = `<strong>${edge.pact.Pact}</strong><span>${counterparty}</span><small>${pactDescription(edge.pact.Pact)}${globallyDisabled ? " Hidden by global filter." : ""}</small>`;

                const swatch = document.createElement("span");
                swatch.className = "geo-pact-swatch";
                swatch.style.color = pactColor(edge.pact.Pact);
                swatch.style.backgroundColor = pactColor(edge.pact.Pact);

                item.classList.toggle("is-inactive", !isEffectiveEnabled);
                item.classList.toggle("is-globally-disabled", globallyDisabled);
                item.appendChild(checkbox);
                item.appendChild(indicator);
                item.appendChild(text);
                swatch.classList.toggle("is-off", !isEffectiveEnabled);
                item.appendChild(swatch);
                selectedFamilyPactsList.appendChild(item);
            });

        renderAddPactForm(familyName);
    }

    function renderGlobalFilters() {
        const pactTypes = [...pactTypeCounts.keys()].sort((a, b) => a.localeCompare(b));
        globalFiltersCount.textContent = String(pactTypes.length);
        globalFiltersList.innerHTML = "";
        globalCallout.hidden = true;

        function showGlobalCallout(event, pactType) {
            const matchingEdges = edges
                .filter(edge => edge.pact.Pact === pactType)
                .map(edge => `${edge.pact.From} -> ${edge.pact.To}`);

            globalCallout.innerHTML = `
                <strong>${pactType}</strong>
                ${matchingEdges.map(label => `<span>${label}</span>`).join("") || "<span>No pacts</span>"}
            `;

            const filtersRect = globalFiltersList.getBoundingClientRect();
            const itemRect = event.currentTarget.getBoundingClientRect();
            const top = itemRect.bottom - filtersRect.top + 8;
            const left = Math.max(0, Math.min(itemRect.left - filtersRect.left, filtersRect.width - 320));

            globalCallout.style.top = `${top}px`;
            globalCallout.style.left = `${left}px`;
            globalCallout.hidden = false;
        }

        function hideGlobalCallout() {
            globalCallout.hidden = true;
        }

        pactTypes.forEach(pactType => {
            const item = document.createElement("label");
            item.className = "geo-global-filter-item";

            const { checkbox, indicator } = createToggleControl(globallyEnabledPacts.has(pactType));
            checkbox.addEventListener("change", () => {
                if (checkbox.checked) {
                    globallyEnabledPacts.add(pactType);
                } else {
                    globallyEnabledPacts.delete(pactType);
                }
                updateEdgeAppearance();
                reheatLayout();
                if (selectedFamilyName) {
                    renderFamilyDetails(selectedFamilyName);
                }
            });

            const label = document.createElement("span");
            label.textContent = pactType;

            const count = document.createElement("small");
            count.textContent = `${pactTypeCounts.get(pactType)} edges`;

            item.classList.toggle("is-inactive", !checkbox.checked);
            checkbox.addEventListener("change", () => {
                item.classList.toggle("is-inactive", !checkbox.checked);
            });

            item.appendChild(checkbox);
            item.appendChild(indicator);
            item.appendChild(label);
            item.appendChild(count);
            item.addEventListener("mouseenter", event => showGlobalCallout(event, pactType));
            item.addEventListener("mouseleave", hideGlobalCallout);
            item.addEventListener("focusin", event => showGlobalCallout(event, pactType));
            item.addEventListener("focusout", hideGlobalCallout);
            globalFiltersList.appendChild(item);
        });
    }

    function renderPositions() {
        edges.forEach(edge => {
            edge.line.setAttribute("x1", edge.source.x);
            edge.line.setAttribute("y1", edge.source.y);
            edge.line.setAttribute("x2", edge.target.x);
            edge.line.setAttribute("y2", edge.target.y);
        });

        nodes.forEach(node => {
            node.element.setAttribute("transform", `translate(${node.x}, ${node.y})`);
        });
    }

    function tick() {
        const attraction = 0.00045;
        const repulsion = 18000;
        const centerPull = 0.0009;
        const damping = 0.92;

        for (let i = 0; i < nodes.length; i += 1) {
            const a = nodes[i];
            for (let j = i + 1; j < nodes.length; j += 1) {
                const b = nodes[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const distanceSq = Math.max(dx * dx + dy * dy, 64);
                const force = repulsion / distanceSq;
                const distance = Math.sqrt(distanceSq);
                const fx = (dx / distance) * force;
                const fy = (dy / distance) * force;

                if (!a.isDragging) {
                    a.vx -= fx;
                    a.vy -= fy;
                }
                if (!b.isDragging) {
                    b.vx += fx;
                    b.vy += fy;
                }
            }
        }

        edges.forEach(edge => {
            if (!isEdgeActive(edge)) {
                return;
            }
            const dx = edge.target.x - edge.source.x;
            const dy = edge.target.y - edge.source.y;
            const distance = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const idealDistance = 120 + (edge.source.radius + edge.target.radius) * 0.6;
            const displacement = distance - idealDistance;
            const fx = dx * displacement * attraction;
            const fy = dy * displacement * attraction;

            if (!edge.source.isDragging) {
                edge.source.vx += fx;
                edge.source.vy += fy;
            }
            if (!edge.target.isDragging) {
                edge.target.vx -= fx;
                edge.target.vy -= fy;
            }
        });

        nodes.forEach(node => {
            if (!node.isDragging) {
                node.vx += (width / 2 - node.x) * centerPull;
                node.vy += (height / 2 - node.y) * centerPull;
                node.vx *= damping;
                node.vy *= damping;
                node.x += node.vx;
                node.y += node.vy;
                clampNode(node);
            }
        });

        renderPositions();
        animationFrame = window.requestAnimationFrame(tick);
    }

    function pointerPosition(event) {
        const rect = graphSvg.getBoundingClientRect();
        const scaleX = width / rect.width;
        const scaleY = height / rect.height;
        return {
            x: (event.clientX - rect.left) * scaleX,
            y: (event.clientY - rect.top) * scaleY,
        };
    }

    nodes.forEach(node => {
        node.element.addEventListener("click", event => {
            if (suppressNextClick) {
                suppressNextClick = false;
                return;
            }
            if (activeDragNode) {
                return;
            }
            event.stopPropagation();
            renderFamilyDetails(node.id);
        });

        node.element.addEventListener("pointerdown", event => {
            event.preventDefault();
            event.stopPropagation();
            activeDragNode = node;
            node.isDragging = true;
            node.vx = 0;
            node.vy = 0;
            node.dragStartX = node.x;
            node.dragStartY = node.y;
            graphSvg.classList.add("is-dragging");
            node.element.setPointerCapture(event.pointerId);
        });

        node.element.addEventListener("pointermove", event => {
            if (activeDragNode !== node) {
                return;
            }
            const next = pointerPosition(event);
            node.x = next.x;
            node.y = next.y;
            clampNode(node);
            renderPositions();
        });

        node.element.addEventListener("pointerup", event => {
            if (activeDragNode !== node) {
                return;
            }
            const moved = Math.hypot(node.x - node.dragStartX, node.y - node.dragStartY) > 6;
            suppressNextClick = moved;
            node.isDragging = false;
            activeDragNode = null;
            graphSvg.classList.remove("is-dragging");
            node.element.releasePointerCapture(event.pointerId);
        });

        node.element.addEventListener("pointercancel", () => {
            node.isDragging = false;
            activeDragNode = null;
            suppressNextClick = false;
            graphSvg.classList.remove("is-dragging");
        });
    });

    graphSvg.addEventListener("click", () => renderFamilyDetails(null));

    updateViewBox();
    renderGlobalFilters();
    renderFamilyDetails(null);
    renderPositions();
    tick();

    const handleResize = () => {
        updateViewBox();
        nodes.forEach(clampNode);
        renderPositions();
    };

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(handleResize);
        resizeObserver.observe(graphCard);
    } else {
        window.addEventListener("resize", handleResize);
    }

    return {
        destroy() {
            if (animationFrame) {
                window.cancelAnimationFrame(animationFrame);
            }
            if (resizeObserver) {
                resizeObserver.disconnect();
            } else {
                window.removeEventListener("resize", handleResize);
            }
        }
    };
}

document.addEventListener("DOMContentLoaded", async () => {
    try {
        familyData = await window.fetchFamiliesData();
        pactsData = cleanPacts(await window.fetchPactsData());

        enrichFamilies(familyData, pactsData);
        familyData.sort((a, b) => (a.Name || "").localeCompare(b.Name || ""));

        fillTableWithFamilyStats();
        createGraph(familyData, pactsData);
    } catch (error) {
        console.error("Error loading geopolitics page:", error);
        graphEmptyState.hidden = false;
        selectedFamilyTitle.textContent = "Unable to load graph";
        selectedFamilySummary.textContent = "The page could not build the network from the Google Drive data.";
    }
});
