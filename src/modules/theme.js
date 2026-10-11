import { createTheme } from '@mui/material/styles';

// Material Design theme. Light and dark follow the system setting.
const theme = createTheme({
    cssVariables: true,
    colorSchemes: {
        light: {
            palette: {
                primary: { main: '#2e7d32' },
                secondary: { main: '#6d4c41' },
                background: { default: '#f4f6f4' },
            },
        },
        dark: {
            palette: {
                primary: { main: '#81c784' },
                secondary: { main: '#bcaaa4' },
                background: { default: '#121412', paper: '#1b1e1b' },
            },
        },
    },
    shape: { borderRadius: 12 },
    components: {
        MuiButton: {
            defaultProps: { disableElevation: true },
            styleOverrides: { root: { textTransform: 'none', borderRadius: 20 } },
        },
        MuiTab: {
            styleOverrides: { root: { textTransform: 'none' } },
        },
        MuiTextField: {
            defaultProps: { size: 'small' },
        },
    },
});

export default theme;
