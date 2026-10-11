import { checkChannels, installChannelUpdates } from '../channelUpdates';
import { fetchChannelUpdates } from '../manifest';
import { installBundle, readInstalledVersion } from '../bundleInstaller';

jest.mock('../manifest', () => ({ fetchChannelUpdates: jest.fn() }));
jest.mock('../bundleInstaller', () => ({ installBundle: jest.fn(), readInstalledVersion: jest.fn() }));

const mods = { id: 'mods', label: 'Mods' };
const configs = { id: 'configs', label: 'Configs' };
const shaders = { id: 'shaderpacks', label: 'Shaderpacks' };
const installed = { mods: '1.0', configs: '2.0', shaderpacks: '' };

beforeEach(() => {
    readInstalledVersion.mockImplementation(category => installed[category.id]);
    fetchChannelUpdates.mockResolvedValue({
        mods: { latest: { id: '1.1' }, changes: [{ id: '1.1', label: '1.1', text: 'Adds Sodium' }] },
        configs: { latest: { id: '2.0' }, changes: [] },
        shaderpacks: { latest: null, changes: [] },
    });
});

it('marks the channels whose latest version is not installed', async () => {
    const statuses = await checkChannels([mods, configs, shaders], '/games/a');

    expect(readInstalledVersion).toHaveBeenCalledWith(mods, '/games/a');
    expect(fetchChannelUpdates).toHaveBeenCalledWith({ mods: '1.0', configs: '2.0', shaderpacks: '' });
    expect(statuses).toEqual([
        {
            category: mods,
            installed: '1.0',
            latest: { id: '1.1' },
            outdated: true,
            changes: [{ id: '1.1', label: '1.1', text: 'Adds Sodium' }],
        },
        { category: configs, installed: '2.0', latest: { id: '2.0' }, outdated: false, changes: [] },
        { category: shaders, installed: '', latest: null, outdated: false, changes: [] },
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
