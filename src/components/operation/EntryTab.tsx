import { useState, useRef, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { SearchInput } from '@/components/ui/search-input';
import { PersonCard } from '@/components/ui/person-card';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import type { PersonSearchResult } from '@/lib/types';
import { LogIn, Camera, SwitchCamera, ShieldAlert } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFace } from '@/hooks/useFace';
import { triggerDashboardRefresh } from '@/lib/dashboardRefresh';

export default function EntryTab() {
  const { currentSite } = useSite();
  const { toast } = useToast();
  const { findMatch, loadModels, loading: modelsLoading, error: modelsError, modelLoaded } = useFace();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [selected, setSelected] = useState<PersonSearchResult | null>(null);
  const [observations, setObservations] = useState('');
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [scanning, setScanning] = useState(false);
  const [processingScan, setProcessingScan] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Watchlist state
  const [watchlistAlert, setWatchlistAlert] = useState<{ isBlocked: boolean; reason: string | null } | null>(null);

  useEffect(() => {
    if (scanning) {
      loadModels();
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [scanning, loadModels]);

  // Auto-search with debounce
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      handleSearchAuto(query.trim());
    }, 300);

    return () => clearTimeout(timer);
  }, [query, currentSite]);

  const startCamera = async (facing: 'user' | 'environment' = facingMode) => {
    try {
      if (videoRef.current && videoRef.current.srcObject) {
        const oldStream = videoRef.current.srcObject as MediaStream;
        oldStream.getTracks().forEach(track => track.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', variant: 'destructive', description: 'No se pudo acceder a la cámara' });
      setScanning(false);
    }
  };

  const flipCamera = () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(newMode);
    startCamera(newMode);
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  const stopScanning = () => {
    setScanning(false);
    setProcessingScan(false);
  };

  // Check if person is on watchlist (blocked)
  const checkWatchlist = async (personId: string) => {
    if (!currentSite) return;

    const { data } = await supabase
      .from('favorites')
      .select('is_blocked, block_reason')
      .eq('site_id', currentSite.id)
      .eq('person_id', personId)
      .eq('is_blocked', true)
      .maybeSingle();

    if (data) {
      setWatchlistAlert({ isBlocked: true, reason: (data as any).block_reason || null });
    } else {
      setWatchlistAlert(null);
    }
  };

  // Select person and check watchlist
  const selectPerson = (person: PersonSearchResult) => {
    setSelected(person);
    checkWatchlist(person.id);
  };

  const handleScanCapture = async () => {
    if (!videoRef.current || !canvasRef.current || !currentSite) return;

    setProcessingScan(true);
    setScanError(null); // Clear previous errors
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        // Check if models are loading
        if (modelsLoading) {
          toast({ title: 'Cargando...', description: 'Los modelos de IA aún se están cargando. Espere un momento.' });
          setProcessingScan(false);
          return;
        }

        // Check for model errors
        if (modelsError) {
          toast({ title: 'Error de IA', variant: 'destructive', description: modelsError });
          setProcessingScan(false);
          return;
        }

        // Fetch people with descriptors
        const { data: people, error: fetchError } = await supabase
          .from('people')
          .select('id, face_descriptor')
          .eq('site_id', currentSite.id)
          .not('face_descriptor', 'is', null);

        if (fetchError) {
          toast({ title: 'Error de datos', variant: 'destructive', description: fetchError.message });
          setProcessingScan(false);
          return;
        }

        if (!people || people.length === 0) {
          toast({ title: 'Sin datos', description: 'No hay personas con biometría registrada en esta obra.' });
          setProcessingScan(false);
          return;
        }

        console.log('EntryTab: Found', people.length, 'people with biometrics');
        const match = await findMatch(canvas, people as any[]);

        if (match) {
          toast({ title: '¡Identificado!', description: 'Rostro reconocido exitosamente.' });
          stopScanning();

          // Fetch full person details
          const { data: personData } = await supabase
            .from('people')
            .select('*, workers_profile(*), visitors_profile(*)')
            .eq('id', match.id)
            .single();

          if (personData) {
            // Check inside status logic similar to search
            const { data: logs } = await supabase
              .from('access_logs')
              .select('person_id')
              .eq('site_id', currentSite.id)
              .is('exit_at', null)
              .is('voided_at', null)
              .eq('person_id', match.id);

            const isInside = logs && logs.length > 0;

            selectPerson({
              ...personData,
              type: personData.type as 'worker' | 'visitor',
              is_inside: !!isInside
            });
          }
        } else {
          // Check if it's because no face was detected vs no match
          toast({
            title: 'No reconocido',
            variant: 'destructive',
            description: 'No se detectó rostro o no coincide con ninguna persona registrada.'
          });
        }
      } catch (err: any) {
        console.error('EntryTab: Scan error:', err);
        const errorMsg = err?.message || 'Error desconocido al procesar biometría';
        setScanError(errorMsg); // Persist error in modal
        toast({ title: 'Error', variant: 'destructive', description: errorMsg });
      } finally {
        setProcessingScan(false);
      }
    }
  };

  // Auto-search function (called by debounce effect)
  const handleSearchAuto = async (searchTerm: string) => {
    if (!searchTerm || !currentSite) return;
    setSearching(true);
    setMessage(null);

    try {
      const { data, error } = await supabase
        .from('people')
        .select('*, workers_profile(*), visitors_profile(*)')
        .eq('site_id', currentSite.id)
        .or(`ci.ilike.%${searchTerm}%,full_name.ilike.%${searchTerm}%`)
        .limit(20);

      if (error) throw error;

      const peopleIds = (data || []).map(p => p.id);
      const { data: logs } = await supabase
        .from('access_logs')
        .select('person_id')
        .eq('site_id', currentSite.id)
        .is('exit_at', null)
        .is('voided_at', null)
        .in('person_id', peopleIds);

      const insideSet = new Set((logs || []).map(l => l.person_id));

      const enriched: PersonSearchResult[] = (data || []).map(p => ({
        ...p,
        type: p.type as 'worker' | 'visitor',
        is_inside: insideSet.has(p.id),
      }));

      setResults(enriched);
      if (enriched.length === 1) {
        selectPerson(enriched[0]);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSearching(false);
    }
  };

  const handleSearch = async () => {
    if (!query.trim() || !currentSite) return;
    setSearching(true);
    setMessage(null);
    setSelected(null);

    try {
      // Search by CI first (exact), then by name (ilike)
      const { data, error } = await supabase
        .from('people')
        .select('*, workers_profile(*), visitors_profile(*)')
        .eq('site_id', currentSite.id)
        .or(`ci.ilike.%${query.trim()}%,full_name.ilike.%${query.trim()}%`)
        .limit(20);

      if (error) throw error;

      // Check who is inside
      const peopleIds = (data || []).map(p => p.id);
      const { data: logs } = await supabase
        .from('access_logs')
        .select('person_id')
        .eq('site_id', currentSite.id)
        .is('exit_at', null)
        .is('voided_at', null)
        .in('person_id', peopleIds);

      const insideSet = new Set((logs || []).map(l => l.person_id));

      const enriched: PersonSearchResult[] = (data || []).map(p => ({
        ...p,
        type: p.type as 'worker' | 'visitor',
        is_inside: insideSet.has(p.id),
      }));

      setResults(enriched);
      if (enriched.length === 1) {
        selectPerson(enriched[0]);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSearching(false);
    }
  };

  const handleEntry = async () => {
    if (!selected || !currentSite) return;
    if (selected.is_inside) {
      setMessage({ type: 'error', text: 'Esta persona ya tiene una entrada abierta.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      // Check for double click (entry in last 2 min)
      const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
      const { data: recentLogs } = await supabase
        .from('access_logs')
        .select('id')
        .eq('site_id', currentSite.id)
        .eq('person_id', selected.id)
        .gte('entry_at', twoMinAgo)
        .limit(1);

      if (recentLogs && recentLogs.length > 0) {
        setMessage({ type: 'error', text: 'Posible doble click. Espera unos segundos.' });
        setSubmitting(false);
        return;
      }

      // Insert access log
      const { error } = await supabase
        .from('access_logs')
        .insert({
          site_id: currentSite.id,
          person_id: selected.id,
          entry_at: new Date().toISOString(),
          observations: observations || null,
          ci_snapshot: selected.ci,
          name_snapshot: selected.full_name,
          type_snapshot: selected.type,
          contractor_snapshot: selected.contractor,
        });

      if (error) throw error;

      toast({ title: 'Entrada registrada', description: `${selected.full_name} ingresó correctamente.` });
      triggerDashboardRefresh();
      setSelected(null);
      setQuery('');
      setObservations('');
      setResults([]);
      setMessage({ type: 'success', text: `Entrada registrada: ${selected.full_name}` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <LogIn className="w-6 h-6 text-purple-400" />
        <h2 className="text-lg font-medium text-white">Registrar Entrada</h2>
      </div>

      {/* PRIMARY: Biometric Scan Button */}
      <Button
        onClick={() => setScanning(true)}
        className="w-full h-20 text-lg font-medium bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-2xl mb-4 flex items-center justify-center gap-3"
      >
        <Camera className="w-8 h-8" />
        <span>Escanear Rostro</span>
      </Button>

      {/* SECONDARY: Manual Search (Collapsible) */}
      <div className="border border-white/10 rounded-xl p-4 bg-white/5">
        <p className="text-xs text-white/40 mb-3 text-center">Búsqueda manual (si no hay biometría)</p>
        <div className="flex gap-3">
          <SearchInput
            placeholder="Buscar por CI o nombre..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            containerClassName="flex-1"
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
          />
          <Button
            onClick={handleSearch}
            disabled={searching}
            variant="outline"
            className="px-6 bg-white/10 border-white/20 text-white/80 hover:bg-white/20"
          >
            {searching ? <Spinner size="sm" /> : 'Buscar'}
          </Button>
        </div>
      </div>

      {/* Camera Modal/Sheet for Scanning */}
      {scanning && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-sm w-full p-4 space-y-4">
            <h3 className="text-lg font-medium text-center">Escanear Rostro</h3>

            {/* Model Loading Status */}
            {modelsLoading && (
              <div className="p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg text-center">
                <Spinner size="sm" className="inline mr-2" />
                <span className="text-blue-300 text-sm">Cargando modelos de IA...</span>
              </div>
            )}

            {/* Model Error */}
            {modelsError && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                <p className="text-red-400 text-sm font-medium">⚠️ Error de IA:</p>
                <p className="text-red-300 text-xs mt-1">{modelsError}</p>
              </div>
            )}

            {/* Model Loaded Success */}
            {modelLoaded && !modelsLoading && !modelsError && (
              <div className="p-2 bg-green-500/20 border border-green-500/50 rounded-lg text-center">
                <span className="text-green-300 text-sm">✓ Modelos de IA listos</span>
              </div>
            )}

            {/* Scan Error */}
            {scanError && (
              <div className="p-3 bg-orange-500/20 border border-orange-500/50 rounded-lg">
                <p className="text-orange-400 text-sm font-medium">⚠️ Error de escaneo:</p>
                <p className="text-orange-300 text-xs mt-1">{scanError}</p>
              </div>
            )}

            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 border-4 border-primary/30 rounded-xl" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Button variant="outline" onClick={stopScanning}>
                Cancelar
              </Button>
              <Button variant="outline" onClick={flipCamera}>
                <SwitchCamera className="w-5 h-5" />
              </Button>
              <Button
                onClick={handleScanCapture}
                disabled={processingScan || modelsLoading || !!modelsError}
              >
                {processingScan ? <Spinner size="sm" /> : 'Escanear'}
              </Button>
            </div>

            <canvas ref={canvasRef} className="hidden" />
          </div>
        </div>
      )}

      {/* Results */}
      {results.length > 1 && !selected && (
        <div className="space-y-2">
          <p className="text-sm text-white/60">Selecciona una persona:</p>
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => selectPerson(p)}
              className="w-full text-left transition-transform hover:scale-[1.02]"
            >
              <PersonCard
                name={p.full_name}
                ci={p.ci}
                type={p.type}
                contractor={p.contractor}
                photoUrl={p.photo_url}
                isInside={p.is_inside}
                insuranceExpiry={p.workers_profile?.insurance_expiry}
              />
            </button>
          ))}
        </div>
      )}

      {/* Selected person */}
      {selected && (
        <div className="space-y-4">
          {/* Watchlist Alert */}
          {watchlistAlert?.isBlocked && (
            <div className="p-4 bg-red-500/20 border-2 border-red-500/50 rounded-xl animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <ShieldAlert className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-red-400">⚠️ PERSONA EN LISTA DE BLOQUEO</p>
                  {watchlistAlert.reason && (
                    <p className="text-sm text-red-300/80 mt-0.5">Motivo: {watchlistAlert.reason}</p>
                  )}
                  <p className="text-xs text-red-300/60 mt-1">El guardia debe decidir si permite la entrada.</p>
                </div>
              </div>
            </div>
          )}

          <PersonCard
            name={selected.full_name}
            ci={selected.ci}
            type={selected.type}
            contractor={selected.contractor}
            photoUrl={selected.photo_url}
            isInside={selected.is_inside}
            insuranceExpiry={selected.workers_profile?.insurance_expiry}
            phone={selected.workers_profile?.phone}
          />

          <div>
            <label className="text-sm text-white/60 mb-2 block">Observaciones (opcional)</label>
            <Textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Notas adicionales..."
              rows={2}
              className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
            />
          </div>

          <Button
            onClick={handleEntry}
            disabled={submitting || selected.is_inside}
            className="w-full h-14 text-base font-medium bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white rounded-xl"
          >
            {submitting ? <Spinner size="sm" className="mr-2" /> : <LogIn className="w-5 h-5 mr-2" />}
            Registrar Entrada
          </Button>

          {selected.is_inside && (
            <AlertCosmos type="warning">Esta persona ya está dentro de la obra.</AlertCosmos>
          )}
        </div>
      )}

      {/* Message */}
      {message && (
        <AlertCosmos type={message.type}>{message.text}</AlertCosmos>
      )}
    </div>
  );
}
