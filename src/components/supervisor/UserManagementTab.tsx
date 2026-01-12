import { useState, useEffect } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { useToast } from '@/hooks/use-toast';
import { UserCog, UserPlus, Mail, Shield, Clock, Trash2, Copy, Check, Users, Bell } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoleEnum } from '@/lib/types';

interface SiteUser {
    user_id: string;
    role: RoleEnum;
    created_at: string;
    email?: string;
    receive_notifications: boolean;
}

interface Invitation {
    id: string;
    email: string;
    role: RoleEnum;
    created_at: string;
    expires_at: string;
    accepted_at: string | null;
    token: string;
}

export default function UserManagementTab() {
    const { currentSite } = useSite();
    const { user } = useAuth();
    const { toast } = useToast();

    const [users, setUsers] = useState<SiteUser[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviting, setInviting] = useState(false);
    const [showInviteForm, setShowInviteForm] = useState(false);

    // Invite form
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<RoleEnum>('guard');
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    useEffect(() => {
        if (currentSite) {
            loadData();
        }
    }, [currentSite]);

    const loadData = async () => {
        if (!currentSite) return;
        setLoading(true);

        try {
            // Load current site users
            const { data: memberships } = await (supabase as any)
                .from('site_memberships')
                .select('user_id, role, created_at, receive_notifications')
                .eq('site_id', currentSite.id);

            // Load accepted invitations to get emails
            const { data: acceptedInvites } = await (supabase as any)
                .from('user_invitations')
                .select('email, accepted_by')
                .eq('site_id', currentSite.id)
                .not('accepted_at', 'is', null);

            // Create a map of user_id -> email from accepted invitations
            const emailMap: Record<string, string> = {};
            (acceptedInvites || []).forEach((inv: any) => {
                if (inv.accepted_by && inv.email) {
                    emailMap[inv.accepted_by] = inv.email;
                }
            });

            // Merge memberships with emails
            const usersWithEmail = (memberships || []).map((m: any) => ({
                ...m,
                // Priority: 1) Email from invitation, 2) Current user's email if it matches, 3) undefined
                email: emailMap[m.user_id] || (m.user_id === user?.id ? user?.email : undefined),
                receive_notifications: m.receive_notifications ?? true
            })) as SiteUser[];

            setUsers(usersWithEmail);

            // Load pending invitations
            try {
                const { data: invites } = await (supabase as any)
                    .from('user_invitations')
                    .select('*')
                    .eq('site_id', currentSite.id)
                    .order('created_at', { ascending: false });

                setInvitations((invites || []) as Invitation[]);
            } catch {
                setInvitations([]);
            }
        } catch (error) {
            console.error('Error loading users:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async () => {
        if (!currentSite || !inviteEmail.trim()) return;

        setInviting(true);
        try {
            const { data, error } = await (supabase as any)
                .from('user_invitations')
                .insert({
                    site_id: currentSite.id,
                    email: inviteEmail.trim().toLowerCase(),
                    role: inviteRole,
                    invited_by: user?.id,
                })
                .select()
                .single();

            if (error) throw error;

            toast({
                title: 'Invitación creada',
                description: `Se generó un link de invitación para ${inviteEmail}`,
            });

            setInviteEmail('');
            setShowInviteForm(false);
            loadData();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setInviting(false);
        }
    };

    const copyInviteLink = async (token: string) => {
        const link = `${window.location.origin}/invite/${token}`;
        await navigator.clipboard.writeText(link);
        setCopiedToken(token);
        setTimeout(() => setCopiedToken(null), 2000);
        toast({
            title: 'Link copiado',
            description: 'Compártelo con la persona que quieres invitar',
        });
    };

    const deleteInvitation = async (id: string) => {
        try {
            await (supabase as any)
                .from('user_invitations')
                .delete()
                .eq('id', id);

            toast({ title: 'Invitación eliminada' });
            loadData();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        }
    };

    const toggleNotifications = async (userId: string, currentValue: boolean) => {
        if (!currentSite) return;
        try {
            await (supabase as any)
                .from('site_memberships')
                .update({ receive_notifications: !currentValue })
                .eq('site_id', currentSite.id)
                .eq('user_id', userId);

            // Update local state
            setUsers(prev => prev.map(u =>
                u.user_id === userId
                    ? { ...u, receive_notifications: !currentValue }
                    : u
            ));

            toast({
                title: !currentValue ? 'Notificaciones activadas' : 'Notificaciones desactivadas',
            });
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        }
    };

    const getRoleBadge = (role: RoleEnum) => (
        <span className={cn(
            "px-2 py-0.5 rounded-full text-xs font-medium",
            role === 'supervisor'
                ? "bg-purple-500/20 text-purple-300"
                : "bg-blue-500/20 text-blue-300"
        )}>
            {role === 'supervisor' ? 'Supervisor' : 'Guardia'}
        </span>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Spinner size="lg" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <UserCog className="w-6 h-6 text-purple-400" />
                    <h3 className="text-lg font-medium text-white">Gestión de Usuarios</h3>
                </div>
                <Button
                    onClick={() => setShowInviteForm(!showInviteForm)}
                    className="bg-gradient-to-r from-purple-500 to-blue-500"
                >
                    <UserPlus className="w-4 h-4 mr-2" />
                    Invitar Usuario
                </Button>
            </div>

            {/* Invite Form */}
            {showInviteForm && (
                <div className="card-cosmos p-6 space-y-4">
                    <h4 className="font-medium text-white">Nueva Invitación</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-white/70">Email</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
                                <Input
                                    type="email"
                                    placeholder="guardia@email.com"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-white/70">Rol</Label>
                            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as RoleEnum)}>
                                <SelectTrigger className="bg-white/10 border-white/20 text-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-800 border-white/10">
                                    <SelectItem value="guard" className="text-white">
                                        <div className="flex items-center gap-2">
                                            <Shield className="w-4 h-4 text-blue-400" />
                                            Guardia
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="supervisor" className="text-white">
                                        <div className="flex items-center gap-2">
                                            <Shield className="w-4 h-4 text-purple-400" />
                                            Supervisor
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/20 border border-blue-400/30">
                        <div className="w-5 h-5 rounded-full bg-blue-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-blue-300 text-xs">i</span>
                        </div>
                        <p className="text-white/90 text-sm">
                            Al crear la invitación se generará un link único. Compártelo con la persona para que pueda registrarse.
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <Button
                            onClick={handleInvite}
                            disabled={inviting || !inviteEmail.trim()}
                            className="bg-gradient-to-r from-purple-500 to-blue-500"
                        >
                            {inviting ? <Spinner size="sm" className="mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                            Crear Invitación
                        </Button>
                        <Button
                            onClick={() => setShowInviteForm(false)}
                            className="bg-white/20 hover:bg-white/30 text-white border-0"
                        >
                            Cancelar
                        </Button>
                    </div>
                </div>
            )}

            {/* Current Users */}
            <div className="card-cosmos p-6 space-y-4">
                <div className="flex items-center gap-2 text-white/80">
                    <Users className="w-4 h-4" />
                    <span className="font-medium">Usuarios Activos ({users.length})</span>
                </div>

                {users.length === 0 ? (
                    <p className="text-white/50 text-sm">No hay usuarios registrados.</p>
                ) : (
                    <div className="space-y-2">
                        {users.map((u) => (
                            <div
                                key={u.user_id}
                                className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-medium">
                                        {u.email?.[0]?.toUpperCase() || '?'}
                                    </div>
                                    <div>
                                        <p className="text-white text-sm">{u.email || u.user_id.slice(0, 8)}</p>
                                        <p className="text-white/50 text-xs">
                                            Desde {new Date(u.created_at).toLocaleDateString('es-BO')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => toggleNotifications(u.user_id, u.receive_notifications)}
                                        className={cn(
                                            "p-1.5 rounded-lg transition-colors",
                                            u.receive_notifications
                                                ? "text-emerald-400 hover:bg-emerald-500/20"
                                                : "text-white/30 hover:bg-white/10"
                                        )}
                                        title={u.receive_notifications ? 'Notificaciones activadas' : 'Notificaciones desactivadas'}
                                    >
                                        <Bell className="w-4 h-4" />
                                    </button>
                                    {getRoleBadge(u.role)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Pending Invitations */}
            <div className="card-cosmos p-6 space-y-4">
                <div className="flex items-center gap-2 text-white/80">
                    <Clock className="w-4 h-4" />
                    <span className="font-medium">Invitaciones Pendientes ({invitations.filter(i => !i.accepted_at).length})</span>
                </div>

                {invitations.filter(i => !i.accepted_at).length === 0 ? (
                    <p className="text-white/50 text-sm">No hay invitaciones pendientes.</p>
                ) : (
                    <div className="space-y-2">
                        {invitations.filter(i => !i.accepted_at).map((inv) => (
                            <div
                                key={inv.id}
                                className="flex items-center justify-between p-3 rounded-lg bg-white/5"
                            >
                                <div className="flex items-center gap-3">
                                    <Mail className="w-5 h-5 text-yellow-400" />
                                    <div>
                                        <p className="text-white text-sm">{inv.email}</p>
                                        <p className="text-white/50 text-xs">
                                            Expira: {new Date(inv.expires_at).toLocaleDateString('es-BO')}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {getRoleBadge(inv.role)}
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => copyInviteLink(inv.token)}
                                        className="text-white/50 hover:text-white"
                                    >
                                        {copiedToken === inv.token ? (
                                            <Check className="w-4 h-4 text-green-400" />
                                        ) : (
                                            <Copy className="w-4 h-4" />
                                        )}
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => deleteInvitation(inv.id)}
                                        className="text-white/50 hover:text-red-400"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
