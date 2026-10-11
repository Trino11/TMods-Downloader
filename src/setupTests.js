// Runs before every test file (react-scripts picks it up automatically).
import '@testing-library/jest-dom';

beforeEach(() => {
    // Main-process tests run in plain Node, without a page or its storage.
    if (typeof localStorage !== 'undefined') {
        localStorage.clear();
    }
});

// Electron's page has TextDecoder; jsdom doesn't.
if (typeof global.TextDecoder === 'undefined') {
    global.TextDecoder = require('util').TextDecoder;
}
