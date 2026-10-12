// User settings live in the renderer's localStorage, which Electron keeps in the
// app's userData folder, so they survive app updates. The manifests the player follows
// are kept by services/manifests.js.

// The player's own bundles repository ("owner/name"), which the app can publish to.
const BUNDLES_REPO_KEY = 'tmods.bundlesRepo';

export function getBundlesRepo() {
    return localStorage.getItem(BUNDLES_REPO_KEY) || '';
}

export function setBundlesRepo(repo) {
    localStorage.setItem(BUNDLES_REPO_KEY, repo);
}
