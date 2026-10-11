// Live checks: the app's service modules against the real Modrinth, Fabric and Mojang
// services. They need the internet, so `npm test` leaves them out; the Live API checks
// workflow runs them with `npx jest --config jest.live.config.js`.
module.exports = {
    testEnvironment: 'node',
    roots: ['<rootDir>/src'],
    testMatch: ['**/__live__/**/*.live.js'],
    setupFilesAfterEnv: ['<rootDir>/src/modules/services/__live__/setup.js'],
    testTimeout: 60000,
};
