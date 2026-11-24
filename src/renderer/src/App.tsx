import { Component, useEffect, useState, type ReactNode } from 'react';
import { Toaster } from './components/Toaster';
import { HomePage } from './pages/Home';
import { OverlayPage } from './pages/Overlay';
import { EditorPage } from './pages/Editor';
import { SettingsPage } from './pages/Settings';
import { GalleryPage } from './pages/Gallery';
import { UploadPage } from './pages/Upload';

interface Route {
  path: string;
  params: URLSearchParams;
}

function readRoute(): Route {
  const raw = window.location.hash.replace(/^#/, '') || '/home';
  const [path, query = ''] = raw.split('?');
  return { path: path || '/home', params: new URLSearchParams(query) };
}

const titles: Record<string, string> = {
  '/home': 'Snapleaf',
  '/overlay': 'Select area — Snapleaf',
  '/editor': 'Edit screenshot — Snapleaf',
  '/settings': 'Settings — Snapleaf',
  '/gallery': 'Gallery — Snapleaf',
  '/upload': 'Screenshot shared — Snapleaf'
};

export default function App() {
  const [route, setRoute] = useState<Route>(readRoute);

  useEffect(() => {
    const onHash = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.title = titles[route.path] ?? 'Snapleaf';
    document.body.dataset.route = route.path.slice(1);
  }, [route.path]);

  let page: ReactNode;
  switch (route.path) {
    case '/overlay':
      page = <OverlayPage />;
      break;
    case '/editor':
      page = <EditorPage captureId={route.params.get('captureId') ?? ''} />;
      break;
    case '/settings':
      page = <SettingsPage />;
      break;
    case '/gallery':
      page = <GalleryPage />;
      break;
    case '/upload':
      page = <UploadPage id={route.params.get('id') ?? ''} />;
      break;
    case '/home':
    default:
      page = <HomePage />;
      break;
  }

  return (
    <ErrorBoundary>
      <Toaster />
      {page}
    </ErrorBoundary>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fatal">
          <div className="fatal-card">
            <h1>Something went wrong</h1>
            <p>{this.state.error.message}</p>
            <button type="button" className="button primary" onClick={() => window.location.reload()}>
              Reload Snapleaf
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
