import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import DownloadIcon from '@mui/icons-material/Download';
import { ItemRow } from '../../utils/ItemList';
import { ChangelogButton } from '../../utils/Changelog';
import { IntegrityChip, describeIntegrity } from '../../utils/Integrity';
import { changelogEntries } from '../../../services/manifest';
import { useTranslation } from '../../../i18n';

// `integrity` (installed version only) says whether its files are still the downloaded ones.
function VersionItem({ version, showTarget, installed, integrity, disabled, onDownload }) {
    const { t } = useTranslation();
    const changelog = changelogEntries([version]);
    return (
        <ItemRow
            actions={
                <>
                    {changelog.length > 0 && (
                        <ChangelogButton title={t('bundle.whatsNewIn', { version: version.id })} entries={changelog} />
                    )}
                    <Button
                        variant={installed ? 'outlined' : 'contained'}
                        startIcon={installed ? <CheckIcon /> : <DownloadIcon />}
                        disabled={disabled}
                        onClick={onDownload}
                    >
                        {installed ? t('bundle.downloaded') : t('bundle.download')}
                    </Button>
                </>
            }
        >
            <Stack direction='row' spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography sx={{ fontWeight: 500 }}>{version.id}</Typography>
                {showTarget && version.target && <Chip size='small' variant='outlined' label={version.target} />}
                <IntegrityChip integrity={integrity} />
            </Stack>
            {version.description && (
                <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                    {version.description}
                </Typography>
            )}
            {describeIntegrity(integrity) && (
                <Typography variant='body2' sx={{ color: 'warning.main' }}>
                    {describeIntegrity(integrity)}
                </Typography>
            )}
        </ItemRow>
    );
}

export default VersionItem;
