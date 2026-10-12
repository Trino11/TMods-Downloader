import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import PackPicker from './PackPicker';
import {
    LARGE_PACK_BYTES,
    PACKS_CATEGORY,
    PUBLISH_CATEGORIES,
    bundlesRepo,
    existingVersions,
    nextVersion,
    publishPack,
} from '../../../services/bundlePublish';
import { exportMrpack, readPack } from '../../../services/mrpack';
import { formatSize } from '../../../services/packKinds';

const FROM_PROFILE = 'profile';
const FROM_FILE = 'file';

// Publishes a new version to the player's bundles repository (set up in Settings):
// the files picked in this profile, exported as a .mrpack, or a .mrpack file as it is.
// `items` and `selected` are shared with the Export tab.
function PublishTab({ profile, gameDir, target, items, selected, onSelect, busy, run }) {
    const repo = bundlesRepo();
    const [source, setSource] = useState(FROM_PROFILE);
    const [file, setFile] = useState(null);
    const [category, setCategory] = useState(PACKS_CATEGORY);
    const [version, setVersion] = useState('');
    const [versionTouched, setVersionTouched] = useState(false);
    const [description, setDescription] = useState('');
    const [changelog, setChangelog] = useState('');
    const [lookupError, setLookupError] = useState('');
    const [published, setPublished] = useState(null);

    // Suggests the version after the newest one already published in this category.
    useEffect(() => {
        if (!repo) {
            return undefined;
        }
        let active = true;
        existingVersions(repo, category)
            .then(existing => {
                if (!active) {
                    return;
                }
                setLookupError('');
                if (!versionTouched) {
                    setVersion(nextVersion(existing));
                }
            })
            .catch(error => active && setLookupError(error.message));
        return () => {
            active = false;
        };
    }, [repo, category, versionTouched, published]);

    const filePack = useMemo(() => {
        if (!file) {
            return null;
        }
        try {
            return readPack(file.data);
        } catch (error) {
            return { error: error.message };
        }
    }, [file]);

    if (!repo) {
        return (
            <Card variant='outlined'>
                <CardContent>
                    <Typography variant='subtitle1' component='h2'>
                        Publish to your bundles repository
                    </Typography>
                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                        Set up your bundles repository in{' '}
                        <Link component={RouterLink} to='/settings'>
                            Settings
                        </Link>{' '}
                        to publish packs for your players.
                    </Typography>
                </CardContent>
            </Card>
        );
    }

    async function handleFile(event) {
        const chosen = event.target.files[0];
        event.target.value = '';
        if (chosen) {
            setFile({ name: chosen.name, data: new Uint8Array(await chosen.arrayBuffer()) });
        }
    }

    // The pack to publish, as bytes.
    function packData() {
        if (source === FROM_FILE) {
            return file.data;
        }
        const picked = items.filter(item => selected.has(item.id));
        return exportMrpack(gameDir, target, { name: profile.name, version: version.trim(), items: picked }).data;
    }

    function handleSubmit(event) {
        event.preventDefault();
        setPublished(null);
        run(async () => {
            const data = packData();
            if (
                data.length > LARGE_PACK_BYTES &&
                !window.confirm(
                    `The pack is ${formatSize(data.length)}. Every published version stays in your repository for good. Publish it anyway?`,
                )
            ) {
                return '';
            }
            const result = await publishPack({
                repo,
                category,
                version: version.trim(),
                data,
                description,
                changelog,
            });
            setPublished({ ...result, label: `${category} ${version.trim()}` });
            setVersionTouched(false);
            setChangelog('');
            return '';
        });
    }

    const ready =
        source === FROM_FILE ? Boolean(filePack && !filePack.error) : items.some(item => selected.has(item.id));

    return (
        <Stack component='form' spacing={2} onSubmit={handleSubmit}>
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                Adds a new version to {repo}. GitHub then builds the release your players download. Files from Modrinth
                go in as links; everything else is copied into the pack and published publicly, so only include files
                you're allowed to share.
            </Typography>
            <ToggleButtonGroup
                exclusive
                size='small'
                value={source}
                onChange={(event, value) => value && setSource(value)}
                aria-label='What to publish'
                sx={{ '& .MuiToggleButton-root': { textTransform: 'none' } }}
            >
                <ToggleButton value={FROM_PROFILE}>Files from {profile.name}</ToggleButton>
                <ToggleButton value={FROM_FILE}>A .mrpack file</ToggleButton>
            </ToggleButtonGroup>

            {source === FROM_PROFILE && (
                <PackPicker items={items} selected={selected} onChange={onSelect} disabled={busy} />
            )}
            {source === FROM_FILE && (
                <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <Button component='label' variant='outlined' startIcon={<FileUploadIcon />} disabled={busy}>
                        {file ? 'Choose another file' : 'Choose file'}
                        <input id='publishPackFile' type='file' accept='.mrpack' hidden onChange={handleFile} />
                    </Button>
                    {filePack?.error && <Alert severity='error'>{filePack.error}</Alert>}
                    {filePack && !filePack.error && (
                        <Typography variant='body2'>
                            {file.name}: {filePack.name}, Minecraft {filePack.gameVersion}, {filePack.items.length}{' '}
                            item(s), {formatSize(file.data.length)}.
                        </Typography>
                    )}
                </Stack>
            )}

            <Stack direction='row' spacing={1}>
                <TextField
                    id='publishCategory'
                    select
                    label='Category'
                    value={category}
                    onChange={event => {
                        setCategory(event.target.value);
                        setVersionTouched(false);
                    }}
                    sx={{ minWidth: 240 }}
                >
                    {PUBLISH_CATEGORIES.map(item => (
                        <MenuItem key={item.id} value={item.id}>
                            {item.label}
                        </MenuItem>
                    ))}
                </TextField>
                <TextField
                    id='publishVersion'
                    label='Version'
                    fullWidth
                    value={version}
                    onChange={event => {
                        setVersion(event.target.value);
                        setVersionTouched(true);
                    }}
                    slotProps={{ htmlInput: { required: true }, inputLabel: { shrink: true } }}
                />
            </Stack>
            <TextField
                id='publishDescription'
                label='Description (optional)'
                fullWidth
                value={description}
                onChange={event => setDescription(event.target.value)}
            />
            <TextField
                id='publishChangelog'
                label='What changed (optional)'
                fullWidth
                multiline
                minRows={2}
                value={changelog}
                onChange={event => setChangelog(event.target.value)}
            />
            <Stack direction='row' sx={{ justifyContent: 'flex-end' }}>
                <Button
                    type='submit'
                    variant='contained'
                    startIcon={<CloudUploadIcon />}
                    disabled={busy || !ready || !version.trim()}
                >
                    Publish
                </Button>
            </Stack>
            {lookupError && <Alert severity='warning'>{lookupError}</Alert>}
            {published && (
                <Alert severity='success'>
                    Published {published.label}. GitHub is building the release;{' '}
                    <Link href={published.actionsUrl} target='_blank' rel='noreferrer'>
                        follow it on GitHub
                    </Link>
                    .
                </Alert>
            )}
        </Stack>
    );
}

export default PublishTab;
