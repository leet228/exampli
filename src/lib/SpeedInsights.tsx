import { useLocation } from 'react-router-dom';
import { SpeedInsights as VSISpeedInsights } from '@vercel/speed-insights/react';

export default function SpeedInsights() {
  const { pathname } = useLocation();
  return <VSISpeedInsights route={pathname} />;
}


