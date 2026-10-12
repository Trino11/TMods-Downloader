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
import { PackStatusChip, describePackStatus } from '../packs/PackStatus';
import { fetchPackUpdates } from '../../../services/manifest';
import { downloadPublishedPack, readInstalledPack } from '../../../services/mrpack';
import { useTranslation } from '../../../i18n';

// Quick action: the newest whole pack the channel publishes, and whether the active
// profile has it (Up to date) or an older one (Update available, with what's new).
// Download or Update fetches it and shows the Packs page's import step, where the
// player picks what goes in and which profile it goes into (the active one by default,
// or a new one). Home remounts it when the active profile changes.
function LatestPack({ profile, gameDir, onProfilesChange }) {
    const { t } = useTranslation();
    // undefined while loading; status.latest is null when the channel has no packs.
    const [status, setStatus] = useState(undefined);
    const [checks, setChecks] = useState(0);
    const [loadError, setLoadError] = useState('');
    const [pending, setPending] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    useEffect(() => {
        let live = true;
        fetchPackUpdates(readInstalledPack(gameDir))
            .then(result => live && setStatus(result))
            .catch(fetchError => live && setLoadError(fetchError.message));
        return () => {
            live = false;
        };
    }, [gameDir, checks]);

    const pack = status?.latest;

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
            setPending({ data: await downloadPublishedPack(pack), pack });
            return '';
        });
    }

    function handleImported() {
        setPending(null);
        setChecks(count => count + 1);
        onProfilesChange();
    }

    let body;
    if (loadError) {
        body = t('home.latestPack.loadFailed', { error: loadError });
    } else if (status === undefined) {
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
                        {pack && status.changes.length > 0 && (
                            <ChangelogButton
                                title={t('home.latestPack.whatsNew', { id: pack.id })}
                                entries={status.changes}
                            />
                        )}
                        {pack && (
                            <Button
                                // Up to date, it can still go into another profile.
                                variant={status.installed && !status.outdated ? 'outlined' : 'contained'}
                                startIcon={busy ? <Downloadspinner /> : <DownloadIcon />}
                                onClick={download}
                                disabled={busy}
                            >
                                {status.outdated ? t('home.latestPack.update') : t('home.latestPack.download')}
                            </Button>
                        )}
                    </Stack>
                    {body ? (
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {body}
                        </Typography>
                    ) : (
                        <div>
                            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                                <Typography sx={{ fontWeight: 500 }}>
                                    {t('home.latestPack.pack', { id: pack.id })}
                                </Typography>
                                <PackStatusChip status={status} />
                            </Stack>
                            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                {status.installed
                                    ? t('home.latestPack.inProfile', {
                                          status: describePackStatus(status),
                                          profile: profile.name,
                                      })
                                    : [pack.target, pack.description].filter(Boolean).join(' · ') ||
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
                            data={pending.data}
                            channelPack={pending.pack}
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
