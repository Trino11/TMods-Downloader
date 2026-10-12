import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Divider from '@mui/material/Divider';
import LinearProgress from '@mui/material/LinearProgress';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import ArticleOutlinedIcon from '@mui/icons-material/ArticleOutlined';
import { formatDate, useTranslation } from '../../i18n';

// Changelogs come from mod authors and bundle publishers, so they are shown as plain
// text (React escapes it): Markdown stays readable as written and no HTML is rendered.
// `entries` is [{ id, label, text, date? }], newest first.
export function ChangelogDialog({ open, onClose, title, entries, loading, error }) {
    const { t } = useTranslation();
    return (
        <Dialog open={open} onClose={onClose} fullWidth maxWidth='md' scroll='paper'>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent dividers>
                {loading && <LinearProgress />}
                {error && <Alert severity='error'>{error}</Alert>}
                {!loading && !error && entries.length === 0 && (
                    <Typography sx={{ color: 'text.secondary' }}>{t('common.changelog.noneForUpdate')}</Typography>
                )}
                <Stack spacing={2} divider={<Divider flexItem />}>
                    {entries.map(entry => (
                        <section key={entry.id}>
                            <Stack direction='row' spacing={1} sx={{ alignItems: 'baseline', mb: 1 }}>
                                <Typography variant='subtitle1' component='h3' sx={{ fontWeight: 500 }}>
                                    {entry.label}
                                </Typography>
                                {entry.date && (
                                    <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                                        {formatDate(entry.date)}
                                    </Typography>
                                )}
                            </Stack>
                            <Typography
                                variant='body2'
                                component='div'
                                sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
                            >
                                {entry.text || t('common.changelog.noneForVersion')}
                            </Typography>
                        </section>
                    ))}
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>{t('common.close')}</Button>
            </DialogActions>
        </Dialog>
    );
}

// A "What's new" button that opens the changelog. Pass `entries` when they're known, or
// `load` (returning a promise of entries) to fetch them the first time it's opened.
export function ChangelogButton({ title, entries, load, size, disabled }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [loaded, setLoaded] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    async function handleOpen() {
        setOpen(true);
        if (!load || loaded || loading) {
            return;
        }
        setLoading(true);
        setError('');
        try {
            setLoaded(await load());
        } catch (loadError) {
            setError(t('common.changelog.loadFailed', { message: loadError.message }));
        }
        setLoading(false);
    }

    return (
        <>
            <Button size={size} startIcon={<ArticleOutlinedIcon />} disabled={disabled} onClick={handleOpen}>
                {t('common.changelog.whatsNew')}
            </Button>
            <ChangelogDialog
                open={open}
                onClose={() => setOpen(false)}
                title={title}
                entries={entries || loaded || []}
                loading={loading}
                error={error}
            />
        </>
    );
}
