import { useState } from 'react';
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

    return <div className='versionPicker'>
        <select
            aria-label='Game version'
            className='form-select profileVersion'
            value={value}
            onChange={event => onChange(event.target.value)}
        >
            {shown.map(option => <option key={option.id} value={option.id}>{versionLabel(option)}</option>)}
        </select>
        <div className='versionFilters'>
            <input
                type='search'
                className='form-control form-control-sm'
                placeholder='Search versions'
                aria-label='Search versions'
                value={query}
                onChange={event => setQuery(event.target.value)}
            />
            <div className='form-check'>
                <input
                    id='showAllVersions'
                    type='checkbox'
                    className='form-check-input'
                    checked={showAll}
                    onChange={event => setShowAll(event.target.checked)}
                />
                <label htmlFor='showAllVersions' className='form-check-label'>Snapshots and old versions</label>
            </div>
        </div>
    </div>
}

export default VersionPicker;
