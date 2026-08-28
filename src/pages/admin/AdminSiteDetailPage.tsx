import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAdmin } from '@/hooks/useAdmin';
import { supabase } from '@/integrations/supabase/client';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    ArrowLeft,
    Building2,
    Users,
    UserCheck,
    Clock,
    Crown,
    Calendar,
    Plus,
    Minus,
    Save,
    MessageCircle,
    Search,
    Filter,
    Download,
    RefreshCw,
    ChevronDown,
    AlertTriangle,
    Phone,
    Shield,
    Briefcase
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

type TabType = 'overview' | 'workers' | 'visitors' | 'logs' | 'subscription';

interface SiteData {
    id: string;
    name: string;
    timezone: string;
    created_at: string;
    subscription: {
        plan: string;
        status: string;
        monthly_limit: number;
        current_usage: number;
        trial_ends_at: string | null;
        trial_days_added: number;
    } | null;
    worker_count: number;
    visitor_count: number;
    access_logs_this_month: number;
}

export default function AdminSiteDetailPage() {
    const { siteId } = useParams<{ siteId: string }>();
    const navigate = useNavigate();
    const { isAdmin, loading: adminLoading, getSiteDetails, updateSubscription } = useAdmin();

    const [site, setSite] = useState<SiteData | null>(null);
    const [loadingSite, setLoadingSite] = useState(true);
    const [siteDetails, setSiteDetails] = useState<any>(null);
    const [loadingDetails, setLoadingDetails] = useState(true);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [searchQuery, setSearchQuery] = useState('');

    // Editable fields
    const [selectedPlan, setSelectedPlan] = useState('');
    const [trialDaysToAdd, setTrialDaysToAdd] = useState(0);
    const [notes, setNotes] = useState('');

    useEffect(() => {
        if (!adminLoading && !isAdmin) {
            navigate('/');
        }
    }, [adminLoading, isAdmin, navigate]);

    // Fetch site data directly
    useEffect(() => {
        if (isAdmin && siteId) {
            fetchSiteData();
        }
    }, [isAdmin, siteId]);

    const fetchSiteData = async () => {
        if (!siteId) return;
        setLoadingSite(true);

        try {
            // Fetch site
            const { data: siteData } = await (supabase as any)
                .from('sites')
                .select('*')
                .eq('id', siteId)
                .single();

            if (!siteData) {
                navigate('/brik-control');
                return;
            }

            // Fetch subscription
            const { data: subData } = await (supabase as any)
                .from('subscriptions')
                .select('*')
                .eq('site_id', siteId)
                .maybeSingle();

            // Fetch counts
            const { count: workerCount } = await (supabase as any)
                .from('people')
                .select('*', { count: 'exact', head: true })
                .eq('site_id', siteId)
                .eq('type', 'worker');

            const { count: visitorCount } = await (supabase as any)
                .from('people')
                .select('*', { count: 'exact', head: true })
                .eq('site_id', siteId)
                .eq('type', 'visitor');

            const monthStart = new Date();
            monthStart.setDate(1);
            monthStart.setHours(0, 0, 0, 0);

            const { count: logsCount } = await (supabase as any)
                .from('access_logs')
                .select('*', { count: 'exact', head: true })
                .eq('site_id', siteId)
                .gte('created_at', monthStart.toISOString());

            const enrichedSite: SiteData = {
                id: siteData.id,
                name: siteData.name,
                timezone: siteData.timezone,
                created_at: siteData.created_at,
                subscription: subData ? {
                    plan: subData.plan,
                    status: subData.status,
                    monthly_limit: subData.monthly_limit,
                    current_usage: subData.current_month_usage || 0,
                    trial_ends_at: subData.trial_ends_at,
                    trial_days_added: subData.trial_days_added || 0,
                } : null,
                worker_count: workerCount || 0,
                visitor_count: visitorCount || 0,
                access_logs_this_month: logsCount || 0,
            };

            setSite(enrichedSite);
            if (enrichedSite.subscription) {
                setSelectedPlan(enrichedSite.subscription.plan);
            }

            // Also load details
            await loadDetails();
        } catch (error) {
            console.error('Error fetching site:', error);
        } finally {
            setLoadingSite(false);
        }
    };

    const loadDetails = async () => {
        if (!siteId) return;
        setLoadingDetails(true);
        const details = await getSiteDetails(siteId);
        setSiteDetails(details);
        setLoadingDetails(false);
    };

    const handleSave = async () => {
        if (!siteId || !site) return;
        setSaving(true);

        await updateSubscription(siteId, {
            plan: selectedPlan !== site?.subscription?.plan ? selectedPlan : undefined,
            trialDaysToAdd: trialDaysToAdd !== 0 ? trialDaysToAdd : undefined,
            notes: notes || undefined,
        });

        setTrialDaysToAdd(0);
        setNotes('');
        setSaving(false);
        await fetchSiteData(); // Refresh data
    };

    const handlePause = async () => {
        if (!siteId) return;
        setSaving(true);
        await updateSubscription(siteId, { status: 'paused' });
        setSaving(false);
        await fetchSiteData();
    };

    const handleResume = async () => {
        if (!siteId) return;
        setSaving(true);
        await updateSubscription(siteId, { status: 'active' });
        setSaving(false);
        await fetchSiteData();
    };

    const openWhatsApp = (phone?: string) => {
        const message = `Hola! Soy del equipo de BRIK. Te contacto respecto a la obra "${site?.name}"...`;
        const url = phone
            ? `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`
            : `https://wa.me/?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
    };

    if (adminLoading || loadingSite || !site) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-900">
                <Spinner size="lg" />
            </div>
        );
    }

    const subscription = site.subscription;
    const trialDaysLeft = subscription?.trial_ends_at
        ? Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0;

    // Filter data based on search (name, CI, contractor, role)
    const filteredWorkers = (siteDetails?.workers || []).filter((w: any) => {
        const query = searchQuery.toLowerCase();
        return (
            w.name?.toLowerCase().includes(query) ||
            w.full_name?.toLowerCase().includes(query) ||
            w.ci?.toLowerCase().includes(query) ||
            w.contractor?.toLowerCase().includes(query) ||
            w.role?.toLowerCase().includes(query)
        );
    });

    const filteredVisitors = (siteDetails?.visitors || []).filter((v: any) =>
        v.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.ci?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const filteredLogs = (siteDetails?.recentLogs || []).filter((l: any) =>
        l.name_snapshot?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.ci_snapshot?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const tabs = [
        { id: 'overview', label: 'Resumen', icon: Building2 },
        { id: 'workers', label: `Trabajadores (${siteDetails?.workers?.length || 0})`, icon: Users },
        { id: 'visitors', label: `Visitantes (${siteDetails?.visitors?.length || 0})`, icon: UserCheck },
        { id: 'logs', label: `Accesos (${siteDetails?.recentLogs?.length || 0})`, icon: Clock },
        { id: 'subscription', label: 'Suscripción', icon: Crown },
    ];

    return (
        <div className="min-h-screen bg-slate-900">
            {/* Header */}
            <header className="bg-slate-800 border-b border-white/10 px-4 py-3">
                <div className="max-w-6xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => navigate('/brik-control')}
                            className="text-white/70"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <div>
                            <h1 className="text-lg font-bold text-white flex items-center gap-2">
                                {site.name}
                                {subscription && (
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${subscription.status === 'trial' ? 'bg-yellow-500/20 text-yellow-400' :
                                        subscription.plan === 'pro' ? 'bg-purple-500/20 text-purple-400' :
                                            'bg-white/10 text-white/50'
                                        }`}>
                                        {subscription.status === 'trial' ? `Trial (${Math.max(0, trialDaysLeft)}d)` : subscription.plan}
                                    </span>
                                )}
                            </h1>
                            <p className="text-xs text-white/50">
                                Creada {formatDistanceToNow(new Date(site.created_at), { addSuffix: true, locale: es })}
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={loadDetails}
                        className="text-white/70"
                    >
                        <RefreshCw className="w-4 h-4 mr-1" />
                        Actualizar
                    </Button>
                </div>
            </header>

            {/* Tabs */}
            <div className="bg-slate-800/50 border-b border-white/10 px-4 overflow-x-auto">
                <div className="max-w-6xl mx-auto flex gap-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id as TabType)}
                            className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-colors whitespace-nowrap ${activeTab === tab.id
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

            {/* Search bar for data tabs */}
            {['workers', 'visitors', 'logs'].includes(activeTab) && (
                <div className="max-w-6xl mx-auto px-4 py-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <Input
                            placeholder="Buscar por nombre, CI, contratista..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 bg-slate-800 border-white/20 text-white"
                        />
                    </div>
                </div>
            )}

            <main className="max-w-6xl mx-auto p-4">
                {loadingDetails ? (
                    <div className="flex justify-center py-12">
                        <Spinner size="lg" />
                    </div>
                ) : (
                    <>
                        {activeTab === 'overview' && <OverviewTab site={site} details={siteDetails} />}
                        {activeTab === 'workers' && <WorkersTab workers={filteredWorkers} onWhatsApp={openWhatsApp} />}
                        {activeTab === 'visitors' && <VisitorsTab visitors={filteredVisitors} />}
                        {activeTab === 'logs' && <LogsTab logs={filteredLogs} />}
                        {activeTab === 'subscription' && (
                            <SubscriptionTab
                                site={site}
                                subscription={subscription}
                                trialDaysLeft={trialDaysLeft}
                                selectedPlan={selectedPlan}
                                setSelectedPlan={setSelectedPlan}
                                trialDaysToAdd={trialDaysToAdd}
                                setTrialDaysToAdd={setTrialDaysToAdd}
                                notes={notes}
                                setNotes={setNotes}
                                saving={saving}
                                onSave={handleSave}
                                onWhatsApp={() => openWhatsApp()}
                                onPause={handlePause}
                                onResume={handleResume}
                            />
                        )}
                    </>
                )}
            </main>
        </div>
    );
}

