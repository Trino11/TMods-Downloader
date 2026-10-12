import { useCallback, useMemo, useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import CardContent from '@mui/material/CardContent';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import PackPicker from './PackPicker';
import { LOADERS } from '../../../services/modrinth';
import { NEW_PROFILE, importMrpack, packWarnings, readPack } from '../../../services/mrpack';
import { PACKS, isPinned } from '../../../services/pins';
import { listProfiles, profileGameDir } from '../../../services/profiles';
import { t, useTranslation } from '../../../i18n';

function describeTarget(pack) {
    const loader = pack.loader ? ` · ${LOADERS[pack.loader.loader]} ${pack.loader.loaderVersion}` : '';
    return `Minecraft ${pack.gameVersion}${loader}`;
}

// What an import did, in words.
export function importMessage(result, intoNew) {
    if (intoNew) {
        return [t('packs.importer.created', { profile: result.profile.name }), result.loaderNote]
            .filter(Boolean)
            .join(' ');
    }
    const replaced = result.replaced.length ? t('packs.importer.replaced', { mods: result.replaced.join(', ') }) : '';
    return t('packs.importer.imported', { profile: result.profile.name, replaced });
}

// Shows what a pack (its bytes, `data`) holds and installs the picked items into the
// profile chosen in the selector: the active one by default, or a new one. `run`
// performs an action with the page's busy state and messages; `onImported` gets the
// import's result and whether it made a new profile. `channelPack` is the manifest
// version when the pack comes from the player's channel, so the profile remembers it and
// can keep it instead of being offered newer ones; `channelLatest` is the id of the
// channel's newest pack, so picking an older one suggests keeping it.
function PackImporter({ data, channelPack, channelLatest, activeProfile, busy, run, onImported, onCancel }) {
    useTranslation();
    const pack = useMemo(() => {
        try {
            return readPack(data);
        } catch (error) {
            return { error: error.message };
        }
    }, [data]);
    const profiles = useMemo(() => listProfiles(), []);
    const [selected, setSelected] = useState(() => new Set((pack.items || []).map(item => item.id)));
    const [into, setInto] = useState(activeProfile.id);
    const [newName, setNewName] = useState(pack.name || '');
    const [warnings, setWarnings] = useState(null);
    // "Keep this version" starts on when the profile already keeps its pack, or when the
    // player picked an older pack than the newest one.
    const keepByDefault = useCallback(
        target => {
            if (!channelPack) {
                return false;
            }
            const older = Boolean(channelLatest && channelPack.id !== channelLatest);
            const profile = profiles.find(item => item.id === target);
            return older || Boolean(profile && isPinned(profileGameDir(profile), PACKS));
        },
        [channelLatest, channelPack, profiles],
    );
    const [keep, setKeep] = useState(() => keepByDefault(activeProfile.id));

    if (pack.error) {
        return (
            <Alert severity='error' action={<Button onClick={onCancel}>{t('common.close')}</Button>}>
                {pack.error}
            </Alert>
        );
    }

    const intoNew = into === NEW_PROFILE;
    const others = profiles.filter(profile => profile.id !== activeProfile.id);

    function importNow() {
        setWarnings(null);
        run(async () => {
            const result = await importMrpack(data, {
                into,
                name: intoNew ? newName.trim() : undefined,
                items: [...selected],
                channelVersion: channelPack?.id,
                keepVersion: channelPack ? keep : undefined,
            });
            onImported(result, intoNew);
            return importMessage(result, intoNew);
        });
    }

    function handleImport(event) {
        event.preventDefault();
        const target = profiles.find(profile => profile.id === into);
        const found = target ? packWarnings(pack, target) : [];
        if (found.length > 0) {
            setWarnings(found);
            return;
        }
        importNow();
    }

    return (
        <Card variant='outlined'>
            <CardContent>
                <Stack component='form' spacing={2} onSubmit={handleImport}>
                    <div>
                        <Typography variant='h6' component='h2'>
                            {pack.name}
                            {pack.version && ` ${pack.version}`}
                        </Typography>
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {describeTarget(pack)}
                        </Typography>
                        {pack.summary && <Typography sx={{ mt: 1 }}>{pack.summary}</Typography>}
                    </div>
                    <PackPicker items={pack.items} selected={selected} onChange={setSelected} disabled={busy} />
                    <Stack direction='row' spacing={1}>
                        <TextField
                            id='importInto'
                            select
                            label={t('packs.importer.into')}
                            value={into}
                            onChange={event => {
                                setInto(event.target.value);
                                setKeep(keepByDefault(event.target.value));
                            }}
                            slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                            sx={{ minWidth: 240 }}
                        >
                            <option value={activeProfile.id}>
                                {t('packs.importer.current', { profile: activeProfile.name })}
                            </option>
                            {others.map(profile => (
                                <option key={profile.id} value={profile.id}>
                                    {profile.name}
                                </option>
                            ))}
                            <option value={NEW_PROFILE}>{t('packs.importer.newProfile')}</option>
                        </TextField>
                        {intoNew && (
                            <TextField
                                id='newProfileName'
                                label={t('packs.importer.profileName')}
                                fullWidth
                                value={newName}
                                onChange={event => setNewName(event.target.value)}
                                slotProps={{ htmlInput: { required: true } }}
                            />
                        )}
                    </Stack>
                    {!intoNew && (
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {t('packs.importer.backupNote')}
                        </Typography>
                    )}
                    {channelPack && (
                        <FormControlLabel
                            control={
                                <Checkbox
                                    id='keepPackVersion'
                                    checked={keep}
                                    disabled={busy}
                                    onChange={event => setKeep(event.target.checked)}
                                />
                            }
                            label={t('packs.importer.keepVersion', { version: channelPack.id })}
                        />
                    )}
                    <Stack direction='row' spacing={1} sx={{ justifyContent: 'flex-end' }}>
                        <Button onClick={onCancel} disabled={busy}>
                            {t('common.cancel')}
                        </Button>
                        <Button type='submit' variant='contained' disabled={busy || selected.size === 0}>
                            {t('packs.importer.import')}
                        </Button>
                    </Stack>
                </Stack>
            </CardContent>
            <Dialog open={Boolean(warnings)} onClose={() => setWarnings(null)}>
                <DialogTitle>{t('packs.importer.anywayTitle')}</DialogTitle>
                <DialogContent>
                    <Stack spacing={1}>
                        {warnings?.map(warning => (
                            <Typography key={warning}>{warning}</Typography>
                        ))}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setWarnings(null)}>{t('common.cancel')}</Button>
                    <Button color='warning' onClick={importNow}>
                        {t('packs.importer.anyway')}
                    </Button>
                </DialogActions>
            </Dialog>
        </Card>
    );
}

export default PackImporter;
