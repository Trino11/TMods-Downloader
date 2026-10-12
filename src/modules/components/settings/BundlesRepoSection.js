import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import Downloadspinner from '../utils/Downloadspinner';
import { bundlesRepo, manifestRepo } from '../../services/bundlePublish';
import { github } from '../../services/node';
import { setBundlesRepo } from '../../services/settings';
import { t, useTranslation } from '../../i18n';

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

// Where the Modrinth page's "Publish to your bundles repository" commits to, and the
// GitHub token it uses. The token is handed to the main process, which keeps it
// encrypted; this page can replace or forget it but never reads it back.
function BundlesRepoSection() {
    useTranslation();
    const [repo, setRepo] = useState(bundlesRepo);
    const [token, setToken] = useState('');
    const [hasToken, setHasToken] = useState(false);
    const [checking, setChecking] = useState(false);
    const [error, setError] = useState('');
    const [ready, setReady] = useState('');

    useEffect(() => {
        let active = true;
        github
            .status()
            .then(status => active && setHasToken(status.hasToken))
            .catch(statusError => active && setError(statusError.message));
        return () => {
            active = false;
        };
    }, []);

    async function handleSubmit(event) {
        event.preventDefault();
        const trimmed = repo.trim();
        setChecking(true);
        setError('');
        setReady('');
        try {
            if (token.trim()) {
                await github.saveToken(token.trim());
                setToken('');
                setHasToken(true);
            }
            // The repository of the current profile's manifest isn't saved, so publishing
            // keeps following the manifest when the profile or its manifest changes.
            setBundlesRepo(trimmed === manifestRepo() ? '' : trimmed);
            setRepo(trimmed);
            const status = await github.status(trimmed);
            if (!status.hasToken) {
                throw new Error(t('settings.bundlesRepo.needToken'));
            }
            setReady(t('settings.bundlesRepo.ready', { repo: status.repo }));
        } catch (saveError) {
            setError(saveError.message);
        } finally {
            setChecking(false);
        }
    }

    async function handleForget() {
        setError('');
        setReady('');
        try {
            await github.forgetToken();
            setHasToken(false);
        } catch (forgetError) {
            setError(forgetError.message);
        }
    }

    return (
        <Stack component='form' spacing={2} onSubmit={handleSubmit}>
            <div>
                <Typography variant='h6' component='h2'>
                    {t('settings.bundlesRepo.title')}
                </Typography>
                <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                    {t('settings.bundlesRepo.descriptionBefore')}{' '}
                    <Link href={NEW_TOKEN_URL} target='_blank' rel='noreferrer'>
                        {t('settings.bundlesRepo.tokenLink')}
                    </Link>{' '}
                    {t('settings.bundlesRepo.descriptionAfter')}
                </Typography>
            </div>
            <TextField
                id='bundlesRepo'
                label={t('settings.bundlesRepo.repository')}
                fullWidth
                placeholder='owner/name'
                value={repo}
                onChange={event => setRepo(event.target.value)}
                disabled={checking}
                slotProps={{ htmlInput: { required: true }, inputLabel: { shrink: true } }}
            />
            <TextField
                id='githubToken'
                label={hasToken ? t('settings.bundlesRepo.tokenSaved') : t('settings.bundlesRepo.token')}
                type='password'
                autoComplete='off'
                fullWidth
                value={token}
                onChange={event => setToken(event.target.value)}
                disabled={checking}
                slotProps={{ inputLabel: { shrink: true } }}
            />
            <Stack direction='row' spacing={1}>
                <Button type='submit' variant='contained' disabled={checking} sx={{ minWidth: 96 }}>
                    {checking ? <Downloadspinner /> : t('settings.bundlesRepo.save')}
                </Button>
                {hasToken && (
                    <Button variant='outlined' color='error' disabled={checking} onClick={handleForget}>
                        {t('settings.bundlesRepo.forget')}
                    </Button>
                )}
            </Stack>
            {error && <Alert severity='error'>{error}</Alert>}
            {ready && <Alert severity='success'>{ready}</Alert>}
        </Stack>
    );
}

export default BundlesRepoSection;
