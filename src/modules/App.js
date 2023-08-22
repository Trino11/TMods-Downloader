import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import Navbar from './components/enclosing/navbar';
import Home from './components/pages/home/home';
import Mods from './components/pages/mods/mods';
import Schematics from './components/pages/schematics/schematics';
import Resourcepacks from './components/pages/resourcepacks/resourcepacks';
import Configs from './components/pages/configs/configs';
import Shaderpacks from './components/pages/shaderpacks/shaderpacks';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';

window.tmodsconfig = {
  MANIFEST_URL: 'https://cdn.trinohost.com/webdavshare/tmods/manifest.json',
  VERSION: '0.2.2',
};

function App() {
  return (
    <Router>
      <div className="App">
        <main>
          <Navbar></Navbar>
          <div className='content'>

            <Routes>
              <Route path="/" element={<Home/>} />
              <Route path="/home" element={<Home/>} />
              <Route path="/mods" element={<Mods/>} />
              <Route path="/schematics" element={<Schematics/>} />
              <Route path="/resourcepacks" element={<Resourcepacks/>} />
              <Route path="/configs" element={<Configs/>} />
              <Route path="/shaderpacks" element={<Shaderpacks/>} />
            </Routes>

          </div >
        </main>
      </div >
    </Router>

  );
}

export default App;