// Overview Tab
function OverviewTab({ site, details }: { site: any; details: any }) {
    const [expandedContractors, setExpandedContractors] = useState<string[]>([]);
    const workers = details?.workers || [];
    const visitors = details?.visitors || [];
    const logs = details?.recentLogs || [];

    // Group workers by contractor
    const contractorGroups: Record<string, any[]> = {};
    workers.forEach((w: any) => {
        const contractor = w.contractor || 'Sin contratista';
        if (!contractorGroups[contractor]) contractorGroups[contractor] = [];
        contractorGroups[contractor].push(w);
    });

    const toggleContractor = (contractor: string) => {
        setExpandedContractors(prev =>
            prev.includes(contractor)
                ? prev.filter(c => c !== contractor)
                : [...prev, contractor]
        );
    };

    return (
        <div className="space-y-6">
            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-800 rounded-xl p-4 border border-white/10 text-center">
                    <Users className="w-6 h-6 text-blue-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">{workers.length}</p>
                    <p className="text-xs text-white/50">Trabajadores</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-white/10 text-center">
                    <UserCheck className="w-6 h-6 text-green-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">{visitors.length}</p>
                    <p className="text-xs text-white/50">Visitantes</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-white/10 text-center">
                    <Briefcase className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">{Object.keys(contractorGroups).length}</p>
                    <p className="text-xs text-white/50">Contratistas</p>
                </div>
                <div className="bg-slate-800 rounded-xl p-4 border border-white/10 text-center">
                    <Clock className="w-6 h-6 text-orange-400 mx-auto mb-2" />
                    <p className="text-2xl font-bold text-white">{logs.length}</p>
                    <p className="text-xs text-white/50">Accesos (últ. 100)</p>
                </div>
            </div>

            {/* Contractors breakdown - Expandable */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
                <h3 className="font-medium text-white mb-4 flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-purple-400" />
                    Trabajadores por Contratista
                    <span className="text-xs text-white/40 ml-auto">Clic para expandir</span>
                </h3>
                <div className="space-y-2">
                    {Object.entries(contractorGroups)
                        .sort((a, b) => b[1].length - a[1].length)
                        .map(([contractor, contractorWorkers]) => {
                            const isExpanded = expandedContractors.includes(contractor);
                            return (
                                <div key={contractor} className="bg-slate-700/30 rounded-xl overflow-hidden">
                                    <button
                                        onClick={() => toggleContractor(contractor)}
                                        className="w-full flex justify-between items-center p-3 hover:bg-slate-700/50 transition-colors"
                                    >
                                        <div className="flex items-center gap-2">
                                            <ChevronDown className={`w-4 h-4 text-white/50 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            <span className="text-white">{contractor}</span>
                                        </div>
                                        <span className="text-purple-400 font-medium">{(contractorWorkers as any[]).length} trabajadores</span>
                                    </button>
                                    {isExpanded && (
                                        <div className="px-3 pb-3 space-y-1">
                                            {(contractorWorkers as any[]).map((w: any) => (
                                                <div key={w.id} className="flex justify-between items-center p-2 bg-slate-800/50 rounded-lg text-sm">
                                                    <div>
                                                        <span className="text-white">{w.name || w.full_name}</span>
                                                        <span className="text-white/40 ml-2">CI: {w.ci}</span>
                                                    </div>
                                                    {w.role && (
                                                        <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded">
                                                            {w.role}
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
                <h3 className="font-medium text-white mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-orange-400" />
                    Actividad Reciente
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                    {logs.slice(0, 10).map((log: any) => (
                        <div key={log.id} className="flex justify-between items-center p-2 bg-slate-700/30 rounded-lg">
                            <div>
                                <p className="text-white text-sm">{log.name_snapshot}</p>
                                <p className="text-xs text-white/50">
                                    {format(new Date(log.entry_at), 'dd/MM/yyyy HH:mm', { locale: es })}
                                    {log.exit_at && ` → ${format(new Date(log.exit_at), 'HH:mm', { locale: es })}`}
                                </p>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded ${log.person_type === 'worker' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                                }`}>
                                {log.person_type === 'worker' ? 'Trabajador' : 'Visitante'}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Workers Tab
function WorkersTab({ workers, onWhatsApp }: { workers: any[]; onWhatsApp: (phone?: string) => void }) {
    return (
        <div className="space-y-3">
            {workers.length === 0 ? (
                <div className="text-center py-12 text-white/50">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>No se encontraron trabajadores</p>
                </div>
            ) : (
                workers.map((worker: any) => (
                    <div key={worker.id} className="p-4 bg-slate-800 rounded-xl border border-white/10">
                        <div className="flex justify-between items-start">
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-white">{worker.name || worker.full_name}</h4>
                                    {worker.contractor && (
                                        <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">
                                            {worker.contractor}
                                        </span>
                                    )}
                                </div>
                                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                                    <div>
                                        <span className="text-white/50">CI:</span>
                                        <span className="text-white ml-1">{worker.ci}</span>
                                    </div>
                                    {worker.phone && (
                                        <div>
                                            <span className="text-white/50">Tel:</span>
                                            <span className="text-white ml-1">{worker.phone}</span>
                                        </div>
                                    )}
                                    {worker.role && (
                                        <div>
                                            <span className="text-white/50">Rol:</span>
                                            <span className="text-white ml-1">{worker.role}</span>
                                        </div>
                                    )}
                                    {worker.insurance_expiry && (
                                        <div className="flex items-center gap-1">
                                            <Shield className="w-3 h-3 text-green-400" />
                                            <span className="text-white/50">Seguro:</span>
                                            <span className="text-white ml-1">
                                                {format(new Date(worker.insurance_expiry), 'dd/MM/yyyy')}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {worker.phone && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onWhatsApp(worker.phone)}
                                    className="text-green-400 hover:bg-green-500/10"
                                >
                                    <Phone className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}

// Visitors Tab
function VisitorsTab({ visitors }: { visitors: any[] }) {
    return (
        <div className="space-y-3">
            {visitors.length === 0 ? (
                <div className="text-center py-12 text-white/50">
                    <UserCheck className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>No se encontraron visitantes</p>
                </div>
            ) : (
                visitors.map((visitor: any) => (
                    <div key={visitor.id} className="p-4 bg-slate-800 rounded-xl border border-white/10">
                        <div className="flex justify-between items-start">
                            <div>
                                <h4 className="font-medium text-white">{visitor.name || visitor.full_name}</h4>
                                <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                    <div>
                                        <span className="text-white/50">CI:</span>
                                        <span className="text-white ml-1">{visitor.ci}</span>
                                    </div>
                                    {visitor.company && (
                                        <div>
                                            <span className="text-white/50">Empresa:</span>
                                            <span className="text-white ml-1">{visitor.company}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );
}

// Logs Tab
function LogsTab({ logs }: { logs: any[] }) {
    return (
        <div className="space-y-2">
            {logs.length === 0 ? (
                <div className="text-center py-12 text-white/50">
                    <Clock className="w-12 h-12 mx-auto mb-4 opacity-30" />
                    <p>No se encontraron registros de acceso</p>
                </div>
            ) : (
                <div className="bg-slate-800 rounded-xl border border-white/10 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-slate-700/50">
                            <tr>
                                <th className="text-left p-3 text-xs text-white/60 font-medium">Nombre</th>
                                <th className="text-left p-3 text-xs text-white/60 font-medium">CI</th>
                                <th className="text-left p-3 text-xs text-white/60 font-medium">Tipo</th>
                                <th className="text-left p-3 text-xs text-white/60 font-medium">Entrada</th>
                                <th className="text-left p-3 text-xs text-white/60 font-medium">Salida</th>
                                <th className="text-left p-3 text-xs text-white/60 font-medium">Duración</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {logs.map((log: any) => {
                                const entry = new Date(log.entry_at);
                                const exit = log.exit_at ? new Date(log.exit_at) : null;
                                const duration = exit ? Math.round((exit.getTime() - entry.getTime()) / (1000 * 60 * 60) * 10) / 10 : null;

                                return (
                                    <tr key={log.id} className="hover:bg-slate-700/30">
                                        <td className="p-3 text-sm text-white">{log.name_snapshot}</td>
                                        <td className="p-3 text-sm text-white/70">{log.ci_snapshot}</td>
                                        <td className="p-3">
                                            <span className={`text-xs px-2 py-0.5 rounded ${log.person_type === 'worker' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'
                                                }`}>
                                                {log.person_type === 'worker' ? 'Trabajador' : 'Visitante'}
                                            </span>
                                        </td>
                                        <td className="p-3 text-sm text-white/70">
                                            {format(entry, 'dd/MM HH:mm', { locale: es })}
                                        </td>
                                        <td className="p-3 text-sm text-white/70">
                                            {exit ? format(exit, 'HH:mm', { locale: es }) : '—'}
                                        </td>
                                        <td className="p-3 text-sm">
                                            {duration !== null ? (
                                                <span className={duration > 10 ? 'text-orange-400' : 'text-white/70'}>
                                                    {duration}h
                                                </span>
                                            ) : (
                                                <span className="text-yellow-400">En sitio</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// Subscription Tab
function SubscriptionTab({
    site,
    subscription,
    trialDaysLeft,
    selectedPlan,
    setSelectedPlan,
    trialDaysToAdd,
    setTrialDaysToAdd,
    notes,
    setNotes,
    saving,
    onSave,
    onWhatsApp,
    onPause,
    onResume
}: {
    site: any;
    subscription: any;
    trialDaysLeft: number;
    selectedPlan: string;
    setSelectedPlan: (p: string) => void;
    trialDaysToAdd: number;
    setTrialDaysToAdd: (d: number) => void;
    notes: string;
    setNotes: (n: string) => void;
    saving: boolean;
    onSave: () => void;
    onWhatsApp: () => void;
    onPause: () => void;
    onResume: () => void;
}) {
    return (
        <div className="max-w-2xl mx-auto space-y-6">
            {/* Current Status */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
                <h3 className="font-medium text-white mb-4 flex items-center gap-2">
                    <Crown className="w-5 h-5 text-purple-400" />
                    Estado Actual
                </h3>

                <div className="space-y-3">
                    <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-xl">
                        <span className="text-white/70">Plan</span>
                        <span className={`px-3 py-1 rounded-full text-sm font-medium ${subscription?.plan === 'pro' ? 'bg-purple-500/20 text-purple-400' :
                            subscription?.plan === 'enterprise' ? 'bg-blue-500/20 text-blue-400' :
                                'bg-white/10 text-white/50'
                            }`}>
                            {subscription?.plan || 'Sin plan'}
                        </span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-xl">
                        <span className="text-white/70">Estado</span>
                        <span className={`px-3 py-1 rounded-full text-sm ${subscription?.status === 'trial' ? 'bg-yellow-500/20 text-yellow-400' :
                            subscription?.status === 'active' ? 'bg-green-500/20 text-green-400' :
                            subscription?.status === 'paused' ? 'bg-orange-500/20 text-orange-400' :
                                'bg-red-500/20 text-red-400'
                            }`}>
                            {subscription?.status === 'trial' ? `Trial (${Math.max(0, trialDaysLeft)} días)` :
                                subscription?.status === 'active' ? 'Activo' :
                                subscription?.status === 'paused' ? 'Pausado' :
                                    subscription?.status || 'Desconocido'}
                        </span>
                    </div>

                    <div className="flex justify-between items-center p-3 bg-slate-700/50 rounded-xl">
                        <span className="text-white/70">Uso este mes</span>
                        <span className="text-white">
                            {subscription?.current_usage || 0} / {subscription?.monthly_limit || 100} registros
                        </span>
                    </div>
                </div>
            </div>

            {/* Change Plan */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
                <h3 className="font-medium text-white mb-4">Cambiar Plan</h3>
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { id: 'free', label: 'Free', price: '$0', limit: '100/mes' },
                        { id: 'pro', label: 'Pro', price: '$70', limit: '2000/mes' },
                        { id: 'enterprise', label: 'Enterprise', price: 'Custom', limit: 'Ilimitado' },
                    ].map(plan => (
                        <button
                            key={plan.id}
                            onClick={() => setSelectedPlan(plan.id)}
                            className={`p-4 rounded-xl text-center transition-all ${selectedPlan === plan.id
                                ? 'bg-purple-500 text-white ring-2 ring-purple-400'
                                : 'bg-slate-700 text-white/70 hover:bg-slate-600'
                                }`}
                        >
                            <p className="font-medium">{plan.label}</p>
                            <p className="text-lg font-bold mt-1">{plan.price}</p>
                            <p className="text-xs opacity-70">{plan.limit}</p>
                        </button>
                    ))}
                </div>
            </div>

            {/* Extend Trial */}
            {subscription?.status === 'trial' && (
                <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
                    <h3 className="font-medium text-white mb-4">Modificar Trial</h3>
                    <div className="flex items-center justify-center gap-4">
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => setTrialDaysToAdd(trialDaysToAdd - 7)}
                            className="border-white/20"
                        >
                            <Minus className="w-5 h-5" />
                        </Button>
                        <div className="text-center w-32">
                            <span className={`text-3xl font-bold ${trialDaysToAdd > 0 ? 'text-green-400' :
                                trialDaysToAdd < 0 ? 'text-red-400' : 'text-white'
                                }`}>
                                {trialDaysToAdd > 0 ? '+' : ''}{trialDaysToAdd}
                            </span>
                            <p className="text-xs text-white/50 mt-1">días</p>
                        </div>
                        <Button
                            variant="outline"
                            size="lg"
                            onClick={() => setTrialDaysToAdd(trialDaysToAdd + 7)}
                            className="border-white/20"
                        >
                            <Plus className="w-5 h-5" />
                        </Button>
                    </div>
                    {trialDaysToAdd !== 0 && (
                        <p className="text-center text-sm text-white/50 mt-3">
                            Nuevo vencimiento: {format(
                                new Date(new Date(subscription.trial_ends_at).getTime() + trialDaysToAdd * 24 * 60 * 60 * 1000),
                                'dd/MM/yyyy',
                                { locale: es }
                            )}
                        </p>
                    )}
                </div>
            )}

            {/* Notes */}
            <div className="bg-slate-800 rounded-2xl p-5 border border-white/10">
                <h3 className="font-medium text-white mb-4">Notas de Admin</h3>
                <Input
                    placeholder="Ej: Pagó por transferencia el 15/01, extendido trial por soporte..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="bg-slate-700 border-white/20 text-white"
                />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <Button
                    onClick={onSave}
                    disabled={saving || (selectedPlan === subscription?.plan && trialDaysToAdd === 0 && !notes)}
                    className="flex-1 bg-purple-500 hover:bg-purple-600 h-12"
                >
                    {saving ? <Spinner size="sm" /> : <Save className="w-5 h-5 mr-2" />}
                    Guardar Cambios
                </Button>
                {subscription?.status === 'paused' ? (
                    <Button
                        onClick={onResume}
                        disabled={saving}
                        className="bg-green-600 hover:bg-green-500 text-white h-12 px-6"
                    >
                        Reanudar
                    </Button>
                ) : (
                    <Button
                        onClick={onPause}
                        disabled={saving}
                        variant="destructive"
                        className="h-12 px-6"
                    >
                        Pausar
                    </Button>
                )}
                <Button
                    variant="outline"
                    onClick={onWhatsApp}
                    className="border-green-500/50 text-green-400 hover:bg-green-500/10 h-12"
                >
                    <MessageCircle className="w-5 h-5 mr-2" />
                    WhatsApp
                </Button>
            </div>
        </div>
    );
}
