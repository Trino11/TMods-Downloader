import { useState } from 'react';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import BadgeIcon from '@mui/icons-material/Badge';
import SettingsIcon from '@mui/icons-material/Settings';
import TravelExploreIcon from '@mui/icons-material/TravelExplore';
import { Link } from 'react-router';
import Page from '../../utils/Page';
import FabricInstall from '../profiles/FabricInstall';
import ChannelUpdates from './ChannelUpdates';
import LatestPack from './LatestPack';
import NewProfile from './NewProfile';
import { VERSION } from '../../../config';
import { detectTarget } from '../../../services/gameTarget';
import { DEFAULT_PROFILE_ID, LATEST_RELEASE, LATEST_SNAPSHOT, updateProfile } from '../../../services/profiles';
import { setTargetVersion } from '../../../services/modrinthMods';
import { useTranslation } from '../../../i18n';

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
    const { t } = useTranslation();
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
            setFabricNotice(t('home.fabric.installedDefault', { version: versionId }));
            return;
        }
        updateProfile(profile.id, { name: profile.name, gameVersion: versionId });
        onProfilesChange();
        setFabricNotice(t('home.fabric.installedProfile', { version: versionId, name: profile.name }));
    }

    return (
        <Page title={t('home.title')} description={t('home.description', { name: profile.name })}>
            {created && <Alert severity='success'>{t('home.created', { name: created })}</Alert>}
            <Stack direction='row' spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                <Button component={Link} to='/modrinth' variant='outlined' startIcon={<TravelExploreIcon />}>
                    {t('home.browseModrinth')}
                </Button>
                <Button component={Link} to='/profiles' variant='outlined' startIcon={<BadgeIcon />}>
                    {t('home.manageProfiles')}
                </Button>
                <Button component={Link} to='/settings' variant='outlined' startIcon={<SettingsIcon />}>
                    {t('home.settings')}
                </Button>
            </Stack>
            <LatestPack profile={profile} onProfilesChange={onProfilesChange} />
            <ChannelUpdates key={profile.id} profile={profile} gameDir={gameDir} />
            <NewProfile onCreated={handleCreated} />
            <FabricInstall
                title={t('home.fabric.title', { name: profile.name })}
                description={
                    profile.id === DEFAULT_PROFILE_ID
                        ? t('home.fabric.descriptionDefault')
                        : t('home.fabric.descriptionProfile')
                }
                preferredVersion={minecraftVersion(profile)}
                notice={fabricNotice}
                onInstalled={handleFabricInstalled}
            />
            <Typography variant='body2' sx={{ color: 'text.secondary' }}>
                {t('home.version', { version: VERSION })}
            </Typography>
        </Page>
    );
}

export default Home;
