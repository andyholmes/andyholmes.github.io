// assets/js/post.js
var codeBlocks = document.querySelectorAll('pre.highlight');

codeBlocks.forEach((element) => {
    const button = document.createElement('button');
    button.setAttribute('type', 'button');
    element.appendChild(button);

    const icon = document.createElement('img');
    icon.setAttribute('src', '/assets/images/copy-symbolic.svg');
    button.appendChild(icon);

    button.addEventListener('click', async () => {
        button.disabled = true;
        button.opacity = 0;

        try {
            const text = element.textContent || '';
            await navigator.clipboard.writeText(text);
        } catch (e) {
            console.error('Error copying to clipboard', e);
        }

        setTimeout(() => {
            button.disabled = false;
            button.opacity = 1;
        }, 500);
    });
});

