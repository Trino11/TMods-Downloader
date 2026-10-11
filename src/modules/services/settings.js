// User settings live in the renderer's localStorage, which Electron keeps in the
// app's userData folder, so they survive app updates.
const MANIFEST_URL_KEY = 'tmods.manifestUrl';

export function getManifestUrl() {
    return localStorage.getItem(MANIFEST_URL_KEY) || '';
}

export function setManifestUrl(url) {
    localStorage.setItem(MANIFEST_URL_KEY, url);
}

// The player's own bundles repository ("owner/name"), which the app can publish to.
const BUNDLES_REPO_KEY = 'tmods.bundlesRepo';

export function getBundlesRepo() {
    return localStorage.getItem(BUNDLES_REPO_KEY) || '';
}

export function setBundlesRepo(repo) {
    localStorage.setItem(BUNDLES_REPO_KEY, repo);
}
