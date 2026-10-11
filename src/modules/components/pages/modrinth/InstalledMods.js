// The mods TMods installed in this profile, plus jars added by hand.
function InstalledMods({ mods, unmanaged, updates, busy, canCheckUpdates, onCheckUpdates, onUpdate, onUpdateAll, onToggle, onRemove, onAdopt }) {
    const updateFor = new Map(updates.map(update => [update.mod.projectId, update.version]));

    return <div className='grow'>
        <div className='text-center'>
            <button className='btn btn-primary' disabled={busy || !canCheckUpdates || mods.length === 0} onClick={onCheckUpdates}>Check for updates</button>
            {updates.length > 0 &&
                <button className='btn btn-success' disabled={busy} onClick={onUpdateAll}>Update all ({updates.length})</button>}
        </div>
        {mods.length === 0 && <p className='text-center mt-3'>No mods from Modrinth in this profile yet. Find some under Search mods.</p>}
        <ul className='grow'>
            {mods.map(mod => {
                const update = updateFor.get(mod.projectId);
                return <li key={mod.projectId} className='listItem'>
                    <div className='grow textDesc'>
                        <strong className={mod.enabled ? '' : 'text-secondary'}>{mod.title}</strong>{' '}
                        <code>{mod.versionNumber}</code>
                        {mod.asDependency && <small className='text-secondary'> (needed by another mod)</small>}
                        {update && <div className='text-success'>Update available: {update.version_number}</div>}
                    </div>
                    {update && <button className='btn btn-success' disabled={busy} onClick={() => onUpdate(mod, update)}>Update</button>}
                    <button className='btn btn-secondary' disabled={busy} onClick={() => onToggle(mod)}>{mod.enabled ? 'Disable' : 'Enable'}</button>
                    <button className='btn btn-danger' disabled={busy} onClick={() => onRemove(mod)}>Remove</button>
                </li>
            })}
        </ul>
        {unmanaged.length > 0 && <>
            <h4 className='backupsTitle'>Added by hand</h4>
            <p className='text-center'>
                TMods leaves these alone. If they come from Modrinth, it can recognise them so you can update them here.
                <button className='btn btn-primary' disabled={busy} onClick={onAdopt}>Recognise</button>
            </p>
            <ul className='grow'>
                {unmanaged.map(name => <li key={name} className='listItem'><code>{name}</code></li>)}
            </ul>
        </>}
    </div>
}

export default InstalledMods;
