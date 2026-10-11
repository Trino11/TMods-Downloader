import { useEffect, useState } from 'react';
import { installFabric, listFabricGameVersions } from '../../../services/fabric';

// Installs Fabric for a Minecraft version straight from Fabric's servers, so a
// profile can use it without running Fabric's installer. `onInstalled` gets the new
// launcher version id.
function FabricInstall({ onInstalled }) {
    const [versions, setVersions] = useState([]);
    const [gameVersion, setGameVersion] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let live = true;
        listFabricGameVersions()
            .then(list => {
                if (live) {
                    setVersions(list);
                    setGameVersion(list[0] || '');
                }
            })
            .catch(() => live && setError('Could not reach Fabric to list Minecraft versions.'));
        return () => { live = false; };
    }, []);

    async function handleInstall() {
        setBusy(true);
        setError('');
        try {
            onInstalled(await installFabric(gameVersion));
        } catch (installError) {
            setError(`Could not install Fabric: ${installError.message}`);
        } finally {
            setBusy(false);
        }
    }

    return <div className='settingsForm'>
        <label htmlFor='fabricVersion' className='form-label'>Install Fabric</label>
        <div className='settingsRow'>
            <select
                id='fabricVersion'
                aria-label='Fabric Minecraft version'
                className='form-select profileVersion'
                value={gameVersion}
                onChange={event => setGameVersion(event.target.value)}
                disabled={busy || versions.length === 0}
            >
                {versions.map(version => <option key={version} value={version}>{version}</option>)}
            </select>
            <button type='button' className='btn btn-primary' onClick={handleInstall} disabled={busy || !gameVersion}>
                {busy ? 'Installing...' : 'Install Fabric'}
            </button>
        </div>
        {error && <div className='text-danger mt-2'>{error}</div>}
    </div>
}

export default FabricInstall;
