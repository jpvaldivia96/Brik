import { useState, useRef, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { SearchInput } from '@/components/ui/search-input';
import { PersonCard } from '@/components/ui/person-card';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import type { PersonSearchResult } from '@/lib/types';
import { LogOut, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFace } from '@/hooks/useFace';

export default function ExitTab() {
  const { currentSite } = useSite();
  const { toast } = useToast();
  const { findMatch, loadModels } = useFace();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<(PersonSearchResult & { log_id: string })[]>([]);
  const [selected, setSelected] = useState<(PersonSearchResult & { log_id: string }) | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Face Scan State
  const [scanning, setScanning] = useState(false);
  const [processingScan, setProcessingScan] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
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

  const stopScanning = () => {
    setScanning(false);
    setProcessingScan(false);
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
        // Fetch only people who are INSIDE and have descriptors
        // 1. Get open logs
        const { data: logs } = await supabase
          .from('access_logs')
          .select('id, person_id, people!inner(id, face_descriptor)')
          .eq('site_id', currentSite.id)
          .is('exit_at', null)
          .is('voided_at', null)
          .not('people.face_descriptor', 'is', null);

        if (!logs || logs.length === 0) {
          toast({ title: 'Sin personas', description: 'No hay nadie dentro con biometría registrada.' });
          setProcessingScan(false);
          return;
        }

        // Map to people array for matching
        // Need to cast to any because nested shape and missing type definition updates
        const peopleInside = logs.map(log => (log.people as any));

        const match = await findMatch(canvas, peopleInside);

        if (match) {
          toast({ title: '¡Identificado!', description: 'Rostro reconocido. Registrando salida...' });
          stopScanning();

          // Find the specific log for the matched person
          const matchedLog = logs.find(l => (l.people as any).id === match.id);

          if (matchedLog) {
            // Fetch full details for display
            const { data: personData } = await supabase
              .from('people')
              .select('*, workers_profile(*), visitors_profile(*)')
              .eq('id', match.id)
              .single();

            if (personData) {
              setSelected({
                ...personData,
                type: personData.type as 'worker' | 'visitor',
                is_inside: true,
                log_id: matchedLog.id
              });
            }
          }
        } else {
          toast({ title: 'No reconocido', variant: 'destructive', description: 'No se encontró coincidencia entre las personas dentro.' });
        }
      } catch (err) {
        console.error(err);
        toast({ title: 'Error', variant: 'destructive', description: 'Error al procesar biometría.' });
      } finally {
        setProcessingScan(false);
      }
    }
  };

  const handleSearch = async () => {
    if (!query.trim() || !currentSite) return;
    setSearching(true);
    setMessage(null);
    setSelected(null);

    try {
      // Search people with open logs
      const { data: logs, error } = await supabase
        .from('access_logs')
        .select('id, person_id, people(*)')
        .eq('site_id', currentSite.id)
        .is('exit_at', null)
        .is('voided_at', null);

      if (error) throw error;

      const filtered = (logs || []).filter(log => {
        const p = log.people as any;
        return p && (
          p.ci === query.trim() ||
          p.full_name.toLowerCase().includes(query.trim().toLowerCase())
        );
      }).map(log => ({
        ...(log.people as any),
        type: (log.people as any).type as 'worker' | 'visitor',
        is_inside: true,
        log_id: log.id,
      }));

      setResults(filtered);
      if (filtered.length === 1) {
        setSelected(filtered[0]);
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSearching(false);
    }
  };

  const handleExit = async () => {
    if (!selected || !currentSite) return;

    setSubmitting(true);
    setMessage(null);

    try {
      // Check for double click (check if log was recently updated)
      const { data: currentLog } = await supabase
        .from('access_logs')
        .select('exit_at')
        .eq('id', selected.log_id)
        .single();

      if (currentLog?.exit_at) {
        const exitTime = new Date(currentLog.exit_at).getTime();
        const twoMinAgo = Date.now() - 2 * 60 * 1000;
        if (exitTime > twoMinAgo) {
          setMessage({ type: 'error', text: 'Posible doble click. Esta salida ya fue registrada.' });
          setSubmitting(false);
          return;
        }
      }

      // Update access log
      const { error } = await supabase
        .from('access_logs')
        .update({ exit_at: new Date().toISOString() })
        .eq('id', selected.log_id);

      if (error) throw error;

      toast({ title: 'Salida registrada', description: `${selected.full_name} salió correctamente.` });
      setSelected(null);
      setQuery('');
      setResults([]);
      setMessage({ type: 'success', text: `Salida registrada: ${selected.full_name}` });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-3 mb-4">
        <LogOut className="w-6 h-6 text-purple-400" />
        <h2 className="text-lg font-medium text-white">Registrar Salida</h2>
      </div>

      {/* Search */}
      <div className="flex gap-3">
        <SearchInput
          placeholder="Buscar persona dentro por CI o nombre..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          containerClassName="flex-1"
          className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
        />
        <Button
          onClick={handleSearch}
          disabled={searching}
          className="px-6 bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white"
        >
          {searching ? <Spinner size="sm" /> : 'Buscar'}
        </Button>
        <Button
          variant="outline"
          className="px-4 bg-white/10 border-white/20 text-white/80 hover:bg-white/20 hover:text-white"
          onClick={() => setScanning(true)}
        >
          <Camera className="w-5 h-5" />
        </Button>
      </div>

      {/* Camera Modal/Sheet for Scanning */}
      {scanning && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gradient-to-br from-slate-900 via-purple-900/95 to-slate-900 border border-white/10 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-lg font-medium text-center text-white">Escanear Salida</h3>

            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 border-4 border-purple-500/30 rounded-xl" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={stopScanning}
                className="bg-white/10 border-white/20 text-white/80 hover:bg-white/20"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleScanCapture}
                disabled={processingScan}
                className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
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
              onClick={() => setSelected(p)}
              className="w-full text-left transition-transform hover:scale-[1.02]"
            >
              <PersonCard
                name={p.full_name}
                ci={p.ci}
                type={p.type}
                contractor={p.contractor}
                photoUrl={p.photo_url}
                isInside={true}
              />
            </button>
          ))}
        </div>
      )}

      {/* Selected person */}
      {selected && (
        <div className="space-y-4">
          <PersonCard
            name={selected.full_name}
            ci={selected.ci}
            type={selected.type}
            contractor={selected.contractor}
            photoUrl={selected.photo_url}
            isInside={true}
          />

          <Button
            onClick={handleExit}
            disabled={submitting}
            className="w-full h-14 text-base font-medium bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white rounded-xl"
          >
            {submitting ? <Spinner size="sm" className="mr-2" /> : <LogOut className="w-5 h-5 mr-2" />}
            Registrar Salida
          </Button>
        </div>
      )}

      {results.length === 0 && query && !searching && (
        <AlertCosmos type="info">No hay personas dentro que coincidan con la búsqueda.</AlertCosmos>
      )}

      {message && <AlertCosmos type={message.type}>{message.text}</AlertCosmos>}
    </div>
  );
}
