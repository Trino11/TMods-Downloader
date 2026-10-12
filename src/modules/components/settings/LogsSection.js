import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import DescriptionIcon from '@mui/icons-material/Description';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import { getLogPath, openLogFile, showLogInFolder } from '../../services/logs';
import { useTranslation } from '../../i18n';

// Shows where the app's log is and opens it, so a bug report can include it.
function LogsSection() {
    const { t } = useTranslation();
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
                    {t('settings.logs.title')}
                </Typography>
                <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                    {t('settings.logs.description')}
                </Typography>
            </div>
            <Typography
                variant='body2'
                aria-label={t('settings.logs.location')}
                sx={{ fontFamily: 'monospace', wordBreak: 'break-all' }}
            >
                {logPath || t('settings.logs.finding')}
            </Typography>
            <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap' }}>
                <Button variant='contained' startIcon={<DescriptionIcon />} onClick={() => run(openLogFile)}>
                    {t('settings.logs.open')}
                </Button>
                <Button variant='outlined' startIcon={<FolderOpenIcon />} onClick={() => run(showLogInFolder)}>
                    {t('settings.logs.openFolder')}
                </Button>
            </Stack>
            {error && <Alert severity='error'>{error}</Alert>}
        </Stack>
    );
}

export default LogsSection;
