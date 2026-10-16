import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {loadCampusCore} from './components/canvas/modelLoader';
import './index.css';
import {setBootStage} from './bootSplash';

// Start downloading the campus model right away, in parallel with the 3D code.
if (!window.location.pathname.startsWith('/admin')) {
  setBootStage('正在载入地图数据');
  loadCampusCore().catch(() => {});
}

createRoot(document.getElementById('root')!).render(<App />);
