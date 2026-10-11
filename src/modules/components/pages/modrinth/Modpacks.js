import { useState } from 'react';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import IosShareIcon from '@mui/icons-material/IosShare';
import ProjectSearch from './ProjectSearch';
import { exportMrpack, importMrpack, installModrinthModpack } from '../../../services/mrpack';

const modpackFilters = { projectType: 'modpack' };

// Saves the exported pack through the browser's download, which Electron turns into
// a save dialog.
function saveFile(data, fileName) {
    const url = URL.createObjectURL(new Blob([data], { type: 'application/zip' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

// Modpacks go into a new profile each. `run` performs an action with the page's busy
// state and messages.
function Modpacks({ profile, gameDir, target, busy, run, onProfileCreated }) {
    const [packName, setPackName] = useState(profile.name);
    const [includeConfig, setIncludeConfig] = useState(true);

    function created({ profile: newProfile, loaderNote }) {
        onProfileCreated(newProfile);
        return [`Created the profile "${newProfile.name}". Switch to it with the profile picker.`, loaderNote]
            .filter(Boolean)
            .join(' ');
    }

    function handleFile(event) {
        const file = event.target.files[0];
        event.target.value = '';
        if (file) {
            run(async () =>
                created(await importMrpack(await file.arrayBuffer(), { name: file.name.replace(/\.mrpack$/i, '') })),
            );
        }
    }

    function handleExport(event) {
        event.preventDefault();
        run(async () => {
            const result = exportMrpack(gameDir, target, { name: packName, includeConfig });
            saveFile(result.data, `${packName.replace(/[^\w.-]+/g, '_') || 'modpack'}.mrpack`);
            const extra = result.extraFiles.length
                ? ` ${result.extraFiles.length} jar(s) added by hand are copied into the pack.`
                : '';
            return `Exported ${result.mods} mod(s) from Modrinth.${extra}`;
        });
    }

    return (
        <Stack spacing={3}>
            <Card variant='outlined'>
                <CardContent>
                    <Stack component='form' spacing={1} onSubmit={handleExport}>
                        <Typography variant='subtitle1' component='h2'>
                            Share this profile as a modpack file
                        </Typography>
                        <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                            <TextField
                                id='packName'
                                label='Modpack name'
                                fullWidth
                                value={packName}
                                onChange={event => setPackName(event.target.value)}
                                slotProps={{ htmlInput: { required: true } }}
                            />
                            <Button
                                type='submit'
                                variant='contained'
                                startIcon={<IosShareIcon />}
                                disabled={busy || !target?.loaderVersion}
                                sx={{ flexShrink: 0 }}
                            >
                                Export
                            </Button>
                        </Stack>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    id='includeConfig'
                                    checked={includeConfig}
                                    onChange={event => setIncludeConfig(event.target.checked)}
                                />
                            }
                            label='Include the config folder'
                        />
                    </Stack>
                </CardContent>
            </Card>

            <Card variant='outlined'>
                <CardContent>
                    <Stack spacing={1.5} sx={{ alignItems: 'flex-start' }}>
                        <Typography variant='subtitle1' component='h2'>
                            Import a modpack file (.mrpack) as a new profile
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
                    Modpacks on Modrinth
                </Typography>
                <ProjectSearch
                    filters={modpackFilters}
                    placeholder='Search modpacks'
                    action={hit => (
                        <Button
                            variant='contained'
                            disabled={busy}
                            onClick={() =>
                                run(async () => created(await installModrinthModpack(hit.project_id, hit.title)))
                            }
                        >
                            Install
                        </Button>
                    )}
                />
            </section>
        </Stack>
    );
}

export default Modpacks;
