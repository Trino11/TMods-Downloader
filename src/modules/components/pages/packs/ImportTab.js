import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { ItemList, ItemRow } from '../../utils/ItemList';
import { ChangelogButton } from '../../utils/Changelog';
import { KeepVersionButton } from '../../utils/KeepVersion';
import FabricInstall from '../profiles/FabricInstall';
import PackImporter from './PackImporter';
import { PackStatusChip, describePackStatus } from './PackStatus';
import { fetchPackUpdates } from '../../../services/manifest';
import { downloadPublishedPack, listPackBackups, readInstalledPack, restorePackBackup } from '../../../services/mrpack';
import { PACKS, isPinned, setPinned } from '../../../services/pins';
import { updateProfile } from '../../../services/profiles';
import { formatDateTime, useTranslation } from '../../../i18n';

// The packs the player's channel publishes, each ready to preview, and where the active
// profile stands with them: which one it has and whether a newer one is out. `checks`
// changes after every import, to look again. The profile can keep the pack it has, so
// newer ones aren't offered as an update.
function ChannelPacks({ profile, gameDir, checks, busy, onPick, onKeepChange }) {
    const { t } = useTranslation();
    const [status, setStatus] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let live = true;
        fetchPackUpdates(readInstalledPack(gameDir), isPinned(gameDir, PACKS))
            .then(result => live && setStatus(result))
            .catch(fetchError => live && setError(fetchError.message));
        return () => {
            live = false;
        };
    }, [gameDir, checks]);

    if (error) {
        return (
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {t('packs.import.channelError', { error })}
            </Typography>
        );
    }
    if (!status) {
        return (
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {t('packs.import.channelLoading')}
            </Typography>
        );
    }
    if (status.packs.length === 0) {
        return (
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {t('packs.import.channelEmpty')}
            </Typography>
        );
    }
    return (
        <Stack spacing={1.5}>
            <Card variant='outlined'>
                <CardContent>
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                        <Stack sx={{ flexGrow: 1 }}>
                            <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                                <Typography sx={{ fontWeight: 500 }}>
                                    {t('packs.import.channelStatusTitle', { profile: profile.name })}
                                </Typography>
                                <PackStatusChip status={status} />
                            </Stack>
                            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                {describePackStatus(status) ||
                                    t('packs.import.channelStatusNone', { profile: profile.name })}
                            </Typography>
                        </Stack>
                        {status.installed && (
                            <KeepVersionButton pinned={status.pinned} disabled={busy} onChange={onKeepChange} />
                        )}
                        {status.newer && status.changes.length > 0 && (
                            <ChangelogButton
                                title={t('packs.import.whatsNew', { id: status.latest.id })}
                                entries={status.changes}
                            />
                        )}
                        {status.outdated && (
                            <Button
                                variant='contained'
                                disabled={busy}
                                onClick={() => onPick(status.latest, status.latest.id)}
                            >
                                {t('packs.import.update')}
                            </Button>
                        )}
                    </Stack>
                </CardContent>
            </Card>
            <ItemList>
                {status.packs.map(pack => (
                    <ItemRow
                        key={pack.id}
                        actions={
                            <Button variant='outlined' disabled={busy} onClick={() => onPick(pack, status.latest.id)}>
                                {t('packs.import.preview')}
                            </Button>
                        }
                    >
                        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                            <Typography>{pack.id}</Typography>
                            {pack.id === status.installed && (
                                <Chip size='small' variant='outlined' label={t('packs.import.installedChip')} />
                            )}
                        </Stack>
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {[pack.target, pack.description].filter(Boolean).join(' · ')}
                        </Typography>
                    </ItemRow>
                ))}
            </ItemList>
        </Stack>
    );
}

