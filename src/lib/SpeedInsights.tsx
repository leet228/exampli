import { useLocation } from 'react-router-dom';
import { SpeedInsights as VSISpeedInsights } from '@vercel/speed-insights/react';
// @ts-ignore: package installed at deploy; suppress type resolution in local env
import { Analytics as VercelAnalytics } from '@vercel/analytics/react';

export default function SpeedInsights() {
  const { pathname } = useLocation();
  return (
    <>
      <VSISpeedInsights route={pathname} />
      <VercelAnalytics />
    </>
  );
}


