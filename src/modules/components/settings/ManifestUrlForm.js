import { useState } from 'react';
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

    return <form className='settingsForm' onSubmit={handleSubmit}>
        <label htmlFor='manifestUrl' className='form-label'>Manifest URL</label>
        <div className='settingsRow'>
            <input
                id='manifestUrl'
                type='url'
                className='form-control'
                placeholder='https://example.com/manifest.json'
                value={url}
                onChange={event => { setUrl(event.target.value); setSaved(false); }}
                disabled={checking}
                required
            />
            <button type='submit' className='btn btn-primary' disabled={checking}>
                {checking ? <Downloadspinner /> : 'Save'}
            </button>
        </div>
        {error && <div className='text-danger mt-2'>{error}</div>}
        {saved && <div className='text-success mt-2'>Saved.</div>}
    </form>
}

export default ManifestUrlForm;
