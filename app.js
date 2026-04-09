/**
 * Load an HTML partial into the host. Host: x-init="mount($el, url)".
 * Partial root is a real UI component: x-data="someView()" — Alpine picks it up in the tree; no initTree.
 */
window.mount = async function mount(el, url) {
    el.innerHTML = await fetch(url).then((r) => r.text());
};
