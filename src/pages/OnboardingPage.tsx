import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { Building2, ArrowRight, LogOut } from 'lucide-react';

const siteSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100, 'Máximo 100 caracteres'),
  timezone: z.string().default('America/La_Paz'),
});

export default function OnboardingPage() {
  const { user, signOut } = useAuth();
  const { refreshSites } = useSite();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [error, setError] = useState('');

  const handleCreateSite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!user) {
      toast({
        title: 'Sesión requerida',
        description: 'Vuelve a iniciar sesión para crear una obra.',
        variant: 'destructive',
      });
      return;
    }

    const result = siteSchema.safeParse({ name: siteName });
    if (!result.success) {
      setError(result.error.errors[0].message);
      return;
    }

    setLoading(true);
    try {
      // Generate a random UUID for the new site
      const siteId = crypto.randomUUID();

      // 1. Create the site (without selecting it back, to avoid RLS race condition)
      const { error: siteError } = await supabase
        .from('sites')
        .insert({
          id: siteId,
          name: result.data.name,
          timezone: result.data.timezone,
        });

      if (siteError) throw siteError;

      // 2. Add user as supervisor
      // Note: RLS allows creating your own membership if role is supervisor
      const { error: membershipError } = await supabase
        .from('site_memberships')
        .insert({
          site_id: siteId,
          user_id: user.id,
          role: 'supervisor',
        });

      if (membershipError) throw membershipError;

      toast({
        title: 'Obra creada',
        description: `"${result.data.name}" está lista para usar`,
      });

      // Refresh sites to pick up the new one
      await refreshSites();
    } catch (err: any) {
      console.error("Error creating site:", err);
      toast({
        title: 'Error al crear obra',
        description: err.message || 'Ocurrió un error inesperado',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="p-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={signOut} className="text-muted-foreground">
          <LogOut className="w-4 h-4 mr-2" />
          Salir
        </Button>
      </header>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-sm space-y-8">
          <div className="text-center">
            <img
              src="/brik-logo.png"
              alt="BRIK"
              className="w-80 mx-auto mb-10 object-contain"
            />
            {/* <h1 className="text-2xl font-semibold mb-2">Bienvenido a BRIK</h1> -- Replaced by logo */}
            <p className="text-muted-foreground">
              Crea tu primera obra para comenzar
            </p>
          </div>

          <form onSubmit={handleCreateSite} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="siteName">Nombre de la obra</Label>
              <Input
                id="siteName"
                placeholder="Ej: Torre Central, Edificio Norte..."
                value={siteName}
                onChange={(e) => setSiteName(e.target.value)}
                className="h-12 rounded-xl"
                disabled={loading}
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
            </div>

            <Button
              type="submit"
              className="w-full h-12 rounded-full text-base font-medium"
              disabled={loading || !siteName.trim()}
            >
              {loading ? (
                <Spinner size="sm" className="mr-2" />
              ) : (
                <>
                  Crear obra
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-muted-foreground">
            Serás asignado como supervisor de esta obra
          </p>
        </div>
      </div>
    </div>
  );
}
