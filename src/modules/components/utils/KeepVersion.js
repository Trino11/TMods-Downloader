import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Tooltip from '@mui/material/Tooltip';
import PushPinIcon from '@mui/icons-material/PushPin';
import PushPinOutlinedIcon from '@mui/icons-material/PushPinOutlined';
import { t } from '../../i18n';

// Turns "keep this version" (services/pins.js) on or off for what a profile has installed.
export function KeepVersionButton({ pinned, disabled, size, onChange }) {
    return (
        <Tooltip title={pinned ? t('common.keepVersion.allowHelp') : t('common.keepVersion.keepHelp')}>
            <span>
                <Button
                    size={size}
                    startIcon={pinned ? <PushPinIcon /> : <PushPinOutlinedIcon />}
                    disabled={disabled}
                    onClick={() => onChange(!pinned)}
                >
                    {pinned ? t('common.keepVersion.allow') : t('common.keepVersion.keep')}
                </Button>
            </span>
        </Tooltip>
    );
}

// Shown in place of "Up to date" or "Update available" while a profile keeps its version.
export function KeptChip() {
    return (
        <Chip
            size='small'
            color='info'
            variant='outlined'
            icon={<PushPinIcon />}
            label={t('common.keepVersion.kept')}
        />
    );
}

// One line on a kept version: which one the profile stays on and, when there is one,
// the newer version it isn't taking.
export function describeKept(installed, latestId) {
    return latestId && latestId !== installed
        ? t('common.keepVersion.keepingNewer', { version: installed, latest: latestId })
        : t('common.keepVersion.keeping', { version: installed });
}
