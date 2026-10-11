import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Downloadspinner from '../../utils/Downloadspinner';
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
        return () => {
            live = false;
        };
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

    return (
        <Card variant='outlined'>
            <CardContent>
                <Stack spacing={2}>
                    <Typography variant='subtitle1' component='h2'>
                        Install Fabric
                    </Typography>
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                        <TextField
                            id='fabricVersion'
                            label='Fabric Minecraft version'
                            select
                            value={gameVersion}
                            onChange={event => setGameVersion(event.target.value)}
                            disabled={busy || versions.length === 0}
                            slotProps={{ select: { native: true } }}
                            sx={{ width: 300 }}
                        >
                            {versions.map(version => (
                                <option key={version} value={version}>
                                    {version}
                                </option>
                            ))}
                        </TextField>
                        <Button
                            variant='contained'
                            onClick={handleInstall}
                            disabled={busy || !gameVersion}
                            startIcon={busy ? <Downloadspinner /> : null}
                        >
                            {busy ? 'Installing...' : 'Install Fabric'}
                        </Button>
                    </Stack>
                    {error && <Alert severity='error'>{error}</Alert>}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default FabricInstall;
