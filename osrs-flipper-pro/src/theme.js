// src/theme.js
import { createTheme } from '@mui/material/styles';

const theme = createTheme({
    palette: {
        mode: 'dark',
        primary: { main: '#00e676' },
        secondary: { main: '#ff1744' },
        background: {
            default: '#121212',
            paper: '#1e1e1e',
        },
    },
    shape: {
        borderRadius: 10,
    },
});

export default theme;
