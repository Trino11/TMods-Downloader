// Runs before every test file (react-scripts picks it up automatically).
import '@testing-library/jest-dom';

beforeEach(() => {
    localStorage.clear();
});
