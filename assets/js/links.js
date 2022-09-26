
// Amend external links with a little icon and open them in a new tab/window
for (const b of document.getElementsByTagName('a')) {
    if (b.getAttribute('href') && b.hostname !== location.hostname) {
        b.target = '_blank';
        b.rel = 'noopener';
        b.classList.add('external-link');
    }
}

