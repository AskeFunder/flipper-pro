import { Box, Drawer, List, ListItemButton, ListItemText, Typography } from '@mui/material';
import { useState } from 'react';

const drawerWidth = 220;

export default function AppLayout({ children }: { children: React.ReactNode }) {
    const [active, setActive] = useState("Dashboard");

    return (
        <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
            {/* Sidebar */}
            <Drawer
                variant="permanent"
                sx={{
                    width: drawerWidth,
                    flexShrink: 0,
                    [`& .MuiDrawer-paper`]: {
                        width: drawerWidth,
                        boxSizing: 'border-box',
                        bgcolor: '#1a1a1a',
                        color: 'white',
                        borderRight: '1px solid #333',
                    },
                }}
            >
                <Box sx={{ p: 2 }}>
                    <Typography variant="h6" fontWeight={600}>FlipperPro</Typography>
                </Box>
                <List>
                    {['Dashboard', 'Items', 'Day Trading', 'Calculator'].map((text) => (
                        <ListItemButton
                            key={text}
                            selected={active === text}
                            onClick={() => setActive(text)}
                        >
                            <ListItemText primary={text} />
                        </ListItemButton>
                    ))}
                </List>
            </Drawer>

            {/* Content */}
            <Box component="main" sx={{ flexGrow: 1, p: 3, overflowY: 'auto' }}>
                {children}
            </Box>
        </Box>
    );
}
