import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import App from './pages/App';
import Onboarding from './pages/Onboarding';
import Profile from './pages/Profile';

const router = createBrowserRouter([
  { path: '/', element: <App /> },
  { path: '/onboarding', element: <Onboarding /> },
  { path: '/profile', element: <Profile /> },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);