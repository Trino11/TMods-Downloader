import { useState } from 'react';
import {
    DEFAULT_PROFILE_ID,
    createProfile,
    deleteProfile,
    listGameVersions,
    profileGameDir,
    updateProfile,
} from '../../../services/profiles';

const emptyForm = { id: null, name: '', gameVersion: '' };

// Create, edit and delete profiles. Each one gets its own game folder and an entry
// in the official Minecraft Launcher; `onChange` reloads the list in the app.
function Profiles({ profiles, activeId, onSelect, onChange }) {
    const [gameVersions, setGameVersions] = useState(listGameVersions);
    const [form, setForm] = useState({ ...emptyForm, gameVersion: gameVersions[0] });
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    function resetForm() {
        setForm({ ...emptyForm, gameVersion: gameVersions[0] });
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
        // Keep a version that's no longer installed selectable instead of silently switching it.
        if (!gameVersions.includes(profile.gameVersion)) {
            setGameVersions([...gameVersions, profile.gameVersion]);
        }
        setForm({ id: profile.id, name: profile.name, gameVersion: profile.gameVersion });
        setError('');
        setNotice('');
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
            For Fabric, Forge or NeoForge, run the loader's installer first, then pick its version here.
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
                <select
                    aria-label='Game version'
                    className='form-select profileVersion'
                    value={form.gameVersion}
                    onChange={event => setForm({ ...form, gameVersion: event.target.value })}
                >
                    {gameVersions.map(version => <option key={version} value={version}>{version}</option>)}
                </select>
                <button type='submit' className='btn btn-primary'>{form.id ? 'Save' : 'Create'}</button>
                {form.id && <button type='button' className='btn btn-secondary' onClick={resetForm}>Cancel</button>}
            </div>
            {error && <div className='text-danger mt-2'>{error}</div>}
            {notice && <div className='text-success mt-2'>{notice}</div>}
        </form>

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
