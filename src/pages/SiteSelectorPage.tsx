import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Building2, ChevronRight, LogOut } from 'lucide-react';

export default function SiteSelectorPage() {
  const { sites, loading, selectSite } = useSite();
  const { signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-sm mx-auto pt-12">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary text-primary-foreground mb-6">
            <Building2 className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-semibold">BRIK</h1>
          <p className="text-muted-foreground mt-1">Selecciona una obra</p>
        </div>

        {sites.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-border">
            <p className="text-muted-foreground mb-4">
              No tienes acceso a ninguna obra.
            </p>
            <p className="text-sm text-muted-foreground">
              Contacta al administrador para que te asigne a una obra.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sites.map((site) => (
              <button
                key={site.id}
                onClick={() => selectSite(site.id)}
                className="w-full p-4 flex items-center justify-between rounded-2xl border border-border bg-card hover:border-primary/50 transition-all text-left"
              >
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Building2 className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-medium">{site.name}</h3>
                    <p className="text-sm text-muted-foreground">{site.timezone}</p>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 text-center">
          <Button variant="ghost" onClick={signOut} className="text-muted-foreground rounded-full">
            <LogOut className="w-4 h-4 mr-2" />
            Cerrar sesión
          </Button>
        </div>
      </div>
    </div>
  );
}
