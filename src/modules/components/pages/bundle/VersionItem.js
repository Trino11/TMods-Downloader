import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import CheckIcon from '@mui/icons-material/Check';
import DownloadIcon from '@mui/icons-material/Download';
import { ItemRow } from '../../utils/ItemList';

function VersionItem({ version, showTarget, installed, disabled, onDownload }) {
    return <ItemRow
        actions={<Button
            variant={installed ? 'outlined' : 'contained'}
            startIcon={installed ? <CheckIcon /> : <DownloadIcon />}
            disabled={disabled}
            onClick={onDownload}
        >
            {installed ? 'Downloaded' : 'Download'}
        </Button>}
    >
        <Stack direction='row' spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Typography sx={{ fontWeight: 500 }}>{version.id}</Typography>
            {showTarget && version.target && <Chip size='small' variant='outlined' label={version.target} />}
        </Stack>
        {version.description && <Typography variant='body2' sx={{ color: 'text.secondary' }}>{version.description}</Typography>}
    </ItemRow>
}

export default VersionItem;
