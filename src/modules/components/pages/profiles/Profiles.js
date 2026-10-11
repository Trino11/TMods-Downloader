import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Page from '../../utils/Page';
import { ItemList, ItemRow } from '../../utils/ItemList';
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

    return <Page
        title='Profiles'
        description="Each profile has its own mods, configs and packs, and shows up in the official Minecraft Launcher, where you press Play. Fabric can be installed below. For Forge or NeoForge, run the loader's installer first, then pick its version here."
    >
        <Card variant='outlined'>
            <CardContent>
                <Stack component='form' spacing={2} onSubmit={handleSubmit}>
                    <Typography variant='subtitle1' component='h2'>{form.id ? 'Edit profile' : 'New profile'}</Typography>
                    <TextField
                        id='profileName'
                        label='Name'
                        placeholder='Profile name'
                        fullWidth
                        value={form.name}
                        onChange={event => setForm({ ...form, name: event.target.value })}
                        slotProps={{ htmlInput: { required: true }, inputLabel: { shrink: true } }}
                    />
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'flex-start' }}>
                        <VersionPicker
                            options={versionOptions}
                            value={form.gameVersion}
                            onChange={gameVersion => setForm({ ...form, gameVersion })}
                        />
                        <Button type='submit' variant='contained' sx={{ flexShrink: 0, height: 40 }}>{form.id ? 'Save' : 'Create'}</Button>
                        {form.id && <Button type='button' onClick={resetForm} sx={{ flexShrink: 0, height: 40 }}>Cancel</Button>}
                    </Stack>
                    {versionsOffline && <Alert severity='info'>Could not load the full Minecraft version list, showing the versions known offline.</Alert>}
                    {error && <Alert severity='error'>{error}</Alert>}
                    {notice && <Alert severity='success'>{notice}</Alert>}
                </Stack>
            </CardContent>
        </Card>

        <FabricInstall onInstalled={handleFabricInstalled} />

        <ItemList>
            {profiles.map(profile =>
                <ItemRow
                    key={profile.id}
                    actions={<>
                        {profile.id === activeId
                            ? <Button variant='outlined' disabled>Active</Button>
                            : <Button variant='contained' onClick={() => onSelect(profile.id)}>Use</Button>}
                        {profile.id !== DEFAULT_PROFILE_ID && <>
                            <Button onClick={() => handleEdit(profile)}>Edit</Button>
                            <Button color='error' onClick={() => handleDelete(profile)}>Delete</Button>
                        </>}
                    </>}
                >
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography sx={{ fontWeight: 500 }}>{profile.name}</Typography>
                        <Chip size='small' variant='outlined' label={profile.gameVersion || 'Your usual launcher profiles'} />
                    </Stack>
                    <Typography variant='body2' noWrap title={profileGameDir(profile)} sx={{ color: 'text.secondary' }}>{profileGameDir(profile)}</Typography>
                </ItemRow>
            )}
        </ItemList>
    </Page>
}

export default Profiles;
