import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Link from '@mui/material/Link';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { useTranslation } from '../../i18n';
import {
    availableUpdate,
    installUpdateNow,
    installUpdateOnQuit,
    onUpdateAvailable,
    releaseUrl,
} from '../../services/appUpdates';

// Asks, when the app opens and a newer version is out, what to do with it: dismiss it
// (nothing is downloaded; the question comes back next time the app opens), install it
// now (download, restart into it) or install it on quit (download in the background).
export default function UpdateDialog() {
    const { t } = useTranslation();
    const [update, setUpdate] = useState(null);
    const [open, setOpen] = useState(false);
    const [installing, setInstalling] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        function show(found) {
            if (active && found) {
                setUpdate(found);
                setOpen(true);
            }
        }
        availableUpdate()
            .then(show)
            .catch(checkError => console.error('Could not check for an app update:', checkError));
        const stop = onUpdateAvailable(show);
        return () => {
            active = false;
            stop();
        };
    }, []);

    async function installNow() {
        setInstalling(true);
        setError('');
        try {
            // The app closes once the update is in, so this only returns on failure.
            await installUpdateNow();
        } catch (installError) {
            setError(t('updates.failed', { message: installError.message }));
            setInstalling(false);
        }
    }

    function installOnQuit() {
        setOpen(false);
        installUpdateOnQuit().catch(installError => console.error('Could not download the update:', installError));
    }

    return (
        <Dialog open={open} onClose={() => !installing && setOpen(false)} maxWidth='xs' fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SystemUpdateAltIcon color='primary' />
                {t('updates.title')}
            </DialogTitle>
            <DialogContent>
                <DialogContentText>{t('updates.available', { version: update?.version })}</DialogContentText>
                <DialogContentText sx={{ mt: 1 }}>
                    <Link href={releaseUrl(update?.version || '')} target='_blank' rel='noreferrer'>
                        {t('updates.whatsNew')}
                    </Link>
                </DialogContentText>
                {installing && (
                    <>
                        <DialogContentText sx={{ mt: 2 }}>{t('updates.downloading')}</DialogContentText>
                        <LinearProgress sx={{ mt: 1 }} />
                    </>
                )}
                {error && (
                    <Alert severity='error' sx={{ mt: 2 }}>
                        {error}
                    </Alert>
                )}
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setOpen(false)} disabled={installing}>
                    {t('updates.dismiss')}
                </Button>
                <Button onClick={installOnQuit} disabled={installing}>
                    {t('updates.installOnQuit')}
                </Button>
                <Button variant='contained' onClick={installNow} disabled={installing}>
                    {t('updates.installNow')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
