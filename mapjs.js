document.addEventListener('DOMContentLoaded', () => {

    const menuButton = document.querySelector('.menu-button');
    const menuContainer = document.querySelector('.menu-container');

    // Toggle the dropdown menu when clicking the button
    menuButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent click from propagating
        menuContainer.classList.toggle('active');
    });

    // Close the dropdown if clicked outside
    window.addEventListener('click', (e) => {
        if (!menuContainer.contains(e.target)) {
            menuContainer.classList.remove('active');
        }
    });
    const svgContainer = document.getElementById('solar-map');
    const dialog = document.getElementById('dialog');

    // Load the SVG file
    fetch('images/map.svg')
        .then(response => response.text())
        .then(svgContent => {
            svgContainer.innerHTML = svgContent;

            // Log all IDs in the SVG
            const allSVGIds = [...svgContainer.querySelectorAll('*')]
                .map(obj => obj.id)
                .filter(id => id); // Exclude empty IDs
            console.log('All SVG IDs:', allSVGIds);

            // Set initial viewBox for zoom/pan functionality
            if (!svgContainer.hasAttribute('viewBox')) {
                svgContainer.setAttribute('viewBox', '0 0 10000 10000');
            }

            enableZoomAndPan(svgContainer);
            loadCSVAndProcess();
        })
        .catch(error => console.error('Error loading SVG:', error));

    function enableZoomAndPan(svg) {
        const viewBox = svg.viewBox.baseVal;
        const originalWidth = viewBox.width;
        const originalHeight = viewBox.height;
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

    function loadCSVAndProcess() {
        const url = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRqpVaE0U3b0-TIyW-xoZrkys30jf0YkU0cRRexohMZmdd_Ln1zeWiAi-x0RrGQUaIKGHvyM1PBIXTk/pub?gid=1694376835&single=true&output=csv';
        fetch(url)
            .then(response => response.text())
            .then(csvData => processCSV(csvData))
            .catch(error => console.error('Error loading CSV:', error));
    }

    function processCSV(csvData) {
        const rows = csvData.split('\n').map(row => row.split(','));
        const headers = rows.shift();

        const data = rows.map(row => {
            return headers.reduce((acc, header, i) => {
                acc[header.trim()] = row[i]?.trim(); // Trim spaces for robust mapping
                return acc;
            }, {});
        });

        const validIDs = new Set(data.map(item => item.ID));

        console.log('Valid IDs from CSV:', Array.from(validIDs));

        filterSVG(validIDs, data);
    }

    function filterSVG(validIDs, data) {
        const sun = document.getElementById('sun');
        if (!sun) {
            console.error('Sun element not found in the SVG');
            return;
        }

        const sunBBox = sun.getBBox();
        const sunCenterX = sunBBox.x + sunBBox.width / 2;
        const sunCenterY = sunBBox.y + sunBBox.height / 2;

        const objects = svgContainer.querySelectorAll('circle, ellipse, rect, path');
        objects.forEach(obj => {
            if (!validIDs.has(obj.id) && !obj.id.includes('orbit') && obj.id !== 'sun') {
                obj.style.display = 'none';
            } else {
                obj.style.display = '';
                const objectData = data.find(item => item.ID === obj.id);
                if (objectData) {
                    // Apply color
                    obj.style.fill = objectData.Color;

                    if (obj.id.startsWith('pti_')) {
                        const speed = parseFloat(objectData.Speed) || 1; // Default to 1 if missing
                        const animationDuration = (60 / speed) * 5; // 5 minutes for full rotation
                        obj.classList.add('animate-rotation');
                        obj.style.animation = `rotate ${animationDuration}s linear infinite`;
                    } else {
                    }

                    obj.addEventListener('click', (event) => {
                        event.stopPropagation(); // Prevent zoom/pan interference
                        dialog.style.display = 'block';
                        dialog.innerHTML = `<h2>${objectData.Name}</h2><p style="color: ${objectData.Color};">${objectData.Owner}</p><p>${objectData.Descr}</p>`;
                    });
                }
            }
        });
    }

    window.addEventListener('click', (e) => {
        if (!dialog.contains(e.target)) {
            dialog.style.display = 'none';
        }
    });
});
