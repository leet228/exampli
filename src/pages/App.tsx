import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Home from './Home';
import Onboarding from './Onboarding';
import Profile from './Profile';
import AppLayout from '../layouts/AppLayout';

const router = createBrowserRouter([
  {
    element: <AppLayout />, // тут HUD + безопасные отступы + условная нижняя навигация
    children: [
      { path: '/', element: <Home /> },
      { path: '/onboarding', element: <Onboarding /> },
      { path: '/profile', element: <Profile /> },
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}