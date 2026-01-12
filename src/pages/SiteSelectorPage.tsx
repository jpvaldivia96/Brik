import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Building2, ChevronRight, LogOut, Plus } from 'lucide-react';

export default function SiteSelectorPage() {
  const { sites, loading, selectSite } = useSite();
  const { signOut, user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Animated gradient background - same as login */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900"
        style={{
          backgroundSize: '400% 400%',
          animation: 'gradient-shift 15s ease infinite',
        }}
      />

      {/* Subtle pattern overlay */}
      <div className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(139, 92, 246, 0.3) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(59, 130, 246, 0.3) 0%, transparent 50%)',
        }}
      />

      {/* Content */}
      <div className="w-full max-w-sm relative z-10">
        <div className="animate-fade-in p-8">
          {/* Logo centered - same as login */}
          <div className="text-center mb-10">
            <img
              src="/brik-logo-white.png"
              alt="BRIK"
              className="w-80 mx-auto mb-1 object-contain drop-shadow-lg"
            />
            <p className="text-white/80 text-base font-light tracking-wide -mt-10">
              Selecciona una obra
            </p>
          </div>

          {/* Sites list */}
          {sites.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20">
              <Building2 className="w-12 h-12 text-white/50 mx-auto mb-4" />
              <p className="text-white/80 mb-2 font-medium">
                No tienes acceso a ninguna obra
              </p>
              <p className="text-sm text-white/50">
                Contacta al administrador para que te asigne a una obra.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {sites.map((site) => (
                <button
                  key={site.id}
                  onClick={() => selectSite(site.id)}
                  className="w-full p-4 flex items-center justify-between rounded-2xl bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 hover:border-purple-400/50 transition-all duration-200 text-left group"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center shadow-lg">
                      <Building2 className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-medium text-white">{site.name}</h3>
                      <p className="text-sm text-white/50">{site.timezone}</p>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-white/50 group-hover:text-white transition-colors" />
                </button>
              ))}

              {/* Add New Site Button */}
              <button
                onClick={() => {
                  sessionStorage.removeItem('brik_force_site_selector');
                  localStorage.removeItem('brik_current_site');
                  window.location.href = '/onboarding';
                }}
                className="w-full p-4 flex items-center justify-center rounded-2xl border-2 border-dashed border-white/30 hover:border-purple-400/50 hover:bg-white/5 transition-all duration-200 group"
              >
                <div className="flex items-center gap-3 text-white/60 group-hover:text-white transition-colors">
                  <Plus className="w-5 h-5" />
                  <span className="font-medium">Crear nueva obra</span>
                </div>
              </button>
            </div>
          )}

          {/* User email & Logout */}
          <div className="mt-8 text-center space-y-3">
            {user?.email && (
              <p className="text-white/50 text-sm">
                {user.email}
              </p>
            )}
            <Button
              variant="ghost"
              onClick={signOut}
              className="text-white/60 hover:text-white hover:bg-white/10 rounded-full px-6"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Cerrar sesión
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
