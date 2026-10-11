import { useState } from 'react';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import SearchIcon from '@mui/icons-material/Search';
import { filterVersionOptions, versionLabel } from '../../services/gameVersions';

// Game version dropdown with a search box and a toggle for snapshots and the old
// alpha/beta versions. The picked version stays in the list whatever the filter.
function VersionPicker({ options, value, onChange }) {
    const [query, setQuery] = useState('');
    const [showAll, setShowAll] = useState(false);

    let shown = filterVersionOptions(options, { query, showAll, keep: value });
    if (value && !shown.some(option => option.id === value)) {
        // A version neither Mojang nor this computer knows, e.g. a loader since uninstalled.
        shown = [{ id: value, type: 'installed', installed: false }, ...shown];
    }

    return (
        <Stack spacing={1} sx={{ width: 300, flexShrink: 0 }}>
            <TextField
                id='profileVersion'
                label='Game version'
                select
                fullWidth
                value={value}
                onChange={event => onChange(event.target.value)}
                slotProps={{ select: { native: true } }}
            >
                {shown.map(option => (
                    <option key={option.id} value={option.id}>
                        {versionLabel(option)}
                    </option>
                ))}
            </TextField>
            <TextField
                type='search'
                placeholder='Search versions'
                fullWidth
                value={query}
                onChange={event => setQuery(event.target.value)}
                slotProps={{
                    htmlInput: { 'aria-label': 'Search versions' },
                    input: {
                        startAdornment: (
                            <InputAdornment position='start'>
                                <SearchIcon fontSize='small' />
                            </InputAdornment>
                        ),
                    },
                }}
            />
            <FormControlLabel
                control={
                    <Checkbox
                        id='showAllVersions'
                        size='small'
                        checked={showAll}
                        onChange={event => setShowAll(event.target.checked)}
                    />
                }
                label='Snapshots and old versions'
                slotProps={{ typography: { variant: 'body2' } }}
            />
        </Stack>
    );
}

export default VersionPicker;
