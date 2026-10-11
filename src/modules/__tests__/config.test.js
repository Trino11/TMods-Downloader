import { VERSION } from '../config';
import packageJson from '../../../package.json';

it('shows the version from package.json', () => {
    expect(VERSION).toBe(packageJson.version);
});
