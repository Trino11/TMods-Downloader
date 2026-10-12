import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import Link from '@mui/material/Link';
import SystemUpdateAltIcon from '@mui/icons-material/SystemUpdateAlt';
import { useTranslation } from '../../i18n';
import { installUpdate, onUpdateReady, readyUpdate, releaseUrl } from '../../services/appUpdates';

// Pops up once a new version of the app has downloaded: restart now to install it, or
// later, and it installs when the app is closed. "Later" hides it for that version until
// the app is opened again.
export default function UpdateDialog() {
    const { t } = useTranslation();
    const [update, setUpdate] = useState(null);
    const [dismissed, setDismissed] = useState('');
    const [installing, setInstalling] = useState(false);

    useEffect(() => {
        let active = true;
        readyUpdate()
            .then(ready => {
                if (active && ready) {
                    setUpdate(ready);
                }
            })
            .catch(error => console.error('Could not check for a downloaded update:', error));
        const stop = onUpdateReady(ready => setUpdate(ready));
        return () => {
            active = false;
            stop();
        };
    }, []);

    async function restart() {
        setInstalling(true);
        try {
            await installUpdate();
        } catch (error) {
            console.error('Could not install the update:', error);
            setInstalling(false);
        }
    }

    const open = Boolean(update) && update.version !== dismissed;
    return (
        <Dialog open={open} onClose={() => setDismissed(update.version)} maxWidth='xs' fullWidth>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <SystemUpdateAltIcon color='primary' />
                {t('updates.title')}
            </DialogTitle>
            <DialogContent>
                <DialogContentText>{t('updates.ready', { version: update?.version })}</DialogContentText>
                <DialogContentText sx={{ mt: 1 }}>
                    <Link href={releaseUrl(update?.version || '')} target='_blank' rel='noreferrer'>
                        {t('updates.whatsNew')}
                    </Link>
                </DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => setDismissed(update.version)} disabled={installing}>
                    {t('updates.later')}
                </Button>
                <Button variant='contained' onClick={restart} disabled={installing}>
                    {installing ? t('updates.restarting') : t('updates.restart')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}
