import { useCallback, useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogContent from '@mui/material/DialogContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DownloadIcon from '@mui/icons-material/Download';
import Downloadspinner from '../../utils/Downloadspinner';
import { ChangelogButton } from '../../utils/Changelog';
import PackImporter from '../packs/PackImporter';
import { changelogEntries, changelogOf, fetchLatestPack } from '../../../services/manifest';
import { downloadPublishedPack } from '../../../services/mrpack';
import { useTranslation } from '../../../i18n';

// Quick action: the newest whole pack the channel publishes. Download fetches it and
// shows the Packs page's import step, where the player picks what goes in and which
// profile it goes into (the active one by default, or a new one).
function LatestPack({ profile, onProfilesChange }) {
    const { t } = useTranslation();
    // undefined while loading, null when the channel has no packs.
    const [pack, setPack] = useState(undefined);
    const [loadError, setLoadError] = useState('');
    const [pending, setPending] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        let live = true;
        fetchLatestPack()
            .then(latest => live && setPack(latest))
            .catch(fetchError => live && setLoadError(fetchError.message));
        return () => {
            live = false;
        };
    }, []);

    // Runs one action at a time; it returns the message to show when it succeeds.
    const run = useCallback(async action => {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            setNotice((await action()) || '');
        } catch (actionError) {
            setError(actionError.message);
        } finally {
            setBusy(false);
        }
    }, []);

    function download() {
        run(async () => {
            setPending(await downloadPublishedPack(pack));
            return '';
        });
    }

    function handleImported() {
        setPending(null);
        onProfilesChange();
    }

    let body;
    if (loadError) {
        body = t('home.latestPack.loadFailed', { error: loadError });
    } else if (pack === undefined) {
        body = t('home.latestPack.loading');
    } else if (!pack) {
        body = t('home.latestPack.none');
    }

    return (
        <Card variant='outlined'>
            <CardContent>
                <Stack spacing={2}>
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant='subtitle1' component='h2' sx={{ flexGrow: 1 }}>
                            {t('home.latestPack.title')}
                        </Typography>
                        {pack && changelogOf(pack) && (
                            <ChangelogButton
                                title={t('home.latestPack.whatsNew', { id: pack.id })}
                                entries={changelogEntries([pack])}
                            />
                        )}
                        {pack && (
                            <Button
                                variant='contained'
                                startIcon={busy ? <Downloadspinner /> : <DownloadIcon />}
                                onClick={download}
                                disabled={busy}
                            >
                                {t('home.latestPack.download')}
                            </Button>
                        )}
                    </Stack>
                    {body ? (
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {body}
                        </Typography>
                    ) : (
                        <div>
                            <Typography sx={{ fontWeight: 500 }}>
                                {t('home.latestPack.pack', { id: pack.id })}
                            </Typography>
                            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                {[pack.target, pack.description].filter(Boolean).join(' · ') ||
                                    t('home.latestPack.pickProfile')}
                            </Typography>
                        </div>
                    )}
                    {error && <Alert severity='error'>{error}</Alert>}
                    {notice && <Alert severity='success'>{notice}</Alert>}
                </Stack>
            </CardContent>
            <Dialog open={Boolean(pending)} onClose={() => setPending(null)} maxWidth='md' fullWidth>
                <DialogContent sx={{ p: 0 }}>
                    {pending && (
                        <PackImporter
                            data={pending}
                            activeProfile={profile}
                            busy={busy}
                            run={run}
                            onImported={handleImported}
                            onCancel={() => setPending(null)}
                        />
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
}

export default LatestPack;
