import { useMemo, useRef, useState } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Page from '../../utils/Page';
import ProjectSearch from './ProjectSearch';
import InstalledMods from './InstalledMods';
import Modpacks from './Modpacks';
import { LOADERS } from '../../../services/modrinth';
import { applyFix, checkBeforeInstall, checkCompatibility } from '../../../services/modCompat';
import { detectTarget } from '../../../services/gameTarget';
import { DEFAULT_PROFILE_ID, listGameVersions } from '../../../services/profiles';
import {
    adoptUnmanaged,
    checkUpdates,
    installMod,
    listUnmanaged,
    readModList,
    removeMod,
    setModEnabled,
    setTargetVersion,
    updateMod,
} from '../../../services/modrinthMods';

const TABS = [
    { id: 'search', label: 'Search mods' },
    { id: 'installed', label: 'Installed' },
    { id: 'modpacks', label: 'Modpacks' },
];

const COMPAT_UNCHECKED = { status: 'idle', problems: [], error: '' };

function describeTarget(target) {
    return `${LOADERS[target.loader]} ${target.loaderVersion} · Minecraft ${target.gameVersion}`;
}

// Which loader the folder plays with. The default profile can be played with any
// launcher version, so the player picks one here; other profiles set it in Profiles.
function TargetBar({ profile, versionId, target, onPick }) {
    const [choice, setChoice] = useState('');
    if (target) {
        return (
            <Alert severity='success' icon={false}>
                Mods are picked for <strong>{describeTarget(target)}</strong>.
            </Alert>
        );
    }
    if (profile.id !== DEFAULT_PROFILE_ID) {
        return (
            <Alert severity='warning'>
                This profile plays {versionId}, which has no mod loader. Install Fabric, Forge, NeoForge or Quilt with
                its installer, then pick that version for the profile in Profiles.
            </Alert>
        );
    }
    const loaderVersions = listGameVersions().filter(id => detectTarget(id));
    if (loaderVersions.length === 0) {
        return (
            <Alert severity='warning'>
                No mod loader is installed. Install Fabric, Forge, NeoForge or Quilt with its installer, then come back
                here.
            </Alert>
        );
    }
    return (
        <Card variant='outlined'>
            <CardContent>
                <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                    <TextField
                        id='loaderVersion'
                        label='Which installed version do you play this folder with?'
                        select
                        fullWidth
                        value={choice}
                        onChange={event => setChoice(event.target.value)}
                        slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                    >
                        <option value=''>Pick a version</option>
                        {loaderVersions.map(id => (
                            <option key={id} value={id}>
                                {id}
                            </option>
                        ))}
                    </TextField>
                    <Button variant='contained' disabled={!choice} onClick={() => onPick(choice)}>
                        Use
                    </Button>
                </Stack>
            </CardContent>
        </Card>
    );
}

// Asks before installing a mod that may not work with this profile.
function InstallWarning({ pending, onCancel, onConfirm }) {
    return (
        <Dialog open={Boolean(pending)} onClose={onCancel}>
            <DialogTitle>Install {pending?.hit.title} anyway?</DialogTitle>
            <DialogContent>
                <Stack spacing={1}>
                    {pending?.warnings.map(warning => (
                        <Typography key={warning}>{warning}</Typography>
                    ))}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onCancel}>Cancel</Button>
                <Button color='warning' onClick={onConfirm}>
                    Install anyway
                </Button>
            </DialogActions>
        </Dialog>
    );
}

