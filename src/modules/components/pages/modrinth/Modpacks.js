import { useState } from 'react';
import ProjectSearch from './ProjectSearch';
import { exportMrpack, importMrpack, installModrinthModpack } from '../../../services/mrpack';

const modpackFilters = { projectType: 'modpack' };

// Saves the exported pack through the browser's download, which Electron turns into
// a save dialog.
function saveFile(data, fileName) {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

// Modpacks go into a new profile each. `run` performs an action with the page's busy
// state and messages.
function Modpacks({ profile, gameDir, target, busy, run, onProfileCreated }) {
    const [packName, setPackName] = useState(profile.name);
    const [includeConfig, setIncludeConfig] = useState(true);

    function created({ profile: newProfile, loaderNote }) {
        onProfileCreated(newProfile);
        return [`Created the profile "${newProfile.name}". Switch to it with the profile picker.`, loaderNote].filter(Boolean).join(' ');
    }

    function handleFile(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) {
            run(async () => created(await importMrpack(await file.arrayBuffer(), { name: file.name.replace(/\.mrpack$/i, '') })));
        }
    }

    function handleExport(event) {
        event.preventDefault();
        run(async () => {
            const result = exportMrpack(gameDir, target, { name: packName, includeConfig });
            saveFile(result.data, `${packName.replace(/[^\w.-]+/g, '_') || 'modpack'}.mrpack`);
            const extra = result.extraFiles.length ? ` ${result.extraFiles.length} jar(s) added by hand are copied into the pack.` : '';
            return `Exported ${result.mods} mod(s) from Modrinth.${extra}`;
        });
    }

    return <div className='grow'>
        <form className='settingsForm mx-auto' onSubmit={handleExport}>
            <label htmlFor='packName' className='form-label'>Share this profile as a modpack file</label>
            <div className='settingsRow'>
                <input id='packName' className='form-control' value={packName} onChange={event => setPackName(event.target.value)} required />
                <button type='submit' className='btn btn-primary' disabled={busy || !target?.loaderVersion}>Export</button>
            </div>
            <div className='form-check mt-2'>
                <input id='includeConfig' type='checkbox' className='form-check-input' checked={includeConfig} onChange={event => setIncludeConfig(event.target.checked)} />
                <label htmlFor='includeConfig' className='form-check-label'>Include the config folder</label>
            </div>
        </form>

        <div className='settingsForm mx-auto mt-3'>
            <label htmlFor='importPack' className='form-label'>Import a modpack file (.mrpack) as a new profile</label>
            <input id='importPack' type='file' accept='.mrpack' className='form-control' disabled={busy} onChange={handleFile} />
        </div>

        <h4 className='backupsTitle'>Modpacks on Modrinth</h4>
        <ProjectSearch
            filters={modpackFilters}
            placeholder='Search modpacks'
            action={hit => <button
                className='btn btn-success'
                disabled={busy}
                onClick={() => run(async () => created(await installModrinthModpack(hit.project_id, hit.title)))}
            >Install</button>}
        />
    </div>
}

export default Modpacks;
