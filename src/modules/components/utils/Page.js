import Box from '@mui/material/Box';
import Container from '@mui/material/Container';
import Typography from '@mui/material/Typography';

// Common frame for every screen: a title, an optional intro line, then the content.
function Page({ title, description, children }) {
    return <Container maxWidth='md' sx={{ py: 4 }}>
        <Typography variant='h4' component='h1' gutterBottom>{title}</Typography>
        {description && <Typography sx={{ color: 'text.secondary', mb: 3 }}>{description}</Typography>}
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {children}
        </Box>
    </Container>
}

export default Page;
