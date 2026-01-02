import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSite } from '@/contexts/SiteContext';
import { Spinner } from '@/components/ui/spinner';
import SiteSelectorPage from './SiteSelectorPage';
import OnboardingPage from './OnboardingPage';
import MainLayout from '@/components/layout/MainLayout';

export default function Index() {
  const { user, loading: authLoading } = useAuth();
  const { currentSite, sites, loading: siteLoading } = useSite();

  if (authLoading || siteLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // No sites - show onboarding to create first site
  if (sites.length === 0) {
    return <OnboardingPage />;
  }

  // Has sites but none selected - show selector
  if (!currentSite) {
    return <SiteSelectorPage />;
  }

  return <MainLayout />;
}
