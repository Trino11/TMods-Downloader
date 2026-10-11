import Box from '@mui/material/Box';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';

// A card holding a list of rows. Use with ItemRow.
export function ItemList({ children }) {
    return (
        <Paper variant='outlined'>
            <List disablePadding sx={{ '& > li:last-of-type': { borderBottom: 0 } }}>
                {children}
            </List>
        </Paper>
    );
}

// One row: optional leading element, content, then action buttons on the right.
export function ItemRow({ leading, children, actions }) {
    return (
        <ListItem divider sx={{ gap: 2, py: 1.5 }}>
            {leading}
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>{children}</Box>
            {actions && (
                <Stack direction='row' spacing={1} sx={{ flexShrink: 0 }}>
                    {actions}
                </Stack>
            )}
        </ListItem>
    );
}
