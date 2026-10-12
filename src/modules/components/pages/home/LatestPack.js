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

// Quick action: the newest whole pack the channel publishes. Download fetches it and
// shows the Packs page's import step, where the player picks what goes in and which
// profile it goes into (the active one by default, or a new one).
function LatestPack({ profile, onProfilesChange }) {
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
        body = `Could not load your channel's packs: ${loadError}`;
    } else if (pack === undefined) {
        body = "Loading your channel's latest pack...";
    } else if (!pack) {
        body = 'Your channel has no packs yet. Publish one from the Packs page.';
    }

    return (
        <Card variant='outlined'>
            <CardContent>
                <Stack spacing={2}>
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant='subtitle1' component='h2' sx={{ flexGrow: 1 }}>
                            Latest pack
                        </Typography>
                        {pack && changelogOf(pack) && (
                            <ChangelogButton
                                title={`What's new in pack ${pack.id}`}
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
                                Download
                            </Button>
                        )}
                    </Stack>
                    {body ? (
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {body}
                        </Typography>
                    ) : (
                        <div>
                            <Typography sx={{ fontWeight: 500 }}>Pack {pack.id}</Typography>
                            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                {[pack.target, pack.description].filter(Boolean).join(' · ') ||
                                    'You pick the profile it goes into before anything changes.'}
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
