const SOLAR_SYSTEM_DATA = [
    {
        "ID": "sun",
        "Name": "Sun",
        "OrbitAround": "",
        "Color": "#FFFFFF",
        "Owner": "",
        "Descr": "The central star of the system, providing light and energy to all orbiting bodies."
    },
    {
        "ID": "wandacker",
        "Name": "Wandacker",
        "OrbitAround": "sun",
        "Period": 84,
        "DistanceFromParent": 490,
        "Color": "#FF5B01",
        "Owner": "Amoako",
        "Descr": "Una delle famiglie più potenti, non vivono sul pianeta stesso, infestato da gnoll. Invece, appaltano navi, equipaggiamenti e altre risorse a contractor suicidi che cercano costantemente di fare il colpo grosso e raccogliere qualcosa di prezioso dalla superficie di Wandacker."
    },
    {
        "ID": "tebara",
        "Name": "Tebara",
        "OrbitAround": "wandacker",
        "Period": 4*10/3+20,
        "DistanceFromParent": 8*4+2.5,
        "Color": "#F502DC",
        "Owner": "Caillot",
        "Descr": "Una società aristocratica schiavista che coltiva la maggior parte del cibo per il sistema."
    },
    {
        "ID": "tophadus",
        "Name": "Tophadus",
        "OrbitAround": "ion",
        "Period": 3*10/3+20,
        "DistanceFromParent": 8*3+2.5,
        "Color": "#00CB6E",
        "Owner": "Carxus",
        "Descr": "L'acqua è il luogo da cui provengono le navi. Una luna oceanica dove i Carxus hanno costruito per la prima volta i loro grandi warjammers, navi che ora dominano il sistema."
    },
    {
        "ID": "pti_26",
        "Name": "Prot Blanc",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 1725.70,
        "Color": "#00CB6E",
        "Owner": "Carxus",
        "Descr": "Una piccola stazione stellare nascosta tra gli asteroidi, famosa per essere il luogo in cui i Carxus testano le loro nuove navi e armamenti."
    },
    {
        "ID": "pti_19",
        "Name": "L'alleanza",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 805.70-20,
        "Color": "#E7E2FD",
        "Owner": "Confraternita",
        "Descr": "Questa base spaziale, neutrale a tutte le famiglie, è la sede della confraternita e il luogo dove la maggioranza delle trattative ha luogo in caso di conflitti."
    },
    {
        "ID": "pti_9",
        "Name": "Gith Crèche X'ller",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 604.70,
        "Color": "#FADEA5",
        "Owner": "Gith",
        "Descr": "Una fortezza costruita su un'unione di asteroidi e resti di spelljammer che hanno tentato di avvicinarsi troppo a questa base nel mondo reale dei gith."
    },
    {
        "ID": "enov",
        "Name": "Enov",
        "OrbitAround": "draconia",
        "Period": 1*10/3+20,
        "DistanceFromParent": 8*1+2.5,
        "Color": "#C005ED",
        "Owner": "Grayshine",
        "Descr": "Qualcosa di più simile a una fortezza che a un pianeta, in cui si nascondono ricchezze oltre ogni immaginazione. Il pianeta è la riserva di tutte le risorse del sistema."
    },
    {
        "ID": "aepra",
        "Name": "Aepra",
        "OrbitAround": "saltar",
        "Period": 1*10/3+20,
        "DistanceFromParent": 8*1+2.5,
        "Color": "#F58900",
        "Owner": "Hai",
        "Descr": "Una luna governata fino a poco tempo fa da una guerra civile costante; ora una nuova famiglia cerca di destreggiarsi tra odi secolari e l'influenza dei potenti e vicini Ousssek."
    },
    {
        "ID": "xan",
        "Name": "Xan",
        "OrbitAround": "sun",
        "Period": 96,
        "DistanceFromParent": 1190,
        "Color": "#F41500",
        "Owner": "Heretics",
        "Descr": "Terra degli eretici."
    },
    {
        "ID": "taliotis",
        "Name": "Taliotis",
        "OrbitAround": "xan",
        "Period": 1*10/3+20,
        "DistanceFromParent": 8*1+2.5,
        "Color": "#F41500",
        "Owner": "Heretics",
        "Descr": "Terra degli eretici."
    },
    {
        "ID": "nereis",
        "Name": "Nereis",
        "OrbitAround": "xan",
        "Period": 2*10/3+20,
        "DistanceFromParent": 8*2+2.5,
        "Color": "#F41500",
        "Owner": "Heretics",
        "Descr": "Terra degli eretici."
    },
    {
        "ID": "progomeneus",
        "Name": "Progomeneus",
        "OrbitAround": "xan",
        "Period": 3*10/3+20,
        "DistanceFromParent": 8*3+2.5,
        "Color": "#F41500",
        "Owner": "Heretics",
        "Descr": "Terra degli eretici."
    },
    {
        "ID": "hophus",
        "Name": "Hophus",
        "OrbitAround": "wandacker",
        "Period": 2*10/3+20,
        "DistanceFromParent": 8*2+2.5,
        "Color": "#FFCF01",
        "Owner": "Kesk",
        "Descr": "Oscurità e dolore sono sovrani su questa luna senza sole."
    },
    {
        "ID": "jetaras",
        "Name": "Jetaras",
        "OrbitAround": "sun",
        "Period": 24,
        "DistanceFromParent": 120,
        "Color": "#7405ED",
        "Owner": "Mitsumoro",
        "Descr": "Un deserto circonda tre ultra-città da miliardi di abitanti, dominate da una gerarchia sociale immutabile."
    },
    {
        "ID": "pti_8",
        "Name": "Ceneris",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 809.70,
        "Color": "#7405ED",
        "Owner": "Mitsumoro",
        "Descr": "La colonia mineraria più popolosa del sistema, Ceneris è anche un porto neutrale utile per aggirare embarghi e tariffe tra le varie famiglie."
    },
    {
        "ID": "brion7",
        "Name": "Brion 7",
        "OrbitAround": "sun",
        "Period": 108,
        "DistanceFromParent": 1990,
        "Color": "#C0B3FA",
        "Owner": "Nobody",
        "Descr": "Un pianeta schermato, che protegge (o intrappola) qualcosa mai visto."
    },
    {
        "ID": "ion",
        "Name": "Ion",
        "OrbitAround": "sun",
        "Period": 60,
        "DistanceFromParent": 340,
        "Color": "#613C24",
        "Owner": "Ntsu",
        "Descr": "Montagne aride e fredde circondano il Faro della Conoscenza, l'unica università di magia del sistema. Qui vengono formati alcuni dei più grandi maghi dei nostri tempi."
    },
    {
        "ID": "pti_14",
        "Name": "Khraeel-II",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 434.70,
        "Color": "#613C24",
        "Owner": "Ntsu",
        "Descr": "L'uscita di un progetto arcano di complessità leggendaria un portale spaziale perenne per spelljammer."
    },
    {
        "ID": "pti_35",
        "Name": "Colonia B-34",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 2150.70,
        "Color": "#613C24",
        "Owner": "Ntsu",
        "Descr": "Una prigione arcana, in cui sono rinchiusi maghi di potenza leggendaria che hanno trasgredito ai voleri della Casata Perenne."
    },
    {
        "ID": "saltar",
        "Name": "Saltar",
        "OrbitAround": "sun",
        "Period": 72,
        "DistanceFromParent": 390,
        "Color": "#C160FF",
        "Owner": "Ousssek",
        "Descr": "Un pianeta che può essere attraversato a piedi, dove le città si espandono in profondità piuttosto che in larghezza. Letale se lasciata incontrollata, qui gli Ousssek tramano i loro grandi piani di dominio."
    },
    {
        "ID": "pti_18",
        "Name": "Tela Kindori",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 859.70-20,
        "Color": "#C160FF",
        "Owner": "Ousssek",
        "Descr": "Una stazione di caccia per Kindori."
    },
    {
        "ID": "pti_23",
        "Name": "Tela dell'Oro",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 1449.70,
        "Color": "#C160FF",
        "Owner": "Ousssek",
        "Descr": "Una stazione mineraria primaria per l'esportazione di oro."
    },
    {
        "ID": "tithion",
        "Name": "Tithion",
        "OrbitAround": "draconia",
        "Period": 2*10/3+20,
        "DistanceFromParent": 8*2+2.5,
        "Color": "#00B3F5",
        "Owner": "Rasaily",
        "Descr": "Casa delle orde di orchi che così spesso discendono nel sistema, sotto il comando dei loro leader, per soddisfare la loro sete di sangue uccidendo e sottomettendo pianeti ribelli."
    },
    {
        "ID": "allenia",
        "Name": "Allenia",
        "OrbitAround": "saltar",
        "Period": 2*10/3+20,
        "DistanceFromParent": 8*2+2.5,
        "Color": "#00F542",
        "Owner": "Rivera",
        "Descr": "Il ghiaccio e il gelo non hanno fermato la natura su questa luna. Un mondo-prigione, qui vengono mandati tutti gli indesiderabili a vivere in una brutale società di tribù goblinoidi in guerra per gli scarti che i loro padroni lasciano."
    },
    {
        "ID": "enides",
        "Name": "Enides",
        "OrbitAround": "wandacker",
        "Period": 1*10/3+20,
        "DistanceFromParent": 8*1+2.5,
        "Color": "#00EEFA",
        "Owner": "Shawel",
        "Descr": "Un centro di ricerca e creazione, gli Shawel sono una famiglia che ha sempre eccelso nella creazione di manufatti magici."
    },
    {
        "ID": "calichi",
        "Name": "Calichi",
        "OrbitAround": "saltar",
        "Period": 3*10/3+20,
        "DistanceFromParent": 8*3+2.5,
        "Color": "#F5AE01",
        "Owner": "Sifu",
        "Descr": "Nulla è stabile qui tranne la distruzione costante. Costantemente colpita da disastri naturali, questa società vive per sopravvivere un altro giorno."
    },
    {
        "ID": "pti_10",
        "Name": "Lo slancio",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 1422.70,
        "Color": "#E7AFF9",
        "Owner": "Spunnik",
        "Descr": "L'unica base degli spunnik all'interno dell'opazio. La usano come base commerciale per le loro esplorazioni - un punto per raccogliere velocemente le provviste necessarie - che si espandono oltre l'opazio stesso."
    },
    {
        "ID": "pti_1",
        "Name": "The Suneye",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 61.70,
        "Color": "#F697D8",
        "Owner": "Stability Commission",
        "Descr": "Una base stellare dedicata alla ricerca di fluttuazioni provenienti dal sole, data una forza elementale sfuggita alle sue fiamme dopo il cataclisma."
    },
    {
        "ID": "hoter",
        "Name": "Hoter",
        "OrbitAround": "ion",
        "Period": 1*10/3+20,
        "DistanceFromParent": 8*1+2.5,
        "Color": "#7EFA00",
        "Owner": "Stozav",
        "Descr": "Una luna di gas governata da navi che fluttuano sulla sua superficie, filtrando e raccogliendo un potente afrodisiaco usato dagli stozav per creare le loro sostanze potenziate."
    },
    {
        "ID": "hellcoast",
        "Name": "Hellcoast",
        "OrbitAround": "sun",
        "Period": 12,
        "DistanceFromParent": 100,
        "Color": "#FE4402",
        "Owner": "Sudriz",
        "Descr": "La miniera fiammeggiante, dove un'intera popolazione è dedicata all'estrazione dei rari minerali che alimentano gli armamenti dei warjammers."
    },
    {
        "ID": "void",
        "Name": "The Void",
        "OrbitAround": "sun",
        "Period": 36,
        "DistanceFromParent": 140,
        "Color": "#F8FE75",
        "Owner": "The Custodians",
        "Descr": "Ciò che rimane di ciò che una volta era. Il vuoto è ora una fonte costante di invasioni demoniache, e spetta ai custodi assicurarsi che non sfuggano nello spazio più ampio. I custodi vivono nella piccola città-roccia di Bral."
    },
    {
        "ID": "elbethel",
        "Name": "El-beth-el",
        "OrbitAround": "wandacker",
        "Period": 3*10/3+20,
        "DistanceFromParent": 8*3+2.5,
        "Color": "#CC6E35",
        "Owner": "The Hand",
        "Descr": "Quattro regni su un pianeta con un unico padrone su tutti. La Mano è un nuovo arrivato nel sistema e deve rapidamente bilanciare tutti i problemi brucianti e distruttivi lasciati dai loro predecessori."
    },
    {
        "ID": "pti_25",
        "Name": "Stazione Mineraria Gemma A",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 1472.70,
        "Color": "#DCF59D",
        "Owner": "Waytir-Yugani",
        "Descr": "Una delle stazioni minerarie più proficue e ricche dell'intero sistema, e il gioiello della Waytir-Yugani."
    },
    {
        "ID": "draconia",
        "Name": "Draconia",
        "OrbitAround": "sun",
        "Period": 48,
        "DistanceFromParent": 180,
        "Color": "#0576ED",
        "Owner": "Wueng",
        "Descr": "Draghi e avidità governano questa terra, ma i veri re di questo pianeta sono i possenti eserciti dei Wueng, che piegano tutti al loro volere."
    },
    {
        "ID": "pti_4",
        "Name": "Khraeel-I",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 160.70,
        "Color": "#0576ED",
        "Owner": "Wueng",
        "Descr": "L'ingresso di un progetto arcano di complessità leggendaria un portale spaziale perenne per spelljammer."
    },
    {
        "ID": "pti_21",
        "Name": "Il Tiratore",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 874.70,
        "Color": "#0576ED",
        "Owner": "Wueng",
        "Descr": "Una gigantesca base militare dei Wueng, dedicata alla crociata perenne contro gli eretici. Significativa in quanto è anche uno dei pochi posti in cui è presente un'arma interplanetaria, capace di attaccare direttamente altri oggetti nel sistema, indipendentemente dalla distanza."
    },
    {
        "ID": "zimurn",
        "Name": "Zimurn",
        "OrbitAround": "ion",
        "Period": 2*10/3+20,
        "DistanceFromParent": 8*2+2.5,
        "Color": "#FB005F",
        "Owner": "Zolinath",
        "Descr": "Isole fluttuanti ospitano una legge radicata. Una società in cui la legge è tutto, e la deviazione è il più grande crimine."
    },
    {
        "ID": "pti_13",
        "Name": "Sogno della Pace",
        "OrbitAround": "sun",
        "Period": (1200*108)/700,
        "DistanceFromParent": 871.70+20,
        "Color": "#C340FF",
        "Owner": "Mercanti di Giada",
        "Descr": "Un Hotel fluttuante su una roccia nello spazio usata spesso come base per incontri fra le diverse famiglie."
    }
];

