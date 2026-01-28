import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage';
import Documentation from './pages/Documentation';
import DocPage from './pages/DocPage';
import DownloadPage from './pages/DownloadPage';
import LanguageSwitcher from './components/LanguageSwitcher';


function App() {
  return (
    <Router basename="/zen_ai">
      {/* Global top-right language switcher */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher />
      </div>
      <Routes>
        <Route path="/" element={<HomePage />} />
          <Route path="/download" element={<DownloadPage />} />
        <Route path="/documentation" element={<Documentation />} />
        <Route path="/documentation/:id" element={<DocPage />} />
      </Routes>
    </Router>
  );
}

export default App;
