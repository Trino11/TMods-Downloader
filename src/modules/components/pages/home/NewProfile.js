import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import VersionPicker from '../../profiles/VersionPicker';
import { buildVersionOptions, fetchMojangVersions, readCachedVersions } from '../../../services/gameVersions';
import { LATEST_RELEASE, createProfile } from '../../../services/profiles';

// Quick action: makes a profile and switches to it. Editing and deleting stay on the
// Profiles page.
function NewProfile({ onCreated }) {
    const [versionOptions, setVersionOptions] = useState(() => buildVersionOptions(readCachedVersions()));
    const [name, setName] = useState('');
    const [gameVersion, setGameVersion] = useState(LATEST_RELEASE);
    const [error, setError] = useState('');

    useEffect(() => {
        let cancelled = false;
        fetchMojangVersions()
            .then(versions => !cancelled && setVersionOptions(buildVersionOptions(versions)))
            // The cached list (or the installed versions) is still there to pick from.
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, []);

    function handleSubmit(event) {
        event.preventDefault();
        setError('');
        try {
            const profile = createProfile({ name, gameVersion });
            setName('');
            setGameVersion(LATEST_RELEASE);
            onCreated(profile);
        } catch (createError) {
            setError(createError.message);
        }
    }

    return (
        <Card variant='outlined'>
            <CardContent>
                <Stack component='form' spacing={2} onSubmit={handleSubmit}>
                    <Typography variant='subtitle1' component='h2'>
                        Create a profile
                    </Typography>
                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                        A new profile gets its own folder and shows up in the Minecraft Launcher. TMods switches to it
                        right away.
                    </Typography>
                    <TextField
                        id='newProfileName'
                        label='Name'
                        placeholder='Profile name'
                        fullWidth
                        value={name}
                        onChange={event => setName(event.target.value)}
                        slotProps={{ htmlInput: { required: true }, inputLabel: { shrink: true } }}
                    />
                    <Stack direction='row' spacing={1} sx={{ alignItems: 'flex-start' }}>
                        <VersionPicker options={versionOptions} value={gameVersion} onChange={setGameVersion} />
                        <Button type='submit' variant='contained' sx={{ flexShrink: 0, height: 40 }}>
                            Create
                        </Button>
                    </Stack>
                    {error && <Alert severity='error'>{error}</Alert>}
                </Stack>
            </CardContent>
        </Card>
    );
}

export default NewProfile;
