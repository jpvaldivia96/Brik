import { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { logAuditEvent } from '@/lib/auditLog';
import { Camera, Pencil, User, CreditCard, X, SwitchCamera } from 'lucide-react';

interface PhotoEditorProps {
    personId: string;
    currentPhotoUrl: string | null;
    ciFrontUrl: string | null;
    ciBackUrl: string | null;
    onPhotosUpdated: (photos: { photo_url?: string; ci_front_url?: string; ci_back_url?: string }) => void;
    editing: boolean;
}

type PhotoType = 'profile' | 'ci_front' | 'ci_back';

/**
 * PROTOCOLO DE SEGURIDAD - 4 PASOS:
 * 
 * 1. VERIFICACIÓN DE ROL: Determinar si usuario es supervisor/owner o guardia
 * 2. VERIFICACIÓN DE ESTADO: Verificar si la foto ya existe
 * 3. DECISIÓN DE PERMISO: 
 *    - Sin foto: cualquier miembro puede agregar
 *    - Con foto: solo supervisor/owner puede cambiar
 * 4. AUDIT LOG: Registrar cualquier cambio de foto
 */

export function PhotoEditor({
    personId,
    currentPhotoUrl,
    ciFrontUrl,
    ciBackUrl,
    onPhotosUpdated,
    editing
}: PhotoEditorProps) {
    const { toast } = useToast();
    const { user } = useAuth();
    const { currentSite, isSupervisor, currentRole } = useSite();

    const [cameraOpen, setCameraOpen] = useState(false);
    const [activePhotoType, setActivePhotoType] = useState<PhotoType>('profile');
    const [uploading, setUploading] = useState(false);
    const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');

    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // PASO 1: Verificar si es supervisor/owner (isSupervisor ya incluye supervisor, owner, admin)
    const isSupervisorOrAbove = isSupervisor;

    // PASO 2 & 3: Verificar permiso para cada foto
    const canEditPhoto = (photoUrl: string | null): boolean => {
        // Sin foto = cualquiera puede agregar primera
        if (!photoUrl) return true;
        // Con foto = solo supervisor/owner puede cambiar
        return isSupervisorOrAbove;
    };

    const canEditProfilePhoto = canEditPhoto(currentPhotoUrl);
    const canEditCiFront = canEditPhoto(ciFrontUrl);
    const canEditCiBack = canEditPhoto(ciBackUrl);

    const startCamera = async (photoType: PhotoType) => {
        // Verificar permiso antes de abrir cámara
        const url = photoType === 'profile' ? currentPhotoUrl :
            photoType === 'ci_front' ? ciFrontUrl : ciBackUrl;

        if (!canEditPhoto(url)) {
            toast({
                title: 'Sin permiso',
                description: 'Solo supervisores pueden cambiar fotos existentes',
                variant: 'destructive'
            });
            return;
        }

        setActivePhotoType(photoType);
        setCameraOpen(true);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            toast({ title: 'Error', description: 'No se pudo acceder a la cámara', variant: 'destructive' });
            setCameraOpen(false);
        }
    };

    const stopCamera = () => {
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
            videoRef.current.srcObject = null;
        }
        setCameraOpen(false);
    };

    const flipCamera = async () => {
        const newMode = facingMode === 'user' ? 'environment' : 'user';
        setFacingMode(newMode);

        // Restart with new mode
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream;
            stream.getTracks().forEach(t => t.stop());
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: newMode }
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error('Error switching camera', err);
        }
    };

    const captureAndUpload = async () => {
        if (!videoRef.current || !canvasRef.current || !currentSite) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size
        const maxWidth = 800;
        const scale = video.videoWidth > maxWidth ? maxWidth / video.videoWidth : 1;
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        stopCamera();
        setUploading(true);

        try {
            // Convert to blob
            const res = await fetch(dataUrl);
            const blob = await res.blob();

            // Generate filename
            const typePrefix = activePhotoType === 'profile' ? 'photo' :
                activePhotoType === 'ci_front' ? 'ci_front' : 'ci_back';
            const filename = `${currentSite.id}/${personId}_${typePrefix}_${Date.now()}.jpg`;

            // Upload to storage
            const { error: uploadError } = await supabase.storage
                .from('worker-photos')
                .upload(filename, blob, { contentType: 'image/jpeg', upsert: true });

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: urlData } = supabase.storage
                .from('worker-photos')
                .getPublicUrl(filename);

            const publicUrl = urlData.publicUrl;

            // Update person record
            const updateField = activePhotoType === 'profile' ? 'photo_url' :
                activePhotoType === 'ci_front' ? 'ci_front_url' : 'ci_back_url';

            const { error: updateError } = await supabase
                .from('people')
                .update({ [updateField]: publicUrl })
                .eq('id', personId);

            if (updateError) throw updateError;

            // PASO 4: Audit log
            logAuditEvent({
                siteId: currentSite.id,
                userId: user?.id || null,
                action: 'PHOTO_UPDATED',
                entityType: 'person',
                entityId: personId,
                after: {
                    photo_type: activePhotoType,
                    was_first_photo: activePhotoType === 'profile' ? !currentPhotoUrl :
                        activePhotoType === 'ci_front' ? !ciFrontUrl : !ciBackUrl
                },
                note: `Foto ${activePhotoType} actualizada por ${currentRole}`,
            });

            // Notify parent
            onPhotosUpdated({ [updateField]: publicUrl });

            toast({ title: 'Foto guardada', description: 'La foto se actualizó correctamente' });
        } catch (err: any) {
            toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
            setUploading(false);
        }
    };

    const getPhotoLabel = (type: PhotoType) => {
        switch (type) {
            case 'profile': return 'Foto de Perfil';
            case 'ci_front': return 'CI Anverso';
            case 'ci_back': return 'CI Reverso';
        }
    };

    const renderPhotoCard = (
        type: PhotoType,
        url: string | null,
        canEdit: boolean,
        icon: React.ReactNode
    ) => (
        <div className="relative group">
            <div className="aspect-[4/3] rounded-lg overflow-hidden bg-muted border border-border">
                {url ? (
                    <img src={url} alt={getPhotoLabel(type)} className="w-full h-full object-cover" />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                        {icon}
                        <span className="text-xs mt-1">{getPhotoLabel(type)}</span>
                    </div>
                )}
            </div>

            {/* Edit overlay - only show if editing and has permission */}
            {editing && canEdit && (
                <button
                    onClick={() => startCamera(type)}
                    className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg"
                >
                    <div className="bg-white/20 p-2 rounded-full backdrop-blur-sm">
                        {url ? <Pencil className="w-5 h-5 text-white" /> : <Camera className="w-5 h-5 text-white" />}
                    </div>
                </button>
            )}

            {/* Lock indicator if has photo but can't edit */}
            {editing && url && !canEdit && (
                <div className="absolute top-1 right-1 bg-yellow-500/90 text-xs px-1.5 py-0.5 rounded text-black font-medium">
                    Solo supervisor
                </div>
            )}
        </div>
    );

    return (
        <>
            <div className="space-y-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">
                    Fotografías
                </p>

                <div className="grid grid-cols-3 gap-2">
                    {renderPhotoCard('profile', currentPhotoUrl, canEditProfilePhoto,
                        <User className="w-8 h-8" />)}
                    {renderPhotoCard('ci_front', ciFrontUrl, canEditCiFront,
                        <CreditCard className="w-8 h-8" />)}
                    {renderPhotoCard('ci_back', ciBackUrl, canEditCiBack,
                        <CreditCard className="w-8 h-8 rotate-180" />)}
                </div>

                {editing && !isSupervisorOrAbove && (currentPhotoUrl || ciFrontUrl || ciBackUrl) && (
                    <p className="text-xs text-yellow-500">
                        ⚠️ Solo puedes agregar fotos faltantes. Para cambiar fotos existentes, contacta a un supervisor.
                    </p>
                )}
            </div>

            {/* Camera Modal */}
            {cameraOpen && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4">
                    <div className="bg-card border border-border rounded-xl max-w-md w-full p-4 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="font-medium">{getPhotoLabel(activePhotoType)}</h3>
                            <Button variant="ghost" size="icon" onClick={stopCamera}>
                                <X className="w-5 h-5" />
                            </Button>
                        </div>

                        <div className="relative rounded-lg overflow-hidden bg-black aspect-[4/3]">
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        </div>

                        <div className="flex gap-2">
                            <Button variant="outline" onClick={stopCamera} className="flex-1">
                                Cancelar
                            </Button>
                            <Button variant="outline" size="icon" onClick={flipCamera}>
                                <SwitchCamera className="w-5 h-5" />
                            </Button>
                            <Button
                                onClick={captureAndUpload}
                                disabled={uploading}
                                className="flex-1"
                            >
                                {uploading ? <Spinner size="sm" className="mr-2" /> : <Camera className="w-4 h-4 mr-2" />}
                                {uploading ? 'Subiendo...' : 'Capturar'}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            <canvas ref={canvasRef} className="hidden" />
        </>
    );
}