// This function will compute the positions of celestial bodies based on the month
// and return a dictionary {id:(position)}.
// Note that some bodies may orbit around other bodies, so their positions depend on their parent's position.
// Hence, a hierarchical computation may be necessary.
function computeAllPositions(month) {
    let computedPositions = {};
    SOLAR_SYSTEM_DATA.forEach(body => {
        computedPositions[body.ID] = computeBodyPosition(body, month, computedPositions);
    });
    return computedPositions;
}

function computeBodyPosition(body, month, computedPositions) {
    // If the position is already computed, return it
    if (computedPositions[body.ID]) {
        return computedPositions[body.ID];
    }

    
    if (body.ID === "sun") {
        return {x: 5000, y: 5000}; // Center of the SVG
    }
    
    const parentBody = SOLAR_SYSTEM_DATA.find(b => b.ID === body.OrbitAround);
    const parentPosition = computeBodyPosition(parentBody, month, computedPositions);
    
    custom_phase = {
        "pti_26":-2.383646608362283,
        "pti_19":-0.07896319873795357,
        "pti_9":-0.790076491839103,
        "pti_8":-2.4191034962274705,
        "pti_14":0.5806662120457247,
        "pti_18":2.440224064063863,
        "pti_23":2.9291757325014562,
        "pti_10":1.1834385071366533,
        "pti_25":2.49055451090383,
        "pti_13":1.0591260433715197
    }

    const phase = custom_phase[body.ID] || Math.PI;
    const r = body.DistanceFromParent;
    const period = body.Period;
    const x = r*Math.cos(phase+month * (2 * Math.PI) / period);
    const y = r*Math.sin(phase+month * (2 * Math.PI) / period);
    return {x: parentPosition.x + x,  y: parentPosition.y + y};
}

