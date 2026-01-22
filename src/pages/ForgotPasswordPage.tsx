import { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { HCaptcha, HCaptchaRef } from '@/components/ui/hcaptcha';

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const captchaRef = useRef<HCaptchaRef>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setSubmitting(true);

        try {
            // Execute captcha
            const token = await captchaRef.current?.execute();
            if (!token) {
                throw new Error('Por favor completa la verificación de seguridad');
            }

            // Send reset password email
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
                captchaToken: token,
            });

            if (error) throw error;

            setSubmitted(true);
        } catch (err: any) {
            console.error('Reset password error:', err);
            setError(err.message || 'Error al enviar el correo. Intenta nuevamente.');
        } finally {
            setSubmitting(false);
            captchaRef.current?.reset();
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background (Same as AuthPage) */}
            <div
                className="absolute inset-0 bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900"
                style={{
                    backgroundSize: '400% 400%',
                    animation: 'gradient-shift 15s ease infinite',
                }}
            />
            <div className="absolute inset-0 opacity-20"
                style={{
                    backgroundImage: 'radial-gradient(circle at 25% 25%, rgba(139, 92, 246, 0.3) 0%, transparent 50%), radial-gradient(circle at 75% 75%, rgba(59, 130, 246, 0.3) 0%, transparent 50%)',
                }}
            />

            <div className="w-full max-w-sm relative z-10">
                <div className="animate-fade-in p-8">
                    {/* Logo/Header */}
                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-bold text-white mb-2">Recuperar Contraseña</h1>
                        <p className="text-white/60 text-sm">
                            Te enviaremos un enlace para restablecer tu acceso.
                        </p>
                    </div>

                    {!submitted ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <AlertCosmos type="error">{error}</AlertCosmos>
                            )}

                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-white/80 text-sm font-medium">Correo electrónico</Label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40" />
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="tu@email.com"
                                        required
                                        className="pl-10 h-12 rounded-xl bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:bg-white/15 focus:border-purple-400"
                                    />
                                </div>
                            </div>

                            <Button
                                type="submit"
                                className="w-full h-12 text-base rounded-full font-semibold bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white shadow-lg"
                                disabled={submitting}
                            >
                                {submitting ? <Spinner size="sm" className="mr-2" /> : null}
                                Enviar instrucciones
                            </Button>

                            <HCaptcha ref={captchaRef} />
                        </form>
                    ) : (
                        <div className="text-center space-y-6 animate-scale-in">
                            <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
                                <CheckCircle2 className="w-8 h-8 text-green-400" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-xl font-medium text-white">¡Correo enviado!</h3>
                                <p className="text-white/60 text-sm">
                                    Revisa tu bandeja de entrada en <strong>{email}</strong> y sigue las instrucciones.
                                </p>
                            </div>
                            <Button
                                variant="outline"
                                className="w-full rounded-full border-white/20 text-white hover:bg-white/10"
                                onClick={() => setSubmitted(false)}
                            >
                                Intentar con otro correo
                            </Button>
                        </div>
                    )}

                    <div className="mt-8 text-center">
                        <Link
                            to="/auth"
                            className="inline-flex items-center text-sm text-white/60 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Volver al inicio de sesión
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
