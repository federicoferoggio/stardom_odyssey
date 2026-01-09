// This controls the navigation menu behavior (in all pages)
// In all the pages you just need to copy-paste the following HTML snippet where you want the menu to appear:
/*
    <!-- Start Navigation Menu -->
    <nav class="menu"></nav>
    <script src="nav.js"></script>
    <link rel="stylesheet" href="nav.css">
    <!-- End Navigation Menu-->
*/

document.addEventListener("DOMContentLoaded", function() {
    const menuContainer = document.querySelector('.navigation-menu');

    const button = document.createElement('button');
    button.className = 'navigation-menu-button';
    button.style.marginTop = '0';
    button.textContent = 'Menu';

    const menuLinks = document.createElement('div');
    menuLinks.className = 'navigation-menu-links';

    const links = [
        { href: 'index.html', text: 'Court' },
        { href: 'scrolls.html', text: 'Army' },
        { href: 'families.html', text: 'Families' },
        { href: 'map.html', text: 'Map' },
        { href: 'https://www.dndbeyond.com/campaigns/5380810', text: 'D&D Beyond Campaign' },
        { href: 'https://federicoferoggio.github.io/planetnavigator/', text: 'Planets Explorer' }
    ];

    links.forEach(linkInfo => {
        const link = document.createElement('a');
        link.href = linkInfo.href;
        link.textContent = linkInfo.text;
        menuLinks.appendChild(link);
    });

    button.addEventListener('click', function() {
        if (menuLinks.style.display === 'block') {
            menuLinks.style.display = 'none';
            this.blur();
        } else {
            menuLinks.style.display = 'block';
        }
    });

    button.addEventListener('focusout', function(event) {
        if (!menuLinks.contains(event.relatedTarget)) {
            menuLinks.style.display = 'none';
        }
    });

    menuContainer.appendChild(button);
    menuContainer.appendChild(menuLinks);
});