// Enable zoom and pan for the SVG
function enableZoomAndPan(svg) {
    const viewBox = svg.viewBox.baseVal;
    const minZoom = 0.01;
    const maxZoom = 1;
    let isPanning = false;
    let startX, startY;
    let currentZoom = 1;
    const zoomSpeed = 0.1;

    svg.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
        const newZoom = currentZoom * zoomFactor;

        if (newZoom >= minZoom && newZoom <= maxZoom) {
            const mouseX = e.offsetX / svg.clientWidth;
            const mouseY = e.offsetY / svg.clientHeight;
            const deltaWidth = viewBox.width * (1 - zoomFactor);
            const deltaHeight = viewBox.height * (1 - zoomFactor);

            viewBox.x += deltaWidth * mouseX;
            viewBox.y += deltaHeight * mouseY;
            viewBox.width *= zoomFactor;
            viewBox.height *= zoomFactor;

            currentZoom = newZoom;
        }
    });

    svg.addEventListener('mousedown', (e) => {
        isPanning = true;
        startX = e.clientX;
        startY = e.clientY;
        svg.style.cursor = 'grabbing';
    });

    svg.addEventListener('mousemove', (e) => {
        if (!isPanning) return;
        const dx = (startX - e.clientX) * (viewBox.width / svg.clientWidth);
        const dy = (startY - e.clientY) * (viewBox.height / svg.clientHeight);
        viewBox.x += dx;
        viewBox.y += dy;
        startX = e.clientX;
        startY = e.clientY;
    });

    svg.addEventListener('mouseup', () => {
        isPanning = false;
        svg.style.cursor = 'grab';
    });

    svg.addEventListener('mouseleave', () => {
        isPanning = false;
        svg.style.cursor = 'grab';
    });
}

