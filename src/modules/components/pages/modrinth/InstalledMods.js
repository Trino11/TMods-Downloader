import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { ItemList, ItemRow } from '../../utils/ItemList';
import { ChangelogButton } from '../../utils/Changelog';
import { updateChangelog } from '../../../services/modrinthMods';

// A mod's compatibility problems, each with its one-click fix when there is one.
function Problems({ problems, busy, onFix }) {
    return problems.map(problem => (
        <Stack
            key={`${problem.kind}:${problem.message}`}
            direction='row'
            spacing={1}
            useFlexGap
            sx={{ alignItems: 'center', flexWrap: 'wrap', color: 'warning.main' }}
        >
            <WarningAmberIcon fontSize='small' />
            <Typography variant='body2'>{problem.message}</Typography>
            {problem.fix && (
                <Button size='small' color='warning' disabled={busy} onClick={() => onFix(problem)}>
                    {problem.fix.label}
                </Button>
            )}
        </Stack>
    ));
}

function CompatSummary({ compat }) {
    if (compat.status === 'error') {
        return <Alert severity='warning'>Could not check compatibility: {compat.error}</Alert>;
    }
    if (compat.status !== 'done') {
        return null;
    }
    const count = compat.problems.length;
    return count === 0 ? (
        <Alert severity='success'>No compatibility problems found.</Alert>
    ) : (
        <Alert severity='warning'>
            {count === 1 ? '1 compatibility problem' : `${count} compatibility problems`} found. They are listed under
            each mod below.
        </Alert>
    );
}

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
    compat,
    onCheckCompat,
    onFix,
}) {
    const updateFor = new Map(updates.map(update => [update.mod.projectId, update.version]));
    const problemsFor = key => compat.problems.filter(p => (p.mod.tracked ? p.mod.projectId : p.mod.fileName) === key);

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
                <Button
                    variant='outlined'
                    disabled={busy || !canCheckUpdates || compat.status === 'checking'}
                    onClick={onCheckCompat}
                >
                    {compat.status === 'checking' ? 'Checking compatibility…' : 'Check compatibility'}
                </Button>
                {updates.length > 0 && (
                    <Button variant='contained' color='success' disabled={busy} onClick={onUpdateAll}>
                        Update all ({updates.length})
                    </Button>
                )}
            </Stack>
            {(mods.length > 0 || unmanaged.length > 0) && <CompatSummary compat={compat} />}
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
                                <Problems problems={problemsFor(mod.projectId)} busy={busy} onFix={onFix} />
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
                                <Problems problems={problemsFor(name)} busy={busy} onFix={onFix} />
                            </ItemRow>
                        ))}
                    </ItemList>
                </section>
            )}
        </Stack>
    );
}

export default InstalledMods;
