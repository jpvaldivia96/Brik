import { LogIn, LogOut, HardHat, User, Star, Camera, Search, SwitchCamera, Bell, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSite } from '@/contexts/SiteContext';
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useFace } from '@/hooks/useFace';
import { useToast } from '@/hooks/use-toast';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { SearchInput } from '@/components/ui/search-input';
import { Button } from '@/components/ui/button';
import { PersonCard } from '@/components/ui/person-card';
import { Spinner } from '@/components/ui/spinner';
import type { PersonSearchResult } from '@/lib/types';
import { triggerDashboardRefresh } from '@/lib/dashboardRefresh';
import { logAuditEvent } from '@/lib/auditLog';
import { useAuth } from '@/contexts/AuthContext';
import { runEntryTriggers, runExitTriggers } from '@/lib/alertTriggers';

interface BottomActionBarProps {
  activeAction: string;
  onActionChange: (action: string) => void;
  onAdminClick: () => void;
}

export default function BottomActionBar({ activeAction, onActionChange }: Omit<BottomActionBarProps, 'onAdminClick'>) {
  const { currentSite, isInspector } = useSite();
  const { user } = useAuth();
  const { toast } = useToast();
  const { findMatch, loadModels, loading: modelsLoading, error: modelsError, modelLoaded } = useFace();

  // Camera state
  const [scanning, setScanning] = useState(false);
  const [scanType, setScanType] = useState<'entry' | 'exit'>('entry');
  const [processingScan, setProcessingScan] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Manual search state
  const [manualOpen, setManualOpen] = useState(false);
  const [manualType, setManualType] = useState<'entry' | 'exit'>('entry');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [selected, setSelected] = useState<PersonSearchResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (scanning) {
      loadModels();
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [scanning, loadModels]);

  // Auto-search with debounce when typing
  useEffect(() => {
    if (!manualOpen) {
      setResults([]);
      return;
    }

    if (query.trim().length < 2) {
      setResults([]);
      return;
    }

    const timer = setTimeout(() => {
      handleSearchDebounced();
    }, 300);

    return () => clearTimeout(timer);
  }, [query, manualOpen, manualType, currentSite]);

  // Search function for debounced auto-search
  const handleSearchDebounced = async () => {
    if (!query.trim() || !currentSite) return;
    setSearching(true);

    try {
      if (manualType === 'entry') {
        const { data } = await supabase
          .from('people')
          .select('*, workers_profile(*), visitors_profile(*)')
          .eq('site_id', currentSite.id)
          .or(`ci.ilike.%${query.trim()}%,full_name.ilike.%${query.trim()}%`)
          .limit(20);

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
      } else {
        // For exit: First find people matching search, then find their open logs
        const { data: matchingPeople } = await supabase
          .from('people')
          .select('id')
          .eq('site_id', currentSite.id)
          .or(`ci.ilike.%${query.trim()}%,full_name.ilike.%${query.trim()}%`);

        const personIds = (matchingPeople || []).map(p => p.id);

        if (personIds.length === 0) {
          setResults([]);
        } else {
          const { data: logs } = await supabase
            .from('access_logs')
            .select('id, person_id, people(*)')
            .eq('site_id', currentSite.id)
            .is('exit_at', null)
            .is('voided_at', null)
            .in('person_id', personIds);

          const enriched: PersonSearchResult[] = (logs || []).map(l => ({
            ...(l.people as any),
            type: (l.people as any).type as 'worker' | 'visitor',
            is_inside: true,
            log_id: l.id,
          }));
          setResults(enriched);
        }
      }
    } catch (err) {
      console.error('Auto-search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const startCamera = async (facing: 'user' | 'environment' = facingMode) => {
    try {
      // Stop existing stream first
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

  const handleScan = (type: 'entry' | 'exit') => {
    setScanType(type);
    setScanning(true);
  };

  const handleScanCapture = async () => {
    if (!videoRef.current || !canvasRef.current || !currentSite) return;

    setProcessingScan(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        if (scanType === 'entry') {
          // Entry: find any person with face
          const { data: people } = await supabase
            .from('people')
            .select('id, face_descriptor')
            .eq('site_id', currentSite.id)
            .not('face_descriptor', 'is', null);

          if (!people || people.length === 0) {
            toast({ title: 'Sin datos', description: 'No hay personas con biometría registrada.' });
            setProcessingScan(false);
            return;
          }

          const match = await findMatch(canvas, people as any[]);

          if (match) {
            // Check if already inside
            const { data: logs } = await supabase
              .from('access_logs')
              .select('id')
              .eq('site_id', currentSite.id)
              .eq('person_id', match.id)
              .is('exit_at', null)
              .is('voided_at', null);

            if (logs && logs.length > 0) {
              toast({ title: 'Ya adentro', variant: 'destructive', description: 'Esta persona ya tiene una entrada abierta.' });
            } else {
              // Get full person data
              const { data: personData } = await supabase
                .from('people')
                .select('*')
                .eq('id', match.id)
                .single();

              if (personData) {
                // Create entry
                await supabase.from('access_logs').insert({
                  site_id: currentSite.id,
                  person_id: match.id,
                  entry_at: new Date().toISOString(),
                  ci_snapshot: personData.ci,
                  name_snapshot: personData.full_name,
                  type_snapshot: personData.type,
                  contractor_snapshot: personData.contractor,
                });
                toast({ title: '✓ Entrada registrada', description: personData.full_name });
                triggerDashboardRefresh();

                // Fire all alert triggers (non-blocking)
                runEntryTriggers(currentSite.id, match.id, personData.full_name, personData.contractor).catch(console.error);
              }
            }
            setScanning(false);
          } else {
            toast({ title: 'No reconocido', variant: 'destructive', description: 'Rostro no identificado.' });
          }
        } else {
          // Exit: find person who is inside
          const { data: logs } = await supabase
            .from('access_logs')
            .select('id, person_id, people!inner(id, face_descriptor, full_name)')
            .eq('site_id', currentSite.id)
            .is('exit_at', null)
            .is('voided_at', null)
            .not('people.face_descriptor', 'is', null);

          if (!logs || logs.length === 0) {
            toast({ title: 'Sin personas', description: 'No hay nadie dentro con biometría.' });
            setProcessingScan(false);
            return;
          }

          const peopleInside = logs.map(log => (log.people as any));
          const match = await findMatch(canvas, peopleInside);

          if (match) {
            const logToUpdate = logs.find(l => (l.people as any).id === match.id);
            if (logToUpdate) {
              await supabase
                .from('access_logs')
                .update({ exit_at: new Date().toISOString() })
                .eq('id', logToUpdate.id);
              toast({ title: '✓ Salida registrada', description: (logToUpdate.people as any).full_name });
              triggerDashboardRefresh();

              // Fire exit triggers (non-blocking)
              runExitTriggers(currentSite.id, match.id, (logToUpdate.people as any).full_name, logToUpdate.contractor_snapshot).catch(console.error);
            }
            setScanning(false);
          } else {
            toast({ title: 'No reconocido', variant: 'destructive', description: 'Rostro no identificado.' });
          }
        }
      } catch (err) {
        console.error(err);
        toast({ title: 'Error', variant: 'destructive', description: 'Error al procesar biometría.' });
      } finally {
        setProcessingScan(false);
      }
    }
  };

  const handleManualOpen = (type: 'entry' | 'exit') => {
    setManualType(type);
    setManualOpen(true);
    setQuery('');
    setResults([]);
    setSelected(null);
  };

  const handleSearch = async () => {
    if (!query.trim() || !currentSite) return;
    setSearching(true);
    setSelected(null);

    try {
      if (manualType === 'entry') {
        const { data } = await supabase
          .from('people')
          .select('*, workers_profile(*), visitors_profile(*)')
          .eq('site_id', currentSite.id)
          .or(`ci.ilike.%${query.trim()}%,full_name.ilike.%${query.trim()}%`)
          .limit(20);

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
      } else {
        // For exit: First find people matching search, then find their open logs
        const { data: matchingPeople } = await supabase
          .from('people')
          .select('id')
          .eq('site_id', currentSite.id)
          .or(`ci.ilike.%${query.trim()}%,full_name.ilike.%${query.trim()}%`);

        const personIds = (matchingPeople || []).map(p => p.id);

        if (personIds.length === 0) {
          setResults([]);
        } else {
          const { data: logs } = await supabase
            .from('access_logs')
            .select('id, person_id, people(*)')
            .eq('site_id', currentSite.id)
            .is('exit_at', null)
            .is('voided_at', null)
            .in('person_id', personIds);

          const enriched: PersonSearchResult[] = (logs || []).map(l => ({
            ...(l.people as any),
            type: (l.people as any).type as 'worker' | 'visitor',
            is_inside: true,
            log_id: l.id,
          }));
          setResults(enriched);
        }
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  };

  const handleManualAction = async () => {
    if (!selected || !currentSite) return;
    setSubmitting(true);

    try {
      if (manualType === 'entry') {
        if (selected.is_inside) {
          toast({ title: 'Error', description: 'Ya está adentro', variant: 'destructive' });
          return;
        }
        await supabase.from('access_logs').insert({
          site_id: currentSite.id,
          person_id: selected.id,
          entry_at: new Date().toISOString(),
          ci_snapshot: selected.ci,
          name_snapshot: selected.full_name,
          type_snapshot: selected.type,
          contractor_snapshot: selected.contractor,
        });
        toast({ title: '✓ Entrada registrada', description: selected.full_name });
        triggerDashboardRefresh();

        // Fire all alert triggers (non-blocking)
        runEntryTriggers(currentSite.id, selected.id, selected.full_name, selected.contractor).catch(console.error);
        // Audit log for manual entry
        logAuditEvent({
          siteId: currentSite.id,
          userId: user?.id || null,
          action: 'MANUAL_ENTRY',
          entityType: 'access_log',
          entityId: selected.id,
          note: `Entrada MANUAL de ${selected.full_name} (CI: ${selected.ci})`,
        });
      } else {
        const logId = (selected as any).log_id;
        if (logId) {
          await supabase
            .from('access_logs')
            .update({ exit_at: new Date().toISOString() })
            .eq('id', logId);
          toast({ title: '✓ Salida registrada', description: selected.full_name });
          triggerDashboardRefresh();

          // Fire exit triggers (non-blocking)
          runExitTriggers(currentSite.id, selected.id, selected.full_name, selected.contractor).catch(console.error);
          // Audit log for manual exit
          logAuditEvent({
            siteId: currentSite.id,
            userId: user?.id || null,
            action: 'MANUAL_EXIT',
            entityType: 'access_log',
            entityId: logId,
            note: `Salida MANUAL de ${selected.full_name} (CI: ${selected.ci})`,
          });
        }
      }
      setManualOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 flex justify-center pb-safe px-3 py-2.5">
        <nav
          className="flex items-center justify-evenly w-full max-w-md"
          style={{
            borderRadius: '28px',
            background: 'rgba(30, 30, 40, 0.55)',
            backdropFilter: 'blur(40px) saturate(1.4)',
            WebkitBackdropFilter: 'blur(40px) saturate(1.4)',
            border: '1px solid rgba(255,255,255,0.06)',
            boxShadow: '0 4px 30px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.04)',
            padding: '6px 8px',
          }}
        >
          {/* Entry */}
          <button
            onClick={() => handleScan('entry')}
            onContextMenu={(e) => { e.preventDefault(); handleManualOpen('entry'); }}
            className="relative flex items-center justify-center transition-all duration-200 active:scale-90"
            style={{
              width: '48px', height: '48px',
              borderRadius: '16px',
              background: 'transparent',
            }}
          >
            <LogIn style={{ width: '26px', height: '26px', color: 'white', strokeWidth: 1.6 }} />
          </button>

          {/* Exit */}
          <button
            onClick={() => handleScan('exit')}
            onContextMenu={(e) => { e.preventDefault(); handleManualOpen('exit'); }}
            className="relative flex items-center justify-center transition-all duration-200 active:scale-90"
            style={{
              width: '48px', height: '48px',
              borderRadius: '16px',
              background: 'transparent',
            }}
          >
            <LogOut style={{ width: '26px', height: '26px', color: 'white', strokeWidth: 1.6 }} />
          </button>

          {/* Worker — active pill */}
          <button
            onClick={() => onActionChange('worker')}
            className="relative flex items-center justify-center transition-all duration-200 active:scale-90"
            style={{
              width: activeAction === 'worker' ? '56px' : '48px',
              height: '48px',
              borderRadius: '16px',
              background: activeAction === 'worker' ? 'rgba(255,255,255,0.12)' : 'transparent',
            }}
          >
            <HardHat style={{ width: '26px', height: '26px', color: 'white', strokeWidth: 1.6 }} />
          </button>

          {/* Visitor */}
          <button
            onClick={() => onActionChange('visitor')}
            className="relative flex items-center justify-center transition-all duration-200 active:scale-90"
            style={{
              width: activeAction === 'visitor' ? '56px' : '48px',
              height: '48px',
              borderRadius: '16px',
              background: activeAction === 'visitor' ? 'rgba(255,255,255,0.12)' : 'transparent',
            }}
          >
            <User style={{ width: '26px', height: '26px', color: 'white', strokeWidth: 1.6 }} />
          </button>

          {/* Favorites */}
          <button
            onClick={() => onActionChange('favorites')}
            className="relative flex items-center justify-center transition-all duration-200 active:scale-90"
            style={{
              width: activeAction === 'favorites' ? '56px' : '48px',
              height: '48px',
              borderRadius: '16px',
              background: activeAction === 'favorites' ? 'rgba(255,255,255,0.12)' : 'transparent',
            }}
          >
            <Star style={{ width: '26px', height: '26px', color: 'white', strokeWidth: 1.6 }} />
          </button>

          {/* AI Assistant */}
          <button
            onClick={() => document.dispatchEvent(new CustomEvent('toggle-assistant'))}
            className="relative flex items-center justify-center transition-all duration-200 active:scale-90"
            style={{
              width: '48px', height: '48px',
              borderRadius: '16px',
              background: 'transparent',
            }}
          >
            <Sparkles style={{ width: '26px', height: '26px', color: 'white', strokeWidth: 1.6 }} />
          </button>
        </nav>
      </div>

      {/* Camera Modal */}
      {scanning && (
        <div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-sm w-full p-4 space-y-4">
            <h3 className="text-lg font-medium text-center">
              {scanType === 'entry' ? 'Escanear Entrada' : 'Escanear Salida'}
            </h3>

            {/* Model Loading Status */}
            {modelsLoading && (
              <div className="p-3 bg-blue-500/20 border border-blue-500/50 rounded-lg text-center">
                <Spinner size="sm" className="inline mr-2" />
                <span className="text-blue-600 text-sm">Cargando modelos de IA...</span>
              </div>
            )}

            {/* Model Error */}
            {modelsError && (
              <div className="p-3 bg-red-500/20 border border-red-500/50 rounded-lg">
                <p className="text-red-600 text-sm font-medium">⚠️ Error de IA:</p>
                <p className="text-red-500 text-xs mt-1">{modelsError}</p>
              </div>
            )}

            {/* Model Loaded Success */}
            {modelLoaded && !modelsLoading && !modelsError && (
              <div className="p-2 bg-green-500/20 border border-green-500/50 rounded-lg text-center">
                <span className="text-green-600 text-sm">✓ Modelos de IA listos</span>
              </div>
            )}

            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 border-4 border-primary/30 rounded-xl" />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Button variant="outline" onClick={() => setScanning(false)}>
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
          </div>
          <canvas ref={canvasRef} className="hidden" />
        </div>
      )}

      {/* Manual Search Sheet */}
      <Sheet open={manualOpen} onOpenChange={setManualOpen}>
        <SheetContent side="bottom" className="h-[70vh] bg-gradient-to-br from-slate-900 via-purple-900/95 to-slate-900 border-t border-white/10">
          <div className="space-y-4 pt-4">
            <h3 className="text-lg font-medium text-white">
              {manualType === 'entry' ? 'Entrada Manual' : 'Salida Manual'}
            </h3>

            <div className="flex gap-2">
              <SearchInput
                placeholder={manualType === 'entry' ? "Buscar por CI o nombre..." : "Buscar persona dentro..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                containerClassName="flex-1"
                className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
              />
              <Button onClick={handleSearch} disabled={searching} variant="outline" className="bg-white/10 border-white/20">
                {searching ? <Spinner size="sm" /> : <Search className="w-4 h-4" />}
              </Button>
            </div>

            <div className="space-y-2 max-h-[40vh] overflow-y-auto">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelected(p)}
                  className={cn(
                    "w-full text-left transition-all rounded-xl",
                    selected?.id === p.id ? "ring-2 ring-purple-500" : ""
                  )}
                >
                  <PersonCard
                    name={p.full_name}
                    ci={p.ci}
                    type={p.type}
                    contractor={p.contractor}
                    photoUrl={p.photo_url}
                    isInside={p.is_inside}
                  />
                </button>
              ))}
            </div>

            {selected && (
              <Button
                onClick={handleManualAction}
                disabled={submitting || (manualType === 'entry' && selected.is_inside)}
                className={cn(
                  "w-full h-12",
                  manualType === 'entry'
                    ? "bg-gradient-to-r from-emerald-500 to-green-500"
                    : "bg-gradient-to-r from-orange-500 to-red-500"
                )}
              >
                {submitting ? <Spinner size="sm" className="mr-2" /> : null}
                {manualType === 'entry' ? 'Registrar Entrada' : 'Registrar Salida'}
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
