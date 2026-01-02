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
import { LogIn, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFace } from '@/hooks/useFace';

export default function EntryTab() {
  const { currentSite } = useSite();
  const { toast } = useToast();
  const { findMatch, loadModels } = useFace();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PersonSearchResult[]>([]);
  const [selected, setSelected] = useState<PersonSearchResult | null>(null);
  const [observations, setObservations] = useState('');
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
        // Fetch people with descriptors
        const { data: people } = await supabase
          .from('people')
          .select('id, face_descriptor')
          .eq('site_id', currentSite.id)
          .not('face_descriptor', 'is', null);

        if (!people || people.length === 0) {
          toast({ title: 'Sin datos', description: 'No hay personas con biometría registrada en esta obra.' });
          setProcessingScan(false);
          return;
        }

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

            setSelected({
              ...personData,
              type: personData.type as 'worker' | 'visitor',
              is_inside: !!isInside
            });
          }
        } else {
          toast({ title: 'No reconocido', variant: 'destructive', description: 'No se encontró coincidencia.' });
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
      // Search by CI first (exact), then by name (ilike)
      const { data, error } = await supabase
        .from('people')
        .select('*, workers_profile(*), visitors_profile(*)')
        .eq('site_id', currentSite.id)
        .or(`ci.eq.${query.trim()},full_name.ilike.%${query.trim()}%`)
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
        setSelected(enriched[0]);
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

      {/* Search */}
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
            <h3 className="text-lg font-medium text-center text-white">Escanear Rostro</h3>

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
