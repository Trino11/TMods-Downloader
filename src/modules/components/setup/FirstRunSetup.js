import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import ManifestUrlForm from '../settings/ManifestUrlForm';

// Shown instead of the app until a manifest URL has been saved.
function FirstRunSetup({ onDone }) {
    return <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 3 }}>
        <Card variant='outlined' sx={{ width: '100%', maxWidth: 640 }}>
            <CardContent sx={{ p: 4 }}>
                <ViewInArIcon color='primary' sx={{ fontSize: 48, mb: 1 }} />
                <Typography variant='h4' component='h1' gutterBottom>Welcome to TMods Loader</Typography>
                <Typography sx={{ color: 'text.secondary', mb: 3 }}>Enter the URL of your manifest to get started. You can change it later in Settings.</Typography>
                <ManifestUrlForm onSaved={onDone} />
            </CardContent>
        </Card>
    </Box>
}

export default FirstRunSetup;
