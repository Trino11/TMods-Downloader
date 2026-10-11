import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Typography from '@mui/material/Typography';
import Page from '../../utils/Page';
import { VERSION } from '../../../config';

function Home() {
    return <Page title='Home'>
        <Card variant='outlined'>
            <CardContent>
                <Typography>Here you can manage, download and update your minecraft content, feel free to explore the side elements</Typography>
                <Typography variant='body2' sx={{ color: 'text.secondary', mt: 1 }}>Version {VERSION}</Typography>
            </CardContent>
        </Card>
    </Page>
}

export default Home;
