import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import VersionPicker from '../../profiles/VersionPicker';
import { describeVersionId, parseLoaderId } from '../../../services/loaderIds';
import { DEFAULT_PROFILE_ID, profileGameDir } from '../../../services/profiles';
import { profileManifest } from '../../../services/manifests';
import FabricInstall from './FabricInstall';
import ManifestPicker from './ManifestPicker';
import { useTranslation } from '../../../i18n';

// Everything about one profile in a window: its name, game version and manifest, where
// its files are, and installing Fabric for it. Nothing is saved until Save, which calls
// `onSave(changes)` with { name, gameVersion, manifestId } and closes the window, or
// shows the error it throws. The default profile only sends manifestId, and only when
// there are manifests to pick from. `onFabricInstalled` rebuilds the page's version
// list so the new Fabric version can be picked.
function EditProfileDialog({ profile, manifests, versionOptions, onFabricInstalled, onSave, onClose }) {
    const { t } = useTranslation();
    const isDefault = profile.id === DEFAULT_PROFILE_ID;
    const [name, setName] = useState(profile.name);
    const [gameVersion, setGameVersion] = useState(profile.gameVersion);
    const [manifestId, setManifestId] = useState(profileManifest(profile)?.id || manifests[0]?.id || '');
    const [fabricNotice, setFabricNotice] = useState('');
    const [error, setError] = useState('');
    const pickManifest = manifests.length > 1;

    function handleSubmit(event) {
        event.preventDefault();
        const changes = isDefault ? {} : { name, gameVersion };
        if (pickManifest) {
            changes.manifestId = manifestId;
        }
        try {
            onSave(changes);
            onClose();
        } catch (saveError) {
            setError(saveError.message);
        }
    }

    function handleFabricInstalled(versionId) {
        onFabricInstalled();
        if (isDefault) {
            // The default profile plays whatever the launcher picks, so just say it is there.
            setFabricNotice(t('profiles.fabricInstalledDefault', { version: describeVersionId(versionId) }));
            return;
        }
        setGameVersion(versionId);
        setFabricNotice(t('profiles.fabricPicked', { version: describeVersionId(versionId) }));
    }

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth='sm'>
            <form onSubmit={handleSubmit}>
                <DialogTitle>{t('profiles.editNamed', { name: profile.name })}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ pt: 1 }}>
                        {isDefault ? (
                            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                {t('profiles.defaultEditHelp')}
                            </Typography>
                        ) : (
                            <>
                                <TextField
                                    id='editProfileName'
                                    label={t('profiles.name')}
                                    placeholder={t('profiles.namePlaceholder')}
                                    fullWidth
                                    value={name}
                                    onChange={event => setName(event.target.value)}
                                    slotProps={{ htmlInput: { required: true }, inputLabel: { shrink: true } }}
                                />
                                <VersionPicker
                                    id='editProfileVersion'
                                    fullWidth
                                    options={versionOptions}
                                    value={gameVersion}
                                    onChange={setGameVersion}
                                />
                            </>
                        )}
                        {pickManifest && (
                            <ManifestPicker
                                id='editProfileManifest'
                                manifests={manifests}
                                value={manifestId}
                                onChange={setManifestId}
                            />
                        )}
                        <TextField
                            id='editProfileFolder'
                            label={t('profiles.folder')}
                            fullWidth
                            value={profileGameDir(profile)}
                            helperText={t('profiles.folderHelp')}
                            slotProps={{ htmlInput: { readOnly: true }, inputLabel: { shrink: true } }}
                        />
                        <Divider />
                        <FabricInstall
                            bare
                            preferredVersion={parseLoaderId(profile.gameVersion)?.gameVersion || profile.gameVersion}
                            description={isDefault ? undefined : t('profiles.fabricHelp')}
                            onInstalled={handleFabricInstalled}
                            notice={fabricNotice}
                        />
                        {error && <Alert severity='error'>{error}</Alert>}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose}>{t('common.cancel')}</Button>
                    <Button type='submit' variant='contained'>
                        {t('common.save')}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
}

export default EditProfileDialog;
