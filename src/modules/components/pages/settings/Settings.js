import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Page from '../../utils/Page';
import ManifestsSection from '../../settings/ManifestsSection';
import LogsSection from '../../settings/LogsSection';
import BundlesRepoSection from '../../settings/BundlesRepoSection';
import LanguageSection from '../../settings/LanguageSection';
import { useTranslation } from '../../../i18n';

function Settings({ onManifestsChange }) {
    const { t } = useTranslation();
    return (
        <Page title={t('settings.title')} description={t('settings.description')}>
            <Card variant='outlined'>
                <CardContent>
                    <LanguageSection />
                </CardContent>
            </Card>
            <Card variant='outlined'>
                <CardContent>
                    <ManifestsSection onChange={onManifestsChange} />
                </CardContent>
            </Card>
            <Card variant='outlined'>
                <CardContent>
                    <BundlesRepoSection />
                </CardContent>
            </Card>
            <Card variant='outlined'>
                <CardContent>
                    <LogsSection />
                </CardContent>
            </Card>
        </Page>
    );
}

export default Settings;
