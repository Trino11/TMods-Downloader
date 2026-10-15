import { useEffect, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ItemList, ItemRow } from '../../utils/ItemList';
import ReplaceContentDialog from '../../utils/ReplaceContent';
import { fetchPackSetParts, installPackSet, installedParts, partFolders } from '../../../services/packSets';
import { PACKS, isPinned } from '../../../services/pins';
import { useTranslation } from '../../../i18n';

// Shows what a pack from the channel that is a set of category versions installs (mods
// 2.1.1, configs 1.0.1...) and installs them all into the active profile, each the way its
// own page's Download would. `run` performs an action with the page's busy state and
// messages; `onInstalled` is called once it's done. `latestId` is the id of the channel's
// newest pack, so picking an older one suggests keeping it.
function PackSetInstaller({ pack, latestId, profile, gameDir, busy, run, onInstalled, onCancel }) {
    const { t } = useTranslation();
    const [parts, setParts] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [asking, setAsking] = useState(false);
    // "Keep this version" starts on when the profile already keeps its pack, or when the
    // player picked an older pack than the newest one.
    const [keep, setKeep] = useState(() => pack.id !== latestId || isPinned(gameDir, PACKS));

    useEffect(() => {
        let live = true;
        fetchPackSetParts(pack)
            .then(result => live && setParts(result))
            .catch(error => live && setLoadError(error.message));
        return () => {
            live = false;
        };
    }, [pack]);

    const missing = parts ? parts.filter(part => !part.version) : [];
    const have = parts ? new Set(installedParts(parts, gameDir).map(part => part.categoryId)) : new Set();

    function install(replace) {
        setAsking(false);
        run(async () => {
            await installPackSet(pack, parts, gameDir, { replace, keepVersion: keep });
            onInstalled();
            return t('packs.set.installed', {
                id: pack.id,
                profile: profile.name,
                parts: parts.map(part => `${part.category.label} ${part.versionId}`).join(', '),
            });
        });
    }

    return (
        <Card variant='outlined'>
            <CardContent>
                <Stack spacing={2}>
                    <div>
                        <Typography variant='h6' component='h2'>
                            {t('packs.set.title', { id: pack.id })}
                        </Typography>
                        {(pack.target || pack.description) && (
                            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                {[pack.target, pack.description].filter(Boolean).join(' · ')}
                            </Typography>
                        )}
                    </div>
                    <Typography variant='body2'>{t('packs.set.intro', { profile: profile.name })}</Typography>
                    {loadError && <Alert severity='error'>{loadError}</Alert>}
                    {!parts && !loadError && (
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {t('packs.set.loading')}
                        </Typography>
                    )}
                    {parts && (
                        <ItemList>
                            {parts.map(part => (
                                <ItemRow key={part.categoryId}>
                                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                                        <Typography>
                                            {part.category?.label || part.categoryId} {part.versionId}
                                        </Typography>
                                        {have.has(part.categoryId) && (
                                            <Chip size='small' variant='outlined' label={t('packs.set.alreadyChip')} />
                                        )}
                                    </Stack>
                                    {part.version && (part.version.target || part.version.description) && (
                                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                            {[part.category.showTarget && part.version.target, part.version.description]
                                                .filter(Boolean)
                                                .join(' · ')}
                                        </Typography>
                                    )}
                                </ItemRow>
                            ))}
                        </ItemList>
                    )}
                    {missing.length > 0 && (
                        <Alert severity='error'>
                            {t('packs.set.missing', {
                                parts: missing
                                    .map(part => `${part.category?.label || part.categoryId} ${part.versionId}`)
                                    .join(', '),
                            })}
                        </Alert>
                    )}
                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                        {t('packs.set.backupNote')}
                    </Typography>
                    <FormControlLabel
                        control={
                            <Checkbox
                                id='keepPackVersion'
                                checked={keep}
                                disabled={busy}
                                onChange={event => setKeep(event.target.checked)}
                            />
                        }
                        label={t('packs.set.keepVersion', { version: pack.id })}
                    />
                    <Stack direction='row' spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        <Button onClick={onCancel} disabled={busy}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant='contained'
                            disabled={busy || !parts || missing.length > 0}
                            onClick={() => setAsking(true)}
                        >
                            {t('packs.set.install')}
                        </Button>
                    </Stack>
                </Stack>
            </CardContent>
            <ReplaceContentDialog
                open={asking}
                folders={asking && parts ? partFolders(parts) : []}
                onConfirm={install}
                onCancel={() => setAsking(false)}
            />
        </Card>
    );
}

export default PackSetInstaller;
