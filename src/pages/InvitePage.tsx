import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { Shield, Mail, Lock, UserPlus, CheckCircle, XCircle } from 'lucide-react';

interface InvitationData {
    id: string;
    email: string;
    role: string;
    site_id: string;
    expires_at: string;
    accepted_at: string | null;
    sites?: { name: string };
}

export default function InvitePage() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { toast } = useToast();

    const [invitation, setInvitation] = useState<InvitationData | null>(null);
    const [loading, setLoading] = useState(true);
    const [accepting, setAccepting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form for new users
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    useEffect(() => {
        if (token) {
            loadInvitation();
        }
    }, [token]);

    const loadInvitation = async () => {
        try {
            const { data, error } = await (supabase as any)
                .from('user_invitations')
                .select('*, sites(name)')
                .eq('token', token)
                .single();

            if (error || !data) {
                setError('Invitación no encontrada o inválida');
                return;
            }

            if (data.accepted_at) {
                setError('Esta invitación ya fue utilizada');
                return;
            }

            if (new Date(data.expires_at) < new Date()) {
                setError('Esta invitación ha expirado');
                return;
            }

            setInvitation(data);
            setEmail(data.email);
        } catch (err) {
            setError('Error al cargar la invitación');
        } finally {
            setLoading(false);
        }
    };

    const handleAcceptWithExistingAccount = async () => {
        if (!invitation || !user) return;

        setAccepting(true);
        try {
            // Call accept_invitation function
            const { data, error } = await (supabase as any).rpc('accept_invitation', {
                invitation_token: token
            });

            if (error) throw error;
            if (!data?.success) throw new Error(data?.error || 'Error al aceptar invitación');

            toast({
                title: '¡Bienvenido!',
                description: `Ahora tienes acceso a ${invitation.sites?.name || 'la obra'}`,
            });

            navigate('/');
        } catch (err: any) {
            toast({
                title: 'Error',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setAccepting(false);
        }
    };

    const handleRegisterAndAccept = async () => {
        if (!invitation) return;

        if (password !== confirmPassword) {
            toast({
                title: 'Error',
                description: 'Las contraseñas no coinciden',
                variant: 'destructive',
            });
            return;
        }

        if (password.length < 6) {
            toast({
                title: 'Error',
                description: 'La contraseña debe tener al menos 6 caracteres',
                variant: 'destructive',
            });
            return;
        }

        setAccepting(true);
        try {
            // Register new user
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                email: invitation.email,
                password,
            });

            if (signUpError) throw signUpError;

            // Wait for session
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Accept invitation
            const { data, error } = await (supabase as any).rpc('accept_invitation', {
                invitation_token: token
            });

            if (error) throw error;

            toast({
                title: '¡Cuenta creada!',
                description: `Bienvenido a ${invitation.sites?.name || 'la obra'}`,
            });

            navigate('/');
        } catch (err: any) {
            toast({
                title: 'Error',
                description: err.message,
                variant: 'destructive',
            });
        } finally {
            setAccepting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/50 to-slate-900 flex items-center justify-center">
                <Spinner size="lg" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/50 to-slate-900 flex items-center justify-center p-4">
                <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 max-w-md w-full text-center space-y-4">
                    <XCircle className="w-16 h-16 text-red-400 mx-auto" />
                    <h1 className="text-xl font-semibold text-white">Invitación Inválida</h1>
                    <p className="text-white/60">{error}</p>
                    <Button
                        onClick={() => navigate('/auth')}
                        className="bg-gradient-to-r from-purple-500 to-blue-500"
                    >
                        Ir al Inicio
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/50 to-slate-900 flex items-center justify-center p-4">
            <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 max-w-md w-full space-y-6">
                {/* Header */}
                <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-blue-500 rounded-2xl flex items-center justify-center mx-auto">
                        <UserPlus className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold text-white">Invitación a BRIK</h1>
                    <p className="text-white/60">
                        Has sido invitado a <span className="text-purple-300 font-medium">{invitation?.sites?.name}</span>
                    </p>
                </div>

                {/* Role Badge */}
                <div className="flex justify-center">
                    <span className={`px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 ${invitation?.role === 'supervisor'
                            ? 'bg-purple-500/20 text-purple-300'
                            : invitation?.role === 'inspector'
                                ? 'bg-orange-500/20 text-orange-300'
                                : 'bg-blue-500/20 text-blue-300'
                        }`}>
                        <Shield className="w-4 h-4" />
                        {invitation?.role === 'supervisor'
                            ? 'Supervisor'
                            : invitation?.role === 'inspector'
                                ? 'Inspector'
                                : 'Guardia'}
                    </span>
                </div>

                {user ? (
                    // User is logged in - just accept
                    <div className="space-y-4">
                        <p className="text-white/70 text-center text-sm">
                            Estás conectado como <span className="text-white">{user.email}</span>
                        </p>
                        <Button
                            onClick={handleAcceptWithExistingAccount}
                            disabled={accepting}
                            className="w-full bg-gradient-to-r from-purple-500 to-blue-500"
                        >
                            {accepting ? <Spinner size="sm" className="mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                            Aceptar Invitación
                        </Button>
                    </div>
                ) : (
                    // New user - need to register
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label className="text-white/70">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <Input
                                    type="email"
                                    value={email}
                                    disabled
                                    className="pl-10 bg-white/5 border-white/20 text-white/50"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-white/70">Contraseña</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Mínimo 6 caracteres"
                                    className="pl-10 bg-white/10 border-white/20 text-white"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-white/70">Confirmar Contraseña</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                                <Input
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    placeholder="Repite la contraseña"
                                    className="pl-10 bg-white/10 border-white/20 text-white"
                                />
                            </div>
                        </div>

                        <Button
                            onClick={handleRegisterAndAccept}
                            disabled={accepting || !password || !confirmPassword}
                            className="w-full bg-gradient-to-r from-purple-500 to-blue-500"
                        >
                            {accepting ? <Spinner size="sm" className="mr-2" /> : <UserPlus className="w-4 h-4 mr-2" />}
                            Crear Cuenta y Aceptar
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
