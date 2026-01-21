import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAdmin, AdminSite } from '@/hooks/useAdmin';
import { useSite } from '@/contexts/SiteContext';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Building2,
    Users,
    UserCheck,
    ClipboardList,
    TrendingUp,
    Clock,
    Search,
    ChevronRight,
    Crown,
    AlertTriangle,
    Calendar,
    DollarSign,
    Settings,
    LogOut,
    ExternalLink,
    Database,
    Globe,
    Github,
    Zap,
    RefreshCw,
    DoorOpen,
    Pause,
    Play,
    Trash2
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

// External service links
const EXTERNAL_SERVICES = [
    {
        name: 'Supabase',
        url: 'https://supabase.com/dashboard',
        icon: Database,
        description: 'Base de datos, Auth, Storage',
        color: 'from-green-500 to-emerald-600',
    },
    {
        name: 'Vercel',
        url: 'https://vercel.com/dashboard',
        icon: Zap,
        description: 'Hosting & Deploys',
        color: 'from-gray-700 to-gray-900',
    },
    {
        name: 'GitHub',
        url: 'https://github.com',
        icon: Github,
        description: 'Código fuente',
        color: 'from-purple-600 to-purple-800',
    },
    {
        name: 'Google Play Console',
        url: 'https://play.google.com/console',
        icon: Globe,
        description: 'Android App Store',
        color: 'from-blue-500 to-blue-700',
    },
];

