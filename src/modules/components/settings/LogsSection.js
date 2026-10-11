import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { getLogPath, openLogFile, showLogInFolder } from '../../services/logs';

// Shows where the app's log is and opens it, so a bug report can include it.
function LogsSection() {
    const [logPath, setLogPath] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        getLogPath()
            .then(path => active && setLogPath(path))
            .catch(pathError => active && setError(pathError.message));
        return () => {
            active = false;
        };
    }, []);

    async function run(action) {
        setError('');
        try {
            await action();
        } catch (actionError) {
            setError(actionError.message);
        }
    }

    return (
        <Stack spacing={2}>
            <div>
                <Typography variant='h6' component='h2'>
                    Logs
                </Typography>
                <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                    Attach the log file when you report a bug.
                </Typography>
            </div>
            <Typography
                variant='body2'
                aria-label='Log file location'
                sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
            >
                {logPath || 'Finding the log file…'}
            </Typography>
            <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Button variant='contained' startIcon={<DescriptionIcon />} onClick={() => run(openLogFile)}>
                    Open log
                </Button>
                <Button variant='outlined' startIcon={<FolderOpenIcon />} onClick={() => run(showLogInFolder)}>
                    Open log folder
                </Button>
            </Stack>
            {error && <Alert severity='error'>{error}</Alert>}
        </Stack>
    );
}

export default LogsSection;
