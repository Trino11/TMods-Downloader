import { useCallback, useEffect, useState } from 'react';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ItemList, ItemRow } from '../../utils/ItemList';
import {
    RESOURCE_PACK,
    isManaged,
    readManaged,
    readServers,
    syncProfileServers,
    writeServers,
} from '../../../services/servers';
import { useTranslation } from '../../../i18n';

const emptyForm = { index: null, name: '', address: '', resourcePack: RESOURCE_PACK.PROMPT };

// The Multiplayer server list of one profile: add, edit, remove and reorder servers.
// Servers the channel's manifest lists are put in on open and marked as such.
// The folder's list and which servers came from the channel, or the error reading it.
function load(gameDir) {
    try {
        return { servers: readServers(gameDir), managed: readManaged(gameDir), error: '' };
    } catch (readError) {
        return { servers: [], managed: [], error: readError.message };
    }
}

// The Multiplayer server list of one profile: add, edit, remove and reorder servers.
// Servers the channel's manifest lists are put in on open and marked as such. Give it a
// `key` per profile so switching profiles starts afresh.
function ServersCard({ profile, gameDir }) {
    const { t } = useTranslation();
    const [{ servers, managed, error: readError }, setLoaded] = useState(() => load(gameDir));
    const [form, setForm] = useState(emptyForm);
    const [saveError, setSaveError] = useState('');
    const error = saveError || readError;

    const reload = useCallback(() => setLoaded(load(gameDir)), [gameDir]);

    useEffect(() => {
        if (readError) {
            return undefined;
        }
        let cancelled = false;
        // Brings in the channel's servers, in case they changed since the app opened.
        syncProfileServers(profile)
            .then(() => {
                if (!cancelled) {
                    // Reloads even when nothing changed here: the app's own sync on
                    // start may have changed the list since the card read it.
                    reload();
                }
            })
            .catch(syncError => console.error("Could not load the manifest's servers:", syncError));
        return () => {
            cancelled = true;
        };
        // Only when the card opens; saving reloads the list itself.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gameDir, reload]);

    function save(next) {
        setSaveError('');
        try {
            writeServers(gameDir, next);
            reload();
            return true;
        } catch (writeError) {
            setSaveError(writeError.message);
            return false;
        }
    }

    function handleSubmit(event) {
        event.preventDefault();
        const server = { name: form.name, address: form.address, resourcePack: form.resourcePack };
        const next =
            form.index === null
                ? [...servers, server]
                : servers.map((existing, i) => (i === form.index ? { ...existing, ...server } : existing));
        if (save(next)) {
            setForm(emptyForm);
        }
    }

    function handleEdit(index) {
        const { name, address, resourcePack } = servers[index];
        setForm({ index, name, address, resourcePack });
        setSaveError('');
    }

    function handleRemove(index) {
        if (window.confirm(t('profiles.servers.confirmRemove', { name: servers[index].name }))) {
            save(servers.filter((_, i) => i !== index));
            if (form.index !== null) {
                setForm(emptyForm);
            }
        }
    }

    function handleMove(index, step) {
        const next = [...servers];
        [next[index], next[index + step]] = [next[index + step], next[index]];
        save(next);
    }

    const resourcePackLabels = {
        [RESOURCE_PACK.PROMPT]: t('profiles.servers.resourcePack.prompt'),
        [RESOURCE_PACK.ENABLED]: t('profiles.servers.resourcePack.enabled'),
        [RESOURCE_PACK.DISABLED]: t('profiles.servers.resourcePack.disabled'),
    };

    return (
        <Card variant='outlined'>
            <CardContent>
                <Stack spacing={2}>
                    <div>
                        <Typography variant='subtitle1' component='h2'>
                            {t('profiles.servers.title', { profile: profile.name })}
                        </Typography>
                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                            {t('profiles.servers.description')}
                        </Typography>
                    </div>

                    {servers.length > 0 ? (
                        <ItemList>
                            {servers.map((server, index) => (
                                <ItemRow
                                    key={`${index}/${server.address}`}
                                    actions={
                                        <>
                                            <IconButton
                                                aria-label={t('profiles.servers.moveUp', { name: server.name })}
                                                disabled={index === 0}
                                                onClick={() => handleMove(index, -1)}
                                            >
                                                <ArrowUpwardIcon fontSize='small' />
                                            </IconButton>
                                            <IconButton
                                                aria-label={t('profiles.servers.moveDown', { name: server.name })}
                                                disabled={index === servers.length - 1}
                                                onClick={() => handleMove(index, 1)}
                                            >
                                                <ArrowDownwardIcon fontSize='small' />
                                            </IconButton>
                                            <Button onClick={() => handleEdit(index)}>{t('profiles.edit')}</Button>
                                            <Button color='error' onClick={() => handleRemove(index)}>
                                                {t('profiles.servers.remove')}
                                            </Button>
                                        </>
                                    }
                                >
                                    <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
                                        <Typography sx={{ fontWeight: 500 }}>{server.name}</Typography>
                                        {isManaged(managed, server) && (
                                            <Chip
                                                size='small'
                                                variant='outlined'
                                                label={t('profiles.servers.fromChannel')}
                                            />
                                        )}
                                    </Stack>
                                    <Typography variant='body2' noWrap sx={{ color: 'text.secondary' }}>
                                        {server.address} · {resourcePackLabels[server.resourcePack]}
                                    </Typography>
                                </ItemRow>
                            ))}
                        </ItemList>
                    ) : (
                        !error && (
                            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                {t('profiles.servers.empty')}
                            </Typography>
                        )
                    )}

                    <Stack component='form' spacing={2} onSubmit={handleSubmit}>
                        <Typography variant='subtitle2' component='h3'>
                            {form.index === null ? t('profiles.servers.addTitle') : t('profiles.servers.editTitle')}
                        </Typography>
                        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                            <TextField
                                id='serverName'
                                label={t('profiles.servers.name')}
                                placeholder={t('services.servers.defaultName')}
                                size='small'
                                fullWidth
                                value={form.name}
                                onChange={event => setForm({ ...form, name: event.target.value })}
                                slotProps={{ inputLabel: { shrink: true } }}
                            />
                            <TextField
                                id='serverAddress'
                                label={t('profiles.servers.address')}
                                placeholder='play.example.com'
                                size='small'
                                fullWidth
                                value={form.address}
                                onChange={event => setForm({ ...form, address: event.target.value })}
                                slotProps={{ htmlInput: { required: true }, inputLabel: { shrink: true } }}
                            />
                            <TextField
                                id='serverResourcePack'
                                select
                                label={t('profiles.servers.resourcePack.label')}
                                size='small'
                                sx={{ minWidth: 200 }}
                                value={form.resourcePack}
                                onChange={event => setForm({ ...form, resourcePack: event.target.value })}
                            >
                                {Object.entries(resourcePackLabels).map(([value, label]) => (
                                    <MenuItem key={value} value={value}>
                                        {label}
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Stack>
                        <Stack direction='row' spacing={1}>
                            <Button type='submit' variant='contained'>
                                {form.index === null ? t('profiles.servers.add') : t('common.save')}
                            </Button>
                            {form.index !== null && (
                                <Button type='button' onClick={() => setForm(emptyForm)}>
                                    {t('common.cancel')}
                                </Button>
                            )}
                        </Stack>
                        <Alert severity='info'>{t('profiles.servers.closeGame')}</Alert>
                        {error && <Alert severity='error'>{error}</Alert>}
                    </Stack>
                </Stack>
            </CardContent>
        </Card>
    );
}

export default ServersCard;
