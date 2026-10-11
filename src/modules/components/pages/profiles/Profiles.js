import { useEffect, useState } from 'react';
import VersionPicker from '../../profiles/VersionPicker';
import { buildVersionOptions, fetchMojangVersions, readCachedVersions } from '../../../services/gameVersions';
import {
    DEFAULT_PROFILE_ID,
    LATEST_RELEASE,
    createProfile,
    deleteProfile,
    profileGameDir,
    updateProfile,
} from '../../../services/profiles';
import FabricInstall from './FabricInstall';

const emptyForm = { id: null, name: '', gameVersion: LATEST_RELEASE };

// Create, edit and delete profiles. Each one gets its own game folder and an entry
// in the official Minecraft Launcher; `onChange` reloads the list in the app.
function Profiles({ profiles, activeId, onSelect, onChange }) {
    // Starts from the last list fetched (or just the installed versions) and refreshes
    // from Mojang; when that fails the cached list keeps the picker usable offline.
    const [versionOptions, setVersionOptions] = useState(() => buildVersionOptions(readCachedVersions()));
    const [versionsOffline, setVersionsOffline] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchMojangVersions()
            .then(versions => !cancelled && setVersionOptions(buildVersionOptions(versions)))
            .catch(() => !cancelled && setVersionsOffline(true));
        return () => { cancelled = true; };
    }, []);

    function resetForm() {
        setForm(emptyForm);
    }

    // Runs a profile change and reports its outcome under the form.
    function run(action, success) {
        setError('');
        setNotice('');
        try {
            action();
            onChange();
            setNotice(success);
            return true;
        } catch (actionError) {
            setError(actionError.message);
            return false;
        }
    }

    function handleSubmit(event) {
        event.preventDefault();
        const done = form.id
            ? run(() => updateProfile(form.id, form), 'Profile saved. Restart the Minecraft Launcher if it is open to see the change.')
            : run(() => createProfile(form), 'Profile created. Restart the Minecraft Launcher if it is open to see it.');
        if (done) {
            resetForm();
        }
    }

    function handleEdit(profile) {
        setForm({ id: profile.id, name: profile.name, gameVersion: profile.gameVersion });
        setError('');
        setNotice('');
    }

    // Picks the freshly installed Fabric version for the profile being created or edited.
    function handleFabricInstalled(versionId) {
        // Fetching the version list also caches it, so this keeps Mojang's versions.
        setVersionOptions(buildVersionOptions(readCachedVersions()));
        setForm(current => ({ ...current, gameVersion: versionId }));
        setError('');
        setNotice(`Installed ${versionId}. It's now selected for this profile.`);
    }

    function handleDelete(profile) {
        const folder = profileGameDir(profile);
        if (!window.confirm(`Delete the profile "${profile.name}"? It is removed from TMods and the Minecraft Launcher. Its files stay in ${folder}.`)) {
            return;
        }
        run(() => deleteProfile(profile.id), `Profile deleted. Its files are still in ${folder}.`);
        if (form.id === profile.id) {
            resetForm();
        }
    }

    return <div className='centered'>
        <h1>Profiles</h1>
        <p className='card-c'>
            Each profile has its own mods, configs and packs, and shows up in the official Minecraft Launcher, where you press Play.
            Fabric can be installed below. For Forge or NeoForge, run the loader's installer first, then pick its version here.
        </p>

        <form className='settingsForm' onSubmit={handleSubmit}>
            <label htmlFor='profileName' className='form-label'>{form.id ? 'Edit profile' : 'New profile'}</label>
            <div className='settingsRow'>
                <input
                    id='profileName'
                    className='form-control'
                    placeholder='Profile name'
                    value={form.name}
                    onChange={event => setForm({ ...form, name: event.target.value })}
                    required
                />
                <VersionPicker
                    options={versionOptions}
                    value={form.gameVersion}
                    onChange={gameVersion => setForm({ ...form, gameVersion })}
                />
                <button type='submit' className='btn btn-primary'>{form.id ? 'Save' : 'Create'}</button>
                {form.id && <button type='button' className='btn btn-secondary' onClick={resetForm}>Cancel</button>}
            </div>
            {versionsOffline && <div className='text-muted mt-2'>Could not load the full Minecraft version list, showing the versions known offline.</div>}
            {error && <div className='text-danger mt-2'>{error}</div>}
            {notice && <div className='text-success mt-2'>{notice}</div>}
        </form>

        <FabricInstall onInstalled={handleFabricInstalled} />

        <ul className='grow'>
            {profiles.map(profile =>
                <li key={profile.id} className='listItem'>
                    <div className='versionsWrapper'>
                        <strong>{profile.name}</strong>
                        <code>{profile.gameVersion || 'Your usual launcher profiles'}</code>
                    </div>
                    <p className='grow textDesc'>{profileGameDir(profile)}</p>
                    {profile.id === activeId
                        ? <button className='btn btn-secondary' disabled>Active</button>
                        : <button className='btn btn-success' onClick={() => onSelect(profile.id)}>Use</button>}
                    {profile.id !== DEFAULT_PROFILE_ID && <>
                        <button className='btn btn-primary' onClick={() => handleEdit(profile)}>Edit</button>
                        <button className='btn btn-danger' onClick={() => handleDelete(profile)}>Delete</button>
                    </>}
                </li>
            )}
        </ul>
    </div>
}

export default Profiles;
