import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SiteProvider } from "@/contexts/SiteContext";
import { OfflineIndicator } from "@/components/ui/OfflineIndicator";
import { startAutoSync } from "@/lib/offline";
import { faceService } from "@/services/FaceService";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import InvitePage from "./pages/InvitePage";
import NotFound from "./pages/NotFound";
import AdminPanelPage from "./pages/admin/AdminPanelPage";
import AdminSiteDetailPage from "./pages/admin/AdminSiteDetailPage";

const queryClient = new QueryClient();

const App = () => {
  // Start auto-sync and preload face models when app loads
  useEffect(() => {
    startAutoSync();

    // Preload face models in background
    console.log('App: Preloading face recognition models...');
    faceService.loadModels()
      .then(() => console.log('App: Face models preloaded successfully'))
      .catch((err) => console.warn('App: Face models preload failed (will retry on use):', err?.message));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <SiteProvider>
            <Toaster />
            <Sonner />
            <OfflineIndicator />
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/invite/:token" element={<InvitePage />} />
                {/* Admin Panel Routes */}
                <Route path="/brik-control" element={<AdminPanelPage />} />
                <Route path="/brik-control/sites/:siteId" element={<AdminSiteDetailPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </SiteProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

