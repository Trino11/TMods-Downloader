import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Page from '../../utils/Page';
import ManifestUrlForm from '../../settings/ManifestUrlForm';
import LogsSection from '../../settings/LogsSection';

function Settings({ onManifestUrlChange }) {
    return (
        <Page
            title='Settings'
            description='The manifest lists the mods, configs and packs you can download. Changing it is checked before saving.'
        >
            <Card variant='outlined'>
                <CardContent>
                    <ManifestUrlForm onSaved={onManifestUrlChange} />
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
