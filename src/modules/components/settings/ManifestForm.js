import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Downloadspinner from '../utils/Downloadspinner';
import { validateManifestUrl } from '../../services/manifest';
import { addManifest, updateManifest } from '../../services/manifests';
import { useTranslation } from '../../i18n';

// Adds a manifest, or edits `manifest` when given. The URL is only saved once it loads
// a valid manifest; the name is optional and defaults to where the manifest comes from.
function ManifestForm({ manifest, onSaved, onCancel }) {
    const { t } = useTranslation();
    const [name, setName] = useState(manifest?.name || '');
    const [url, setUrl] = useState(manifest?.url || '');
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');

    async function handleSubmit(event) {
        event.preventDefault();
        const trimmed = url.trim();
        setChecking(true);
        setError('');
        try {
            await validateManifestUrl(trimmed);
            const entry = { name, url: trimmed };
            const saved = manifest ? updateManifest(manifest.id, entry) : addManifest(entry);
            if (!manifest) {
                setName('');
                setUrl('');
            }
            onSaved?.(saved);
        } catch (validationError) {
            setError(validationError.message);
        } finally {
            setChecking(false);
        }
    }

    return (
        <Stack component='form' spacing={2} onSubmit={handleSubmit}>
            <TextField
                id={manifest ? `manifestName-${manifest.id}` : 'manifestName'}
                label={t('settings.manifest.name')}
                placeholder={t('settings.manifest.namePlaceholder')}
                fullWidth
                value={name}
                onChange={event => setName(event.target.value)}
                disabled={checking}
                slotProps={{ inputLabel: { shrink: true } }}
            />
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                <TextField
                    id={manifest ? `manifestUrl-${manifest.id}` : 'manifestUrl'}
                    label={t('settings.manifest.label')}
                    type='url'
                    fullWidth
                    placeholder='https://example.com/manifest.json'
                    value={url}
                    onChange={event => setUrl(event.target.value)}
                    disabled={checking}
                    slotProps={{ htmlInput: { required: true }, inputLabel: { shrink: true } }}
                />
                <Button type='submit' variant='contained' disabled={checking} sx={{ minWidth: 96, height: 40 }}>
                    {checking ? <Downloadspinner /> : manifest ? t('common.save') : t('settings.manifest.add')}
                </Button>
                {onCancel && (
                    <Button type='button' onClick={onCancel} disabled={checking} sx={{ height: 40 }}>
                        {t('common.cancel')}
                    </Button>
                )}
            </Stack>
            {error && <Alert severity='error'>{error}</Alert>}
        </Stack>
    );
}

export default ManifestForm;
