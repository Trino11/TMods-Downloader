import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import { useState } from 'react';
import Navbar from './components/enclosing/navbar';
import Home from './components/pages/home/home';
import BundlePage from './components/pages/bundle/BundlePage';
import Settings from './components/pages/settings/Settings';
import FirstRunSetup from './components/setup/FirstRunSetup';
import categories from './categories';
import { getManifestUrl } from './services/settings';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';

function App() {
  const [manifestUrl, setManifestUrl] = useState(getManifestUrl);

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
          <Navbar />
          <div className='content'>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/home" element={<Home />} />
              {categories.map(category =>
                // key forces a fresh page per category, otherwise React reuses state across routes
                <Route key={category.id} path={`/${category.id}`} element={<BundlePage key={category.id} category={category} />} />
              )}
              <Route path="/settings" element={<Settings onManifestUrlChange={setManifestUrl} />} />
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
