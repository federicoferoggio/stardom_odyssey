document.addEventListener('DOMContentLoaded', async () => {
    const warscrollFiles = ['ashranian_corsars.svg', 'bataarian_warhorse.svg', 'draconian_guard.svg', 'korrian_cultist.svg', 'steel_master.svg'];
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
});