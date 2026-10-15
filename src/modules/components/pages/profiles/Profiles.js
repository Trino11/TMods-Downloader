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
import {
    buildVersionOptions,
    fetchMojangVersions,
    readCachedVersions,
    versionLabel,
} from '../../../services/gameVersions';
import {
    DEFAULT_PROFILE_ID,
    LATEST_RELEASE,
    createProfile,
    deleteProfile,
    profileGameDir,
    setProfileManifest,
    updateProfile,
} from '../../../services/profiles';
import { profileManifest } from '../../../services/manifests';
import EditProfileDialog from './EditProfileDialog';
import ManifestPicker from './ManifestPicker';
import ServersCard from './ServersCard';
import { useTranslation } from '../../../i18n';

const emptyForm = { name: '', gameVersion: LATEST_RELEASE, manifestId: '' };

// Create, edit and delete profiles. Each one gets its own game folder and an entry
// in the official Minecraft Launcher, and follows one of the saved `manifests`;
// `onChange` reloads the list in the app. New profiles are made in the form at the top;
// Edit opens a window with everything else, Fabric included.
function Profiles({ profiles, manifests = [], activeId, onSelect, onChange }) {
    const { t } = useTranslation();
    // Starts from the last list fetched (or just the installed versions) and refreshes
    // from Mojang; when that fails the cached list keeps the picker usable offline.
    const [versionOptions, setVersionOptions] = useState(() => buildVersionOptions(readCachedVersions()));
    const [versionsOffline, setVersionsOffline] = useState(false);
    const [form, setForm] = useState(emptyForm);
    // The profile open in the edit window, if any.
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const activeProfile = profiles.find(profile => profile.id === activeId);

    useEffect(() => {
        let cancelled = false;
        fetchMojangVersions()
            .then(versions => !cancelled && setVersionOptions(buildVersionOptions(versions)))
            .catch(() => !cancelled && setVersionsOffline(true));
        return () => {
            cancelled = true;
        };
    }, []);

    // The manifest picker only shows when there is more than one to pick from.
    const pickManifest = manifests.length > 1;

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

    function handleCreate(event) {
        event.preventDefault();
        const done = run(
            () => createProfile({ ...form, manifestId: form.manifestId || manifests[0]?.id }),
            t('profiles.created'),
        );
        if (done) {
            setForm(emptyForm);
        }
    }

    function handleEdit(profile) {
        setError('');
        setNotice('');
        setEditing(profile);
    }

    // Saves the edit window; errors are thrown back so the window shows them.
    function handleSave(profile, changes) {
        if (profile.id === DEFAULT_PROFILE_ID) {
            if (changes.manifestId) {
                setProfileManifest(profile.id, changes.manifestId);
            }
        } else {
            updateProfile(profile.id, changes);
        }
        onChange();
        setNotice(t('profiles.saved'));
    }

    // A Fabric version installed from the edit window joins the version list.
    function handleFabricInstalled() {
        // Fetching the version list also caches it, so this keeps Mojang's versions.
        setVersionOptions(buildVersionOptions(readCachedVersions()));
    }

    function handleDelete(profile) {
        const folder = profileGameDir(profile);
        if (!window.confirm(t('profiles.confirmDelete', { name: profile.name, folder }))) {
            return;
        }
        run(() => deleteProfile(profile.id), t('profiles.deleted', { folder }));
    }

    return (
        <Page title={t('profiles.title')} description={t('profiles.description')}>
            <Card variant='outlined'>
                <CardContent>
                    <Stack component='form' spacing={2} onSubmit={handleCreate}>
                        <Typography variant='subtitle1' component='h2'>
                            {t('profiles.newTitle')}
                        </Typography>
                        <TextField
                            id='profileName'
                            label={t('profiles.name')}
                            placeholder={t('profiles.namePlaceholder')}
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
                            <Button type='submit' variant='contained' sx={{ flexShrink: 0, height: 40 }}>
                                {t('profiles.create')}
                            </Button>
                        </Stack>
                        {pickManifest && (
                            <ManifestPicker
                                id='profileManifest'
                                manifests={manifests}
                                value={form.manifestId || manifests[0].id}
                                onChange={manifestId => setForm({ ...form, manifestId })}
                            />
                        )}
                        {versionsOffline && <Alert severity='info'>{t('profiles.versionsOffline')}</Alert>}
                        {error && <Alert severity='error'>{error}</Alert>}
                        {notice && <Alert severity='success'>{notice}</Alert>}
                    </Stack>
                </CardContent>
            </Card>

            {activeProfile && (
                <ServersCard key={activeProfile.id} profile={activeProfile} gameDir={profileGameDir(activeProfile)} />
            )}

            <ItemList>
                {profiles.map(profile => (
                    <ItemRow
                        key={profile.id}
                        actions={
                            <>
                                {profile.id === activeId ? (
                                    <Button variant='outlined' disabled>
                                        {t('profiles.active')}
                                    </Button>
                                ) : (
                                    <Button variant='contained' onClick={() => onSelect(profile.id)}>
                                        {t('profiles.use')}
                                    </Button>
                                )}
                                <Button
                                    onClick={() => handleEdit(profile)}
                                    aria-label={t('profiles.editNamed', { name: profile.name })}
                                >
                                    {t('profiles.edit')}
                                </Button>
                                {profile.id !== DEFAULT_PROFILE_ID && (
                                    <Button color='error' onClick={() => handleDelete(profile)}>
                                        {t('profiles.delete')}
                                    </Button>
                                )}
                            </>
                        }
                    >
                        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                            <Typography sx={{ fontWeight: 500 }}>{profile.name}</Typography>
                            <Chip
                                size='small'
                                variant='outlined'
                                label={
                                    profile.gameVersion
                                        ? versionLabel({ id: profile.gameVersion })
                                        : t('profiles.launcherProfiles')
                                }
                                title={profile.gameVersion}
                            />
                            {pickManifest && (
                                <Chip
                                    size='small'
                                    variant='outlined'
                                    label={t('profiles.followsManifest', { manifest: profileManifest(profile)?.name })}
                                />
                            )}
                        </Stack>
                        <Typography
                            variant='body2'
                            noWrap
                            title={profileGameDir(profile)}
                            sx={{ color: 'text.secondary' }}
                        >
                            {profileGameDir(profile)}
                        </Typography>
                    </ItemRow>
                ))}
            </ItemList>

            {editing && (
                <EditProfileDialog
                    key={editing.id}
                    profile={editing}
                    manifests={manifests}
                    versionOptions={versionOptions}
                    onFabricInstalled={handleFabricInstalled}
                    onSave={changes => handleSave(editing, changes)}
                    onClose={() => setEditing(null)}
                />
            )}
        </Page>
    );
}

export default Profiles;
