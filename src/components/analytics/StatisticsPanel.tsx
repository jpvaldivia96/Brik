import { useEffect, useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { Users, TrendingUp, Calendar, HardHat } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function StatisticsPanel() {
    const { currentSite } = useSite();
    const [loading, setLoading] = useState(true);
    const [dailyStats, setDailyStats] = useState<any[]>([]);
    const [contractorStats, setContractorStats] = useState<any[]>([]);
    const [weeklyComparison, setWeeklyComparison] = useState<any[]>([]);

    useEffect(() => {
        if (currentSite) {
            fetchStats();
        }
    }, [currentSite]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            // Fetch Daily Attendance
            const { data: daily } = await (supabase.rpc as any)('get_daily_attendance_stats', {
                target_site_id: currentSite?.id,
                days_lookback: 14
            });

            // Fetch Contractor Distribution
            const { data: contractors } = await (supabase.rpc as any)('get_contractor_distribution', {
                target_site_id: currentSite?.id
            });

            // Fetch Weekly Comparison
            const { data: weekly } = await (supabase.rpc as any)('get_weekly_comparison', {
                target_site_id: currentSite?.id
            });

            setDailyStats(daily || []);
            setContractorStats(contractors || []);
            setWeeklyComparison(weekly || []);

        } catch (error) {
            console.error('Error fetching stats:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <div className="flex justify-center items-center h-64"><Spinner size="lg" /></div>;
    }

    // Calculate generic stats
    const todayCount = dailyStats.length > 0 ? dailyStats[dailyStats.length - 1].count : 0;
    const weeklyTotal = weeklyComparison.find(w => w.period === 'Esta Semana')?.count || 0;
    const lastWeeklyTotal = weeklyComparison.find(w => w.period === 'Semana Pasada')?.count || 0;
    const growth = lastWeeklyTotal > 0 ? ((weeklyTotal - lastWeeklyTotal) / lastWeeklyTotal) * 100 : 0;

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Panel de Estadísticas</h2>
                    <p className="text-muted-foreground">Análisis de asistencia y operaciones en tiempo real</p>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Asistencia Hoy</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{todayCount}</div>
                        <p className="text-xs text-muted-foreground">Personas únicas en obra</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Semanal</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{weeklyTotal}</div>
                        <p className={`text-xs ${growth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                            {growth > 0 ? '+' : ''}{growth.toFixed(1)}% vs semana pasada
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Contratistas Activos</CardTitle>
                        <HardHat className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{contractorStats.length}</div>
                        <p className="text-xs text-muted-foreground">Empresas presentes esta semana</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Días Operativos</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">14</div>
                        <p className="text-xs text-muted-foreground">Últimos 14 días analizados</p>
                    </CardContent>
                </Card>
            </div>

            {/* Main Charts */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                {/* Daily Trend */}
                <Card className="col-span-4">
                    <CardHeader>
                        <CardTitle>Tendencia de Asistencia</CardTitle>
                        <CardDescription>Flujo diario de personal (últimos 14 días)</CardDescription>
                    </CardHeader>
                    <CardContent className="pl-2">
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={dailyStats}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                    <XAxis dataKey="date" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => value.slice(5)} />
                                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                                        itemStyle={{ color: '#fff' }}
                                    />
                                    <Line type="monotone" dataKey="count" stroke="#adfa1d" strokeWidth={2} activeDot={{ r: 8 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Top Contractors */}
                <Card className="col-span-3">
                    <CardHeader>
                        <CardTitle>Top Contratistas</CardTitle>
                        <CardDescription>Empresas con mayor presencia esta semana</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart layout="vertical" data={contractorStats} margin={{ top: 0, right: 30, left: 20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#333" />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" width={100} stroke="#888888" fontSize={11} tickLine={false} axisLine={false} />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }}
                                    />
                                    <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]}>
                                        {contractorStats.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
