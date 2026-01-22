import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Lock, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function ResetPasswordPage() {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Supabase handles the session via the URL hash automatically.
        // If no session is present, it means the link is invalid or expired.
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (!session) {
                setError('El enlace de recuperación es inválido o ha expirado.');
            }
        });
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError('Las contraseñas no coinciden');
            return;
        }

        if (password.length < 6) {
            setError('La contraseña debe tener al menos 6 caracteres');
            return;
        }

        setSubmitting(true);

        try {
            const { error } = await supabase.auth.updateUser({
                password: password
            });

            if (error) throw error;

            setSuccess(true);
            // Wait a bit before redirecting
            setTimeout(() => navigate('/auth'), 3000);

        } catch (err: any) {
            console.error('Update password error:', err);
            setError(err.message || 'Error al actualizar la contraseña.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background (Same aesthetic) */}
            <div
                className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900"
                style={{
                    backgroundSize: '400% 400%',
                    animation: 'gradient-shift 15s ease infinite',
                }}
            />

            <div className="w-full max-w-sm relative z-10">
                <div className="animate-fade-in p-8">
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-white mb-2">Nueva Contraseña</h1>
                        <p className="text-white/60 text-sm">
                            Ingresa tu nueva contraseña segura.
                        </p>
                    </div>

                    {!success ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <AlertCosmos type="error">{error}</AlertCosmos>
                            )}

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="password" className="text-white/80 text-sm font-medium">Nueva contraseña</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                        <Input
                                            id="password"
                                            type="password"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            className="pl-10 h-12 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-purple-400"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="confirm" className="text-white/80 text-sm font-medium">Confirmar contraseña</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                        <Input
                                            id="confirm"
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder="••••••••"
                                            required
                                            className="pl-10 h-12 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-purple-400"
                                        />
                                    </div>
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-12 text-base rounded-full font-semibold bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white shadow-lg"
                                disabled={submitting || (!!error && error.includes('inválido'))}
                            >
                                {submitting ? <Spinner size="sm" className="mr-2" /> : null}
                                Actualizar contraseña
                            </Button>
                        </form>
                    ) : (
                        <div className="text-center space-y-6 animate-scale-in">
                            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle2 className="w-8 h-8 text-green-400" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-medium text-white">¡Actualización exitosa!</h3>
                                <p className="text-white/60 text-sm">
                                    Tu contraseña ha sido modificada correctamente. <br />
                                    Redirigiendo al inicio de sesión...
                                </p>
                            </div>
                            <Spinner className="mx-auto" />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
