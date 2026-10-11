import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Link from '@mui/material/Link';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import categories from '../../../categories';
import { bundlesRepo, existingVersions, nextVersion, publishProfile } from '../../../services/bundlePublish';

// Publishes the profile as a new version in the player's bundles repository (Settings).
// `run` performs an action with the page's busy state and messages.
function PublishBundle({ profile, gameDir, target, busy, run }) {
    const repo = bundlesRepo();
    const [category, setCategory] = useState('mods');
    const [version, setVersion] = useState('');
    const [versionTouched, setVersionTouched] = useState(false);
    const [description, setDescription] = useState('');
    const [changelog, setChangelog] = useState('');
    const [includeConfig, setIncludeConfig] = useState(true);
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
                        to publish this profile for your players.
                    </Typography>
                </CardContent>
            </Card>
        );
    }

    function handleSubmit(event) {
        event.preventDefault();
        setPublished(null);
        run(async () => {
            const result = await publishProfile({
                repo,
                category,
                version: version.trim(),
                gameDir,
                target,
                name: profile.name,
                description,
                changelog,
                includeConfig,
            });
            setPublished({ ...result, label: `${category} ${version.trim()}` });
            setVersionTouched(false);
            setChangelog('');
            return '';
        });
    }

    return (
        <Card variant='outlined'>
            <CardContent>
                <Stack component='form' spacing={2} onSubmit={handleSubmit}>
                    <div>
                        <Typography variant='subtitle1' component='h2'>
                            Publish to your bundles repository
                        </Typography>
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            Adds this profile to {repo} as a new version. Mods from Modrinth go in as links, jars you
                            added by hand and configs as files. GitHub then builds the release your players download.
                        </Typography>
                    </div>
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
                            sx={{ minWidth: 180 }}
                        >
                            {categories.map(item => (
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
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    id='publishIncludeConfig'
                                    checked={includeConfig}
                                    onChange={event => setIncludeConfig(event.target.checked)}
                                />
                            }
                            label='Include the config folder'
                        />
                        <Button
                            type='submit'
                            variant='contained'
                            startIcon={<CloudUploadIcon />}
                            disabled={busy || !target?.loaderVersion || !version.trim()}
                        >
                            Publish
                        </Button>
                    </Stack>
                    {lookupError && <Alert severity='warning'>{lookupError}</Alert>}
                    {published && (
                        <Alert severity='success'>
                            Published {published.label} ({published.mods} file(s) from Modrinth
                            {published.extraFiles.length ? `, ${published.extraFiles.length} added by hand` : ''}).
                            GitHub is building the release;{' '}
                            <Link href={published.actionsUrl} target='_blank' rel='noreferrer'>
                                follow it on GitHub
                            </Link>
                            .
                        </Alert>
                    )}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default PublishBundle;
