import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Home from './Home';
import Onboarding from './Onboarding';
import Profile from './Profile';

const router = createBrowserRouter([
  { path: '/', element: <Home /> },
  { path: '/onboarding', element: <Onboarding /> },
  { path: '/profile', element: <Profile /> },
]);

export default function AppRouter(){
  return <RouterProvider router={router} />;
}