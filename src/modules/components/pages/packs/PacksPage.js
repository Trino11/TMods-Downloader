import { useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import LinearProgress from '@mui/material/LinearProgress';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import Page from '../../utils/Page';
import ExportTab from './ExportTab';
import ImportTab from './ImportTab';
import PublishTab from './PublishTab';
import { profileTarget } from '../../../services/mrpack';
import { recogniseFiles, scanProfile } from '../../../services/packScan';

const TABS = [
    { id: 'export', label: 'Export' },
    { id: 'import', label: 'Import' },
    { id: 'publish', label: 'Publish' },
];

function ticked(items) {
    return new Set(items.filter(item => item.ticked).map(item => item.id));
}

// Export, import and publish whole packs (.mrpack) for the active profile: every kind of
// file at once, picked from one list. App remounts the page when the profile changes.
function PacksPage({ profile, gameDir, onProfilesChange }) {
    const [tab, setTab] = useState('export');
    const [items, setItems] = useState(() => scanProfile(gameDir));
    const [selected, setSelected] = useState(() => ticked(items));
    const [recognising, setRecognising] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const exportTarget = useMemo(() => {
        const { target, gameVersion } = profileTarget(profile);
        return target || (gameVersion ? { gameVersion } : null);
    }, [profile]);

    // Files added by hand may be on Modrinth; once they are recognised they go into packs
    // as links instead of copies.
    useEffect(() => {
        let live = true;
        recogniseFiles(gameDir)
            .then(count => live && count > 0 && setItems(scanProfile(gameDir)))
            .catch(() => {})
            .finally(() => live && setRecognising(false));
        return () => {
            live = false;
        };
    }, [gameDir]);

    // After an import or an undo the folder changed: list it again, picking what's new
    // by default and keeping the player's choices for the rest.
    function rescan() {
        const before = new Set(items.map(item => item.id));
        const next = scanProfile(gameDir);
        setItems(next);
        setSelected(
            current =>
                new Set(
                    next
                        .filter(item => (before.has(item.id) ? current.has(item.id) : item.ticked))
                        .map(item => item.id),
                ),
        );
    }

    // Runs one action at a time; it returns the message to show when it succeeds.
    async function run(action) {
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
    }

    function handleChanged() {
        rescan();
        onProfilesChange();
    }

    const shared = { profile, gameDir, target: exportTarget, items, selected, onSelect: setSelected, busy, run };

    return (
        <Page
            title='Packs'
            description={`Export, import and publish whole packs for ${profile.name}: mods, resource packs, shaders, configs and more, all at once.`}
        >
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs value={tab} onChange={(event, id) => setTab(id)}>
                    {TABS.map(({ id, label }) => (
                        <Tab key={id} value={id} label={label} />
                    ))}
                </Tabs>
            </Box>
            {busy && <LinearProgress />}
            {error && <Alert severity='error'>{error}</Alert>}
            {notice && <Alert severity='success'>{notice}</Alert>}
            {recognising && tab !== 'import' && (
                <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                    Looking up files you added by hand on Modrinth...
                </Typography>
            )}

            {tab === 'export' && <ExportTab {...shared} />}
            {tab === 'import' && (
                <ImportTab profile={profile} gameDir={gameDir} busy={busy} run={run} onChanged={handleChanged} />
            )}
            {tab === 'publish' && <PublishTab {...shared} />}
        </Page>
    );
}

export default PacksPage;
