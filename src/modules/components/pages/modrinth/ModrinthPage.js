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
import { KINDS, LOADERS, SHADER_LOADERS } from '../../../services/modrinth';
import { applyFix, checkBeforeInstall, checkCompatibility } from '../../../services/modCompat';
import { detectTarget, gameVersionOf } from '../../../services/gameTarget';
import { DEFAULT_PROFILE_ID, LATEST_RELEASE, LATEST_SNAPSHOT, listGameVersions } from '../../../services/profiles';
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
    { id: 'mod', label: 'Mods' },
    { id: 'resourcepack', label: 'Resource packs' },
    { id: 'shader', label: 'Shaders' },
    { id: 'installed', label: 'Installed' },
    { id: 'modpacks', label: 'Modpacks' },
];

const KIND_IDS = Object.keys(KINDS);

function listAllUnmanaged(gameDir) {
    return Object.fromEntries(KIND_IDS.map(kind => [kind, listUnmanaged(gameDir, kind)]));
}

const COMPAT_UNCHECKED = { status: 'idle', problems: [], error: '' };

function describeTarget(target) {
    return `${LOADERS[target.loader]} ${target.loaderVersion} · Minecraft ${target.gameVersion}`;
}

// Which version the folder plays with. Resource packs and shaders only need the
// Minecraft version; mods also need a loader. The default profile can be played with
// any launcher version, so the player picks one here; other profiles set it in Profiles.
function TargetBar({ profile, versionId, target, gameVersion, onPick }) {
    const [choice, setChoice] = useState('');
    if (target) {
        return (
            <Alert severity='success' icon={false}>
                Content is picked for <strong>{describeTarget(target)}</strong>.
            </Alert>
        );
    }
    if (versionId && gameVersion) {
        return (
            <Alert severity='info'>
                This profile plays Minecraft {gameVersion}, which has no mod loader, so only resource packs and shaders
                are offered. For mods, install Fabric, Forge, NeoForge or Quilt with its installer, then pick that
                version for the profile in Profiles.
            </Alert>
        );
    }
    if (profile.id !== DEFAULT_PROFILE_ID) {
        return (
            <Alert severity='warning'>
                TMods doesn't know which Minecraft version {versionId} is yet. Open Profiles once so it can load the
                version list, or pick a specific version for this profile.
            </Alert>
        );
    }
    const installed = listGameVersions().filter(id => id !== LATEST_RELEASE && id !== LATEST_SNAPSHOT);
    // Mod loader versions first, since they unlock everything.
    const versions = [...installed.filter(id => detectTarget(id)), ...installed.filter(id => !detectTarget(id))];
    if (versions.length === 0) {
        return (
            <Alert severity='warning'>
                No Minecraft version is installed yet. Play once with the Minecraft Launcher, or install Fabric, Forge,
                NeoForge or Quilt for mods, then come back here.
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
                        {versions.map(id => (
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

// Shader packs are written for one shader mod; the player says which they use.
function ShaderLoaderPicker({ value, onChange, hasLoader }) {
    return (
        <Stack spacing={1}>
            <TextField
                id='shaderLoader'
                label='Shader mod'
                select
                value={value}
                onChange={event => onChange(event.target.value)}
                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                sx={{ maxWidth: 280 }}
            >
                {Object.entries(SHADER_LOADERS).map(([id, label]) => (
                    <option key={id} value={id}>
                        {label}
                    </option>
                ))}
            </TextField>
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {hasLoader
                    ? 'Shaders only work with a shader mod installed: Iris on Fabric, Quilt or NeoForge (find it under Mods), Oculus on Forge, or OptiFine.'
                    : 'Shaders only work with a shader mod: OptiFine, or Iris on a mod loader such as Fabric.'}
            </Typography>
        </Stack>
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

// Single mods, resource packs, shaders and modpacks from Modrinth for the active
// profile. App remounts the page
// when the profile changes.
function ModrinthPage({ profile, gameDir, onProfilesChange }) {
    const [tab, setTab] = useState('mod');
    const [list, setList] = useState(() => readModList(gameDir));
    const [unmanaged, setUnmanaged] = useState(() => listAllUnmanaged(gameDir));
    const [shaderLoader, setShaderLoader] = useState('iris');
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
    const gameVersion = useMemo(() => target?.gameVersion || gameVersionOf(versionId), [target, versionId]);

    // The Modrinth loader and game version each kind is searched and installed for:
    // mods need the profile's loader; packs and shaders only the game version.
    const installTargets = useMemo(
        () => ({
            mod: target && { loader: target.loader, gameVersion: target.gameVersion },
            resourcepack: gameVersion && { loader: KINDS.resourcepack.loader, gameVersion },
            shader: gameVersion && { loader: shaderLoader, gameVersion },
        }),
        [target, gameVersion, shaderLoader],
    );
    const searchFilters = useMemo(
        () =>
            Object.fromEntries(
                KIND_IDS.map(kind => {
                    const kindTarget = installTargets[kind];
                    if (!kindTarget) {
                        return [kind, null];
                    }
                    // Resource packs are all filed under the "minecraft" loader, so it filters nothing.
                    const loader = kind === 'resourcepack' ? undefined : kindTarget.loader;
                    return [
                        kind,
                        { projectType: KINDS[kind].projectType, loader, gameVersion: kindTarget.gameVersion },
                    ];
                }),
            ),
        [installTargets],
    );
    const installedIds = new Set(list.mods.map(mod => mod.projectId));

    function reload() {
        setList(readModList(gameDir));
        setUnmanaged(listAllUnmanaged(gameDir));
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

    function install(hit, kind) {
        run(async () => {
            // Packs and shaders need no mod loader, so there is nothing to check for them.
            if (kind !== 'mod') {
                return installNow(hit, { kind });
            }
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
        const kindTarget = options.kind ? installTargets[options.kind] : target;
        const titles = await installMod(gameDir, kindTarget, hit.project_id, hit.title, options);
        return titles.length > 1
            ? `Installed ${titles[0]} with ${titles.slice(1).join(', ')}.`
            : `Installed ${titles[0]}.`;
    }

    function handleCheckUpdates() {
        run(async () => {
            const found = await checkUpdates(gameDir, target, gameVersion);
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

    function handleAdopt(kind) {
        run(async () => {
            const count = await adoptUnmanaged(gameDir, kind);
            return count
                ? `Recognised ${count} ${KINDS[kind].noun}(s) from Modrinth.`
                : 'None of them were found on Modrinth.';
        });
    }

    function searchTab(kind) {
        const { noun, label } = KINDS[kind];
        if (!searchFilters[kind]) {
            return (
                <Typography sx={{ color: 'text.secondary' }}>
                    {kind === 'mod'
                        ? 'Set up a mod loader above to search for mods.'
                        : `Pick the Minecraft version above to search for ${label.toLowerCase()}.`}
                </Typography>
            );
        }
        return (
            <Stack spacing={2}>
                {kind === 'shader' && (
                    <ShaderLoaderPicker value={shaderLoader} onChange={setShaderLoader} hasLoader={Boolean(target)} />
                )}
                <ProjectSearch
                    key={kind}
                    filters={searchFilters[kind]}
                    placeholder={`Search ${label.toLowerCase()}`}
                    action={hit =>
                        installedIds.has(hit.project_id) ? (
                            <Button variant='outlined' disabled>
                                Installed
                            </Button>
                        ) : (
                            <Button
                                variant='contained'
                                disabled={busy}
                                aria-label={`Install ${hit.title} (${noun})`}
                                onClick={() => install(hit, kind)}
                            >
                                Install
                            </Button>
                        )
                    }
                />
            </Stack>
        );
    }

    function handlePickTarget(id) {
        setTargetVersion(gameDir, id);
        reload();
    }

    return (
        <Page title='Modrinth'>
            <TargetBar
                profile={profile}
                versionId={versionId}
                target={target}
                gameVersion={gameVersion}
                onPick={handlePickTarget}
            />
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

            {KINDS[tab] && searchTab(tab)}

            {tab === 'installed' && (
                <InstalledMods
                    mods={list.mods}
                    unmanaged={unmanaged}
                    updates={updates}
                    target={target}
                    gameVersion={gameVersion}
                    busy={busy}
                    canCheckUpdates={Boolean(target || gameVersion)}
                    onCheckUpdates={handleCheckUpdates}
                    onUpdate={(mod, version) => applyUpdates([{ mod, version }])}
                    onUpdateAll={() => applyUpdates(updates)}
                    onToggle={mod => run(async () => setModEnabled(gameDir, mod.projectId, !mod.enabled))}
                    onRemove={handleRemove}
                    onAdopt={handleAdopt}
                    canCheckCompat={Boolean(target)}
                    compat={compat}
                    onCheckCompat={checkCompat}
                    onFix={problem => run(() => applyFix(gameDir, target, problem))}
                />
            )}

            {tab === 'modpacks' && (
                <Modpacks profile={profile} busy={busy} run={run} onProfileCreated={onProfilesChange} />
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
