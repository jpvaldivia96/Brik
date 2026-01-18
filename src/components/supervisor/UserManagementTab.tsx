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
import { UserCog, UserPlus, Mail, Shield, Clock, Trash2, Copy, Check, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RoleEnum } from '@/lib/types';

interface SiteUser {
    user_id: string;
    role: RoleEnum;
    created_at: string;
    email?: string;
    receive_notifications: boolean;
    invited_by?: string; // email of inviter
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
    const [isOwner, setIsOwner] = useState(false);

    // Invite form
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<RoleEnum>('guard');
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    useEffect(() => {
        if (currentSite) {
            loadData();
            checkIfOwner();
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

            // Load accepted invitations to get emails AND inviters
            const { data: acceptedInvites } = await (supabase as any)
                .from('user_invitations')
                .select('email, accepted_by, invited_by')
                .eq('site_id', currentSite.id)
                .not('accepted_at', 'is', null);

            // Create maps
            const emailMap: Record<string, string> = {};
            const inviterMap: Record<string, string> = {};

            for (const inv of (acceptedInvites || [])) {
                if (inv.accepted_by && inv.email) {
                    emailMap[inv.accepted_by] = inv.email;

                    // Get inviter email if invited_by exists
                    if (inv.invited_by) {
                        const { data: inviterUser } = await supabase.auth.admin.getUserById(inv.invited_by);
                        inviterMap[inv.accepted_by] = inviterUser?.user?.email || 'Sistema';
                    } else {
                        inviterMap[inv.accepted_by] = 'Sistema';
                    }
                }
            }

            // Merge memberships with emails and inviters
            const usersWithEmail = (memberships || []).map((m: any) => ({
                ...m,
                email: emailMap[m.user_id] || (m.user_id === user?.id ? user?.email : undefined),
                receive_notifications: m.receive_notifications ?? true,
                invited_by: inviterMap[m.user_id] || 'Desconocido'
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

    const checkIfOwner = async () => {
        if (!currentSite || !user) return;
        try {
            const { data: membership } = await supabase
                .from('site_memberships')
                .select('role')
                .eq('site_id', currentSite.id)
                .eq('user_id', user.id)
                .single();

            setIsOwner(membership?.role === 'owner' || membership?.role === 'admin');
        } catch (error) {
            setIsOwner(false);
        }
    };

    const deleteUser = async (userId: string) => {
        if (!currentSite || userId === user?.id) {
            toast({
                title: 'Error',
                description: 'No puedes eliminarte a ti mismo',
                variant: 'destructive',
            });
            return;
        }

        if (!confirm('¿Estás seguro de eliminar este usuario? Esta acción no se puede deshacer.')) {
            return;
        }

        try {
            await supabase
                .from('site_memberships')
                .delete()
                .eq('site_id', currentSite.id)
                .eq('user_id', userId);

            toast({ title: 'Usuario eliminado correctamente' });
            loadData();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
        }
    };

    const changeUserRole = async (userId: string, newRole: RoleEnum) => {
        if (!currentSite || userId === user?.id) {
            toast({
                title: 'Error',
                description: 'No puedes cambiar tu propio rol',
                variant: 'destructive',
            });
            return;
        }

        try {
            await supabase
                .from('site_memberships')
                .update({ role: newRole })
                .eq('site_id', currentSite.id)
                .eq('user_id', userId);

            // Log audit event
            const oldRole = users.find(u => u.user_id === userId)?.role;
            await supabase.from('audit_events').insert({
                site_id: currentSite.id,
                action: 'ROLE_CHANGED',
                entity_type: 'site_memberships',
                entity_id: userId,
                before: { role: oldRole },
                after: { role: newRole },
            });

            toast({ title: 'Rol actualizado correctamente' });
            loadData();
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message,
                variant: 'destructive',
            });
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



    const getRoleBadge = (role: RoleEnum) => {
        let bgColor = "bg-blue-500/20";
        let textColor = "text-blue-300";
        let label = "Guardia";

        if (role === 'owner') {
            bgColor = "bg-yellow-500/20";
            textColor = "text-yellow-300";
            label = "Owner";
        } else if (role === 'admin') {
            bgColor = "bg-red-500/20";
            textColor = "text-red-300";
            label = "Admin";
        } else if (role === 'supervisor') {
            bgColor = "bg-purple-500/20";
            textColor = "text-purple-300";
            label = "Supervisor";
        } else if (role === 'inspector') {
            bgColor = "bg-orange-500/20";
            textColor = "text-orange-300";
            label = "Inspector";
        }

        return (
            <span className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium",
                bgColor,
                textColor
            )}>
                {label}
            </span>
        );
    };

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
                                    <SelectItem value="inspector" className="text-white">
                                        <div className="flex items-center gap-2">
                                            <Shield className="w-4 h-4 text-orange-400" />
                                            Inspector
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
                                    {/* Role badge/dropdown */}
                                    {isOwner && u.user_id !== user?.id ? (
                                        <Select value={u.role} onValueChange={(newRole) => changeUserRole(u.user_id, newRole as RoleEnum)}>
                                            <SelectTrigger className="w-[120px] h-7 bg-white/10 border-white/20 text-white text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-800 border-white/10">
                                                <SelectItem value="guard" className="text-white text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <Shield className="w-3 h-3 text-blue-400" />
                                                        Guardia
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="inspector" className="text-white text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <Shield className="w-3 h-3 text-orange-400" />
                                                        Inspector
                                                    </div>
                                                </SelectItem>
                                                <SelectItem value="supervisor" className="text-white text-xs">
                                                    <div className="flex items-center gap-2">
                                                        <Shield className="w-3 h-3 text-purple-400" />
                                                        Supervisor
                                                    </div>
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        getRoleBadge(u.role)
                                    )}

                                    {/* Delete button - only for owner and not self */}
                                    {isOwner && u.user_id !== user?.id && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteUser(u.user_id)}
                                            className="text-white/50 hover:text-red-400 h-7 w-7 p-0"
                                            title="Eliminar usuario"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    )}
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
