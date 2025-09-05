// src/pages/AppRouter.tsx (или твой путь)
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      {
        path: '/',
        async lazy() {
          const m = await import('./Home');
          return { Component: m.default };
        },
      },
      {
        path: '/quests',
        async lazy() {
          const m = await import('./Quests');
          return { Component: m.default };
        },
      },
      {
        path: '/battle',
        async lazy() {
          const m = await import('./Battle');
          return { Component: m.default };
        },
      },
      {
        path: '/ai',
        async lazy() {
          const m = await import('./AI');
          return { Component: m.default };
        },
      },
      {
        path: '/subscription',
        async lazy() {
          const m = await import('./Subscription');
          return { Component: m.default };
        },
      },
      {
        path: '/profile',
        async lazy() {
          const m = await import('./Profile');
          return { Component: m.default };
        },
      },
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}
