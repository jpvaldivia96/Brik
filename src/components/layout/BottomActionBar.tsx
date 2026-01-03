import { LogIn, LogOut, HardHat, User, Star, Camera, Search } from 'lucide-react';
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

interface BottomActionBarProps {
  activeAction: string;
  onActionChange: (action: string) => void;
  onAdminClick: () => void;
}

export default function BottomActionBar({ activeAction, onActionChange }: Omit<BottomActionBarProps, 'onAdminClick'>) {
  const { currentSite } = useSite();
  const { toast } = useToast();
  const { findMatch, loadModels } = useFace();

  // Camera state
  const [scanning, setScanning] = useState(false);
  const [scanType, setScanType] = useState<'entry' | 'exit'>('entry');
  const [processingScan, setProcessingScan] = useState(false);
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

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }
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
          .or(`ci.eq.${query.trim()},full_name.ilike.%${query.trim()}%`)
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
        // For exit, search only people inside
        const { data: logs } = await supabase
          .from('access_logs')
          .select('id, person_id, people!inner(*)')
          .eq('site_id', currentSite.id)
          .is('exit_at', null)
          .is('voided_at', null)
          .or(`people.ci.eq.${query.trim()},people.full_name.ilike.%${query.trim()}%`);

        const enriched: PersonSearchResult[] = (logs || []).map(l => ({
          ...(l.people as any),
          type: (l.people as any).type as 'worker' | 'visitor',
          is_inside: true,
          log_id: l.id,
        }));
        setResults(enriched);
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
      } else {
        const logId = (selected as any).log_id;
        if (logId) {
          await supabase
            .from('access_logs')
            .update({ exit_at: new Date().toISOString() })
            .eq('id', logId);
          toast({ title: '✓ Salida registrada', description: selected.full_name });
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
      <div className="fixed bottom-0 left-0 right-0 backdrop-blur-xl bg-slate-900/80 border-t border-white/10 z-50 pb-safe">
        <div className="flex items-stretch justify-around px-2 py-3">
          {/* Worker Button */}
          <button
            onClick={() => onActionChange('worker')}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-2xl transition-all duration-300 min-w-[60px]",
              activeAction === 'worker'
                ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg shadow-purple-500/30"
                : "text-white/60 hover:text-white hover:bg-purple-500/20 hover:shadow-lg hover:shadow-purple-500/25 hover:scale-105"
            )}
          >
            <HardHat className="w-5 h-5" />
            <span className="text-[10px] font-medium">Trabajador</span>
          </button>

          {/* Entry Button Group */}
          <div className="flex flex-col items-center">
            <button
              onClick={() => handleScan('entry')}
              className="flex flex-col items-center gap-1 px-6 py-3 rounded-2xl transition-all duration-300 bg-gradient-to-r from-emerald-500 via-teal-500 to-purple-500 text-white shadow-lg shadow-emerald-500/30 hover:shadow-xl hover:shadow-emerald-500/50 hover:scale-105 active:scale-95"
            >
              <LogIn className="w-6 h-6" />
              <span className="text-[10px] font-semibold">Entrada</span>
            </button>
            <button
              onClick={() => handleManualOpen('entry')}
              className="text-[9px] text-white/40 hover:text-emerald-400 mt-1 transition-colors"
            >
              manual
            </button>
          </div>

          {/* Exit Button Group */}
          <div className="flex flex-col items-center">
            <button
              onClick={() => handleScan('exit')}
              className="flex flex-col items-center gap-1 px-6 py-3 rounded-2xl transition-all duration-300 bg-gradient-to-r from-red-500 via-orange-500 to-purple-500 text-white shadow-lg shadow-red-500/30 hover:shadow-xl hover:shadow-red-500/50 hover:scale-105 active:scale-95"
            >
              <LogOut className="w-6 h-6" />
              <span className="text-[10px] font-semibold">Salida</span>
            </button>
            <button
              onClick={() => handleManualOpen('exit')}
              className="text-[9px] text-white/40 hover:text-red-400 mt-1 transition-colors"
            >
              manual
            </button>
          </div>

          {/* Visitor Button */}
          <button
            onClick={() => onActionChange('visitor')}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-2xl transition-all duration-300 min-w-[60px]",
              activeAction === 'visitor'
                ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg shadow-purple-500/30"
                : "text-white/60 hover:text-white hover:bg-purple-500/20 hover:shadow-lg hover:shadow-purple-500/25 hover:scale-105"
            )}
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] font-medium">Visitante</span>
          </button>

          {/* Favorites Button */}
          <button
            onClick={() => onActionChange('favorites')}
            className={cn(
              "flex flex-col items-center justify-center gap-1 px-3 py-2 rounded-2xl transition-all duration-300 min-w-[60px]",
              activeAction === 'favorites'
                ? "bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg shadow-purple-500/30"
                : "text-white/60 hover:text-white hover:bg-purple-500/20 hover:shadow-lg hover:shadow-purple-500/25 hover:scale-105"
            )}
          >
            <Star className="w-5 h-5" />
            <span className="text-[10px] font-medium">Favoritos</span>
          </button>
        </div>
      </div>

      {/* Camera Modal */}
      {scanning && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 via-purple-900/95 to-slate-900 border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-5 space-y-4">
            <h3 className="text-lg font-medium text-center text-white">
              {scanType === 'entry' ? '📸 Escanear Entrada' : '📸 Escanear Salida'}
            </h3>

            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className={cn(
                "absolute inset-0 border-4 rounded-xl transition-colors",
                scanType === 'entry' ? "border-emerald-500/50" : "border-orange-500/50"
              )} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={() => setScanning(false)}
                className="bg-white/10 border-white/20 text-white/80 hover:bg-white/20"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleScanCapture}
                disabled={processingScan}
                className={cn(
                  scanType === 'entry'
                    ? "bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600"
                    : "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600"
                )}
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
