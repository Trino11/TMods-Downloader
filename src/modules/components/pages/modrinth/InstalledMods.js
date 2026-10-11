import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { ItemList, ItemRow } from '../../utils/ItemList';
import { ChangelogButton } from '../../utils/Changelog';
import { updateChangelog } from '../../../services/modrinthMods';

// The mods TMods installed in this profile, plus jars added by hand.
function InstalledMods({
    mods,
    unmanaged,
    updates,
    target,
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
            {mods.length === 0 ? (
                <Typography sx={{ color: 'text.secondary' }}>
                    No mods from Modrinth in this profile yet. Find some under Search mods.
                </Typography>
            ) : (
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
                                                load={() => updateChangelog(mod, update, target)}
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
                <section>
                    <Typography variant='h6' component='h2' gutterBottom>
                        Added by hand
                    </Typography>
                    <Alert
                        severity='info'
                        sx={{ mb: 2 }}
                        action={
                            <Button color='inherit' disabled={busy} onClick={onAdopt}>
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
                </section>
            )}
        </Stack>
    );
}

export default InstalledMods;