export default function AdminPanelPage() {
    const navigate = useNavigate();
    const { signOut } = useAuth();
    const { isAdmin, loading, stats, sites, fetchStats, fetchSites } = useAdmin();
    const [searchQuery, setSearchQuery] = useState('');
    const [activeTab, setActiveTab] = useState<'dashboard' | 'sites' | 'search'>('dashboard');
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        if (!loading && !isAdmin) {
            navigate('/');
        }
    }, [loading, isAdmin, navigate]);

    useEffect(() => {
        if (isAdmin) {
            fetchStats();
            fetchSites();
        }
    }, [isAdmin, fetchStats, fetchSites]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await fetchSites();
        setRefreshing(false);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <Spinner size="lg" />
            </div>
        );
    }

    if (!isAdmin) {
        return null;
    }

    const filteredSites = sites.filter(site =>
        site.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        site.supervisor_email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-slate-900">
            {/* Header */}
            <header className="bg-slate-800 border-b border-white/10 px-4 py-3">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
                            <Crown className="w-5 h-5 text-white" />
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-white">BRIK Control</h1>
                            <p className="text-xs text-white/50">Panel de Administración Global</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="text-white/70 hover:text-white"
                        >
                            <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
                            Actualizar
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate('/')}
                            className="text-white/70 hover:text-white"
                        >
                            Ir a la App
                        </Button>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={signOut}
                            className="text-white/50 hover:text-white"
                        >
                            <LogOut className="w-4 h-4" />
                        </Button>
                    </div>
                </div>
            </header>

            {/* Tabs */}
            <div className="bg-slate-800/50 border-b border-white/10 px-4">
                <div className="max-w-6xl mx-auto flex gap-1">
                    {[
                        { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
                        { id: 'sites', label: `Obras (${sites.length})`, icon: Building2 },
                        { id: 'search', label: 'Buscar', icon: Search },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as any)}
                            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors ${activeTab === tab.id
                                ? 'border-purple-500 text-white'
                                : 'border-transparent text-white/50 hover:text-white/80'
                                }`}
                        >
                            <tab.icon className="w-4 h-4" />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content */}
            <main className="max-w-6xl mx-auto p-4">
                {activeTab === 'dashboard' && <DashboardTab stats={stats} sites={sites} />}
                {activeTab === 'sites' && (
                    <SitesTab
                        sites={filteredSites}
                        searchQuery={searchQuery}
                        setSearchQuery={setSearchQuery}
                        onRefresh={handleRefresh}
                    />
                )}
                {activeTab === 'search' && <SearchTab />}
            </main>
        </div>
    );
}

// Dashboard Tab
function DashboardTab({ stats, sites }: { stats: any; sites: AdminSite[] }) {
    const trialsExpiringSoon = sites.filter(s => {
        if (!s.subscription?.trial_ends_at) return false;
        const daysLeft = Math.ceil((new Date(s.subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        return daysLeft > 0 && daysLeft <= 7;
    });

    const MRR = (stats?.sites_on_pro || 0) * 70;

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                    icon={Building2}
                    label="Total Obras"
                    value={stats?.total_sites || 0}
                    color="purple"
                />
                <StatCard
                    icon={Users}
                    label="Trabajadores"
                    value={stats?.total_workers || 0}
                    color="blue"
                />
                <StatCard
                    icon={UserCheck}
                    label="En Trial"
                    value={stats?.sites_on_trial || 0}
                    color="yellow"
                />
                <StatCard
                    icon={Crown}
                    label="Pro Activos"
                    value={stats?.sites_on_pro || 0}
                    color="green"
                />
            </div>

            {/* Revenue & Activity */}
            <div className="grid md:grid-cols-2 gap-4">
                <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
                    <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
                        <DollarSign className="w-4 h-4" /> Ingresos
                    </h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <span className="text-white/70">MRR (Mensual)</span>
                            <span className="text-2xl font-bold text-green-400">${MRR}</span>
                        </div>
                        <div className="flex justify-between items-center">
                            <span className="text-white/70">ARR (Anual proyectado)</span>
                            <span className="text-lg font-medium text-green-300">${MRR * 12}</span>
                        </div>
                        <div className="text-xs text-white/40 pt-2 border-t border-white/10">
                            Basado en {stats?.sites_on_pro || 0} suscripciones Pro a $70/mes
                        </div>
                    </div>
                </div>

                <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
                    <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
                        <ClipboardList className="w-4 h-4" /> Actividad Este Mes
                    </h3>
                    <div className="space-y-3">
                        <div className="flex justify-between">
                            <span className="text-white/70">Registros de acceso</span>
                            <span className="text-white font-medium">{stats?.total_access_logs_this_month || 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white/70">Nuevas obras</span>
                            <span className="text-white font-medium">{stats?.new_sites_this_month || 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-white/70">Visitantes totales</span>
                            <span className="text-white font-medium">{stats?.total_visitors || 0}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Trials Expiring Soon */}
            {trialsExpiringSoon.length > 0 && (
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-5">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle className="w-5 h-5 text-yellow-400" />
                        <h3 className="font-medium text-yellow-400">Trials por Vencer (próximos 7 días)</h3>
                    </div>
                    <div className="space-y-2">
                        {trialsExpiringSoon.map(site => {
                            const daysLeft = Math.ceil((new Date(site.subscription!.trial_ends_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                            return (
                                <div key={site.id} className="flex justify-between items-center p-3 bg-slate-800/50 rounded-xl">
                                    <div>
                                        <span className="text-white font-medium">{site.name}</span>
                                        <span className="text-white/50 text-sm ml-2">({site.worker_count} trabajadores)</span>
                                    </div>
                                    <span className={`text-sm px-2 py-1 rounded ${daysLeft <= 3 ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                        {daysLeft} días
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* All Sites Quick View */}
            {sites.length > 0 && (
                <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
                    <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
                        <Building2 className="w-4 h-4" /> Resumen de Obras
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {sites.slice(0, 10).map(site => (
                            <QuickSiteRow key={site.id} site={site} />
                        ))}
                    </div>
                </div>
            )}

            {/* External Services */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
                <h3 className="text-sm font-medium text-white/60 mb-4 flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" /> Servicios Externos
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {EXTERNAL_SERVICES.map(service => (
                        <a
                            key={service.name}
                            href={service.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={`p-4 rounded-xl bg-gradient-to-br ${service.color} hover:scale-105 transition-transform`}
                        >
                            <service.icon className="w-6 h-6 text-white mb-2" />
                            <p className="text-white font-medium text-sm">{service.name}</p>
                            <p className="text-white/60 text-xs">{service.description}</p>
                        </a>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Quick Site Row for Dashboard
function QuickSiteRow({ site }: { site: AdminSite }) {
    const navigate = useNavigate();
    const { enterSiteAsAdmin } = useSite();

    const handleEnterSite = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await enterSiteAsAdmin(site.id);
        navigate('/');
    };

    return (
        <div className="w-full flex items-center justify-between p-3 bg-slate-700/30 hover:bg-slate-700/60 rounded-xl transition-colors">
            <button
                onClick={() => navigate(`/brik-control/sites/${site.id}`)}
                className="flex items-center gap-3 flex-1"
            >
                <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-left">
                    <p className="text-white text-sm font-medium">{site.name}</p>
                    <p className="text-white/40 text-xs">{site.worker_count} trabajadores • {site.access_logs_this_month} accesos</p>
                </div>
            </button>
            <div className="flex items-center gap-2">
                {site.subscription && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${site.subscription.status === 'trial' ? 'bg-yellow-500/20 text-yellow-400' :
                        site.subscription.plan === 'pro' ? 'bg-purple-500/20 text-purple-400' :
                            'bg-white/10 text-white/50'
                        }`}>
                        {site.subscription.status === 'trial' ? 'Trial' : site.subscription.plan}
                    </span>
                )}
                <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleEnterSite}
                    className="h-7 px-2 text-purple-400 hover:text-purple-300 hover:bg-purple-500/20"
                    title="Entrar a esta obra"
                >
                    <DoorOpen className="w-4 h-4" />
                </Button>
                <button onClick={() => navigate(`/brik-control/sites/${site.id}`)}>
                    <ChevronRight className="w-4 h-4 text-white/30" />
                </button>
            </div>
        </div>
    );
}

// Sites Tab
function SitesTab({
    sites,
    searchQuery,
    setSearchQuery,
    onRefresh
}: {
    sites: AdminSite[];
    searchQuery: string;
    setSearchQuery: (q: string) => void;
    onRefresh: () => void;
}) {
    const navigate = useNavigate();

    return (
        <div className="space-y-4">
            {/* Search */}
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                <Input
                    placeholder="Buscar por nombre de obra..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 bg-slate-800 border-white/20 text-white"
                />
            </div>

            {/* Sites List */}
            <div className="space-y-2">
                {sites.map(site => (
                    <SiteCard key={site.id} site={site} onClick={() => navigate(`/brik-control/sites/${site.id}`)} onRefresh={onRefresh} />
                ))}
                {sites.length === 0 && (
                    <div className="text-center py-12 text-white/50">
                        <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>No se encontraron obras</p>
                        <Button onClick={onRefresh} variant="ghost" className="mt-4 text-purple-400">
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Actualizar lista
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}

// Site Card
function SiteCard({ site, onClick, onRefresh }: { site: AdminSite; onClick: () => void; onRefresh: () => void }) {
    const navigate = useNavigate();
    const { enterSiteAsAdmin } = useSite();
    const [suspending, setSuspending] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const handleEnterSite = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await enterSiteAsAdmin(site.id);
        navigate('/');
    };

    const handleSuspend = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('¿Suspender esta obra? Los usuarios no podrán acceder.')) return;
        setSuspending(true);
        try {
            const { supabase } = await import('@/integrations/supabase/client');
            await (supabase as any).rpc('suspend_site_subscription', { p_site_id: site.id });
            onRefresh();
        } catch (error) {
            console.error('Error suspending:', error);
        } finally {
            setSuspending(false);
        }
    };

    const handleReactivate = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('¿Reactivar esta obra?')) return;
        setSuspending(true);
        try {
            const { supabase } = await import('@/integrations/supabase/client');
            await (supabase as any).rpc('reactivate_site_subscription', { p_site_id: site.id });
            onRefresh();
        } catch (error) {
            console.error('Error reactivating:', error);
        } finally {
            setSuspending(false);
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm(`¿ELIMINAR PERMANENTEMENTE la obra "${site.name}"? Esta acción NO se puede deshacer.`)) return;
        if (!confirm('¿Estás SEGURO? Todos los datos serán eliminados.')) return;
        setDeleting(true);
        try {
            const { supabase } = await import('@/integrations/supabase/client');
            await (supabase as any).rpc('delete_site_completely', { p_site_id: site.id });
            onRefresh();
        } catch (error) {
            console.error('Error deleting:', error);
        } finally {
            setDeleting(false);
        }
    };

    const isSuspended = site.subscription?.status === 'suspended';

    const getStatusBadge = () => {
        if (!site.subscription) {
            return <span className="px-2 py-0.5 bg-gray-500/20 text-gray-400 rounded-full text-xs">Sin suscripción</span>;
        }

        const { status, plan, trial_ends_at } = site.subscription;

        if (status === 'suspended') {
            return <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs">🔒 Suspendida</span>;
        }

        if (status === 'trial' && trial_ends_at) {
            const daysLeft = Math.ceil((new Date(trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysLeft <= 0) {
                return <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs">Trial Vencido</span>;
            }
            return <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs">Trial ({daysLeft}d)</span>;
        }

        if (plan === 'pro') {
            return <span className="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-xs">Pro</span>;
        }

        if (plan === 'enterprise') {
            return <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded-full text-xs">Enterprise</span>;
        }

        return <span className="px-2 py-0.5 bg-white/10 text-white/50 rounded-full text-xs">Free</span>;
    };

    return (
        <div className={`w-full p-4 rounded-xl border transition-colors flex items-center justify-between ${isSuspended ? 'bg-red-900/20 border-red-500/30' : 'bg-slate-800 hover:bg-slate-700 border-white/10'}`}>
            <button
                onClick={onClick}
                className="flex items-center gap-4 flex-1 text-left"
            >
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isSuspended ? 'bg-red-500/20' : 'bg-gradient-to-br from-purple-500/20 to-blue-500/20'}`}>
                    <Building2 className={`w-5 h-5 ${isSuspended ? 'text-red-400' : 'text-purple-400'}`} />
                </div>
                <div>
                    <div className="flex items-center gap-2">
                        <h3 className="font-medium text-white">{site.name}</h3>
                        {getStatusBadge()}
                    </div>
                    <p className="text-sm text-white/50">
                        Creada {formatDistanceToNow(new Date(site.created_at), { addSuffix: true, locale: es })}
                    </p>
                    <div className="flex gap-4 mt-1 text-xs text-white/40">
                        <span>👷 {site.worker_count} trabajadores</span>
                        <span>📊 {site.access_logs_this_month} accesos/mes</span>
                        {site.subscription && (
                            <span>📈 {site.subscription.current_usage}/{site.subscription.monthly_limit}</span>
                        )}
                    </div>
                </div>
            </button>
            <div className="flex items-center gap-1">
                {/* Suspend/Reactivate button */}
                {isSuspended ? (
                    <Button
                        size="sm"
                        onClick={handleReactivate}
                        disabled={suspending}
                        className="bg-green-500/20 hover:bg-green-500/40 text-green-300 border border-green-500/30"
                        title="Reactivar obra"
                    >
                        <Play className="w-4 h-4" />
                    </Button>
                ) : (
                    <Button
                        size="sm"
                        onClick={handleSuspend}
                        disabled={suspending}
                        className="bg-yellow-500/20 hover:bg-yellow-500/40 text-yellow-300 border border-yellow-500/30"
                        title="Suspender obra"
                    >
                        <Pause className="w-4 h-4" />
                    </Button>
                )}
                {/* Enter button */}
                <Button
                    size="sm"
                    onClick={handleEnterSite}
                    disabled={isSuspended}
                    className="bg-purple-500/20 hover:bg-purple-500/40 text-purple-300 border border-purple-500/30"
                    title="Entrar a esta obra"
                >
                    <DoorOpen className="w-4 h-4" />
                </Button>
                {/* Delete button */}
                <Button
                    size="sm"
                    onClick={handleDelete}
                    disabled={deleting}
                    className="bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/30"
                    title="Eliminar obra permanentemente"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
                <button onClick={onClick}>
                    <ChevronRight className="w-5 h-5 text-white/30" />
                </button>
            </div>
        </div>
    );
}

// Search Tab
function SearchTab() {
    const { globalSearch } = useAdmin();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);

    const handleSearch = async () => {
        if (query.length < 2) return;
        setSearching(true);
        const data = await globalSearch(query);
        setResults(data);
        setSearching(false);
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <Input
                        placeholder="Buscar trabajador o visitante por nombre o CI..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="pl-10 bg-slate-800 border-white/20 text-white"
                    />
                </div>
                <Button onClick={handleSearch} disabled={searching || query.length < 2}>
                    {searching ? <Spinner size="sm" /> : 'Buscar'}
                </Button>
            </div>

            <div className="space-y-2">
                {results.map((item, i) => (
                    <div key={i} className="p-4 bg-slate-800 rounded-xl border border-white/10">
                        <div className="flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${item.type === 'worker' ? 'bg-blue-500/20' : 'bg-green-500/20'
                                }`}>
                                {item.type === 'worker' ? (
                                    <Users className="w-5 h-5 text-blue-400" />
                                ) : (
                                    <UserCheck className="w-5 h-5 text-green-400" />
                                )}
                            </div>
                            <div className="flex-1">
                                <p className="text-white font-medium">{item.name || item.full_name}</p>
                                <p className="text-sm text-white/50">
                                    {item.type === 'worker' ? 'Trabajador' : 'Visitante'} • CI: {item.ci}
                                </p>
                                {item.sites?.name && (
                                    <p className="text-xs text-purple-400 mt-1">📍 {item.sites.name}</p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
                {results.length === 0 && query.length >= 2 && !searching && (
                    <div className="text-center py-12 text-white/50">
                        <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>No se encontraron resultados para "{query}"</p>
                    </div>
                )}
                {query.length < 2 && (
                    <div className="text-center py-12 text-white/40">
                        <Search className="w-12 h-12 mx-auto mb-4 opacity-30" />
                        <p>Ingresa al menos 2 caracteres para buscar</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// Stat Card Component
function StatCard({
    icon: Icon,
    label,
    value,
    color
}: {
    icon: any;
    label: string;
    value: number;
    color: 'purple' | 'blue' | 'yellow' | 'green';
}) {
    const colors = {
        purple: 'from-purple-500/20 to-purple-500/5 text-purple-400',
        blue: 'from-blue-500/20 to-blue-500/5 text-blue-400',
        yellow: 'from-yellow-500/20 to-yellow-500/5 text-yellow-400',
        green: 'from-green-500/20 to-green-500/5 text-green-400',
    };

    return (
        <div className={`bg-gradient-to-br ${colors[color]} rounded-2xl p-4 border border-white/10`}>
            <Icon className="w-5 h-5 mb-2" />
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-white/60">{label}</p>
        </div>
    );
}
