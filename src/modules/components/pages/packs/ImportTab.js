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

// The packs the player's channel publishes, each ready to preview.
function ChannelPacks({ busy, onPick }) {
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
                Could not load your channel's packs: {error}
            </Typography>
        );
    }
    if (!packs) {
        return (
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                Loading your channel's packs...
            </Typography>
        );
    }
    if (packs.length === 0) {
        return (
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                Your channel has no packs yet. Publish one from the Publish tab.
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
                            Preview
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
        if (!window.confirm(`Undo the import of ${backup.pack || 'this pack'}?`)) {
            return;
        }
        run(async () => {
            restorePackBackup(gameDir, backup.id);
            setBackups(listPackBackups(gameDir));
            onChanged();
            return `Put ${profile.name} back the way it was before importing ${backup.pack || 'the pack'}.`;
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
                    title={`Install Fabric for ${fabricFor.profile.name}`}
                    description='The pack needs Fabric. This installs it and switches the new profile to it.'
                    preferredVersion={fabricFor.gameVersion}
                    onInstalled={handleFabricInstalled}
                />
            )}
            <Card variant='outlined'>
                <CardContent>
                    <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                        <Typography variant='subtitle1' component='h2'>
                            Import a .mrpack file
                        </Typography>
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            You'll see what's inside and pick the profile it goes into before anything changes.
                        </Typography>
                        <Button component='label' variant='outlined' startIcon={<FileUploadIcon />} disabled={busy}>
                            Choose file
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
                    From your channel
                </Typography>
                <ChannelPacks busy={busy} onPick={pickChannelPack} />
            </section>
            {backups.length > 0 && (
                <section>
                    <Typography variant='h6' component='h2' gutterBottom>
                        Undo an import into {profile.name}
                    </Typography>
                    <ItemList>
                        {backups.map(backup => (
                            <ItemRow
                                key={backup.id}
                                actions={
                                    <Button variant='outlined' disabled={busy} onClick={() => handleRestore(backup)}>
                                        Undo
                                    </Button>
                                }
                            >
                                <Typography>{backup.pack || 'A pack'}</Typography>
                                <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                    Imported {new Date(backup.createdAt).toLocaleString()}
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
