import { useCallback, useEffect, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DownloadIcon from '@mui/icons-material/Download';
import RefreshIcon from '@mui/icons-material/Refresh';
import Downloadspinner from '../../utils/Downloadspinner';
import { ItemList, ItemRow } from '../../utils/ItemList';
import categories from '../../../categories';
import { checkChannels, installChannelUpdates } from '../../../services/channelUpdates';
import { installBundle } from '../../../services/bundleInstaller';
import { detectTarget } from '../../../services/gameTarget';
import { DEFAULT_PROFILE_ID } from '../../../services/profiles';
import { checkUpdates, readModList, updateMod } from '../../../services/modrinthMods';

function StatusChip({ status }) {
    if (!status.latest) {
        return <Chip size='small' variant='outlined' label='Nothing published' />;
    }
    if (!status.outdated) {
        return <Chip size='small' color='success' variant='outlined' label='Up to date' />;
    }
    return <Chip size='small' color='warning' label={status.installed ? 'Update available' : 'Not installed'} />;
}

function describe(status) {
    if (!status.latest) {
        return status.installed ? `Installed ${status.installed}` : 'Not installed';
    }
    if (!status.outdated) {
        return `Installed ${status.installed}`;
    }
    return status.installed ? `${status.installed} → ${status.latest.id}` : `Latest is ${status.latest.id}`;
}

// Quick action: checks every manifest channel (and the Modrinth mods) of the active
// profile for updates and installs the latest of each with one click.
function ChannelUpdates({ profile, gameDir }) {
    const [statuses, setStatuses] = useState(null);
    const [modUpdates, setModUpdates] = useState([]);
    const [checking, setChecking] = useState(false);
    const [busy, setBusy] = useState(false);
    // Problems checking and problems installing are kept apart, so the check that runs
    // after an install doesn't hide why the install failed.
    const [checkError, setCheckError] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    // Modrinth mods are checked against the loader the profile plays with; without one
    // (vanilla, or the default profile with no version picked) there is nothing to check.
    const isDefault = profile.id === DEFAULT_PROFILE_ID;
    const target = useMemo(
        () => detectTarget(isDefault ? readModList(gameDir).target?.versionId : profile.gameVersion),
        [isDefault, profile.gameVersion, gameDir],
    );

    const check = useCallback(async () => {
        setChecking(true);
        setCheckError('');
        try {
            setStatuses(await checkChannels(categories, gameDir));
        } catch (checkError) {
            setCheckError(`Could not check the channels: ${checkError.message}`);
        }
        if (target && readModList(gameDir).mods.length > 0) {
            try {
                setModUpdates(await checkUpdates(gameDir, target));
            } catch (checkError) {
                setCheckError(current => current || `Could not check Modrinth for mod updates: ${checkError.message}`);
            }
        } else {
            setModUpdates([]);
        }
        setChecking(false);
    }, [gameDir, target]);

    useEffect(() => {
        check();
    }, [check]);

    // Runs an install, then checks again so the list shows what's installed now.
    async function run(action) {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            const message = await action();
            setNotice(message || '');
        } catch (actionError) {
            setError(actionError.message);
        }
        setBusy(false);
        await check();
    }

    function installOne(status) {
        run(async () => {
            await installBundle(status.category, status.latest, gameDir);
            return `Installed ${status.category.label} ${status.latest.id}.`;
        });
    }

    function installAll() {
        run(async () => {
            const failures = await installChannelUpdates(statuses || [], gameDir);
            const modFailures = [];
            for (const { mod, version } of modUpdates) {
                try {
                    await updateMod(gameDir, mod.projectId, version);
                } catch (updateError) {
                    modFailures.push(`${mod.title}: ${updateError.message}`);
                }
            }
            const problems = [
                ...failures.map(failure => `${failure.category.label}: ${failure.error.message}`),
                ...modFailures,
            ];
            if (problems.length > 0) {
                throw new Error(`Some updates failed. ${problems.join(' ')}`);
            }
            return 'Everything is up to date.';
        });
    }

    function updateMods() {
        run(async () => {
            for (const { mod, version } of modUpdates) {
                await updateMod(gameDir, mod.projectId, version);
            }
            return `Updated ${modUpdates.length} Modrinth ${modUpdates.length === 1 ? 'mod' : 'mods'}.`;
        });
    }

    const pending = (statuses || []).filter(status => status.outdated).length + modUpdates.length;
    const disabled = busy || checking;

    return (
        <Card variant='outlined'>
            <CardContent>
                <Stack spacing={2}>
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                        <Typography variant='subtitle1' component='h2' sx={{ flexGrow: 1 }}>
                            Updates for {profile.name}
                        </Typography>
                        <Button
                            startIcon={checking ? <Downloadspinner /> : <RefreshIcon />}
                            onClick={check}
                            disabled={disabled}
                        >
                            Check for updates
                        </Button>
                        <Button
                            variant='contained'
                            startIcon={busy ? <Downloadspinner /> : <DownloadIcon />}
                            onClick={installAll}
                            disabled={disabled || pending === 0}
                        >
                            {pending > 0 ? `Install all (${pending})` : 'Install all'}
                        </Button>
                    </Stack>
                    {statuses && (
                        <ItemList>
                            {statuses.map(status => (
                                <ItemRow
                                    key={status.category.id}
                                    leading={<status.category.icon color='action' />}
                                    actions={
                                        status.outdated && (
                                            <Button size='small' disabled={disabled} onClick={() => installOne(status)}>
                                                Install
                                            </Button>
                                        )
                                    }
                                >
                                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                                        <Typography sx={{ fontWeight: 500 }}>{status.category.label}</Typography>
                                        <StatusChip status={status} />
                                    </Stack>
                                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                        {describe(status)}
                                    </Typography>
                                </ItemRow>
                            ))}
                            {modUpdates.length > 0 && (
                                <ItemRow
                                    actions={
                                        <Button size='small' disabled={disabled} onClick={updateMods}>
                                            Update
                                        </Button>
                                    }
                                >
                                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                                        <Typography sx={{ fontWeight: 500 }}>Modrinth mods</Typography>
                                        <Chip size='small' color='warning' label='Update available' />
                                    </Stack>
                                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                        {modUpdates.map(({ mod }) => mod.title).join(', ')}
                                    </Typography>
                                </ItemRow>
                            )}
                        </ItemList>
                    )}
                    {checkError && <Alert severity='error'>{checkError}</Alert>}
                    {error && <Alert severity='error'>{error}</Alert>}
                    {notice && <Alert severity='success'>{notice}</Alert>}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default ChannelUpdates;
