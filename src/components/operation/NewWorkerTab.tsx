import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { UserPlus, Camera, RefreshCw, LogIn, SwitchCamera, User, Briefcase, Phone, Heart, Calendar, AlertCircle, CheckCircle2, UserCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFace } from '@/hooks/useFace';
import { HCaptcha, HCaptchaRef } from '@/components/ui/hcaptcha';
import { useRateLimit } from '@/hooks/useRateLimit';
import { logAuditEvent } from '@/lib/auditLog';
import { ContractorAutocomplete } from '@/components/ui/contractor-autocomplete';
import { workerFormSchema, WorkerFormData, workerFormDefaults } from '@/lib/schemas/workerSchema';

export default function NewWorkerTab() {
  const { currentSite } = useSite();
  const { user } = useAuth();
  const { toast } = useToast();
  const { getDescriptor, loadModels, modelLoaded } = useFace();

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'warning'; text: string } | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [faceDescriptor, setFaceDescriptor] = useState<Float32Array | null>(null);
  const [isProcessingFace, setIsProcessingFace] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

  // React Hook Form with Zod validation
  const {
    register,
    handleSubmit: handleFormSubmit,
    formState: { errors, isValid },
    watch,
    setValue,
    reset,
    getValues,
  } = useForm<WorkerFormData>({
    resolver: zodResolver(workerFormSchema),
    defaultValues: workerFormDefaults,
    mode: 'onChange', // Validate on change for real-time feedback
  });

  // Watch form values for components that need them
  const formValues = watch();

  const captchaRef = useRef<HCaptchaRef>(null);
  const { checkRateLimit, isLimited, retryAfter } = useRateLimit();

  const formatRetryTime = (seconds: number) => {
    if (seconds >= 60) {
      return `${Math.ceil(seconds / 60)} minuto(s)`;
    }
    return `${seconds} segundos`;
  };

  // Upload photo to Supabase Storage
  const uploadPhoto = async (base64Image: string, ci: string): Promise<string | null> => {
    if (!currentSite) return null;

    try {
      // Convert base64 to blob
      const response = await fetch(base64Image);
      const blob = await response.blob();

      // Generate unique filename
      const filename = `${currentSite.id}/${ci}_${Date.now()}.jpg`;

      // Upload to storage
      const { data, error } = await supabase.storage
        .from('worker-photos')
        .upload(filename, blob, {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (error) {
        console.error('Photo upload error:', error);
        return null;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('worker-photos')
        .getPublicUrl(filename);

      return urlData.publicUrl;
    } catch (err) {
      console.error('Photo upload failed:', err);
      return null;
    }
  };

  useEffect(() => {
    if (cameraActive) {
      loadModels();
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [cameraActive, loadModels]);

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
        setCameraActive(true);
        setMessage(null);
      }
    } catch (err) {
      console.error(err);
      setMessage({ type: 'error', text: 'No se pudo acceder a la cámara. Verifique los permisos.' });
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

  // Track if user clicked "Registrar e Ingresar"
  const createEntryRef = useRef(false);

  const onSubmit = async (data: WorkerFormData) => {
    if (!currentSite || !user) return;
    const createEntry = createEntryRef.current;
    createEntryRef.current = false; // Reset for next submission

    setSubmitting(true);
    setMessage(null);

    try {
      // Get hCaptcha token (invisible)
      const captchaToken = await captchaRef.current?.execute();

      // Check rate limit
      const rateLimitResult = await checkRateLimit(
        'register_person',
        user.id,
        currentSite.id,
        captchaToken || undefined
      );

      if (!rateLimitResult.allowed) {
        if (rateLimitResult.requiresCaptcha) {
          setMessage({ type: 'error', text: 'Verificación de seguridad fallida. Por favor intenta de nuevo.' });
        } else {
          const minutes = Math.ceil((rateLimitResult.retryAfter || 3600) / 60);
          setMessage({
            type: 'warning',
            text: `Has excedido el límite de registros (20 por hora). Por favor espera ${minutes} minuto(s).`
          });
        }
        captchaRef.current?.reset();
        setSubmitting(false);
        return;
      }

      // Upload photo if captured
      let photoUrl: string | null = null;
      if (capturedImage) {
        photoUrl = await uploadPhoto(capturedImage, data.ci.trim());
      }

      // Create person
      const { data: person, error: personError } = await supabase
        .from('people')
        .insert({
          site_id: currentSite.id,
          ci: data.ci.trim(),
          full_name: data.fullName.trim(),
          type: 'worker',
          contractor: data.contractor.trim() || null,
          face_descriptor: faceDescriptor ? JSON.stringify(Array.from(faceDescriptor)) : null,
          photo_url: photoUrl
        })
        .select()
        .single();

      if (personError) throw personError;

      // Create worker profile
      const { error: profileError } = await supabase
        .from('workers_profile')
        .insert({
          person_id: person.id,
          role: data.role.trim() || null,
          insurance_number: data.insuranceNumber.trim() || null,
          insurance_expiry: data.insuranceExpiry || null,
          induction_date: data.inductionCompleted ? new Date().toISOString().split('T')[0] : null,
          phone: data.phone.trim() || null,
          emergency_contact: data.emergencyContact.trim() || null,
          blood_type: data.bloodType.trim() || null,
          is_inspector: data.isInspector,
        });

      if (profileError) throw profileError;

      // If createEntry, also create access log
      if (createEntry) {
        const { error: logError } = await supabase
          .from('access_logs')
          .insert({
            site_id: currentSite.id,
            person_id: person.id,
            entry_at: new Date().toISOString(),
            ci_snapshot: data.ci.trim(),
            name_snapshot: data.fullName.trim(),
            type_snapshot: 'worker',
            contractor_snapshot: data.contractor.trim() || null,
          });

        if (logError) throw logError;
        toast({ title: 'Trabajador creado e ingresado', description: `${data.fullName} registrado y ya está dentro.` });
        setMessage({ type: 'success', text: `${data.fullName} creado e ingresado exitosamente.` });
        // Audit log for worker creation with entry
        logAuditEvent({
          siteId: currentSite.id,
          userId: user?.id || null,
          action: 'PERSON_CREATED',
          entityType: 'person',
          after: { ci: data.ci.trim(), full_name: data.fullName.trim(), contractor: data.contractor.trim(), with_entry: true },
          note: `Trabajador ${data.fullName} (CI: ${data.ci}) creado e ingresado`,
        });
      } else {
        toast({ title: 'Trabajador creado', description: `${data.fullName} registrado con biometría.` });
        setMessage({ type: 'success', text: `Trabajador ${data.fullName} creado exitosamente.` });
        // Audit log for worker creation without entry
        logAuditEvent({
          siteId: currentSite.id,
          userId: user?.id || null,
          action: 'PERSON_CREATED',
          entityType: 'person',
          after: { ci: data.ci.trim(), full_name: data.fullName.trim(), contractor: data.contractor.trim(), with_entry: false },
          note: `Trabajador ${data.fullName} (CI: ${data.ci}) creado (sin entrada)`,
        });
      }

      reset();
      setCapturedImage(null);
      setFaceDescriptor(null);
    } catch (err: any) {
      if (err.message?.includes('duplicate')) {
        setMessage({ type: 'error', text: 'Ya existe un trabajador con ese CI en esta obra.' });
      } else {
        setMessage({ type: 'error', text: err.message });
      }
    } finally {
      captchaRef.current?.reset();
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

            <div className="grid grid-cols-3 gap-3">
              <Button variant="outline" onClick={() => setCameraActive(false)}>
                Cancelar
              </Button>
              <Button variant="outline" onClick={flipCamera}>
                <SwitchCamera className="w-5 h-5" />
              </Button>
              <Button onClick={capturePhoto}>
                Capturar
              </Button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} className="hidden" />

      <form onSubmit={handleFormSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="ci">CI *</Label>
            <Input
              id="ci"
              {...register('ci')}
              className={errors.ci ? 'border-red-500' : ''}
            />
            {errors.ci && <p className="text-xs text-red-500">{errors.ci.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="fullName">Nombre completo *</Label>
            <Input
              id="fullName"
              {...register('fullName')}
              className={errors.fullName ? 'border-red-500' : ''}
            />
            {errors.fullName && <p className="text-xs text-red-500">{errors.fullName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="contractor">Contratista</Label>
            <ContractorAutocomplete
              value={formValues.contractor}
              onChange={(val) => setValue('contractor', val)}
              placeholder="Seleccionar contratista"
            />
            {errors.contractor && <p className="text-xs text-red-500">{errors.contractor.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Cargo / Rol</Label>
            <Input
              id="role"
              {...register('role')}
              placeholder="Ej: Electricista, Gerente, Albañil"
              className={errors.role ? 'border-red-500' : ''}
            />
            {errors.role && <p className="text-xs text-red-500">{errors.role.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input
              id="phone"
              {...register('phone')}
              className={errors.phone ? 'border-red-500' : ''}
            />
            {errors.phone && <p className="text-xs text-red-500">{errors.phone.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="insuranceNumber">Nº Seguro</Label>
            <Input
              id="insuranceNumber"
              {...register('insuranceNumber')}
              className={errors.insuranceNumber ? 'border-red-500' : ''}
            />
            {errors.insuranceNumber && <p className="text-xs text-red-500">{errors.insuranceNumber.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="insuranceExpiry">Vencimiento Seguro</Label>
            <Input
              id="insuranceExpiry"
              type="date"
              {...register('insuranceExpiry')}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="emergencyContact">Contacto emergencia</Label>
            <Input
              id="emergencyContact"
              {...register('emergencyContact')}
              className={errors.emergencyContact ? 'border-red-500' : ''}
            />
            {errors.emergencyContact && <p className="text-xs text-red-500">{errors.emergencyContact.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="bloodType">Tipo de sangre</Label>
            <Input
              id="bloodType"
              {...register('bloodType')}
              placeholder="Ej: O+"
              className={errors.bloodType ? 'border-red-500' : ''}
            />
            {errors.bloodType && <p className="text-xs text-red-500">{errors.bloodType.message}</p>}
          </div>
        </div>

        {/* Inspector Checkbox */}
        <div className="flex items-center gap-3 p-4 bg-card/50 rounded-xl border border-border mt-4">
          <input
            type="checkbox"
            id="isInspector"
            {...register('isInspector')}
            className="w-5 h-5 rounded border-border text-purple-500 focus:ring-purple-500"
          />
          <Label htmlFor="isInspector" className="flex-1 cursor-pointer">
            <span className="font-medium flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-purple-400" />
              Es Inspector / Fiscal de Obra
            </span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Marcar si esta persona es un inspector (activará alerta de visita de inspector)
            </p>
          </Label>
        </div>

        {/* Induction Checkbox */}
        <div className="flex items-center gap-3 p-4 bg-card/50 rounded-xl border border-border mt-2">
          <input
            type="checkbox"
            id="inductionCompleted"
            {...register('inductionCompleted')}
            className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
          />
          <Label htmlFor="inductionCompleted" className="flex-1 cursor-pointer">
            <span className="font-medium">Inducción completada</span>
            <p className="text-xs text-muted-foreground mt-0.5">
              Marcar si el trabajador completó la charla de seguridad del sitio
            </p>
          </Label>
        </div>

        <div className="grid grid-cols-1 gap-3 mt-6">
          <Button
            type="submit"
            disabled={submitting || isLimited || !isValid || (!!capturedImage && !faceDescriptor)}
            variant="outline"
            className="w-full h-12"
          >
            {submitting ? <Spinner size="sm" className="mr-2" /> : <UserPlus className="w-5 h-5 mr-2" />}
            Solo Registrar
          </Button>
          <Button
            type="submit"
            onClick={() => { createEntryRef.current = true; }}
            disabled={submitting || isLimited || !isValid || (!!capturedImage && !faceDescriptor)}
            className="w-full h-12 bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600"
          >
            {submitting ? <Spinner size="sm" className="mr-2" /> : <LogIn className="w-5 h-5 mr-2" />}
            Registrar e Ingresar
          </Button>
        </div>

        {/* Invisible hCaptcha */}
        <HCaptcha ref={captchaRef} />
      </form>

      {message && <AlertCosmos type={message.type} className="mt-4">{message.text}</AlertCosmos>}
    </div>
  );
}
