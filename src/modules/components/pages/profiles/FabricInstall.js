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
import { t, useTranslation } from '../../../i18n';

// Installs Fabric for a Minecraft version straight from Fabric's servers, so a
// profile can use it without running Fabric's installer. `onInstalled` gets the new
// launcher version id; `preferredVersion` is the Minecraft version picked at first when
// Fabric supports it, and `notice` a success message shown under the row.
function FabricInstall({ onInstalled, preferredVersion, title, description, notice }) {
    useTranslation();
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
                    setGameVersion(list.includes(preferredVersion) ? preferredVersion : list[0] || '');
                }
            })
            .catch(() => live && setError(t('profiles.fabric.listFailed')));
        return () => {
            live = false;
        };
    }, [preferredVersion]);

    async function handleInstall() {
        setBusy(true);
        setError('');
        try {
            onInstalled(await installFabric(gameVersion));
        } catch (installError) {
            setError(t('profiles.fabric.installFailed', { error: installError.message }));
        } finally {
            setBusy(false);
        }
    }

    return (
        <Card variant='outlined'>
            <CardContent>
                <Stack spacing={2}>
                    <Typography variant='subtitle1' component='h2'>
                        {title || t('profiles.fabric.title')}
                    </Typography>
                    {description && (
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {description}
                        </Typography>
                    )}
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                        <TextField
                            id='fabricVersion'
                            label={t('profiles.fabric.versionLabel')}
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
                            {busy ? t('profiles.fabric.installing') : t('profiles.fabric.install')}
                        </Button>
                    </Stack>
                    {error && <Alert severity='error'>{error}</Alert>}
                    {notice && <Alert severity='success'>{notice}</Alert>}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default FabricInstall;
