import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import Home from './Home';
import Profile from './Profile';
import Subscription from './Subscription';
import AppLayout from '../layouts/AppLayout';

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <Home /> },
      { path: '/subscription', element: <Subscription /> },
      { path: '/profile', element: <Profile /> },
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}