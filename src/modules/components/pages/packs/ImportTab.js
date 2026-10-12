import { useEffect, useState } from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import { ItemList, ItemRow } from '../../utils/ItemList';
import FabricInstall from '../profiles/FabricInstall';
import PackImporter from './PackImporter';
import { fetchPacks } from '../../../services/manifest';
import { downloadPublishedPack, listPackBackups, restorePackBackup } from '../../../services/mrpack';
import { updateProfile } from '../../../services/profiles';
import { formatDateTime, useTranslation } from '../../../i18n';

// The packs the player's channel publishes, each ready to preview.
function ChannelPacks({ busy, onPick }) {
    const { t } = useTranslation();
    const [packs, setPacks] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => {
        let live = true;
        fetchPacks()
            .then(list => live && setPacks(list))
            .catch(fetchError => live && setError(fetchError.message));
        return () => {
            live = false;
        };
    }, []);

    if (error) {
        return (
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {t('packs.import.channelError', { error })}
            </Typography>
        );
    }
    if (!packs) {
        return (
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {t('packs.import.channelLoading')}
            </Typography>
        );
    }
    if (packs.length === 0) {
        return (
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {t('packs.import.channelEmpty')}
            </Typography>
        );
    }
    return (
        <ItemList>
            {packs.map(pack => (
                <ItemRow
                    key={pack.id}
                    actions={
                        <Button variant='outlined' disabled={busy} onClick={() => onPick(pack)}>
                            {t('packs.import.preview')}
                        </Button>
                    }
                >
                    <Typography>{pack.id}</Typography>
                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                        {[pack.target, pack.description].filter(Boolean).join(' · ')}
                    </Typography>
                </ItemRow>
            ))}
        </ItemList>
    );
}

// Previews a pack from a file, the channel or Modrinth and installs it into a profile;
// lists the backups earlier imports into the active profile made, to undo them.
function ImportTab({ profile, gameDir, busy, run, onChanged }) {
    const { t } = useTranslation();
    const [pending, setPending] = useState(null);
    const [fabricFor, setFabricFor] = useState(null);
    const [backups, setBackups] = useState(() => listPackBackups(gameDir));

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

    function pickChannelPack(pack) {
        run(async () => {
            setPending({ data: await downloadPublishedPack(pack) });
            return '';
        });
    }

    function handleImported(result, intoNew) {
        setPending(null);
        setBackups(listPackBackups(gameDir));
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
                <ChannelPacks busy={busy} onPick={pickChannelPack} />
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
