import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {loadCampusCore} from './components/canvas/modelLoader';
import './index.css';

// Start downloading the campus model right away, in parallel with the 3D code.
if (!window.location.pathname.startsWith('/admin')) loadCampusCore().catch(() => {});

createRoot(document.getElementById('root')!).render(<App />);
