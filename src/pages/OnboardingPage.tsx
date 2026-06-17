import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useSite } from '@/contexts/SiteContext';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';
import { Building2, ArrowRight, LogOut, Globe } from 'lucide-react';

// Country options with timezone
const COUNTRIES = [
  { code: 'BO', name: 'Bolivia', flag: '🇧🇴', timezone: 'America/La_Paz' },
  { code: 'PY', name: 'Paraguay', flag: '🇵🇾', timezone: 'America/Asuncion' },
  { code: 'CL', name: 'Chile', flag: '🇨🇱', timezone: 'America/Santiago' },
  { code: 'PE', name: 'Perú', flag: '🇵🇪', timezone: 'America/Lima' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷', timezone: 'America/Buenos_Aires' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴', timezone: 'America/Bogota' },
  { code: 'EC', name: 'Ecuador', flag: '🇪🇨', timezone: 'America/Guayaquil' },
  { code: 'UY', name: 'Uruguay', flag: '🇺🇾', timezone: 'America/Montevideo' },
  { code: 'BR', name: 'Brasil', flag: '🇧🇷', timezone: 'America/Sao_Paulo' },
  { code: 'MX', name: 'México', flag: '🇲🇽', timezone: 'America/Mexico_City' },
];

const siteSchema = z.object({
  name: z.string().trim().min(2, 'El nombre debe tener al menos 2 caracteres').max(100, 'Máximo 100 caracteres'),
  timezone: z.string().min(1, 'Selecciona un país'),
});

export default function OnboardingPage() {
  const { user, signOut } = useAuth();
  const { refreshSites, selectSite } = useSite();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [siteName, setSiteName] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('BO'); // Default to Bolivia
  const [error, setError] = useState('');

  const selectedCountryData = COUNTRIES.find(c => c.code === selectedCountry);

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

    const timezone = selectedCountryData?.timezone || 'America/La_Paz';
    const result = siteSchema.safeParse({ name: siteName, timezone });
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

      // 2. Add user as owner of the new site
      const { error: membershipError } = await (supabase as any)
        .from('site_memberships')
        .insert({
          site_id: siteId,
          user_id: user.id,
          role: 'owner',
        });

      if (membershipError) throw membershipError;

      toast({
        title: 'Obra creada',
        description: `"${result.data.name}" está lista para usar`,
      });

      // Refresh sites to pick up the new one, then auto-select it
      await refreshSites();

      // Mark as first-time user for tutorial
      localStorage.setItem('brik_show_welcome', 'true');

      // Select the new site and navigate to dashboard
      selectSite(siteId);
      navigate('/', { replace: true });
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
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden bg-slate-900">
      {/* Animated gradient background */}
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

      {/* Header */}
      <header className="relative z-10 p-4 flex justify-end">
        <Button variant="ghost" size="sm" onClick={signOut} className="text-white/50 hover:text-white/80 hover:bg-white/10">
          <LogOut className="w-4 h-4 mr-2" />
          Salir
        </Button>
      </header>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-4 relative z-10">
        <div className="w-full max-w-sm animate-fade-in">
          <div className="p-8">
            {/* Logo */}
            <div className="text-center mb-10">
              <img
                src="/brik-logo-white.png"
                alt="BRIK"
                className="w-80 mx-auto mb-1 object-contain drop-shadow-lg"
              />
              <p className="text-white/70 text-base font-light tracking-wide -mt-10">
                Configura tu primera obra
              </p>
            </div>

            {/* Step indicator */}
            <div className="flex items-center justify-center gap-2 mb-8">
              <div className="w-8 h-1 rounded-full bg-purple-500" />
              <div className="w-8 h-1 rounded-full bg-white/20" />
              <div className="w-8 h-1 rounded-full bg-white/20" />
            </div>

            {/* Form */}
            <form onSubmit={handleCreateSite} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="siteName" className="text-white/80 text-sm font-medium">Nombre de la obra</Label>
                <Input
                  id="siteName"
                  placeholder="Ej: Torre Central, Edificio Norte..."
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  className="h-12 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-purple-400 transition-all duration-200"
                  disabled={loading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="country" className="flex items-center gap-2 text-white/80 text-sm font-medium">
                  <Globe className="w-4 h-4" />
                  País de la obra
                </Label>
                <Select value={selectedCountry} onValueChange={setSelectedCountry} disabled={loading}>
                  <SelectTrigger className="h-12 rounded-xl bg-white/10 border-white/20 text-white focus:border-purple-400 transition-all duration-200 [&>svg]:text-white/40">
                    <SelectValue>
                      {selectedCountryData && (
                        <span className="flex items-center gap-2">
                          <span className="text-lg">{selectedCountryData.flag}</span>
                          {selectedCountryData.name}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-white/20">
                    {COUNTRIES.map(country => (
                      <SelectItem key={country.code} value={country.code} className="text-white focus:bg-white/10 focus:text-white">
                        <span className="flex items-center gap-2">
                          <span className="text-lg">{country.flag}</span>
                          {country.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-white/40">
                  Define la zona horaria para los registros de acceso
                </p>
              </div>

              {error && <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</p>}

              <Button
                type="submit"
                className="w-full h-12 text-base rounded-full font-semibold bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white shadow-lg hover:shadow-purple-500/25 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
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

            <p className="text-center text-sm text-white/40 mt-6">
              Serás asignado como administrador de esta obra
            </p>
          </div>

          {/* Decorative glow */}
          <div className="absolute -inset-4 bg-gradient-to-r from-purple-500/20 to-blue-500/20 rounded-3xl blur-2xl -z-10" />
        </div>
      </div>

      {/* CSS for gradient animation */}
      <style>{`
        @keyframes gradient-shift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}