// Single mods and modpacks from Modrinth for the active profile. App remounts the page
// when the profile changes.
function ModrinthPage({ profile, gameDir, onProfilesChange }) {
    const [tab, setTab] = useState('search');
    const [list, setList] = useState(() => readModList(gameDir));
    const [unmanaged, setUnmanaged] = useState(() => listUnmanaged(gameDir));
    const [updates, setUpdates] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [compat, setCompat] = useState(COMPAT_UNCHECKED);
    const [pendingInstall, setPendingInstall] = useState(null);
    // Bumped whenever the folder changes, so a compatibility check that finishes after
    // that is dropped instead of showing problems that may be gone.
    const compatRun = useRef(0);

    const versionId = profile.id === DEFAULT_PROFILE_ID ? list.target?.versionId : profile.gameVersion;
    const target = useMemo(() => detectTarget(versionId), [versionId]);
    const searchFilters = useMemo(
        () => target && { projectType: 'mod', loader: target.loader, gameVersion: target.gameVersion },
        [target],
    );
    const installedIds = new Set(list.mods.map(mod => mod.projectId));

    function reload() {
        setList(readModList(gameDir));
        setUnmanaged(listUnmanaged(gameDir));
        compatRun.current++;
        setCompat(COMPAT_UNCHECKED);
    }

    // Checks the installed mods against the profile. Runs when the Installed tab opens and
    // after every change to the folder made while it is open.
    function checkCompat() {
        if (!target) {
            return;
        }
        const id = ++compatRun.current;
        setCompat({ status: 'checking', problems: [], error: '' });
        checkCompatibility(gameDir, target)
            .then(problems => id === compatRun.current && setCompat({ status: 'done', problems, error: '' }))
            .catch(
                checkError =>
                    id === compatRun.current && setCompat({ status: 'error', problems: [], error: checkError.message }),
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
            reload();
            setBusy(false);
            if (tab === 'installed') {
                checkCompat();
            }
        }
    }

    function install(hit) {
        run(async () => {
            const warnings = await checkBeforeInstall(gameDir, target, hit.project_id).catch(() => []);
            if (warnings.length > 0) {
                setPendingInstall({ hit, warnings });
                return '';
            }
            return installNow(hit);
        });
    }

    function confirmInstall() {
        const { hit } = pendingInstall;
        setPendingInstall(null);
        run(() => installNow(hit, { allowIncompatible: true }));
    }

    async function installNow(hit, options = {}) {
        const titles = await installMod(gameDir, target, hit.project_id, hit.title, options);
        return titles.length > 1
            ? `Installed ${titles[0]} with ${titles.slice(1).join(', ')}.`
            : `Installed ${titles[0]}.`;
    }

    function handleCheckUpdates() {
        run(async () => {
            const found = await checkUpdates(gameDir, target);
            setUpdates(found);
            return found.length ? `${found.length} update(s) available.` : 'Everything is up to date.';
        });
    }

    function applyUpdates(selected) {
        run(async () => {
            for (const { mod, version } of selected) {
                await updateMod(gameDir, mod.projectId, version);
            }
            const done = new Set(selected.map(update => update.mod.projectId));
            setUpdates(current => current.filter(update => !done.has(update.mod.projectId)));
            return `Updated ${selected.map(update => update.mod.title).join(', ')}.`;
        });
    }

    function handleRemove(mod) {
        if (!window.confirm(`Remove ${mod.title}?`)) {
            return;
        }
        run(async () => `Removed ${removeMod(gameDir, mod.projectId).join(', ')}.`);
    }

    function handleAdopt() {
        run(async () => {
            const count = await adoptUnmanaged(gameDir);
            return count ? `Recognised ${count} mod(s) from Modrinth.` : 'None of them were found on Modrinth.';
        });
    }

    function handlePickTarget(id) {
        setTargetVersion(gameDir, id);
        reload();
    }

    return (
        <Page title='Modrinth'>
            <TargetBar profile={profile} versionId={versionId} target={target} onPick={handlePickTarget} />
            <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                <Tabs
                    value={tab}
                    onChange={(event, id) => {
                        setTab(id);
                        if (id === 'installed') {
                            checkCompat();
                        }
                    }}
                >
                    {TABS.map(({ id, label }) => (
                        <Tab
                            key={id}
                            value={id}
                            label={id === 'installed' ? `${label} (${list.mods.length})` : label}
                        />
                    ))}
                </Tabs>
            </Box>
            {busy && <LinearProgress />}
            {error && <Alert severity='error'>{error}</Alert>}
            {notice && <Alert severity='success'>{notice}</Alert>}

            {tab === 'search' &&
                (target ? (
                    <ProjectSearch
                        filters={searchFilters}
                        placeholder='Search mods'
                        action={hit =>
                            installedIds.has(hit.project_id) ? (
                                <Button variant='outlined' disabled>
                                    Installed
                                </Button>
                            ) : (
                                <Button variant='contained' disabled={busy} onClick={() => install(hit)}>
                                    Install
                                </Button>
                            )
                        }
                    />
                ) : (
                    <Typography sx={{ color: 'text.secondary' }}>
                        Set up a mod loader above to search for mods.
                    </Typography>
                ))}

            {tab === 'installed' && (
                <InstalledMods
                    mods={list.mods}
                    unmanaged={unmanaged}
                    updates={updates}
                    busy={busy}
                    canCheckUpdates={Boolean(target)}
                    onCheckUpdates={handleCheckUpdates}
                    onUpdate={(mod, version) => applyUpdates([{ mod, version }])}
                    onUpdateAll={() => applyUpdates(updates)}
                    onToggle={mod => run(async () => setModEnabled(gameDir, mod.projectId, !mod.enabled))}
                    onRemove={handleRemove}
                    onAdopt={handleAdopt}
                    compat={compat}
                    onCheckCompat={checkCompat}
                    onFix={problem => run(() => applyFix(gameDir, target, problem))}
                />
            )}

            {tab === 'modpacks' && (
                <Modpacks
                    profile={profile}
                    gameDir={gameDir}
                    target={target}
                    busy={busy}
                    run={run}
                    onProfileCreated={onProfilesChange}
                />
            )}
            <InstallWarning
                pending={pendingInstall}
                onCancel={() => setPendingInstall(null)}
                onConfirm={confirmInstall}
            />
        </Page>
    );
}

export default ModrinthPage;
