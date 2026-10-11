import './App.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import Navbar from './components/enclosing/navbar';
import Home from './components/pages/home/home';
import BundlePage from './components/pages/bundle/BundlePage';
import categories from './categories';
import { HashRouter as Router, Route, Routes } from 'react-router-dom';

function App() {
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
            </Routes>
          </div>
        </main>
      </div>
    </Router>
  );
}

export default App;
