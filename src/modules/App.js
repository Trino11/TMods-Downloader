import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import { useEffect, useState } from 'react';
import Navbar from './components/enclosing/navbar';
import Home from './components/pages/home/home';
import BundlePage from './components/pages/bundle/BundlePage';
import Settings from './components/pages/settings/Settings';
import Profiles from './components/pages/profiles/Profiles';
import ModrinthPage from './components/pages/modrinth/ModrinthPage';
import FirstRunSetup from './components/setup/FirstRunSetup';
import categories from './categories';
import { getManifestUrl } from './services/settings';
import { getActiveProfile, listProfiles, profileGameDir, setActiveProfile, syncLauncherProfiles } from './services/profiles';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';

function App() {
  const [manifestUrl, setManifestUrl] = useState(getManifestUrl);
  const [profiles, setProfiles] = useState(listProfiles);
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
    setProfiles(listProfiles());
    setActiveProfileState(getActiveProfile());
  }

  function selectProfile(id) {
    setActiveProfile(id);
    reloadProfiles();
  }

  if (!manifestUrl) {
    return <div className="App">
      <main>
        <FirstRunSetup onDone={setManifestUrl} />
      </main>
    </div>
  }

  return (
    <Router>
      <div className="App">
        <main>
          <Navbar profiles={profiles} activeProfileId={activeProfile.id} onSelectProfile={selectProfile} />
          <div className='content'>
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
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
