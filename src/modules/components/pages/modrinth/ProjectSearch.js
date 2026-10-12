import { useEffect, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Avatar from '@mui/material/Avatar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import SearchIcon from '@mui/icons-material/Search';
import ExtensionIcon from '@mui/icons-material/Extension';
import { ItemList, ItemRow } from '../../utils/ItemList';
import { PAGE_SIZE, search } from '../../../services/modrinth';
import { formatNumber, useTranslation } from '../../../i18n';

const SEARCH_DELAY_MS = 400;

function formatDownloads(count) {
    return formatNumber(count, { notation: 'compact' });
}

// Searches Modrinth as the player types and lists the results with one action button
// each. `filters` narrows the search ({ projectType, loader, gameVersion }); `action`
// renders the button for a result.
function ProjectSearch({ filters, placeholder, action }) {
    const { t } = useTranslation();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState({ hits: [], total: 0 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const filterKey = JSON.stringify(filters);
    // Bumped on every new search, so a "More" request that finishes after the query
    // changed is dropped instead of mixing old results into the new list.
    const searchId = useRef(0);

    useEffect(() => {
        let cancelled = false;
        searchId.current++;
        const timer = setTimeout(() => {
            setLoading(true);
            setError('');
            search({ ...JSON.parse(filterKey), query })
                .then(data => !cancelled && setResults(data))
                .catch(searchError => !cancelled && setError(searchError.message))
                .finally(() => !cancelled && setLoading(false));
        }, SEARCH_DELAY_MS);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [query, filterKey]);

    async function loadMore() {
        const id = searchId.current;
        setLoading(true);
        try {
            const more = await search({ ...filters, query, offset: results.hits.length });
            if (id === searchId.current) {
                setResults(current => ({ hits: [...current.hits, ...more.hits], total: more.total }));
            }
        } catch (searchError) {
            if (id === searchId.current) {
                setError(searchError.message);
            }
        } finally {
            if (id === searchId.current) {
                setLoading(false);
            }
        }
    }

    return (
        <Stack spacing={2}>
            <TextField
                fullWidth
                placeholder={placeholder}
                value={query}
                onChange={event => setQuery(event.target.value)}
                slotProps={{
                    htmlInput: { 'aria-label': placeholder },
                    input: {
                        startAdornment: (
                            <InputAdornment position='start'>
                                <SearchIcon />
                            </InputAdornment>
                        ),
                    },
                }}
            />
            <Box sx={{ height: 4 }}>{loading && <LinearProgress />}</Box>
            {error && <Alert severity='error'>{t('modrinth.search.error', { error })}</Alert>}
            {results.hits.length > 0 && (
                <ItemList>
                    {results.hits.map(hit => (
                        <ItemRow
                            key={hit.project_id}
                            leading={
                                <Avatar
                                    variant='rounded'
                                    src={hit.icon_url || undefined}
                                    alt=''
                                    sx={{ width: 48, height: 48 }}
                                >
                                    <ExtensionIcon />
                                </Avatar>
                            }
                            actions={action(hit)}
                        >
                            <Typography component='span' sx={{ fontWeight: 500 }}>
                                {hit.title}
                            </Typography>{' '}
                            <Typography variant='body2' component='span' sx={{ color: 'text.secondary' }}>
                                {t('modrinth.search.byline', {
                                    author: hit.author,
                                    downloads: formatDownloads(hit.downloads),
                                })}
                            </Typography>
                            {/* Search gives a plain-text summary; it is never rendered as HTML. */}
                            <Typography variant='body2'>{hit.description}</Typography>
                        </ItemRow>
                    ))}
                </ItemList>
            )}
            {!loading && !error && results.hits.length === 0 && (
                <Typography align='center' sx={{ color: 'text.secondary' }}>
                    {t('modrinth.search.nothing')}
                </Typography>
            )}
            {results.hits.length < results.total && results.hits.length >= PAGE_SIZE && (
                <Box sx={{ textAlign: 'center' }}>
                    <Button variant='outlined' disabled={loading} onClick={loadMore}>
                        {t('modrinth.search.more')}
                    </Button>
                </Box>
            )}
        </Stack>
    );
}

export default ProjectSearch;
