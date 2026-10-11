import { act, fireEvent, render, screen } from '@testing-library/react';
import ProjectSearch from '../pages/modrinth/ProjectSearch';
import { PAGE_SIZE, search } from '../../services/modrinth';

jest.mock('../../services/modrinth', () => ({
    ...jest.requireActual('../../services/modrinth'),
    search: jest.fn(),
}));

function hits(prefix, count) {
    return Array.from({ length: count }, (_, i) => ({
        project_id: `${prefix}${i}`, title: `${prefix} ${i}`, author: 'someone', description: '', downloads: 1, icon_url: '',
    }));
}

it('drops "More" results that arrive after the query changed', async () => {
    let finishMore;
    search.mockImplementation(({ query, offset }) => {
        if (offset) {
            return new Promise(resolve => { finishMore = () => resolve({ hits: hits('stale', 2), total: 40 }); });
        }
        return Promise.resolve(query ? { hits: hits('fresh', 1), total: 1 } : { hits: hits('first', PAGE_SIZE), total: 40 });
    });
    render(<ProjectSearch filters={{ projectType: 'mod' }} placeholder='Search mods' action={() => null} />);

    fireEvent.click(await screen.findByText('More'));
    fireEvent.change(screen.getByPlaceholderText('Search mods'), { target: { value: 'sodium' } });
    expect(await screen.findByText('fresh 0')).toBeInTheDocument();
    await act(async () => finishMore());

    expect(screen.queryByText('stale 0')).not.toBeInTheDocument();
    expect(screen.queryByText('first 0')).not.toBeInTheDocument();
});
