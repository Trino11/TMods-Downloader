import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ItemList, ItemRow } from '../utils/ItemList';
import ManifestForm from './ManifestForm';
import { listManifests, removeManifest } from '../../services/manifests';
import { useTranslation } from '../../i18n';

// The manifests the player follows. Each profile picks one of them on the Profiles
// page; `onChange` tells the app the list changed.
function ManifestsSection({ onChange }) {
    const { t } = useTranslation();
    const [manifests, setManifests] = useState(listManifests);
    const [editing, setEditing] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    function refresh(message) {
        setManifests(listManifests());
        setEditing(null);
        setError('');
        setNotice(message);
        onChange?.();
    }

    function handleRemove(manifest) {
        if (!window.confirm(t('settings.manifest.confirmRemove', { name: manifest.name }))) {
            return;
        }
        try {
            removeManifest(manifest.id);
            refresh(t('settings.manifest.removed', { name: manifest.name }));
        } catch (removeError) {
            setNotice('');
            setError(removeError.message);
        }
    }

    return (
        <Stack spacing={2}>
            <Typography variant='h6' component='h2'>
                {t('settings.manifest.title')}
            </Typography>
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {t('settings.manifest.description')}
            </Typography>
            <ItemList>
                {manifests.map(manifest =>
                    editing === manifest.id ? (
                        <ItemRow key={manifest.id}>
                            <ManifestForm
                                manifest={manifest}
                                onSaved={saved => refresh(t('settings.manifest.saved', { name: saved.name }))}
                                onCancel={() => setEditing(null)}
                            />
                        </ItemRow>
                    ) : (
                        <ItemRow
                            key={manifest.id}
                            actions={
                                <>
                                    <Button onClick={() => setEditing(manifest.id)}>
                                        {t('settings.manifest.edit')}
                                    </Button>
                                    <Button
                                        color='error'
                                        disabled={manifests.length <= 1}
                                        onClick={() => handleRemove(manifest)}
                                    >
                                        {t('settings.manifest.remove')}
                                    </Button>
                                </>
                            }
                        >
                            <Typography sx={{ fontWeight: 500 }}>{manifest.name}</Typography>
                            <Typography variant='body2' noWrap title={manifest.url} sx={{ color: 'text.secondary' }}>
                                {manifest.url}
                            </Typography>
                        </ItemRow>
                    ),
                )}
            </ItemList>
            <Typography variant='subtitle2' component='h3'>
                {t('settings.manifest.addTitle')}
            </Typography>
            <ManifestForm onSaved={saved => refresh(t('settings.manifest.added', { name: saved.name }))} />
            {error && <Alert severity='error'>{error}</Alert>}
            {notice && <Alert severity='success'>{notice}</Alert>}
        </Stack>
    );
}

export default ManifestsSection;
