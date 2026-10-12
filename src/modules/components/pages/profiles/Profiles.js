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
import { describeVersionId } from '../../../services/loaderIds';
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
import FabricInstall from './FabricInstall';
import { useTranslation } from '../../../i18n';

const emptyForm = { id: null, name: '', gameVersion: LATEST_RELEASE, manifestId: '' };

// Picks one of the saved manifests (Settings) for a profile to follow.
function ManifestPicker({ id, manifests, value, onChange, size }) {
    const { t } = useTranslation();
    return (
        <TextField
            id={id}
            label={t('profiles.manifest')}
            select
            size={size}
            value={value}
            onChange={event => onChange(event.target.value)}
            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
            sx={{ minWidth: 200, maxWidth: 280 }}
        >
            {manifests.map(manifest => (
                <option key={manifest.id} value={manifest.id}>
                    {manifest.name}
                </option>
            ))}
        </TextField>
    );
}

// Create, edit and delete profiles. Each one gets its own game folder and an entry
// in the official Minecraft Launcher, and follows one of the saved `manifests`;
// `onChange` reloads the list in the app.
function Profiles({ profiles, manifests = [], activeId, onSelect, onChange }) {
    const { t } = useTranslation();
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
        return () => {
            cancelled = true;
        };
    }, []);

    // The manifest picker only shows when there is more than one to pick from.
    const pickManifest = manifests.length > 1;

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
            ? run(() => updateProfile(form.id, { name: form.name, gameVersion: form.gameVersion }), t('profiles.saved'))
            : run(
                  () => createProfile({ ...form, manifestId: form.manifestId || manifests[0]?.id }),
                  t('profiles.created'),
              );
        if (done) {
            resetForm();
        }
    }

    function handleEdit(profile) {
        setForm({ ...emptyForm, id: profile.id, name: profile.name, gameVersion: profile.gameVersion });
        setError('');
        setNotice('');
    }

    // Picks the freshly installed Fabric version for the profile being created or edited.
    function handleFabricInstalled(versionId) {
        // Fetching the version list also caches it, so this keeps Mojang's versions.
        setVersionOptions(buildVersionOptions(readCachedVersions()));
        setForm(current => ({ ...current, gameVersion: versionId }));
        setError('');
        setNotice(t('profiles.fabricSelected', { version: describeVersionId(versionId) }));
    }

    function handleManifestChange(profile, manifestId) {
        const manifest = manifests.find(item => item.id === manifestId);
        run(
            () => setProfileManifest(profile.id, manifestId),
            t('profiles.manifestChanged', { name: profile.name, manifest: manifest?.name }),
        );
    }

    function handleDelete(profile) {
        const folder = profileGameDir(profile);
        if (!window.confirm(t('profiles.confirmDelete', { name: profile.name, folder }))) {
            return;
        }
        run(() => deleteProfile(profile.id), t('profiles.deleted', { folder }));
        if (form.id === profile.id) {
            resetForm();
        }
    }

    return (
        <Page title={t('profiles.title')} description={t('profiles.description')}>
            <Card variant='outlined'>
                <CardContent>
                    <Stack component='form' spacing={2} onSubmit={handleSubmit}>
                        <Typography variant='subtitle1' component='h2'>
                            {form.id ? t('profiles.editTitle') : t('profiles.newTitle')}
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
                                {form.id ? t('common.save') : t('profiles.create')}
                            </Button>
                            {form.id && (
                                <Button type='button' onClick={resetForm} sx={{ flexShrink: 0, height: 40 }}>
                                    {t('common.cancel')}
                                </Button>
                            )}
                        </Stack>
                        {pickManifest && !form.id && (
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

            <FabricInstall onInstalled={handleFabricInstalled} />

            <ItemList>
                {profiles.map(profile => (
                    <ItemRow
                        key={profile.id}
                        actions={
                            <>
                                {pickManifest && (
                                    <ManifestPicker
                                        id={`manifest-${profile.id}`}
                                        size='small'
                                        manifests={manifests}
                                        value={profileManifest(profile)?.id}
                                        onChange={manifestId => handleManifestChange(profile, manifestId)}
                                    />
                                )}
                                {profile.id === activeId ? (
                                    <Button variant='outlined' disabled>
                                        {t('profiles.active')}
                                    </Button>
                                ) : (
                                    <Button variant='contained' onClick={() => onSelect(profile.id)}>
                                        {t('profiles.use')}
                                    </Button>
                                )}
                                {profile.id !== DEFAULT_PROFILE_ID && (
                                    <>
                                        <Button onClick={() => handleEdit(profile)}>{t('profiles.edit')}</Button>
                                        <Button color='error' onClick={() => handleDelete(profile)}>
                                            {t('profiles.delete')}
                                        </Button>
                                    </>
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
        </Page>
    );
}

export default Profiles;
