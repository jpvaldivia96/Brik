import { useState, useRef, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { UserPlus, Camera, RefreshCw, LogIn } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFace } from '@/hooks/useFace';

export default function NewWorkerTab() {
  const { currentSite } = useSite();
  const { toast } = useToast();
  const { getDescriptor, loadModels, modelLoaded } = useFace();

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [faceDescriptor, setFaceDescriptor] = useState<Float32Array | null>(null);
  const [isProcessingFace, setIsProcessingFace] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [form, setForm] = useState({
    ci: '',
    fullName: '',
    contractor: '',
    insuranceNumber: '',
    insuranceExpiry: '',
    phone: '',
    emergencyContact: '',
    bloodType: '',
  });

  useEffect(() => {
    if (cameraActive) {
      loadModels();
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [cameraActive, loadModels]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
        setMessage(null);
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'No se pudo acceder a la cámara. Verifique los permisos.' });
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (context) {
      // Downscale for better mobile performance and detection (max width 600px)
      const MAX_WIDTH = 600;
      const scale = video.videoWidth > MAX_WIDTH ? MAX_WIDTH / video.videoWidth : 1;

      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;

      // Draw scaled
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const imageUrl = canvas.toDataURL('image/jpeg', 0.8); // Add compression for faster transfer
      setCapturedImage(imageUrl);
      stopCamera();

      // Process face
      setIsProcessingFace(true);
      try {
        const descriptor = await getDescriptor(canvas);
        if (descriptor) {
          setFaceDescriptor(descriptor);
          toast({ title: 'Rostro detectado', description: 'Huella biométrica generada correctamente.' });
        } else {
          setMessage({ type: 'error', text: 'No se detectó ningún rostro claro. Intente de nuevo.' });
        }
      } catch (err) {
        console.error(err);
        setMessage({ type: 'error', text: 'Error procesando el rostro.' });
      } finally {
        setIsProcessingFace(false);
      }
    }
  };

  const retakePhoto = () => {
    setCapturedImage(null);
    setFaceDescriptor(null);
    startCamera();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite) return;

    setSubmitting(true);
    setMessage(null);

    try {
      // Create person
      const { data: person, error: personError } = await supabase
        .from('people')
        .insert({
          site_id: currentSite.id,
          ci: form.ci.trim(),
          full_name: form.fullName.trim(),
          type: 'worker',
          contractor: form.contractor.trim() || null,
          // Save face descriptor as JSON string
          face_descriptor: faceDescriptor ? JSON.stringify(Array.from(faceDescriptor)) : null,
          // Ideally upload photo to storage, skipping for now to keep it simple, or store small base64?
          // Base64 is too large for TEXT column usually, but let's try or leave null.
          // User asked for biometric entry, descriptor is key.
          photo_url: null
        })
        .select()
        .single();

      if (personError) throw personError;

      // Create worker profile
      const { error: profileError } = await supabase
        .from('workers_profile')
        .insert({
          person_id: person.id,
          insurance_number: form.insuranceNumber.trim() || null,
          insurance_expiry: form.insuranceExpiry || null,
          phone: form.phone.trim() || null,
          emergency_contact: form.emergencyContact.trim() || null,
          blood_type: form.bloodType.trim() || null,
        });

      if (profileError) throw profileError;

      toast({ title: 'Trabajador creado', description: `${form.fullName} registrado con biometría.` });
      setForm({ ci: '', fullName: '', contractor: '', insuranceNumber: '', insuranceExpiry: '', phone: '', emergencyContact: '', bloodType: '' });
      setCapturedImage(null);
      setFaceDescriptor(null);
      setMessage({ type: 'success', text: `Trabajador ${form.fullName} creado exitosamente.` });
    } catch (err: any) {
      if (err.message?.includes('duplicate')) {
        setMessage({ type: 'error', text: 'Ya existe un trabajador con ese CI en esta obra.' });
      } else {
        setMessage({ type: 'error', text: err.message });
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="operation-panel pb-20">
      <div className="flex items-center gap-3 mb-6">
        <UserPlus className="w-6 h-6 text-primary" />
        <h2 className="text-lg font-medium">Nuevo Trabajador</h2>
      </div>

      <div className="mb-6 space-y-4">
        <Label>Registro Biométrico (Foto)</Label>

        {capturedImage ? (
          <div className="relative rounded-xl overflow-hidden aspect-[4/3] bg-black max-w-sm mx-auto border border-border">
            <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />

            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              {isProcessingFace ? (
                <div className="text-white flex flex-col items-center">
                  <Spinner className="mb-2" />
                  <p className="text-xs">Analizando rostro...</p>
                </div>
              ) : faceDescriptor ? (
                <div className="bg-green-500/90 text-white px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1">
                  ✓ Biometría lista
                </div>
              ) : (
                <div className="bg-red-500/90 text-white px-3 py-1 rounded-full text-xs font-medium">
                  ✗ Rostro no visible
                </div>
              )}
            </div>

            <Button
              size="icon"
              variant="secondary"
              className="absolute top-2 right-2 rounded-full shadow-md"
              onClick={() => {
                setCapturedImage(null);
                setFaceDescriptor(null);
              }}
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        ) : (
          <div
            onClick={() => setCameraActive(true)}
            className="border-2 border-dashed border-muted-foreground/25 rounded-xl h-48 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors bg-card/30"
          >
            <Camera className="w-10 h-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Tocar para tomar foto</p>
          </div>
        )}
      </div>

      {/* Camera Modal */}
      {cameraActive && (
        <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-xl shadow-2xl max-w-sm w-full p-4 space-y-4">
            <h3 className="text-lg font-medium text-center">Tomar Foto</h3>

            <div className="relative rounded-xl overflow-hidden bg-black aspect-[4/3]">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
              <div className="absolute inset-0 border-4 border-primary/30 rounded-xl" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Button variant="outline" onClick={() => setCameraActive(false)}>
                Cancelar
              </Button>
              <Button onClick={capturePhoto}>
                Capturar
              </Button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ci">CI *</Label>
            <Input id="ci" value={form.ci} onChange={(e) => setForm({ ...form, ci: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre completo *</Label>
            <Input id="fullName" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contractor">Contratista</Label>
            <Input id="contractor" value={form.contractor} onChange={(e) => setForm({ ...form, contractor: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          {/* Omitted other fields for brevity if needed, but keeping them for completeness based on original file */}
          <div className="space-y-2">
            <Label htmlFor="insuranceNumber">Nº Seguro</Label>
            <Input id="insuranceNumber" value={form.insuranceNumber} onChange={(e) => setForm({ ...form, insuranceNumber: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="insuranceExpiry">Vencimiento Seguro</Label>
            <Input id="insuranceExpiry" type="date" value={form.insuranceExpiry} onChange={(e) => setForm({ ...form, insuranceExpiry: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emergencyContact">Contacto emergencia</Label>
            <Input id="emergencyContact" value={form.emergencyContact} onChange={(e) => setForm({ ...form, emergencyContact: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bloodType">Tipo de sangre</Label>
            <Input id="bloodType" value={form.bloodType} onChange={(e) => setForm({ ...form, bloodType: e.target.value })} placeholder="Ej: O+" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 mt-6">
          <Button
            type="submit"
            disabled={submitting || (!!capturedImage && !faceDescriptor)}
            variant="outline"
            className="w-full h-12"
          >
            {submitting ? <Spinner size="sm" className="mr-2" /> : <UserPlus className="w-5 h-5 mr-2" />}
            Solo Registrar
          </Button>
          <Button
            type="button"
            onClick={async (e) => {
              e.preventDefault();
              if (!currentSite || submitting) return;

              setSubmitting(true);
              setMessage(null);

              try {
                // Create person
                const { data: person, error: personError } = await supabase
                  .from('people')
                  .insert({
                    site_id: currentSite.id,
                    ci: form.ci.trim(),
                    full_name: form.fullName.trim(),
                    type: 'worker',
                    contractor: form.contractor.trim() || null,
                    face_descriptor: faceDescriptor ? JSON.stringify(Array.from(faceDescriptor)) : null,
                    photo_url: null
                  })
                  .select()
                  .single();

                if (personError) throw personError;

                // Create worker profile
                const { error: profileError } = await supabase
                  .from('workers_profile')
                  .insert({
                    person_id: person.id,
                    insurance_number: form.insuranceNumber.trim() || null,
                    insurance_expiry: form.insuranceExpiry || null,
                    phone: form.phone.trim() || null,
                    emergency_contact: form.emergencyContact.trim() || null,
                    blood_type: form.bloodType.trim() || null,
                  });

                if (profileError) throw profileError;

                // Create entry log immediately
                const { error: logError } = await supabase
                  .from('access_logs')
                  .insert({
                    site_id: currentSite.id,
                    person_id: person.id,
                    entry_at: new Date().toISOString(),
                    ci_snapshot: form.ci.trim(),
                    name_snapshot: form.fullName.trim(),
                    type_snapshot: 'worker',
                    contractor_snapshot: form.contractor.trim() || null,
                  });

                if (logError) throw logError;

                toast({ title: 'Trabajador creado e ingresado', description: `${form.fullName} registrado y ya está dentro.` });
                setForm({ ci: '', fullName: '', contractor: '', insuranceNumber: '', insuranceExpiry: '', phone: '', emergencyContact: '', bloodType: '' });
                setCapturedImage(null);
                setFaceDescriptor(null);
                setMessage({ type: 'success', text: `${form.fullName} creado e ingresado exitosamente.` });
              } catch (err: any) {
                if (err.message?.includes('duplicate')) {
                  setMessage({ type: 'error', text: 'Ya existe un trabajador con ese CI en esta obra.' });
                } else {
                  setMessage({ type: 'error', text: err.message });
                }
              } finally {
                setSubmitting(false);
              }
            }}
            disabled={submitting || (!!capturedImage && !faceDescriptor) || !form.ci || !form.fullName}
            className="w-full h-12 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600"
          >
            {submitting ? <Spinner size="sm" className="mr-2" /> : <LogIn className="w-5 h-5 mr-2" />}
            Registrar e Ingresar
          </Button>
        </div>
      </form>

      {message && <AlertCosmos type={message.type} className="mt-4">{message.text}</AlertCosmos>}
    </div>
  );
}
