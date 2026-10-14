import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { PublicResume } from './pages/PublicResume';

// The editor (and react-pdf) load only under /admin, keeping the public page light.
const Admin = lazy(() => import('./pages/admin/Admin'));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={null}>
              <Admin />
            </Suspense>
          }
        />
        <Route path="/" element={<PublicResume slug="main" />} />
        <Route path="/:slug" element={<PublicResume />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
