import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Typography from '@mui/material/Typography';
import HomeIcon from '@mui/icons-material/Home';
import BadgeIcon from '@mui/icons-material/Badge';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import SettingsIcon from '@mui/icons-material/Settings';
import ViewInArIcon from '@mui/icons-material/ViewInAr';
import { NavLink } from "react-router-dom";
import categories from '../../categories';
import ProfileSelector from '../profiles/ProfileSelector';

const WIDTH = 280;

function NavItem({ to, icon: Icon, label }) {
    return <ListItemButton
        component={NavLink}
        to={to}
        sx={{
            borderRadius: 7,
            mb: 0.5,
            '&.active': { bgcolor: 'action.selected', color: 'primary.main' },
            '&.active .MuiListItemIcon-root': { color: 'primary.main' },
        }}
    >
        <ListItemIcon sx={{ minWidth: 40 }}><Icon /></ListItemIcon>
        <ListItemText primary={label} />
    </ListItemButton>
}

function Navbar({ profiles, activeProfileId, onSelectProfile }) {
    return <Drawer
        variant='permanent'
        sx={{ width: WIDTH, flexShrink: 0, '& .MuiDrawer-paper': { width: WIDTH, boxSizing: 'border-box', p: 2, position: 'relative' } }}
    >
        <Box component={NavLink} to='/' sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: 'text.primary', textDecoration: 'none', mb: 2 }}>
            <ViewInArIcon color='primary' fontSize='large' />
            <Typography variant='h6' component='span'>TMods Loader</Typography>
        </Box>
        <ProfileSelector profiles={profiles} activeId={activeProfileId} onSelect={onSelectProfile} />
        <Divider sx={{ my: 2 }} />
        <List component='nav' disablePadding sx={{ flexGrow: 1, overflowY: 'auto' }}>
            <NavItem to="/home" icon={HomeIcon} label="Home" />
            <NavItem to="/profiles" icon={BadgeIcon} label="Profiles" />
            <NavItem to="/modrinth" icon={TravelExploreIcon} label="Modrinth" />
            {categories.map(category =>
                <NavItem key={category.id} to={`/${category.id}`} icon={category.icon} label={category.label} />
            )}
        </List>
        <Divider sx={{ my: 2 }} />
        <List disablePadding>
            <NavItem to="/settings" icon={SettingsIcon} label="Settings" />
        </List>
    </Drawer>
}

export default Navbar;
