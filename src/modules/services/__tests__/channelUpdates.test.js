import { checkChannels, installChannelUpdates } from '../channelUpdates';
import { fetchLatestVersions } from '../manifest';
import { installBundle, readInstalledVersion } from '../bundleInstaller';

jest.mock('../manifest', () => ({ fetchLatestVersions: jest.fn() }));
jest.mock('../bundleInstaller', () => ({ installBundle: jest.fn(), readInstalledVersion: jest.fn() }));

const mods = { id: 'mods', label: 'Mods' };
const configs = { id: 'configs', label: 'Configs' };
const shaders = { id: 'shaderpacks', label: 'Shaderpacks' };
const installed = { mods: '1.0', configs: '2.0', shaderpacks: '' };

beforeEach(() => {
    readInstalledVersion.mockImplementation(category => installed[category.id]);
    fetchLatestVersions.mockResolvedValue({ mods: { id: '1.1' }, configs: { id: '2.0' }, shaderpacks: null });
});

it('marks the channels whose latest version is not installed', async () => {
    const statuses = await checkChannels([mods, configs, shaders], '/games/a');

    expect(readInstalledVersion).toHaveBeenCalledWith(mods, '/games/a');
    expect(statuses).toEqual([
        { category: mods, installed: '1.0', latest: { id: '1.1' }, outdated: true },
        { category: configs, installed: '2.0', latest: { id: '2.0' }, outdated: false },
        { category: shaders, installed: '', latest: null, outdated: false },
    ]);
});

it('installs every outdated channel and reports the ones that failed', async () => {
    installBundle.mockImplementation(async category => {
        if (category === configs) {
            throw new Error('404');
        }
    });
    const statuses = [
        { category: mods, latest: { id: '1.1' }, outdated: true },
        { category: configs, latest: { id: '2.1' }, outdated: true },
        { category: shaders, latest: { id: '3.0' }, outdated: false },
    ];

    const failures = await installChannelUpdates(statuses, '/games/a');

    expect(installBundle).toHaveBeenCalledTimes(2);
    expect(installBundle).toHaveBeenCalledWith(mods, { id: '1.1' }, '/games/a');
    expect(failures).toEqual([{ category: configs, error: new Error('404') }]);
});
