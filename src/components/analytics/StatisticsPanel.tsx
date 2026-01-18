import { useEffect, useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Area, AreaChart, Legend } from 'recharts';
import { Users, TrendingUp, Calendar, HardHat, Clock, Award, Shield, Trophy, AlertTriangle, Cloud, Target, TrendingDown } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Progress } from '@/components/ui/progress';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d'];

export default function StatisticsPanel() {
    const { currentSite } = useSite();
    const [loading, setLoading] = useState(true);

    // Existing state
    const [dailyStats, setDailyStats] = useState<any[]>([]);
    const [contractorStats, setContractorStats] = useState<any[]>([]);
    const [weeklyComparison, setWeeklyComparison] = useState<any[]>([]);

    // NEW: Phase 1 state
    const [heatmapData, setHeatmapData] = useState<any[]>([]);
    const [avgHoursData, setAvgHoursData] = useState<any[]>([]);
    const [punctualityData, setPunctualityData] = useState<any[]>([]);
    const [complianceData, setComplianceData] = useState<any>(null);
    const [daysWithoutAccidents, setDaysWithoutAccidents] = useState<number>(0);
    const [hallOfFame, setHallOfFame] = useState<any>({ punctual: null, consistent: null, veteran: null });

    // NEW: Phase 2 state
    const [weatherData, setWeatherData] = useState<any[]>([]);
    const [turnoverData, setTurnoverData] = useState<any[]>([]);
    const [anomalies, setAnomalies] = useState<any[]>([]);
    const [progressData, setProgressData] = useState<any[]>([]);
    const [prediction, setPrediction] = useState<any[]>([]);

    useEffect(() => {
        if (currentSite) {
            fetchStats();
        }
    }, [currentSite]);

    const fetchStats = async () => {
        setLoading(true);
        try {
            // EXISTING: Fetch Daily Attendance
            const { data: daily } = await (supabase.rpc as any)('get_daily_attendance_stats', {
                target_site_id: currentSite?.id,
                days_lookback: 14
            });

            // EXISTING: Fetch Contractor Distribution
            const { data: contractors } = await (supabase.rpc as any)('get_contractor_distribution', {
                target_site_id: currentSite?.id
            });

            // EXISTING: Fetch Weekly Comparison
            const { data: weekly } = await (supabase.rpc as any)('get_weekly_comparison', {
                target_site_id: currentSite?.id
            });

            setDailyStats(daily || []);
            setContractorStats(contractors || []);
            setWeeklyComparison(weekly || []);

            // NEW: Phase 1 - Fetch all new analytics
            await fetchPhase1Analytics();
            await fetchPhase2Analytics();

        } catch (error) {
            console.error('Error fetching stats:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPhase1Analytics = async () => {
        try {
            // 1. Heatmap
            const { data: heatmap } = await (supabase.rpc as any)('get_hourly_heatmap', {
                target_site_id: currentSite?.id,
                days_back: 14
            });
            setHeatmapData(heatmap || []);

            // 2. Average Hours
            const { data: avgHours } = await (supabase.rpc as any)('get_avg_hours_by_contractor', {
                target_site_id: currentSite?.id,
                days_back: 30
            });
            setAvgHoursData(avgHours || []);

            // 3. Punctuality
            const { data: punctuality } = await (supabase.rpc as any)('get_punctuality_leaderboard', {
                target_site_id: currentSite?.id,
                cutoff_time: '08:00',
                days_back: 30
            });
            setPunctualityData(punctuality || []);

            // 4. Compliance Dashboard (Query workers_profile directly)
            const { data: workers } = await supabase
                .from('workers_profile')
                .select('insurance_expiry, induction_date, person_id, people!inner(site_id, photo_url)')
                .eq('people.site_id', currentSite?.id);

            const now = new Date();
            const withInsurance = workers?.filter(w => w.insurance_expiry && new Date(w.insurance_expiry) > now).length || 0;
            const withInduction = workers?.filter(w => w.induction_date).length || 0;
            const withPhoto = workers?.filter(w => w.people?.photo_url).length || 0;
            const total = workers?.length || 1;

            setComplianceData({
                insurance_pct: (withInsurance / total) * 100,
                induction_pct: (withInduction / total) * 100,
                photo_pct: (withPhoto / total) * 100
            });

            // 5. Days Without Accidents
            const { data: daysCount } = await (supabase.rpc as any)('get_days_without_accidents', {
                target_site_id: currentSite?.id
            });
            setDaysWithoutAccidents(daysCount || 0);

            // 6. Hall of Fame
            const { data: punctualWorker } = await (supabase.rpc as any)('get_most_punctual_worker', {
                target_site_id: currentSite?.id
            });
            const { data: consistentWorker } = await (supabase.rpc as any)('get_most_consistent_worker', {
                target_site_id: currentSite?.id
            });
            const { data: veteranWorker } = await (supabase.rpc as any)('get_veteran_worker', {
                target_site_id: currentSite?.id
            });

            setHallOfFame({
                punctual: punctualWorker?.[0] || null,
                consistent: consistentWorker?.[0] || null,
                veteran: veteranWorker?.[0] || null
            });

        } catch (error) {
            console.error('Error fetching Phase 1 analytics:', error);
        }
    };

    const fetchPhase2Analytics = async () => {
        try {
            // 1. Weather Correlation
            const { data: weather } = await (supabase.rpc as any)('get_weather_correlation', {
                target_site_id: currentSite?.id,
                days_back: 30
            });
            setWeatherData(weather || []);

            // 2. Turnover
            const { data: turnover } = await (supabase.rpc as any)('get_monthly_turnover', {
                target_site_id: currentSite?.id,
                months_back: 6
            });
            setTurnoverData(turnover || []);

            // 3. Anomalies
            const { data: anomalyList } = await (supabase.rpc as any)('get_anomalies', {
                target_site_id: currentSite?.id
            });
            setAnomalies(anomalyList || []);

            // 4. Progress vs Target
            const { data: progress } = await (supabase.rpc as any)('get_progress_vs_target', {
                target_site_id: currentSite?.id,
                expected_daily_attendance: 50, // Default, should be setting
                days_back: 14
            });
            setProgressData(progress || []);

            // 5. Simple Prediction (client-side)
            if (dailyStats.length >= 7) {
                const last7 = dailyStats.slice(-7);
                const avgGrowth = last7.reduce((acc, curr, idx) => {
                    if (idx === 0) return 0;
                    return acc + (curr.count - last7[idx - 1].count);
                }, 0) / 6;

                const forecast = [];
                const lastCount = dailyStats[dailyStats.length - 1].count;
                for (let i = 1; i <= 7; i++) {
                    const predictedCount = Math.max(0, Math.round(lastCount + (avgGrowth * i)));
                    const futureDate = new Date();
                    futureDate.setDate(futureDate.getDate() + i);
                    forecast.push({
                        date: futureDate.toISOString().split('T')[0],
                        predicted_count: predictedCount,
                        is_forecast: true
                    });
                }
                setPrediction(forecast);
            }

        } catch (error) {
            console.error('Error fetching Phase 2 analytics:', error);
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

    // Helper function for compliance colors
    const getComplianceColor = (pct: number) => {
        if (pct >= 90) return 'text-green-500';
        if (pct >= 70) return 'text-yellow-500';
        return 'text-red-500';
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Panel de Estadísticas</h2>
                    <p className="text-muted-foreground">Análisis de asistencia y operaciones en tiempo real</p>
                </div>
            </div>

            {/* ==================== EXISTING KPI CARDS ==================== */}
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
                        <CardTitle className="text-sm font-medium">Días Sin Accidentes</CardTitle>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{daysWithoutAccidents}</div>
                        <p className="text-xs text-muted-foreground">
                            {daysWithoutAccidents >= 30 ? '🎉 Excelente récord!' : 'Mantener la seguridad'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* ==================== EXISTING MAIN CHARTS ==================== */}
            {/* Daily Trend */}
            <Card>
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
            <Card>
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

            {/* ==================== NEW: HALL OF FAME ==================== */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Trophy className="h-5 w-5 text-yellow-500" />
                            🥇 Más Puntual
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {hallOfFame.punctual ? (
                            <div className="text-center">
                                {hallOfFame.punctual.photo_url && (
                                    <img src={hallOfFame.punctual.photo_url} alt="" className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-yellow-500" />
                                )}
                                <p className="font-bold text-lg">{hallOfFame.punctual.full_name}</p>
                                <p className="text-sm text-muted-foreground">{hallOfFame.punctual.contractor}</p>
                                <p className="text-2xl font-bold text-yellow-500 mt-2">{hallOfFame.punctual.punctuality_pct}%</p>
                                <p className="text-xs text-muted-foreground">Puntualidad</p>
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground">Sin datos suficientes</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border-blue-500/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Award className="h-5 w-5 text-blue-500" />
                            🥈 Más Constante
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {hallOfFame.consistent ? (
                            <div className="text-center">
                                {hallOfFame.consistent.photo_url && (
                                    <img src={hallOfFame.consistent.photo_url} alt="" className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-blue-500" />
                                )}
                                <p className="font-bold text-lg">{hallOfFame.consistent.full_name}</p>
                                <p className="text-sm text-muted-foreground">{hallOfFame.consistent.contractor}</p>
                                <p className="text-2xl font-bold text-blue-500 mt-2">{hallOfFame.consistent.days_worked}</p>
                                <p className="text-xs text-muted-foreground">Días trabajados (último mes)</p>
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground">Sin datos suficientes</p>
                        )}
                    </CardContent>
                </Card>

                <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Users className="h-5 w-5 text-purple-500" />
                            🥉 Veterano
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {hallOfFame.veteran ? (
                            <div className="text-center">
                                {hallOfFame.veteran.photo_url && (
                                    <img src={hallOfFame.veteran.photo_url} alt="" className="w-20 h-20 rounded-full mx-auto mb-3 border-2 border-purple-500" />
                                )}
                                <p className="font-bold text-lg">{hallOfFame.veteran.full_name}</p>
                                <p className="text-sm text-muted-foreground">{hallOfFame.veteran.contractor}</p>
                                <p className="text-2xl font-bold text-purple-500 mt-2">{hallOfFame.veteran.days_since_induction}</p>
                                <p className="text-xs text-muted-foreground">Días desde inducción</p>
                            </div>
                        ) : (
                            <p className="text-center text-muted-foreground">Sin datos suficientes</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* ==================== NEW: COMPLIANCE DASHBOARD ==================== */}
            {
                complianceData && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Shield className="h-5 w-5" />
                                Dashboard de Cumplimiento
                            </CardTitle>
                            <CardDescription>Porcentaje de trabajadores con documentación completa</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-3 gap-6">
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-sm font-medium">Seguro Vigente</span>
                                        <span className={`text-sm font-bold ${getComplianceColor(complianceData.insurance_pct)}`}>
                                            {complianceData.insurance_pct.toFixed(0)}%
                                        </span>
                                    </div>
                                    <Progress value={complianceData.insurance_pct} className="h-2" />
                                </div>
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-sm font-medium">Inducción Completa</span>
                                        <span className={`text-sm font-bold ${getComplianceColor(complianceData.induction_pct)}`}>
                                            {complianceData.induction_pct.toFixed(0)}%
                                        </span>
                                    </div>
                                    <Progress value={complianceData.induction_pct} className="h-2" />
                                </div>
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-sm font-medium">Foto Registrada</span>
                                        <span className={`text-sm font-bold ${getComplianceColor(complianceData.photo_pct)}`}>
                                            {complianceData.photo_pct.toFixed(0)}%
                                        </span>
                                    </div>
                                    <Progress value={complianceData.photo_pct} className="h-2" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )
            }

            {/* ==================== NEW: PUNCTUALITY LEADERBOARD ==================== */}
            {
                punctualityData.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="h-5 w-5" />
                                Ranking de Puntualidad
                            </CardTitle>
                            <CardDescription>Top 10 trabajadores más puntuales (antes de las 8:00 AM)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {punctualityData.map((worker, idx) => (
                                    <div key={idx} className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <span className="text-lg font-bold text-muted-foreground w-6">{idx + 1}</span>
                                            <div>
                                                <p className="font-medium">{worker.full_name}</p>
                                                <p className="text-sm text-muted-foreground">{worker.contractor}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-bold text-primary">{worker.punctuality_pct}%</p>
                                            <p className="text-xs text-muted-foreground">{worker.on_time_count}/{worker.total_count} a tiempo</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )
            }

            {/* ==================== NEW: AVERAGE HOURS BY CONTRACTOR ==================== */}
            {
                avgHoursData.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Tiempo Promedio de Permanencia por Contratista</CardTitle>
                            <CardDescription>Promedio de horas trabajadas por empresa (último mes)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[400px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={avgHoursData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                        <XAxis dataKey="contractor" angle={-45} textAnchor="end" height={100} stroke="#888888" fontSize={10} />
                                        <YAxis stroke="#888888" label={{ value: 'Horas', angle: -90, position: 'insideLeft' }} />
                                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                                        <Bar dataKey="avg_hours" fill="#8884d8" radius={[8, 8, 0, 0]}>
                                            {avgHoursData.map((entry, index) => (
                                                <Cell
                                                    key={`cell-${index}`}
                                                    fill={
                                                        entry.avg_hours < 6 ? '#ef4444' :
                                                            entry.avg_hours > 12 ? '#f59e0b' :
                                                                '#10b981'
                                                    }
                                                />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                )
            }

            {/* ==================== NEW: TURNOVER ANALYSIS ==================== */}
            {
                turnoverData.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <TrendingUp className="h-5 w-5" />
                                Tasa de Rotación Mensual
                            </CardTitle>
                            <CardDescription>Trabajadores nuevos vs inactivos por mes</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={turnoverData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                        <XAxis dataKey="month" stroke="#888888" fontSize={12} />
                                        <YAxis stroke="#888888" />
                                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                                        <Legend />
                                        <Bar dataKey="new_workers" fill="#10b981" name="Nuevos" />
                                        <Bar dataKey="inactive_workers" fill="#ef4444" name="Inactivos" />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                )
            }

            {/* ==================== NEW: SMART ALERTS ==================== */}
            {
                anomalies.length > 0 && (
                    <Card className="border-orange-500/30">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-orange-500" />
                                Alertas Predictivas Inteligentes
                            </CardTitle>
                            <CardDescription>Anomalías detectadas automáticamente</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {anomalies.map((anomaly, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-4 rounded-lg border ${anomaly.severity === 'high' ? 'border-red-500/50 bg-red-500/10' :
                                            anomaly.severity === 'medium' ? 'border-yellow-500/50 bg-yellow-500/10' :
                                                'border-blue-500/50 bg-blue-500/10'
                                            }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <AlertTriangle
                                                className={`h-5 w-5 mt-0.5 ${anomaly.severity === 'high' ? 'text-red-500' :
                                                    anomaly.severity === 'medium' ? 'text-yellow-500' :
                                                        'text-blue-500'
                                                    }`}
                                            />
                                            <div>
                                                <p className="font-medium">{anomaly.description}</p>
                                                <p className="text-sm text-muted-foreground mt-1">Afectado: {anomaly.affected_entity}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )
            }

            {/* ==================== NEW: PREDICTION ==================== */}
            {
                prediction.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Target className="h-5 w-5" />
                                Predicción de Asistencia (Próximos 7 días)
                            </CardTitle>
                            <CardDescription>Proyección basada en tendencia de últimos 7 días</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={[...dailyStats, ...prediction]}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                        <XAxis dataKey="date" stroke="#888888" fontSize={12} tickFormatter={(value) => value.slice(5)} />
                                        <YAxis stroke="#888888" />
                                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                                        <Legend />
                                        <Line type="monotone" dataKey="count" stroke="#adfa1d" strokeWidth={2} name="Real" />
                                        <Line
                                            type="monotone"
                                            dataKey="predicted_count"
                                            stroke="#3b82f6"
                                            strokeWidth={2}
                                            strokeDasharray="5 5"
                                            name="Predicción"
                                        />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                )
            }

            {/* ==================== NEW: PROGRESS VS TARGET ==================== */}
            {
                progressData.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Target className="h-5 w-5" />
                                Progreso vs Planificación
                            </CardTitle>
                            <CardDescription>Asistencia real vs objetivo diario (50 personas)</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={progressData}>
                                        <defs>
                                            <linearGradient id="colorActual" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#10b981" stopOpacity={0.8} />
                                                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                                        <XAxis dataKey="date" stroke="#888888" fontSize={12} tickFormatter={(value) => value.slice(5)} />
                                        <YAxis stroke="#888888" />
                                        <Tooltip contentStyle={{ backgroundColor: '#1f2937', borderColor: '#374151', color: '#fff' }} />
                                        <Legend />
                                        <Area type="monotone" dataKey="actual_attendance" stroke="#10b981" fillOpacity={1} fill="url(#colorActual)" name="Real" />
                                        <Line type="monotone" dataKey="target_attendance" stroke="#ef4444" strokeWidth={2} strokeDasharray="5 5" name="Objetivo" dot={false} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                )
            }
        </div >
    );
}
