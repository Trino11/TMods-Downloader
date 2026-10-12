import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import RestoreIcon from '@mui/icons-material/Restore';
import { ItemList, ItemRow } from '../../utils/ItemList';
import { formatDateTime, useTranslation } from '../../../i18n';

function BackupList({ backups, disabled, onRestore }) {
    const { t } = useTranslation();
    return (
        <section>
            <Typography variant='h6' component='h2' gutterBottom>
                {t('bundle.backups.title')}
            </Typography>
            {backups.length === 0 ? (
                <Typography sx={{ color: 'text.secondary' }}>{t('bundle.backups.empty')}</Typography>
            ) : (
                <ItemList>
                    {backups.map(backup => (
                        <ItemRow
                            key={backup.id}
                            actions={
                                <Button
                                    variant='outlined'
                                    color='warning'
                                    startIcon={<RestoreIcon />}
                                    disabled={disabled}
                                    onClick={() => onRestore(backup)}
                                >
                                    {t('bundle.backups.restore')}
                                </Button>
                            }
                        >
                            <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
                                <Typography>{formatDateTime(backup.createdAt) || backup.createdAt}</Typography>
                                <Chip
                                    size='small'
                                    variant='outlined'
                                    label={backup.version || t('bundle.backups.noVersion')}
                                />
                            </Stack>
                        </ItemRow>
                    ))}
                </ItemList>
            )}
        </section>
    );
}

export default BackupList;
