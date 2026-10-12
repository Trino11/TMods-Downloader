import { useState } from 'react';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { t } from '../../i18n';

// Asks before an install whether it replaces what the game folders have or adds to it.
// "Replace" starts ticked. `folders` are the game-folder folders the install writes into;
// `onConfirm` gets true to replace, false to keep.
function ReplaceContentDialog({ open, folders, onConfirm, onCancel }) {
    const [replace, setReplace] = useState(true);

    // Starts ticked again the next time it opens.
    function close(done) {
        setReplace(true);
        done();
    }

    return (
        <Dialog open={open} onClose={() => close(onCancel)}>
            <DialogTitle>{t('common.replaceContent.title')}</DialogTitle>
            <DialogContent>
                <Stack spacing={1}>
                    {folders.length > 0 && (
                        <Typography>
                            {t('common.replaceContent.intro', {
                                folders: folders.map(folder => `${folder}/`).join(', '),
                            })}
                        </Typography>
                    )}
                    <FormControlLabel
                        control={
                            <Checkbox
                                id='replaceContent'
                                checked={replace}
                                onChange={event => setReplace(event.target.checked)}
                            />
                        }
                        label={t('common.replaceContent.replace')}
                    />
                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                        {replace ? t('common.replaceContent.replaceHelp') : t('common.replaceContent.keepHelp')}
                    </Typography>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={() => close(onCancel)}>{t('common.cancel')}</Button>
                <Button variant='contained' onClick={() => close(() => onConfirm(replace))}>
                    {t('common.replaceContent.confirm')}
                </Button>
            </DialogActions>
        </Dialog>
    );
}

export default ReplaceContentDialog;
