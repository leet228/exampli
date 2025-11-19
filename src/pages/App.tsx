// src/pages/AppRouter.tsx - оптимизировано с code splitting
import { lazy, Suspense } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import AppLayout from '../layouts/AppLayout';

// Lazy load всех страниц для уменьшения initial bundle
const Home = lazy(() => import('./Home'));
const Subscription = lazy(() => import('./Subscription'));
const Profile = lazy(() => import('./Profile'));
const Quests = lazy(() => import('./Quests'));
const Battle = lazy(() => import('./Battle'));
const AI = lazy(() => import('./AI'));
const SubscriptionGate = lazy(() => import('./SubscriptionGate'));
const SubscriptionOpening = lazy(() => import('./SubscriptionOpening'));
const PostLesson = lazy(() => import('./PostLesson'));

// Легковесный loader для страниц
const PageLoader = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="animate-spin w-12 h-12 border-4 border-accent border-t-transparent rounded-full" />
  </div>
);

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { 
        path: '/', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <Home />
          </Suspense>
        ) 
      },
      { 
        path: '/quests', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <Quests />
          </Suspense>
        ) 
      },
      { 
        path: '/battle', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <Battle />
          </Suspense>
        ) 
      },
      { 
        path: '/ai', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <AI />
          </Suspense>
        ) 
      },
      { 
        path: '/subscription-gate', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <SubscriptionGate />
          </Suspense>
        ) 
      },
      { 
        path: '/subscription-opening', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <SubscriptionOpening />
          </Suspense>
        ) 
      },
      { 
        path: '/post-lesson', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <PostLesson />
          </Suspense>
        ) 
      },
      { 
        path: '/subscription', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <Subscription />
          </Suspense>
        ) 
      },
      { 
        path: '/profile', 
        element: (
          <Suspense fallback={<PageLoader />}>
            <Profile />
          </Suspense>
        ) 
      },
    ],
  },
]);

export default function AppRouter() {
  return <RouterProvider router={router} />;
}