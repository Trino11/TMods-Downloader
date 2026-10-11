import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import BadgeIcon from '@mui/icons-material/Badge';
import SettingsIcon from '@mui/icons-material/Settings';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import { Link } from 'react-router-dom';
import Page from '../../utils/Page';
import FabricInstall from '../profiles/FabricInstall';
import ChannelUpdates from './ChannelUpdates';
import NewProfile from './NewProfile';
import { VERSION } from '../../../config';
import { detectTarget } from '../../../services/gameTarget';
import { DEFAULT_PROFILE_ID, LATEST_RELEASE, LATEST_SNAPSHOT, updateProfile } from '../../../services/profiles';
import { setTargetVersion } from '../../../services/modrinthMods';

// The Minecraft version a profile plays, so Fabric is offered for that one first.
function minecraftVersion(profile) {
    const versionId = profile.gameVersion;
    if (!versionId || versionId === LATEST_RELEASE || versionId === LATEST_SNAPSHOT) {
        return undefined;
    }
    return detectTarget(versionId)?.gameVersion || versionId;
}

// Landing page: quick actions on the active profile. `onSelectProfile` switches the
// active profile and `onProfilesChange` reloads the list after a change.
function Home({ profile, gameDir, onSelectProfile, onProfilesChange }) {
    const [created, setCreated] = useState('');
    const [fabricNotice, setFabricNotice] = useState('');

    function handleCreated(newProfile) {
        setCreated(newProfile.name);
        setFabricNotice('');
        onSelectProfile(newProfile.id);
    }

    // Fabric goes on the active profile: an app profile switches to the new version,
    // the default one (played with any launcher profile) gets it as its Modrinth target.
    function handleFabricInstalled(versionId) {
        if (profile.id === DEFAULT_PROFILE_ID) {
            setTargetVersion(gameDir, versionId);
            setFabricNotice(`Installed ${versionId}. Pick it in the Minecraft Launcher to play with Fabric.`);
            return;
        }
        updateProfile(profile.id, { name: profile.name, gameVersion: versionId });
        onProfilesChange();
        setFabricNotice(
            `Installed ${versionId} and switched ${profile.name} to it. Restart the Minecraft Launcher if it is open.`,
        );
    }

    return (
        <Page title='Home' description={`Quick actions for the active profile, ${profile.name}.`}>
            {created && <Alert severity='success'>Created {created} and switched to it.</Alert>}
            <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Button component={Link} to='/modrinth' variant='outlined' startIcon={<TravelExploreIcon />}>
                    Browse Modrinth
                </Button>
                <Button component={Link} to='/profiles' variant='outlined' startIcon={<BadgeIcon />}>
                    Manage profiles
                </Button>
                <Button component={Link} to='/settings' variant='outlined' startIcon={<SettingsIcon />}>
                    Settings
                </Button>
            </Stack>
            <ChannelUpdates key={profile.id} profile={profile} gameDir={gameDir} />
            <NewProfile onCreated={handleCreated} />
            <FabricInstall
                title={`Install Fabric on ${profile.name}`}
                description={
                    profile.id === DEFAULT_PROFILE_ID
                        ? 'Adds Fabric to the Minecraft Launcher and uses it for Modrinth mods in this folder.'
                        : 'Adds Fabric to the Minecraft Launcher and switches this profile to it.'
                }
                preferredVersion={minecraftVersion(profile)}
                notice={fabricNotice}
                onInstalled={handleFabricInstalled}
            />
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                Version {VERSION}
            </Typography>
        </Page>
    );
}

export default Home;
