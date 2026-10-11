import { useEffect, useState } from 'react';
import { PAGE_SIZE, search } from '../../../services/modrinth';

const SEARCH_DELAY_MS = 400;

function formatDownloads(count) {
    return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(count);
}

// Searches Modrinth as the player types and lists the results with one action button
// each. `filters` narrows the search ({ projectType, loader, gameVersion }); `action`
// renders the button for a result.
function ProjectSearch({ filters, placeholder, action }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState({ hits: [], total: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const filterKey = JSON.stringify(filters);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            setLoading(true);
            setError('');
            search({ ...JSON.parse(filterKey), query })
                .then(data => !cancelled && setResults(data))
                .catch(searchError => !cancelled && setError(`Could not search Modrinth: ${searchError.message}`))
                .finally(() => !cancelled && setLoading(false));
        }, SEARCH_DELAY_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, filterKey]);

    async function loadMore() {
        setLoading(true);
        try {
            const more = await search({ ...filters, query, offset: results.hits.length });
            setResults({ hits: [...results.hits, ...more.hits], total: more.total });
        } catch (searchError) {
            setError(`Could not search Modrinth: ${searchError.message}`);
        } finally {
            setLoading(false);
        }
    }

    return <div className='grow'>
        <div className='settingsForm searchBox'>
            <input
                className='form-control'
                placeholder={placeholder}
                aria-label={placeholder}
                value={query}
                onChange={event => setQuery(event.target.value)}
            />
        </div>
        {error && <div className='text-danger text-center mt-2'>{error}</div>}
        <ul className='grow'>
            {results.hits.map(hit =>
                <li key={hit.project_id} className='listItem'>
                    {hit.icon_url
                        ? <img className='projectIcon' src={hit.icon_url} alt='' />
                        : <div className='projectIcon' />}
                    <div className='grow textDesc'>
                        <strong>{hit.title}</strong> <small className='text-secondary'>by {hit.author} · {formatDownloads(hit.downloads)} downloads</small>
                        {/* Search gives a plain-text summary; it is never rendered as HTML. */}
                        <div>{hit.description}</div>
                    </div>
                    {action(hit)}
                </li>
            )}
        </ul>
        {!loading && !error && results.hits.length === 0 && <p className='text-center'>Nothing found.</p>}
        {results.hits.length < results.total && results.hits.length >= PAGE_SIZE &&
            <div className='text-center'>
                <button className='btn btn-secondary' disabled={loading} onClick={loadMore}>More</button>
            </div>}
    </div>
}

export default ProjectSearch;