// Previews a pack from a file, the channel or Modrinth and installs it into a profile;
// lists the backups earlier imports into the active profile made, to undo them.
function ImportTab({ profile, gameDir, busy, run, onChanged }) {
    const { t } = useTranslation();
    const [pending, setPending] = useState(null);
    const [fabricFor, setFabricFor] = useState(null);
    const [backups, setBackups] = useState(() => listPackBackups(gameDir));
    const [checks, setChecks] = useState(0);

    function handleFile(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) {
            run(async () => {
                setPending({ data: new Uint8Array(await file.arrayBuffer()) });
                return '';
            });
        }
    }

    function pickChannelPack(pack, latestId) {
        run(async () => {
            setPending({ data: await downloadPublishedPack(pack), pack, latestId });
            return '';
        });
    }

    function handleKeepChange(keep) {
        setPinned(gameDir, PACKS, keep);
        setChecks(count => count + 1);
    }

    function handleImported(result, intoNew) {
        setPending(null);
        setBackups(listPackBackups(gameDir));
        setChecks(count => count + 1);
        setFabricFor(intoNew && result.needsLoader && result.loader?.loader === 'fabric' ? result : null);
        onChanged();
    }

    function handleRestore(backup) {
        if (!window.confirm(t('packs.import.confirmUndo', { pack: backup.pack || t('packs.import.thisPack') }))) {
            return;
        }
        run(async () => {
            restorePackBackup(gameDir, backup.id);
            setBackups(listPackBackups(gameDir));
            setChecks(count => count + 1);
            onChanged();
            return t('packs.import.restored', {
                profile: profile.name,
                pack: backup.pack || t('packs.import.thePack'),
            });
        });
    }

    function handleFabricInstalled(versionId) {
        const { profile: created } = fabricFor;
        updateProfile(created.id, { name: created.name, gameVersion: versionId });
        setFabricFor(null);
        onChanged();
    }

    if (pending) {
        return (
            <PackImporter
                data={pending.data}
                channelPack={pending.pack}
                channelLatest={pending.latestId}
                activeProfile={profile}
                busy={busy}
                run={run}
                onImported={handleImported}
                onCancel={() => setPending(null)}
            />
        );
    }

    return (
        <Stack spacing={3}>
            {fabricFor && (
                <FabricInstall
                    title={t('packs.import.fabricTitle', { profile: fabricFor.profile.name })}
                    description={t('packs.import.fabricDescription')}
                    preferredVersion={fabricFor.gameVersion}
                    onInstalled={handleFabricInstalled}
                />
            )}
            <Card variant='outlined'>
                <CardContent>
                    <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                        <Typography variant='subtitle1' component='h2'>
                            {t('packs.import.fileTitle')}
                        </Typography>
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {t('packs.import.fileHelp')}
                        </Typography>
                        <Button component='label' variant='outlined' startIcon={<FileUploadIcon />} disabled={busy}>
                            {t('packs.import.chooseFile')}
                            <input
                                id='importPack'
                                type='file'
                                accept='.mrpack'
                                hidden
                                disabled={busy}
                                onChange={handleFile}
                            />
                        </Button>
                    </Stack>
                </CardContent>
            </Card>
            <section>
                <Typography variant='h6' component='h2' gutterBottom>
                    {t('packs.import.fromChannel')}
                </Typography>
                <ChannelPacks
                    profile={profile}
                    gameDir={gameDir}
                    checks={checks}
                    busy={busy}
                    onPick={pickChannelPack}
                    onKeepChange={handleKeepChange}
                />
            </section>
            {backups.length > 0 && (
                <section>
                    <Typography variant='h6' component='h2' gutterBottom>
                        {t('packs.import.undoTitle', { profile: profile.name })}
                    </Typography>
                    <ItemList>
                        {backups.map(backup => (
                            <ItemRow
                                key={backup.id}
                                actions={
                                    <Button variant='outlined' disabled={busy} onClick={() => handleRestore(backup)}>
                                        {t('packs.import.undo')}
                                    </Button>
                                }
                            >
                                <Typography>{backup.pack || t('packs.import.aPack')}</Typography>
                                <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                    {t('packs.import.importedAt', { date: formatDateTime(backup.createdAt) })}
                                </Typography>
                            </ItemRow>
                        ))}
                    </ItemList>
                </section>
            )}
        </Stack>
    );
}

export default ImportTab;