// Filter and style SVG elements
function buildSolarSystem(svgContainer, dialog, month) {
    const computedPositions = computeAllPositions(month);
    const objects = svgContainer.querySelectorAll('circle, ellipse, rect, path');
    const validIDs = new Set(SOLAR_SYSTEM_DATA.map(item => item.ID));
    objects.forEach(obj => {
        if (!validIDs.has(obj.id) && !obj.id.includes('orbit') && obj.id !== 'sun' && obj.id !== 'asteroids' && obj.id !== 'asteroids_names') {
            obj.style.display = 'none';
        } else {
            obj.style.display = '';
            const objectData = SOLAR_SYSTEM_DATA.find(item => item.ID === obj.id);
            if (objectData) {
                if (obj.id !== "sun") {
                    obj.style.fill = objectData.Color;
                }
                if (objectData.OrbitAround === "sun") {
                    obj.setAttribute('r', 5);

                }
                obj.addEventListener('click', (event) => {
                    event.stopPropagation();
                    dialog.style.display = 'block';
                    dialog.innerHTML = `<h2>${objectData.Name}</h2>`;
                    dialog.innerHTML += `<p>${objectData.Descr}</p>`;

                    // Add the planet image dynamically
                    let image_name = objectData.ID;
                    image_name = image_name.charAt(0).toUpperCase() + image_name.slice(1);
                    dialog.innerHTML += `<p style="color: ${objectData.Color};">${objectData.Owner}</p>`;
                    if (objectData.OrbitAround === "sun" && !objectData.ID.startsWith('pti_')) { 
                        dialog.innerHTML += `<img id="planetImage" src="images/${image_name}.webp" alt="${objectData.Name}" style="width:100%; height:auto; margin-bottom:10px;">`;
                    }

                    // Add a list of distances to other planets
                    const distancesList = document.createElement('ul');
                    distancesList.style.listStyleType = "none";
                    SOLAR_SYSTEM_DATA.forEach(otherBody => {
                        if (otherBody.ID !== objectData.ID && otherBody.OrbitAround === "sun" && !otherBody.ID.startsWith('pti_')) {
                            const position1 = computedPositions[objectData.ID];
                            const position2 = computedPositions[otherBody.ID];
                            const x1 = position1.x;
                            const y1 = position1.y;
                            const x2 = position2.x;
                            const y2 = position2.y;
                            // Calculate the distance between the two planets using the distance formula
                            const distance = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
                            const speed_factor = 89.76;
                            const listItem = document.createElement('li');
                            listItem.textContent = `${otherBody.Name}: ${(distance/speed_factor).toFixed(2)} months`;
                            distancesList.appendChild(listItem);
                        }
                    });
                    dialog.innerHTML += `<h3>Distances from main planets:</h3>`;
                    dialog.appendChild(distancesList);
                });

                const position = computedPositions[obj.id];
                obj.cx.baseVal.value = position.x;
                obj.cy.baseVal.value = position.y;
            } else if (obj.id === "asteroids") {
                const period = (1200*108)/700;
                // Rotate asteroids
                const angle = month * (360 / period);
                obj.style.transform = `rotate(${angle}deg)`;
                obj.style.transformOrigin = '5000px 5000px';
            } else {
                console.log("No data found for object with ID:", obj.id);
            }
        }
    });
}

