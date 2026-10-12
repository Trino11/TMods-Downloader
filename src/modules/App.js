import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import theme from './theme';
import Navbar from './components/enclosing/navbar';
import Home from './components/pages/home/home';
import BundlePage from './components/pages/bundle/BundlePage';
import Settings from './components/pages/settings/Settings';
import Profiles from './components/pages/profiles/Profiles';
import ModrinthPage from './components/pages/modrinth/ModrinthPage';
import PacksPage from './components/pages/packs/PacksPage';
import FirstRunSetup from './components/setup/FirstRunSetup';
import UpdateDialog from './components/utils/UpdateDialog';
import categories from './categories';
import { listManifests, profileManifest } from './services/manifests';
import { syncManifestServers } from './services/servers';
import { applyDocumentLanguage, useTranslation } from './i18n';
import {
    ensureTModsProfile,
    getActiveProfile,
    listProfiles,
    profileGameDir,
    setActiveProfile,
    syncLauncherProfiles,
} from './services/profiles';
import { HashRouter as Router, Route, Routes } from 'react-router';

// Make sure the player has a TMods profile before the selector reads the list, on
// start and after any change such as deleting the last profile.
function loadProfiles() {
    try {
        ensureTModsProfile();
    } catch (error) {
        console.error('Could not create the TMods profile:', error);
    }
    return listProfiles();
}

applyDocumentLanguage();

function App() {
    // Redraws every screen when the player picks another language in Settings.
    useTranslation();
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline enableColorScheme />
            <Screens />
            <UpdateDialog />
        </ThemeProvider>
    );
}

function Screens() {
    const [manifests, setManifests] = useState(listManifests);
    const [profiles, setProfiles] = useState(loadProfiles);
    const [activeProfile, setActiveProfileState] = useState(getActiveProfile);

    // Put back launcher entries the player or the launcher removed while TMods was closed.
    useEffect(() => {
        try {
            syncLauncherProfiles();
        } catch (error) {
            console.error('Could not sync profiles to the Minecraft Launcher:', error);
        }
    }, []);

    // Put the servers each profile's manifest lists in its Multiplayer list, on start and
    // whenever the manifests or the one a profile follows change.
    const followed = manifests.length > 0 ? profiles.map(profile => profileManifest(profile)?.url).join('\n') : '';
    useEffect(() => {
        if (followed) {
            syncManifestServers().catch(error => console.error("Could not add the channel's servers:", error));
        }
    }, [followed]);

    function reloadProfiles() {
        setProfiles(loadProfiles());
        setActiveProfileState(getActiveProfile());
    }

    function selectProfile(id) {
        setActiveProfile(id);
        reloadProfiles();
    }

    // Also reloads the profiles, since one may now follow another manifest.
    function reloadManifests() {
        setManifests(listManifests());
        reloadProfiles();
    }

    if (manifests.length === 0) {
        return <FirstRunSetup onDone={reloadManifests} />;
    }

    // Pages are keyed by profile and by the manifest it follows, so switching either
    // gives them fresh state and makes them load the right manifest.
    const manifest = profileManifest(activeProfile);
    const pageKey = `${activeProfile.id}@${manifest?.url}`;

    return (
        <Router>
            <Box sx={{ display: 'flex', height: '100vh' }}>
                <Navbar
                    profiles={profiles}
                    activeProfileId={activeProfile.id}
                    onSelectProfile={selectProfile}
                    manifestName={manifests.length > 1 ? manifest?.name : ''}
                />
                <Box component='main' sx={{ flexGrow: 1, overflowY: 'auto' }}>
                    <Routes>
                        {['/', '/home'].map(route => (
                            <Route
                                key={route}
                                path={route}
                                element={
                                    <Home
                                        key={pageKey}
                                        profile={activeProfile}
                                        gameDir={profileGameDir(activeProfile)}
                                        onSelectProfile={selectProfile}
                                        onProfilesChange={reloadProfiles}
                                    />
                                }
                            />
                        ))}
                        {categories.map(category => (
                            // key forces a fresh page per category and profile, otherwise React reuses state across them
                            <Route
                                key={category.id}
                                path={`/${category.id}`}
                                element={
                                    <BundlePage
                                        key={`${pageKey}/${category.id}`}
                                        category={category}
                                        gameDir={profileGameDir(activeProfile)}
                                    />
                                }
                            />
                        ))}
                        <Route
                            path='/modrinth'
                            element={
                                <ModrinthPage
                                    key={pageKey}
                                    profile={activeProfile}
                                    gameDir={profileGameDir(activeProfile)}
                                    onProfilesChange={reloadProfiles}
                                />
                            }
                        />
                        <Route
                            path='/packs'
                            element={
                                <PacksPage
                                    key={pageKey}
                                    profile={activeProfile}
                                    gameDir={profileGameDir(activeProfile)}
                                    onProfilesChange={reloadProfiles}
                                />
                            }
                        />
                        <Route
                            path='/profiles'
                            element={
                                <Profiles
                                    profiles={profiles}
                                    manifests={manifests}
                                    activeId={activeProfile.id}
                                    onSelect={selectProfile}
                                    onChange={reloadProfiles}
                                />
                            }
                        />
                        <Route path='/settings' element={<Settings onManifestsChange={reloadManifests} />} />
                    </Routes>
                </Box>
            </Box>
        </Router>
    );
}

export default App;
