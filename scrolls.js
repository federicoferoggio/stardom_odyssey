document.addEventListener('DOMContentLoaded', async () => {
    const warscrollFiles = [
        'Draconian Guard.svg',
        'Spiderlings.svg',
        'Korrian Cultist.svg',
        'Steel Master.svg'
    ];
    const cardFiles = ['1.svg', '2.svg', '3.svg', '4.svg', '5.svg', '6.svg', '7.svg', '8.svg'];

    async function fetchAndDisplaySVGs(directory, fileList, containerId, itemClass, loaderId) {
        const container = document.getElementById(containerId);
        const loader = document.getElementById(loaderId);

        if (fileList.length === 0) {
            container.innerHTML = `<p class="text-gray-400">No files listed for this section.</p>`;
            container.classList.add('p-4', 'items-center', 'justify-center');
            return;
        }

        if (loader) loader.style.display = 'none';
        if (containerId === "card-scroller") container.innerHTML = '';

        for (const fileName of fileList) {
            try {
                const response = await fetch(`./${directory}/${fileName}`);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                const svgContent = await response.text();

                const wrapper = document.createElement('div');
                wrapper.className = itemClass;
                wrapper.innerHTML = svgContent;
                container.appendChild(wrapper);
            } catch (error) {
                const errorWrapper = document.createElement('div');
                errorWrapper.className = itemClass;
                errorWrapper.innerHTML = `<div class="error-message"><p>Error loading<br>${fileName}</p></div>`;
                container.appendChild(errorWrapper);
            }
        }
    }

    await fetchAndDisplaySVGs('warscrolls/battle_sheets', warscrollFiles, 'warscroll-container', 'warscroll', 'warscroll-loader');
    await fetchAndDisplaySVGs('warscrolls/cards', cardFiles, 'card-scroller', 'card', 'card-loader');
    const warscrollContainer = document.getElementById('warscroll-container');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const warscrolls = document.querySelectorAll('.warscroll');

    if (warscrolls.length > 1) {
        prevBtn.classList.remove('hidden');
        nextBtn.classList.remove('hidden');

        let currentIndex = 0;
        const totalWarscrolls = warscrolls.length;

        function updateWarscrollPosition() {
            if (warscrolls[currentIndex]) {
                const scrollAmount = warscrolls[currentIndex].offsetLeft;
                warscrollContainer.scrollTo({ left: scrollAmount, behavior: 'smooth' });
            }
        }

        nextBtn.addEventListener('click', () => {
            currentIndex = (currentIndex + 1) % totalWarscrolls;
            updateWarscrollPosition();
        });

        prevBtn.addEventListener('click', () => {
            currentIndex = (currentIndex - 1 + totalWarscrolls) % totalWarscrolls;
            updateWarscrollPosition();
        });

        window.addEventListener('resize', updateWarscrollPosition);
    }

    document.querySelectorAll('.card').forEach(card => {
        let floatingClone;

        card.addEventListener('mouseenter', (e) => {
            const svg = card.querySelector('svg');
            if (!svg) return;

            const clone = svg.cloneNode(true);
            floatingClone = document.createElement('div');
            floatingClone.style.position = 'fixed';
            floatingClone.style.pointerEvents = 'none';
            floatingClone.style.zIndex = '99999';
            floatingClone.style.transform = 'scale(0.4)';
            floatingClone.style.transformOrigin = 'center';
            floatingClone.style.opacity = '0';
            floatingClone.style.transition = 'opacity 0.2s ease-out';

            floatingClone.appendChild(clone);
            document.body.appendChild(floatingClone);

            const cloneWidth = floatingClone.offsetWidth;
            const cloneHeight = floatingClone.offsetHeight;
            floatingClone.style.left = `${e.clientX - cloneWidth / 2}px`;
            floatingClone.style.top = `${e.clientY - cloneHeight / 2}px`;

            requestAnimationFrame(() => {
                floatingClone.style.opacity = '1';
            });
        });

        card.addEventListener('mousemove', (e) => {
            if (!floatingClone) return;
            const cloneWidth = floatingClone.offsetWidth;
            const cloneHeight = floatingClone.offsetHeight;
            floatingClone.style.left = `${e.clientX - cloneWidth / 2}px`;
            floatingClone.style.top = `${e.clientY - cloneHeight / 2}px`;
        });

        card.addEventListener('mouseleave', () => {
            if (floatingClone) {
                floatingClone.remove();
                floatingClone = null;
            }
        });
    });

    // New Side Menu Functionality
    const sideMenuButton = document.querySelector('.side-menu-button');
    const sideMenu = document.getElementById('side-menu');
    const closeSideMenuButton = document.querySelector('.close-side-menu-button');

    sideMenuButton.addEventListener('click', () => {
        sideMenu.classList.add('open');
    });

    closeSideMenuButton.addEventListener('click', () => {
        sideMenu.classList.remove('open');
    });

    // Unit Data with points (updated as per user request)
    const unitsData = [
        {
            id: "unit3",
            name: "Draconian Guard",
            points: 11, 
        },
        {
            id: "unit4",
            name: "Korrian Cultist",
            points: 8, 
        },
        {
            id: "unit5",
            name: "Steel Master",
            points: 13,
        },
        {
            id: "unit8",
            name: "Spiderlings",
            points: 10, 
        },
    ];

    // Army Builder Functionality
    const unitQuantityInputs = document.getElementById('unitQuantityInputs');
    const pointsProgressBar = document.getElementById('pointsProgressBar');
    const pointsProgressText = document.getElementById('pointsProgressText');
    const maxPoints = 500;

    function populateUnitsForArmyBuilder() {
        unitQuantityInputs.innerHTML = ''; // Clear previous inputs
        unitsData.forEach(unit => {
            const div = document.createElement('div');
            div.classList.add('unit-input-group');
            div.innerHTML = `
                <label for="qty-${unit.id}">${unit.name} (${unit.points} pts):</label>
                <input type="number" id="qty-${unit.id}" value="0" min="0">
            `;
            unitQuantityInputs.appendChild(div);

            // Add event listener to recalculate totals on quantity change
            div.querySelector(`#qty-${unit.id}`).addEventListener('input', calculateArmyTotals);
        });
        calculateArmyTotals(); // Initial calculation
    }

    function calculateArmyTotals() {
        let totalPoints = 0;

        unitsData.forEach(unit => {
            const quantityInput = document.getElementById(`qty-${unit.id}`);
            const quantity = parseInt(quantityInput.value, 10) || 0;

            totalPoints += (unit.points * quantity);
        });

        // Update progress bar
        const percentage = (totalPoints / maxPoints) * 100;
        pointsProgressBar.style.width = `${Math.min(percentage, 100)}%`;
        pointsProgressText.textContent = `${totalPoints} / ${maxPoints} Points`;

        if (totalPoints > maxPoints) {
            pointsProgressBar.style.backgroundColor = '#dc3545'; // Red if over limit
            pointsProgressText.style.color = 'red';
        } else {
            pointsProgressBar.style.backgroundColor = '#4CAF50'; // Green
            pointsProgressText.style.color = 'white';
        }
    }

    // Initialize new functionalities
    populateUnitsForArmyBuilder();
});