async function fetchTimelineData() {
    const url = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=1188539103&single=true&output=csv";

    try {
        const response = await fetch(url);
        const data = await response.text();

        // Parse CSV
        const rows = data.split("\n").slice(1); // Skip the header row
        const events = rows.map(row => {
            const [month, event, description, mod] = row.split(",");
            return { month, event, description, mod };
        });

        const currentMonth = events.find(({ event }) => event === "Current");
        if (currentMonth) {
            const monthInput = document.getElementById("monthInput");
            monthInput.value = currentMonth.month; // Set the input value to the last month
            monthInput.dispatchEvent(new Event("input")); // Trigger the update event
        }

    } catch (error) {
        console.error("Error fetching timeline data:", error);
    }
}

// Close dialog on outside click
function closeDialogOnClickOutside(dialog) {
    window.addEventListener('click', (e) => {
        if (!dialog.contains(e.target)) {
            dialog.style.display = 'none';
        }
    });
}

// Main initialization
document.addEventListener('DOMContentLoaded', () => {
    const monthInput = document.getElementById('monthInput');
    const svgContainer = document.getElementById('solar-map');
    const dialog = document.getElementById('dialog');
    fetchTimelineData()

    closeDialogOnClickOutside(dialog);
    monthInput.addEventListener('input', () => {
        // Rebuild the solar system on month change
        buildSolarSystem(svgContainer, dialog, parseInt(monthInput.value, 10));
    });

    fetch('images/map.svg')
        .then(response => response.text())
        .then(svgContent => {
            svgContainer.innerHTML = svgContent;

            if (!svgContainer.hasAttribute('viewBox')) {
                svgContainer.setAttribute('viewBox', '0 0 10000 10000');
            }

            enableZoomAndPan(svgContainer);
            buildSolarSystem(svgContainer, dialog, 0); // Initial build for month 0
        })
        .catch(error => console.error('Error loading SVG:', error));
});