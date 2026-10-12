import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import Stack from '@mui/material/Stack';
import ManifestForm from '../settings/ManifestForm';
import LanguageSection from '../settings/LanguageSection';
import { useTranslation } from '../../i18n';

// Shown instead of the app until a manifest has been saved.
function FirstRunSetup({ onDone }) {
    const { t } = useTranslation();
    return (
        <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
            <Card variant='outlined' sx={{ width: '100%', maxWidth: 640 }}>
                <CardContent sx={{ p: 4 }}>
                    <ViewInArIcon color='primary' sx={{ fontSize: 48, mb: 1 }} />
                    <Typography variant='h4' component='h1' gutterBottom>
                        {t('settings.firstRun.title')}
                    </Typography>
                    <Typography sx={{ color: 'text.secondary', mb: 3 }}>
                        {t('settings.firstRun.description')}
                    </Typography>
                    <Stack spacing={3}>
                        <LanguageSection />
                        <ManifestForm onSaved={onDone} />
                    </Stack>
                </CardContent>
            </Card>
        </Box>
    );
}

export default FirstRunSetup;
