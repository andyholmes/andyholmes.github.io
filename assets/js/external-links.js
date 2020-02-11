
// Amend external links with a little icon and open them in a new tab/window
for (let c = document.getElementsByTagName('a'), a = 0; a < c.length; a++) {
    let b = c[a];

    if (b.getAttribute('href') && b.hostname !== location.hostname) {
        b.target = '_blank';
        b.rel = 'noopener';
        b.classList.add('external-link');
    }
}

