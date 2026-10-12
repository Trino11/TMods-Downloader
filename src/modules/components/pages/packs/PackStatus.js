import Chip from '@mui/material/Chip';
import { KeptChip, describeKept } from '../../utils/KeepVersion';
import { t } from '../../../i18n';

// Where a profile stands with the channel's pack, as fetchPackUpdates describes it: the
// same chips the channels show on Home.
export function PackStatusChip({ status }) {
    if (!status.installed) {
        return <Chip size='small' variant='outlined' label={t('packs.status.notInstalled')} />;
    }
    if (status.pinned) {
        return <KeptChip />;
    }
    if (status.outdated) {
        return <Chip size='small' color='warning' label={t('packs.status.updateAvailable')} />;
    }
    return <Chip size='small' color='success' variant='outlined' label={t('packs.status.upToDate')} />;
}

// One line on the profile's pack: which version it has and, when outdated, the one it
// would update to (or, when it keeps its version, the newer one it isn't taking). Empty
// when the profile has no pack from the channel.
export function describePackStatus(status) {
    if (!status.installed) {
        return '';
    }
    if (status.pinned) {
        return describeKept(status.installed, status.latest?.id);
    }
    return status.outdated
        ? `${status.installed} → ${status.latest.id}`
        : t('packs.status.installed', { version: status.installed });
}
