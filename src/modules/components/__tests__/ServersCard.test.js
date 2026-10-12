import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import ServersCard from '../pages/profiles/ServersCard';
import { readManaged, readServers, syncProfileServers, writeServers } from '../../services/servers';

jest.mock('../../services/servers', () => ({
    RESOURCE_PACK: { PROMPT: 'prompt', ENABLED: 'enabled', DISABLED: 'disabled' },
    isManaged: (managed, server) => managed.includes(server.address),
    readManaged: jest.fn(),
    readServers: jest.fn(),
    syncProfileServers: jest.fn(),
    writeServers: jest.fn(),
}));

const profile = { id: 'survival', name: 'Survival' };
let list;

beforeEach(() => {
    list = [
        { name: 'TMods Lobby', address: 'lobby.example.com', resourcePack: 'enabled', extra: [] },
        { name: 'Mine', address: 'mine.example.com', resourcePack: 'prompt', extra: [['icon', {}]] },
    ];
    readServers.mockImplementation(() => list);
    readManaged.mockReturnValue(['lobby.example.com']);
    writeServers.mockImplementation((dir, next) => {
        list = next;
        return true;
    });
    syncProfileServers.mockResolvedValue(false);
    window.confirm = jest.fn(() => true);
});

function rows() {
    return screen.getAllByRole('listitem').map(row => row.textContent);
}

async function renderCard() {
    render(<ServersCard profile={profile} gameDir='/games/survival' />);
    await waitFor(() => expect(syncProfileServers).toHaveBeenCalledWith(profile));
}

it("lists the profile's servers and marks the channel's", async () => {
    await renderCard();

    expect(screen.getByText('Servers for Survival')).toBeInTheDocument();
    expect(rows()[0]).toContain('From your channel');
    expect(rows()[0]).toContain('lobby.example.com · Use them');
    expect(rows()[1]).not.toContain('From your channel');
});

it('adds a server', async () => {
    await renderCard();

    fireEvent.change(screen.getByLabelText('Server name'), { target: { value: 'Friends' } });
    fireEvent.change(screen.getByLabelText(/Server address/), { target: { value: 'friends.example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));

    expect(writeServers).toHaveBeenCalledWith('/games/survival', [
        ...list.slice(0, 2),
        { name: 'Friends', address: 'friends.example.com', resourcePack: 'prompt' },
    ]);
    expect(rows()[2]).toContain('Friends');
});

it('edits a server, keeping what the game stored for it', async () => {
    await renderCard();

    fireEvent.click(within(screen.getAllByRole('listitem')[1]).getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Server name'), { target: { value: 'Mine 2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(writeServers.mock.calls[0][1][1]).toEqual({
        name: 'Mine 2',
        address: 'mine.example.com',
        resourcePack: 'prompt',
        extra: [['icon', {}]],
    });
});

it('moves and removes servers', async () => {
    await renderCard();

    fireEvent.click(screen.getByRole('button', { name: 'Move Mine up' }));
    expect(list.map(server => server.name)).toEqual(['Mine', 'TMods Lobby']);

    fireEvent.click(within(screen.getAllByRole('listitem')[0]).getByRole('button', { name: 'Remove' }));
    expect(window.confirm).toHaveBeenCalledWith('Remove "Mine" from the server list?');
    expect(list.map(server => server.name)).toEqual(['TMods Lobby']);
});

it('shows why a change was refused', async () => {
    writeServers.mockImplementation(() => {
        throw new Error('Every server needs an address.');
    });
    await renderCard();

    fireEvent.change(screen.getByLabelText(/Server address/), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add server' }));

    expect(screen.getByText('Every server needs an address.')).toBeInTheDocument();
});

it("says so when the list can't be read", async () => {
    readServers.mockImplementation(() => {
        throw new Error('Could not read the server list (servers.dat): broken');
    });
    render(<ServersCard profile={profile} gameDir='/games/survival' />);

    expect(screen.getByText('Could not read the server list (servers.dat): broken')).toBeInTheDocument();
    expect(syncProfileServers).not.toHaveBeenCalled();
});

it("shows the channel's servers once they are in, whoever put them there", async () => {
    // The app's sync on start may add them after the card read the list.
    syncProfileServers.mockImplementation(async () => {
        list = [{ name: 'New', address: 'new.example.com', resourcePack: 'prompt', extra: [] }, ...list];
        return false;
    });
    await renderCard();

    await waitFor(() => expect(rows()[0]).toContain('New'));
});
