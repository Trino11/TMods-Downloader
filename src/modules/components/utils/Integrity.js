import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import EditNoteIcon from '@mui/icons-material/EditNote';
import HelpOutlineIcon from '@mui/icons-material/HelpOutlineOutlined';
import VerifiedIcon from '@mui/icons-material/Verified';
import { t } from '../../i18n';

// How many file names a tooltip lists before it says "and N more".
const MAX_NAMES = 8;

// The reasons an install no longer matches its download, as short phrases
// ("merged with 3 files you had", "2 files changed since"), from checkIntegrity.
export function integrityReasons(integrity) {
    if (!integrity?.tracked) {
        return [];
    }
    return ['merged', 'changed', 'added', 'removed']
        .filter(kind => integrity[kind].length > 0)
        .map(kind => t(`common.integrity.reasons.${kind}`, { count: integrity[kind].length }));
}

// One line under an installed version, '' when there's nothing to add to the chip.
export function describeIntegrity(integrity) {
    if (!integrity?.tracked) {
        return '';
    }
    return integrity.modified
        ? t('common.integrity.modifiedBecause', { reasons: integrityReasons(integrity).join(', ') })
        : '';
}

function names(files) {
    const shown = files.slice(0, MAX_NAMES);
    return files.length > MAX_NAMES
        ? [...shown, t('common.integrity.andMore', { count: files.length - MAX_NAMES })]
        : shown;
}

function ModifiedDetails({ integrity }) {
    return (
        <Box sx={{ py: 0.5 }}>
            {['merged', 'changed', 'added', 'removed']
                .filter(kind => integrity[kind].length > 0)
                .map(kind => (
                    <Box key={kind} sx={{ mb: 0.5 }}>
                        <Box sx={{ fontWeight: 600 }}>
                            {t(`common.integrity.reasons.${kind}`, { count: integrity[kind].length })}
                        </Box>
                        {names(integrity[kind]).map(name => (
                            <Box key={name}>{name}</Box>
                        ))}
                    </Box>
                ))}
        </Box>
    );
}

// "Unchanged" when the installed files are byte for byte the downloaded ones, "Modified"
// otherwise (the tooltip says which files and why), "Not checked" for installs made
// before TMods kept a record. Nothing when nothing is installed.
export function IntegrityChip({ integrity }) {
    if (!integrity) {
        return null;
    }
    if (!integrity.tracked) {
        return (
            <Tooltip title={t('common.integrity.untrackedHelp')}>
                <Chip
                    size='small'
                    variant='outlined'
                    icon={<HelpOutlineIcon />}
                    label={t('common.integrity.untracked')}
                />
            </Tooltip>
        );
    }
    if (!integrity.modified) {
        return (
            <Tooltip title={t('common.integrity.unchangedHelp')}>
                <Chip
                    size='small'
                    color='success'
                    variant='outlined'
                    icon={<VerifiedIcon />}
                    label={t('common.integrity.unchanged')}
                />
            </Tooltip>
        );
    }
    return (
        <Tooltip title={<ModifiedDetails integrity={integrity} />}>
            <Chip
                size='small'
                color='warning'
                variant='outlined'
                icon={<EditNoteIcon />}
                label={t('common.integrity.modified')}
            />
        </Tooltip>
    );
}
