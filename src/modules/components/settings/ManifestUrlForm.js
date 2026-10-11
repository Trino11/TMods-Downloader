import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Downloadspinner from '../utils/Downloadspinner';
import { validateManifestUrl } from '../../services/manifest';
import { getManifestUrl, setManifestUrl } from '../../services/settings';

// Asks for a manifest URL and only saves it once it loads a valid manifest.
function ManifestUrlForm({ onSaved }) {
    const [url, setUrl] = useState(getManifestUrl);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');
    const [saved, setSaved] = useState(false);

    async function handleSubmit(event) {
        event.preventDefault();
        const trimmed = url.trim();
        setChecking(true);
        setError('');
        setSaved(false);
        try {
            await validateManifestUrl(trimmed);
            setManifestUrl(trimmed);
            setUrl(trimmed);
            setSaved(true);
            onSaved?.(trimmed);
        } catch (validationError) {
            setError(validationError.message);
        } finally {
            setChecking(false);
        }
    }

    return (
        <Stack component='form' spacing={2} onSubmit={handleSubmit}>
            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                <TextField
                    id='manifestUrl'
                    label='Manifest URL'
                    type='url'
                    fullWidth
                    placeholder='https://example.com/manifest.json'
                    value={url}
                    onChange={event => {
                        setUrl(event.target.value);
                        setSaved(false);
                    }}
                    disabled={checking}
                    slotProps={{ htmlInput: { required: true }, inputLabel: { shrink: true } }}
                />
                <Button type='submit' variant='contained' disabled={checking} sx={{ minWidth: 96, height: 40 }}>
                    {checking ? <Downloadspinner /> : 'Save'}
                </Button>
            </Stack>
            {error && <Alert severity='error'>{error}</Alert>}
            {saved && <Alert severity='success'>Saved.</Alert>}
        </Stack>
    );
}

export default ManifestUrlForm;
