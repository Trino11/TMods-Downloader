import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import RestoreIcon from '@mui/icons-material/Restore';
import { ItemList, ItemRow } from '../../utils/ItemList';

function formatDate(iso) {
    const date = new Date(iso);
    return isNaN(date) ? iso : date.toLocaleString();
}

function BackupList({ backups, disabled, onRestore }) {
    return (
        <section>
            <Typography variant='h6' component='h2' gutterBottom>
                Backups
            </Typography>
            {backups.length === 0 ? (
                <Typography sx={{ color: 'text.secondary' }}>
                    No backups yet. One is made every time you install a version.
                </Typography>
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
                                    Restore
                                </Button>
                            }
                        >
                            <Stack direction='row' spacing={1.5} sx={{ alignItems: 'center' }}>
                                <Typography>{formatDate(backup.createdAt)}</Typography>
                                <Chip
                                    size='small'
                                    variant='outlined'
                                    label={backup.version || 'No version installed'}
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
