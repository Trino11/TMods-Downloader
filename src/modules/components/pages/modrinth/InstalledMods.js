import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ItemList, ItemRow } from '../../utils/ItemList';
import { ChangelogButton } from '../../utils/Changelog';
import { KINDS } from '../../../services/modrinth';
import { updateChangelog } from '../../../services/modrinthMods';

// The tracked entries of one kind, plus the files of that kind added by hand.
function KindSection({
    kind,
    mods,
    unmanaged,
    updateFor,
    target,
    gameVersion,
    busy,
    onUpdate,
    onToggle,
    onRemove,
    onAdopt,
}) {
    const { label, noun } = KINDS[kind];
    return (
        <Stack component='section' spacing={2}>
            <Typography variant='h6' component='h2'>
                {label}
            </Typography>
            {mods.length > 0 && (
                <ItemList>
                    {mods.map(mod => {
                        const update = updateFor.get(mod.projectId);
                        return (
                            <ItemRow
                                key={mod.projectId}
                                actions={
                                    <>
                                        {update && (
                                            <ChangelogButton
                                                key={update.id}
                                                title={`What's new in ${mod.title}`}
                                                load={() => updateChangelog(mod, update, target, gameVersion)}
                                            />
                                        )}
                                        {update && (
                                            <Button
                                                variant='contained'
                                                color='success'
                                                disabled={busy}
                                                onClick={() => onUpdate(mod, update)}
                                            >
                                                Update
                                            </Button>
                                        )}
                                        <Button variant='outlined' disabled={busy} onClick={() => onToggle(mod)}>
                                            {mod.enabled ? 'Disable' : 'Enable'}
                                        </Button>
                                        <Button color='error' disabled={busy} onClick={() => onRemove(mod)}>
                                            Remove
                                        </Button>
                                    </>
                                }
                            >
                                <Stack
                                    direction='row'
                                    spacing={1}
                                    useFlexGap
                                    sx={{ alignItems: 'center', flexWrap: 'wrap' }}
                                >
                                    <Typography
                                        sx={{ color: mod.enabled ? 'text.primary' : 'text.disabled', fontWeight: 500 }}
                                    >
                                        {mod.title}
                                    </Typography>
                                    <Chip size='small' variant='outlined' label={mod.versionNumber} />
                                    {mod.asDependency && (
                                        <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                            (needed by another mod)
                                        </Typography>
                                    )}
                                </Stack>
                                {update && (
                                    <Typography variant='body2' sx={{ color: 'success.main' }}>
                                        Update available: {update.version_number}
                                    </Typography>
                                )}
                            </ItemRow>
                        );
                    })}
                </ItemList>
            )}
            {unmanaged.length > 0 && (
                <Stack spacing={2}>
                    <Typography variant='subtitle1' component='h3'>
                        Added by hand
                    </Typography>
                    <Alert
                        severity='info'
                        action={
                            <Button color='inherit' disabled={busy} onClick={() => onAdopt(kind)}>
                                Recognise
                            </Button>
                        }
                    >
                        TMods leaves these alone. If they come from Modrinth, it can recognise them so you can update
                        them here.
                    </Alert>
                    <ItemList>
                        {unmanaged.map(name => (
                            <ItemRow key={name}>
                                <Typography component='code' variant='body2'>
                                    {name}
                                </Typography>
                            </ItemRow>
                        ))}
                    </ItemList>
                </Stack>
            )}
            {mods.length === 0 && unmanaged.length === 0 && (
                <Typography sx={{ color: 'text.secondary' }}>
                    No {noun}s from Modrinth in this profile yet. Find some under {label}.
                </Typography>
            )}
        </Stack>
    );
}

// What TMods installed in this profile, by kind, plus files added by hand.
// `unmanaged` maps each kind to the file names added by hand.
function InstalledMods({
    mods,
    unmanaged,
    updates,
    target,
    gameVersion,
    busy,
    canCheckUpdates,
    onCheckUpdates,
    onUpdate,
    onUpdateAll,
    onToggle,
    onRemove,
    onAdopt,
}) {
    const updateFor = new Map(updates.map(update => [update.mod.projectId, update.version]));

    return (
        <Stack spacing={3}>
            <Stack direction='row' spacing={1}>
                <Button
                    variant='contained'
                    disabled={busy || !canCheckUpdates || mods.length === 0}
                    onClick={onCheckUpdates}
                >
                    Check for updates
                </Button>
                {updates.length > 0 && (
                    <Button variant='contained' color='success' disabled={busy} onClick={onUpdateAll}>
                        Update all ({updates.length})
                    </Button>
                )}
            </Stack>
            {Object.keys(KINDS).map(kind => (
                <KindSection
                    key={kind}
                    kind={kind}
                    mods={mods.filter(mod => (mod.kind || 'mod') === kind)}
                    unmanaged={unmanaged[kind] || []}
                    updateFor={updateFor}
                    target={target}
                    gameVersion={gameVersion}
                    busy={busy}
                    onUpdate={onUpdate}
                    onToggle={onToggle}
                    onRemove={onRemove}
                    onAdopt={onAdopt}
                />
            ))}
        </Stack>
    );
}

export default InstalledMods;
