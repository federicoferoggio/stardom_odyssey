// Global variables
let speedMultiplier = 1; // Default speed multiplier

// Menu toggle functionality
function setupMenuToggle(menuButton, menuContainer) {
    menuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        menuContainer.classList.toggle('active');
    });

    window.addEventListener('click', (e) => {
        if (!menuContainer.contains(e.target) && !menuButton.contains(e.target)) {
            menuContainer.classList.remove('active');
        }
    });
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

// Process CSV data
function processCSV(csvData, svgContainer, dialog) {
    const rows = csvData.split('\n').map(row => row.split(','));
    const headers = rows.shift();

    const data = rows.map(row => {
        return headers.reduce((acc, header, i) => {
            acc[header.trim()] = row[i]?.trim();
            return acc;
        }, {});
    });

    const validIDs = new Set(data.map(item => item.ID));
    console.log('Valid IDs from CSV:', Array.from(validIDs));

    filterSVG(validIDs, data, svgContainer, dialog);
}

// Filter and style SVG elements
function filterSVG(validIDs, data, svgContainer, dialog) {
    const objects = svgContainer.querySelectorAll('circle, ellipse, rect, path');
    objects.forEach(obj => {
        if (!validIDs.has(obj.id) && !obj.id.includes('orbit') && obj.id !== 'sun' && obj.id !== 'asteroids' && obj.id !== 'asteroids_names') {
            obj.style.display = 'none';
        } else {
            obj.style.display = '';
            const objectData = data.find(item => item.ID === obj.id);
            if (objectData) {
                obj.style.fill = objectData.Color;

                if (obj.id.startsWith('pti_')) {
                    const speed = parseFloat(objectData.Speed) || 1;
                    const animationDuration = (60 / speed) * 5;
                    obj.classList.add('animate-rotation');
                    obj.style.animation = `rotate ${animationDuration}s linear infinite`;
                    // Ensure the transform origin is set to the center of the object (position of the sun)
                    obj.style.transformOrigin = '5000px 5000px';
                    obj.style.cursor = 'pointer';
                }
                // cursor is set to pointer to indicate the object is clickable
                obj.style.cursor = 'pointer';
                obj.addEventListener('click', (event) => {
                    event.stopPropagation();
                    dialog.style.display = 'block';
                    dialog.innerHTML = `<h2>${objectData.Name}</h2><p style="color: ${objectData.Color};">${objectData.Owner}</p><p>${objectData.Descr}</p>`;
                });
            }
        }
    });
}

// Speed slider functionality
function setupSpeedSlider(speedSlider, speedValue, svgContainer) {
    speedSlider.addEventListener('input', () => {
        speedMultiplier = parseFloat(speedSlider.value);
        speedValue.textContent = `${speedMultiplier.toFixed(1)}x`;

        const allElements = svgContainer.querySelectorAll('svg *');
        allElements.forEach(element => {
            const computedStyle = window.getComputedStyle(element);
            // get current position of the object (coordinates in x and y)
            
            const animationDuration = parseFloat(computedStyle.animationDuration);

            if (!isNaN(animationDuration) && animationDuration > 0) {
                const originalDuration = element.dataset.originalDuration || animationDuration;
                element.dataset.originalDuration = originalDuration;
                const newDuration = originalDuration / speedMultiplier;
                element.style.animationDuration = `${newDuration}s`;
            }
        });
    });
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
    const menuButton = document.querySelector('.menu-button');
    const menuContainer = document.querySelector('.menu-container');
    const speedSlider = document.getElementById('speed-slider');
    const speedValue = document.getElementById('speed-value');
    const svgContainer = document.getElementById('solar-map');
    const dialog = document.getElementById('dialog');

    setupMenuToggle(menuButton, menuContainer);
    closeDialogOnClickOutside(dialog);
    setupSpeedSlider(speedSlider, speedValue, svgContainer);

    fetch('images/map.svg')
        .then(response => response.text())
        .then(svgContent => {
            svgContainer.innerHTML = svgContent;

            if (!svgContainer.hasAttribute('viewBox')) {
                svgContainer.setAttribute('viewBox', '0 0 10000 10000');
            }

            enableZoomAndPan(svgContainer);

            fetch('https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=1694376835&single=true&output=csv')
                .then(response => response.text())
                .then(csvData => processCSV(csvData, svgContainer, dialog))
                .catch(error => console.error('Error loading CSV:', error));
        })
        .catch(error => console.error('Error loading SVG:', error));
});