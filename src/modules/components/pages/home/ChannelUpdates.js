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
import { ChangelogButton } from '../../utils/Changelog';
import categories from '../../../categories';
import { checkChannels, installChannelUpdates } from '../../../services/channelUpdates';
import { installBundle } from '../../../services/bundleInstaller';
import { detectTarget, gameVersionOf } from '../../../services/gameTarget';
import { DEFAULT_PROFILE_ID } from '../../../services/profiles';
import { checkUpdates, readModList, updateChangelog, updateMod } from '../../../services/modrinthMods';
import { t, useTranslation } from '../../../i18n';

function StatusChip({ status }) {
    if (!status.latest) {
        return <Chip size='small' variant='outlined' label={t('home.updates.nothingPublished')} />;
    }
    if (!status.outdated) {
        return <Chip size='small' color='success' variant='outlined' label={t('home.updates.upToDate')} />;
    }
    return (
        <Chip
            size='small'
            color='warning'
            label={status.installed ? t('home.updates.updateAvailable') : t('home.updates.notInstalled')}
        />
    );
}

function describe(status) {
    if (!status.latest) {
        return status.installed
            ? t('home.updates.installed', { version: status.installed })
            : t('home.updates.notInstalled');
    }
    if (!status.outdated) {
        return t('home.updates.installed', { version: status.installed });
    }
    return status.installed
        ? `${status.installed} → ${status.latest.id}`
        : t('home.updates.latestIs', { version: status.latest.id });
}

// The changelogs of every pending Modrinth update, each version labelled with its project.
async function loadModChangelogs(updates, target, gameVersion) {
    const all = await Promise.all(
        updates.map(async ({ mod, version }) =>
            (await updateChangelog(mod, version, target, gameVersion)).map(entry => ({
                ...entry,
                id: `${mod.projectId}:${entry.id}`,
                label: `${mod.title} ${entry.label}`,
            })),
        ),
    );
    return all.flat();
}

// Quick action: checks every manifest channel (and what came from Modrinth) of the active
// profile for updates and installs the latest of each with one click.
function ChannelUpdates({ profile, gameDir }) {
    useTranslation();
    const [statuses, setStatuses] = useState(null);
    const [modUpdates, setModUpdates] = useState([]);
    const [checking, setChecking] = useState(false);
    const [busy, setBusy] = useState(false);
    // Problems checking and problems installing are kept apart, so the check that runs
    // after an install doesn't hide why the install failed.
    const [checkError, setCheckError] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    // Modrinth mods are checked against the loader the profile plays with, resource packs
    // and shaders against its Minecraft version. Without a version (the default profile
    // with none picked) there is nothing to check.
    const isDefault = profile.id === DEFAULT_PROFILE_ID;
    const versionId = useMemo(
        () => (isDefault ? readModList(gameDir).target?.versionId : profile.gameVersion),
        [isDefault, profile.gameVersion, gameDir],
    );
    const target = useMemo(() => detectTarget(versionId), [versionId]);
    const gameVersion = useMemo(() => target?.gameVersion || gameVersionOf(versionId), [target, versionId]);

    const check = useCallback(async () => {
        setChecking(true);
        setCheckError('');
        try {
            setStatuses(await checkChannels(categories, gameDir));
        } catch (checkError) {
            setCheckError(t('home.updates.checkChannelsFailed', { error: checkError.message }));
        }
        if ((target || gameVersion) && readModList(gameDir).mods.length > 0) {
            try {
                setModUpdates(await checkUpdates(gameDir, target, gameVersion));
            } catch (checkError) {
                setCheckError(
                    current => current || t('home.updates.checkModrinthFailed', { error: checkError.message }),
                );
            }
        } else {
            setModUpdates([]);
        }
        setChecking(false);
    }, [gameDir, target, gameVersion]);

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
            return t('home.updates.installedOne', { name: status.category.label, version: status.latest.id });
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
                throw new Error(t('home.updates.someFailed', { problems: problems.join(' ') }));
            }
            return t('home.updates.allUpToDate');
        });
    }

    function updateMods() {
        run(async () => {
            for (const { mod, version } of modUpdates) {
                await updateMod(gameDir, mod.projectId, version);
            }
            return t('home.updates.updatedMods', { count: modUpdates.length });
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
                            {t('home.updates.title', { name: profile.name })}
                        </Typography>
                        <Button
                            startIcon={checking ? <Downloadspinner /> : <RefreshIcon />}
                            onClick={check}
                            disabled={disabled}
                        >
                            {t('home.updates.check')}
                        </Button>
                        <Button
                            variant='contained'
                            startIcon={busy ? <Downloadspinner /> : <DownloadIcon />}
                            onClick={installAll}
                            disabled={disabled || pending === 0}
                        >
                            {pending > 0
                                ? t('home.updates.installAllCount', { count: pending })
                                : t('home.updates.installAll')}
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
                                            <>
                                                {status.changes?.length > 0 && (
                                                    <ChangelogButton
                                                        size='small'
                                                        title={t('home.updates.whatsNewIn', {
                                                            name: status.category.label,
                                                        })}
                                                        entries={status.changes}
                                                    />
                                                )}
                                                <Button
                                                    size='small'
                                                    disabled={disabled}
                                                    onClick={() => installOne(status)}
                                                >
                                                    {t('home.updates.install')}
                                                </Button>
                                            </>
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
                                        <>
                                            <ChangelogButton
                                                // A new button (and so a fresh load) for each set of updates.
                                                key={modUpdates.map(({ version }) => version.id).join()}
                                                size='small'
                                                title={t('home.updates.whatsNewMods')}
                                                load={() => loadModChangelogs(modUpdates, target, gameVersion)}
                                            />
                                            <Button size='small' disabled={disabled} onClick={updateMods}>
                                                {t('home.updates.update')}
                                            </Button>
                                        </>
                                    }
                                >
                                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                                        <Typography sx={{ fontWeight: 500 }}>
                                            {t('home.updates.fromModrinth')}
                                        </Typography>
                                        <Chip size='small' color='warning' label={t('home.updates.updateAvailable')} />
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
