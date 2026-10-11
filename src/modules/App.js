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
import FirstRunSetup from './components/setup/FirstRunSetup';
import categories from './categories';
import { getManifestUrl } from './services/settings';
import { ensureTModsProfile, getActiveProfile, listProfiles, profileGameDir, setActiveProfile, syncLauncherProfiles } from './services/profiles';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';

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

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline enableColorScheme />
      <Screens />
    </ThemeProvider>
  );
}

function Screens() {
  const [manifestUrl, setManifestUrl] = useState(getManifestUrl);
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

  function reloadProfiles() {
    setProfiles(loadProfiles());
    setActiveProfileState(getActiveProfile());
  }

  function selectProfile(id) {
    setActiveProfile(id);
    reloadProfiles();
  }

  if (!manifestUrl) {
    return <FirstRunSetup onDone={setManifestUrl} />
  }

  return (
    <Router>
      <Box sx={{ display: 'flex', height: '100vh' }}>
        <Navbar profiles={profiles} activeProfileId={activeProfile.id} onSelectProfile={selectProfile} />
        <Box component='main' sx={{ flexGrow: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/home" element={<Home />} />
            {categories.map(category =>
              // key forces a fresh page per category and profile, otherwise React reuses state across them
              <Route key={category.id} path={`/${category.id}`} element={<BundlePage key={`${activeProfile.id}/${category.id}`} category={category} gameDir={profileGameDir(activeProfile)} />} />
            )}
            <Route path="/modrinth" element={<ModrinthPage key={activeProfile.id} profile={activeProfile} gameDir={profileGameDir(activeProfile)} onProfilesChange={reloadProfiles} />} />
            <Route path="/profiles" element={<Profiles profiles={profiles} activeId={activeProfile.id} onSelect={selectProfile} onChange={reloadProfiles} />} />
            <Route path="/settings" element={<Settings onManifestUrlChange={setManifestUrl} />} />
          </Routes>
        </Box>
      </Box>
    </Router>
  );
}

export default App;
