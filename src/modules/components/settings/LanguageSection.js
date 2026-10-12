import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { getLanguageSetting, languages, setLanguage, systemLanguage, useTranslation } from '../../i18n';

// Picks the app's language. "System language" follows the computer and is the default.
function LanguageSection() {
    const { t } = useTranslation();
    const systemName = languages.find(language => language.code === systemLanguage())?.name;

    return (
        <Stack spacing={2}>
            <Typography variant='h6' component='h2'>
                {t('settings.language.title')}
            </Typography>
            <TextField
                id='language'
                label={t('settings.language.label')}
                select
                value={getLanguageSetting()}
                onChange={event => setLanguage(event.target.value)}
                slotProps={{ select: { native: true }, inputLabel: { shrink: true } }}
                sx={{ maxWidth: 360 }}
            >
                <option value=''>{t('settings.language.system', { name: systemName })}</option>
                {languages.map(language => (
                    <option key={language.code} value={language.code}>
                        {language.name}
                    </option>
                ))}
            </TextField>
        </Stack>
    );
}

export default LanguageSection;
