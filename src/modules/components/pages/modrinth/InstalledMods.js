import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { ItemList, ItemRow } from '../../utils/ItemList';
import { ChangelogButton } from '../../utils/Changelog';
import { KINDS } from '../../../services/modrinth';
import { updateChangelog } from '../../../services/modrinthMods';
import { useTranslation } from '../../../i18n';

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
    const { t } = useTranslation();
    if (compat.status === 'error') {
        return <Alert severity='warning'>{t('modrinth.compat.error', { error: compat.error })}</Alert>;
    }
    if (compat.status !== 'done') {
        return null;
    }
    const count = compat.problems.length;
    return count === 0 ? (
        <Alert severity='success'>{t('modrinth.compat.none')}</Alert>
    ) : (
        <Alert severity='warning'>{t('modrinth.compat.found', { count })}</Alert>
    );
}

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
    problemsFor,
    onFix,
}) {
    const { t } = useTranslation();
    return (
        <Stack component='section' spacing={2}>
            <Typography variant='h6' component='h2'>
                {t(`modrinth.kinds.${kind}.label`)}
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
                                                title={t('modrinth.installed.whatsNew', { title: mod.title })}
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
                                                {t('modrinth.installed.update')}
                                            </Button>
                                        )}
                                        <Button variant='outlined' disabled={busy} onClick={() => onToggle(mod)}>
                                            {mod.enabled
                                                ? t('modrinth.installed.disable')
                                                : t('modrinth.installed.enable')}
                                        </Button>
                                        <Button color='error' disabled={busy} onClick={() => onRemove(mod)}>
                                            {t('modrinth.installed.remove')}
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
                                            {t('modrinth.installed.asDependency')}
                                        </Typography>
                                    )}
                                </Stack>
                                {update && (
                                    <Typography variant='body2' sx={{ color: 'success.main' }}>
                                        {t('modrinth.installed.updateAvailable', { version: update.version_number })}
                                    </Typography>
                                )}
                                <Problems problems={problemsFor(mod.projectId)} busy={busy} onFix={onFix} />
                            </ItemRow>
                        );
                    })}
                </ItemList>
            )}
            {unmanaged.length > 0 && (
                <Stack spacing={2}>
                    <Typography variant='subtitle1' component='h3'>
                        {t('modrinth.installed.byHand')}
                    </Typography>
                    <Alert
                        severity='info'
                        action={
                            <Button color='inherit' disabled={busy} onClick={() => onAdopt(kind)}>
                                {t('modrinth.installed.recognise')}
                            </Button>
                        }
                    >
                        {t('modrinth.installed.byHandHelp')}
                    </Alert>
                    <ItemList>
                        {unmanaged.map(name => (
                            <ItemRow key={name}>
                                <Typography component='code' variant='body2'>
                                    {name}
                                </Typography>
                                {kind === 'mod' && <Problems problems={problemsFor(name)} busy={busy} onFix={onFix} />}
                            </ItemRow>
                        ))}
                    </ItemList>
                </Stack>
            )}
            {mods.length === 0 && unmanaged.length === 0 && (
                <Typography sx={{ color: 'text.secondary' }}>{t(`modrinth.kinds.${kind}.empty`)}</Typography>
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
    canCheckCompat,
    compat,
    onCheckCompat,
    onFix,
}) {
    const { t } = useTranslation();
    const updateFor = new Map(updates.map(update => [update.mod.projectId, update.version]));
    // Compatibility is checked for mods only; packs and shaders need no loader.
    const problemsFor = key => compat.problems.filter(p => (p.mod.tracked ? p.mod.projectId : p.mod.fileName) === key);
    const hasMods = mods.some(mod => (mod.kind || 'mod') === 'mod') || (unmanaged.mod || []).length > 0;

    return (
        <Stack spacing={3}>
            <Stack direction='row' spacing={1}>
                <Button
                    variant='contained'
                    disabled={busy || !canCheckUpdates || mods.length === 0}
                    onClick={onCheckUpdates}
                >
                    {t('modrinth.installed.checkUpdates')}
                </Button>
                <Button
                    variant='outlined'
                    disabled={busy || !canCheckCompat || compat.status === 'checking'}
                    onClick={onCheckCompat}
                >
                    {compat.status === 'checking'
                        ? t('modrinth.installed.checkingCompat')
                        : t('modrinth.installed.checkCompat')}
                </Button>
                {updates.length > 0 && (
                    <Button variant='contained' color='success' disabled={busy} onClick={onUpdateAll}>
                        {t('modrinth.installed.updateAll', { count: updates.length })}
                    </Button>
                )}
            </Stack>
            {hasMods && <CompatSummary compat={compat} />}
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
                    problemsFor={problemsFor}
                    onFix={onFix}
                />
            ))}
        </Stack>
    );
}

export default InstalledMods;
