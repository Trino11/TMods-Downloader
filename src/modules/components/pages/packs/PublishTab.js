import { useEffect, useMemo, useState } from 'react';
import { Link as RouterLink } from 'react-router';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Checkbox from '@mui/material/Checkbox';
import CardContent from '@mui/material/CardContent';
import Link from '@mui/material/Link';
import ListItemText from '@mui/material/ListItemText';
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
    SERVERS_CATEGORY,
    bundlesRepo,
    categoryHasFiles,
    existingVersions,
    isVersioned,
    nextVersion,
    publishPack,
    serversOfPack,
    serversOfProfile,
} from '../../../services/bundlePublish';
import { exportMrpack, readPack } from '../../../services/mrpack';
import { formatSize } from '../../../services/packKinds';
import { useTranslation } from '../../../i18n';

const FROM_PROFILE = 'profile';
const FROM_FILE = 'file';

const labelOf = id => PUBLISH_CATEGORIES.find(category => category.id === id)?.label || id;

// Publishes a new version of each picked category to the player's bundles repository
// (set up in Settings), in one commit: the files picked in this profile, exported as a
// .mrpack, or a .mrpack file as it is. Picking the server list category publishes the
// picked servers.dat as the channel's server list instead, in the same commit.
// `items` and `selected` are shared with the Export tab.
function PublishTab({ profile, gameDir, target, items, selected, onSelect, busy, run }) {
    const { t } = useTranslation();
    const repo = bundlesRepo();
    const [source, setSource] = useState(FROM_PROFILE);
    const [file, setFile] = useState(null);
    // The categories to publish into, in PUBLISH_CATEGORIES order, and a version for each:
    // the suggested one until the player types their own (`touched`).
    const [picked, setPicked] = useState([PACKS_CATEGORY]);
    const [versions, setVersions] = useState({});
    const [touched, setTouched] = useState({});
    const [description, setDescription] = useState('');
    const [changelog, setChangelog] = useState('');
    const [lookupError, setLookupError] = useState('');
    const [published, setPublished] = useState(null);

    // Suggests, for each picked category, the version after the newest one already
    // published there.
    useEffect(() => {
        if (!repo) {
            return undefined;
        }
        let active = true;
        for (const category of picked.filter(id => isVersioned(id) && !touched[id])) {
            existingVersions(repo, category)
                .then(existing => {
                    if (!active) {
                        return;
                    }
                    setLookupError('');
                    setVersions(current => ({ ...current, [category]: nextVersion(existing) }));
                })
                .catch(error => active && setLookupError(error.message));
        }
        return () => {
            active = false;
        };
    }, [repo, picked, touched, published]);

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

    // The servers to publish as the channel's list, or an error reading them.
    const servers = useMemo(() => {
        if (!picked.includes(SERVERS_CATEGORY)) {
            return null;
        }
        try {
            if (source === FROM_FILE) {
                return { list: filePack && !filePack.error ? serversOfPack(filePack) : [] };
            }
            const ticked = items.some(item => item.kind === 'servers' && selected.has(item.id));
            return { list: ticked ? serversOfProfile(gameDir) : [] };
        } catch (error) {
            return { error: error.message };
        }
    }, [picked, source, filePack, items, selected, gameDir]);

    if (!repo) {
        return (
            <Card variant='outlined'>
                <CardContent>
                    <Typography variant='subtitle1' component='h2'>
                        {t('packs.publish.setupTitle')}
                    </Typography>
                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                        {t('packs.publish.setupBefore')}{' '}
                        <Link component={RouterLink} to='/settings'>
                            {t('packs.publish.setupLink')}
                        </Link>{' '}
                        {t('packs.publish.setupAfter')}
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

    const versionOf = category => (versions[category] || '').trim();
    const versioned = picked.filter(isVersioned);
    const withServers = picked.includes(SERVERS_CATEGORY);
    // When the servers go out as the channel's list, they stay out of the pack, so players
    // don't get them twice.
    const packItems = items.filter(
        item => selected.has(item.id) && !(withServers && source === FROM_PROFILE && item.kind === 'servers'),
    );

    // The pack to publish, as bytes: the whole of it, each category takes its own part.
    function packData() {
        if (source === FROM_FILE) {
            return file.data;
        }
        return exportMrpack(gameDir, target, {
            name: profile.name,
            version: versionOf(versioned.includes(PACKS_CATEGORY) ? PACKS_CATEGORY : versioned[0]),
            items: packItems,
        }).data;
    }

    function handleSubmit(event) {
        event.preventDefault();
        setPublished(null);
        run(async () => {
            const data = versioned.length > 0 ? packData() : null;
            if (
                data &&
                data.length > LARGE_PACK_BYTES &&
                !window.confirm(t('packs.publish.confirmLarge', { size: formatSize(data.length) }))
            ) {
                return '';
            }
            const targets = versioned.map(category => ({ category, version: versionOf(category) }));
            const result = await publishPack({
                repo,
                versions: targets,
                data,
                description,
                changelog,
                ...(withServers ? { servers: servers.list } : {}),
            });
            const labels = targets.map(({ category, version }) => `${labelOf(category)} ${version}`);
            if (withServers) {
                labels.push(labelOf(SERVERS_CATEGORY));
            }
            setPublished({ ...result, label: labels.join(', ') });
            setTouched({});
            setChangelog('');
            return '';
        });
    }

    // The kinds of file going out, so categories with nothing to take can be told apart.
    const kinds = [
        ...new Set(
            source === FROM_FILE
                ? filePack && !filePack.error
                    ? filePack.items.map(item => item.kind)
                    : []
                : items.filter(item => selected.has(item.id)).map(item => item.kind),
        ),
    ];
    const serversReady = !withServers || Boolean(servers?.list?.length);
    // What goes in the pack: the server list stays out of it when published on its own.
    const packKinds = source === FROM_FILE ? kinds : [...new Set(packItems.map(item => item.kind))];
    const empty = picked.filter(
        category => !categoryHasFiles(category, category === SERVERS_CATEGORY ? kinds : packKinds),
    );
    const ready =
        (source === FROM_FILE ? Boolean(filePack && !filePack.error) : items.some(item => selected.has(item.id))) &&
        picked.length > 0 &&
        empty.length === 0 &&
        serversReady &&
        versioned.every(category => versionOf(category));

    return (
        <Stack component='form' spacing={2} onSubmit={handleSubmit}>
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {t('packs.publish.intro', { repo })}
            </Typography>
            <ToggleButtonGroup
                exclusive
                size='small'
                value={source}
                onChange={(event, value) => value && setSource(value)}
                aria-label={t('packs.publish.source')}
                sx={{ '& .MuiToggleButton-root': { textTransform: 'none' } }}
            >
                <ToggleButton value={FROM_PROFILE}>
                    {t('packs.publish.fromProfile', { profile: profile.name })}
                </ToggleButton>
                <ToggleButton value={FROM_FILE}>{t('packs.publish.fromFile')}</ToggleButton>
            </ToggleButtonGroup>

            {source === FROM_PROFILE && (
                <PackPicker items={items} selected={selected} onChange={onSelect} disabled={busy} />
            )}
            {source === FROM_FILE && (
                <Stack spacing={1} sx={{ alignItems: 'flex-start' }}>
                    <Button component='label' variant='outlined' startIcon={<FileUploadIcon />} disabled={busy}>
                        {file ? t('packs.publish.chooseAnother') : t('packs.publish.chooseFile')}
                        <input id='publishPackFile' type='file' accept='.mrpack' hidden onChange={handleFile} />
                    </Button>
                    {filePack?.error && <Alert severity='error'>{filePack.error}</Alert>}
                    {filePack && !filePack.error && (
                        <Typography variant='body2'>
                            {t('packs.publish.fileInfo', {
                                file: file.name,
                                name: filePack.name,
                                gameVersion: filePack.gameVersion,
                                count: filePack.items.length,
                                size: formatSize(file.data.length),
                            })}
                        </Typography>
                    )}
                </Stack>
            )}

            <TextField
                id='publishCategories'
                select
                label={t('packs.publish.categories')}
                helperText={t('packs.publish.categoriesHelp')}
                value={picked}
                onChange={event => {
                    // Kept in PUBLISH_CATEGORIES order, so the versions below are too.
                    const chosen = event.target.value;
                    setPicked(PUBLISH_CATEGORIES.map(item => item.id).filter(id => chosen.includes(id)));
                }}
                slotProps={{
                    select: {
                        multiple: true,
                        renderValue: value => value.map(labelOf).join(', '),
                    },
                }}
            >
                {PUBLISH_CATEGORIES.map(item => (
                    <MenuItem key={item.id} value={item.id}>
                        <Checkbox size='small' checked={picked.includes(item.id)} sx={{ p: 0, mr: 1 }} />
                        <ListItemText
                            primary={item.label}
                            secondary={categoryHasFiles(item.id, kinds) ? null : t('packs.publish.nothingOfKind')}
                        />
                    </MenuItem>
                ))}
            </TextField>
            {versioned.map(category => (
                <TextField
                    key={category}
                    id={`publishVersion-${category}`}
                    label={t('packs.publish.versionOf', { category: labelOf(category) })}
                    fullWidth
                    value={versions[category] || ''}
                    onChange={event => {
                        const value = event.target.value;
                        setVersions(current => ({ ...current, [category]: value }));
                        setTouched(current => ({ ...current, [category]: true }));
                    }}
                    slotProps={{ htmlInput: { required: true }, inputLabel: { shrink: true } }}
                />
            ))}
            {withServers && servers?.error && <Alert severity='error'>{servers.error}</Alert>}
            {withServers && servers?.list?.length > 0 && (
                <Alert severity='info'>
                    {t('packs.publish.serversInfo', {
                        count: servers.list.length,
                        names: servers.list.map(server => server.name).join(', '),
                    })}
                </Alert>
            )}
            {withServers && servers?.list?.length === 0 && !empty.includes(SERVERS_CATEGORY) && (
                <Alert severity='warning'>{t('packs.publish.serversEmpty')}</Alert>
            )}
            {empty.length > 0 && (
                <Alert severity='warning'>
                    {t('packs.publish.emptyCategories', { categories: empty.map(labelOf).join(', ') })}
                </Alert>
            )}
            <TextField
                id='publishDescription'
                label={t('packs.publish.description')}
                fullWidth
                value={description}
                onChange={event => setDescription(event.target.value)}
            />
            <TextField
                id='publishChangelog'
                label={t('packs.publish.changelog')}
                fullWidth
                multiline
                minRows={2}
                value={changelog}
                onChange={event => setChangelog(event.target.value)}
            />
            <Stack direction='row' sx={{ justifyContent: 'flex-end' }}>
                <Button type='submit' variant='contained' startIcon={<CloudUploadIcon />} disabled={busy || !ready}>
                    {t('packs.publish.publish')}
                </Button>
            </Stack>
            {lookupError && <Alert severity='warning'>{lookupError}</Alert>}
            {published && (
                <Alert severity='success'>
                    {t('packs.publish.publishedBefore', { label: published.label })}{' '}
                    <Link href={published.actionsUrl} target='_blank' rel='noreferrer'>
                        {t('packs.publish.follow')}
                    </Link>
                    .
                </Alert>
            )}
        </Stack>
    );
}

export default PublishTab;
