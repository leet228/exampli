// src/pages/AppRouter.tsx (или твой путь)
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';

import Home from './Home';
import Subscription from './Subscription';
import Profile from './Profile';
import Quests from './Quests';
import Battle from './Battle';
import AI from './AI';
import SubscriptionGate from './SubscriptionGate';

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/',            element: <Home /> },
      { path: '/quests',      element: <Quests /> },
      { path: '/battle',      element: <Battle /> },
      { path: '/ai',          element: <AI /> },
      { path: '/subscription-gate', element: <SubscriptionGate /> },
      { path: '/subscription',element: <Subscription /> },
      { path: '/profile',     element: <Profile /> },
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}