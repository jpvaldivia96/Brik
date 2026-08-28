import { useState, useEffect, useMemo } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { SearchInput } from '@/components/ui/search-input';
import { Spinner } from '@/components/ui/spinner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useFeatureGate } from '@/hooks/useFeatureGate';
import { Shield, Search, AlertTriangle, Plus, CheckCircle, XCircle, Eye, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrustReport {
  id: string;
  ci: string;
  person_name: string;
  photo_url: string | null;
  contractor_name: string | null;
  severity: 'leve' | 'moderado' | 'grave';
  reason: string;
  category: string | null;
  reported_by_site_id: string | null;
  reported_by_user_id: string | null;
  reported_by_site_name: string | null;
  reported_at: string;
  is_active: boolean;
}

const SEVERITY_CONFIG = {
  grave: { label: 'Grave', emoji: '🔴', bg: 'bg-red-500/20', border: 'border-red-500/40', text: 'text-red-400' },
  moderado: { label: 'Moderado', emoji: '🟠', bg: 'bg-orange-500/20', border: 'border-orange-500/40', text: 'text-orange-400' },
  leve: { label: 'Leve', emoji: '🟡', bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', text: 'text-yellow-400' },
};

const CATEGORIES = [
  { value: 'robo', label: 'Robo / Hurto', defaultSeverity: 'grave' as const },
  { value: 'violencia', label: 'Violencia / Agresión', defaultSeverity: 'grave' as const },
  { value: 'armas', label: 'Portación de armas', defaultSeverity: 'grave' as const },
  { value: 'alcohol', label: 'Consumo de alcohol', defaultSeverity: 'moderado' as const },
  { value: 'drogas', label: 'Consumo de drogas', defaultSeverity: 'moderado' as const },
  { value: 'daño', label: 'Daño a propiedad', defaultSeverity: 'moderado' as const },
  { value: 'acoso', label: 'Acoso / Hostigamiento', defaultSeverity: 'moderado' as const },
  { value: 'insubordinacion', label: 'Insubordinación', defaultSeverity: 'leve' as const },
  { value: 'ausencia', label: 'Ausencia reiterada', defaultSeverity: 'leve' as const },
  { value: 'seguridad', label: 'Incumplimiento de seguridad', defaultSeverity: 'leve' as const },
  { value: 'otro', label: 'Otro', defaultSeverity: 'leve' as const },
];

type TabMode = 'buscar' | 'mis-reportes';

export default function TrustDatabasePanel() {
  const { currentSite } = useSite();
  const { user } = useAuth();
  const { toast } = useToast();
  const { canUse } = useFeatureGate();
  
  const [mode, setMode] = useState<TabMode>('buscar');
  const [reports, setReports] = useState<TrustReport[]>([]);
  const [myReports, setMyReports] = useState<TrustReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<string | null>(null);
  
  // Report modal state
  const [reportModal, setReportModal] = useState(false);
  const [reportForm, setReportForm] = useState({
    ci: '',
    person_name: '',
    photo_url: '',
    contractor_name: '',
    category: '',
    severity: 'moderado' as 'leve' | 'moderado' | 'grave',
    reason: '',
  });
  const [submitting, setSubmitting] = useState(false);
  
  // Detail modal
  const [detailReport, setDetailReport] = useState<TrustReport | null>(null);
  
  // Resolve modal
  const [resolveModal, setResolveModal] = useState<TrustReport | null>(null);
  const [resolveReason, setResolveReason] = useState('');

  const hasAccess = canUse('trust_database');

  // Fetch all active reports
  const fetchReports = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from('trust_reports')
      .select('*')
      .eq('is_active', true)
      .order('reported_at', { ascending: false })
      .limit(100);
    
    if (!error && data) {
      setReports(data);
    }
    setLoading(false);
  };

  // Fetch my site's reports
  const fetchMyReports = async () => {
    if (!currentSite) return;
    const { data } = await (supabase as any)
      .from('trust_reports')
      .select('*')
      .eq('reported_by_site_id', currentSite.id)
      .order('reported_at', { ascending: false });
    
    if (data) setMyReports(data);
  };

  useEffect(() => {
    if (hasAccess) {
      fetchReports();
      fetchMyReports();
    }
  }, [hasAccess, currentSite]);

  // Filtered reports
  const filteredReports = useMemo(() => {
    let list = mode === 'mis-reportes' ? myReports : reports;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => 
        r.person_name.toLowerCase().includes(q) ||
        r.ci.toLowerCase().includes(q) ||
        (r.contractor_name || '').toLowerCase().includes(q)
      );
    }
    
    if (severityFilter) {
      list = list.filter(r => r.severity === severityFilter);
    }
    
    return list;
  }, [reports, myReports, mode, searchQuery, severityFilter]);

  // Stats
  const stats = useMemo(() => ({
    total: reports.length,
    grave: reports.filter(r => r.severity === 'grave').length,
    moderado: reports.filter(r => r.severity === 'moderado').length,
    leve: reports.filter(r => r.severity === 'leve').length,
  }), [reports]);

  // Submit report
  const handleSubmitReport = async () => {
    if (!currentSite || !user) return;
    if (!reportForm.ci.trim() || !reportForm.person_name.trim() || !reportForm.reason.trim()) {
      toast({ title: 'Error', description: 'CI, nombre y motivo son obligatorios.', variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const { error } = await (supabase as any)
      .from('trust_reports')
      .insert({
        ci: reportForm.ci.trim(),
        person_name: reportForm.person_name.trim(),
        photo_url: reportForm.photo_url.trim() || null,
        contractor_name: reportForm.contractor_name.trim() || null,
        category: reportForm.category || null,
        severity: reportForm.severity,
        reason: reportForm.reason.trim(),
        reported_by_site_id: currentSite.id,
        reported_by_user_id: user.id,
        reported_by_site_name: currentSite.name,
      });

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Reporte enviado', description: 'El reporte se publicó en la Red de Seguridad.' });
      setReportModal(false);
      setReportForm({ ci: '', person_name: '', photo_url: '', contractor_name: '', category: '', severity: 'moderado', reason: '' });
      fetchReports();
      fetchMyReports();
    }
    setSubmitting(false);
  };

  // Resolve report
  const handleResolve = async () => {
    if (!resolveModal) return;
    await (supabase as any)
      .from('trust_reports')
      .update({ 
        is_active: false, 
        resolved_at: new Date().toISOString(),
        resolved_reason: resolveReason.trim() || 'Resuelto'
      })
      .eq('id', resolveModal.id);
    
    toast({ title: 'Reporte resuelto', description: 'El reporte fue marcado como resuelto.' });
    setResolveModal(null);
    setResolveReason('');
    fetchReports();
    fetchMyReports();
  };

  // Category selection auto-sets severity
  const handleCategoryChange = (value: string) => {
    const cat = CATEGORIES.find(c => c.value === value);
    setReportForm(prev => ({
      ...prev,
      category: value,
      severity: cat?.defaultSeverity || prev.severity,
    }));
  };

  if (!hasAccess) {
    return (
      <div className="text-center py-12 space-y-4">
        <Shield className="w-16 h-16 text-white/20 mx-auto" />
        <h3 className="text-lg font-medium text-white/60">Red de Seguridad</h3>
        <p className="text-sm text-white/40 max-w-sm mx-auto">
          Base de datos compartida de reportes entre obras. Disponible en el plan Pro.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-purple-400" />
            Red de Seguridad
          </h2>
          <p className="text-xs text-white/40 mt-0.5">
            {stats.total} reportes activos en la plataforma
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setReportModal(true)}
          className="gap-1.5 bg-red-600 hover:bg-red-700"
        >
          <Plus className="w-4 h-4" />
          Reportar
        </Button>
      </div>

      {/* Severity summary badges */}
      <div className="grid grid-cols-3 gap-2">
        {(['grave', 'moderado', 'leve'] as const).map(sev => {
          const cfg = SEVERITY_CONFIG[sev];
          const count = stats[sev];
          const isActive = severityFilter === sev;
          return (
            <button
              key={sev}
              onClick={() => setSeverityFilter(isActive ? null : sev)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-xl border justify-center transition-all text-sm",
                isActive
                  ? `${cfg.bg} ${cfg.border} ${cfg.text} ring-2 ring-current/30`
                  : "bg-card/30 border-border text-white/60 hover:bg-card/50"
              )}
            >
              <span>{cfg.emoji}</span>
              <span className="font-bold">{count}</span>
              <span className="text-xs hidden sm:inline">{cfg.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setMode('buscar')}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors",
            mode === 'buscar'
              ? "bg-primary text-primary-foreground"
              : "text-white/60 hover:text-white/90 bg-white/5 hover:bg-white/10"
          )}
        >
          <Search className="w-4 h-4 inline mr-1.5" />
          Buscar ({reports.length})
        </button>
        <button
          onClick={() => setMode('mis-reportes')}
          className={cn(
            "flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors",
            mode === 'mis-reportes'
              ? "bg-primary text-primary-foreground"
              : "text-white/60 hover:text-white/90 bg-white/5 hover:bg-white/10"
          )}
        >
          <Filter className="w-4 h-4 inline mr-1.5" />
          Mis Reportes ({myReports.length})
        </button>
      </div>

      {/* Search */}
      <SearchInput
        placeholder="Buscar por CI, nombre o contratista..."
        value={searchQuery}
        onChange={e => setSearchQuery(e.target.value)}
        containerClassName="w-full"
        className="bg-white/10 border-white/20 text-white placeholder:text-white/40"
      />

      {/* Report list */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : filteredReports.length === 0 ? (
        <div className="text-center py-12 text-white/40">
          {searchQuery ? 'No se encontraron resultados' : 'No hay reportes'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredReports.map(report => {
            const cfg = SEVERITY_CONFIG[report.severity];
            const isOwnReport = report.reported_by_site_id === currentSite?.id;
            return (
              <button
                key={report.id}
                onClick={() => setDetailReport(report)}
                className="w-full text-left p-4 rounded-xl border border-border/50 bg-card/30 hover:bg-card/50 transition-all space-y-2"
              >
                <div className="flex items-start gap-3">
                  {/* Photo */}
                  {report.photo_url ? (
                    <img src={report.photo_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-white/50">
                        {report.person_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                      </span>
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-white truncate">{report.person_name}</span>
                      <span className={cn("text-xs px-2 py-0.5 rounded-full border font-medium", cfg.bg, cfg.border, cfg.text)}>
                        {cfg.emoji} {cfg.label}
                      </span>
                    </div>
                    <p className="text-xs text-white/50 mt-0.5">CI: {report.ci}</p>
                    {report.contractor_name && (
                      <p className="text-xs text-white/40">{report.contractor_name}</p>
                    )}
                  </div>
                </div>
                
                {/* Reason preview */}
                <div className="text-sm text-white/60 line-clamp-2">
                  {report.category && (
                    <span className="text-white/40 mr-1">
                      {CATEGORIES.find(c => c.value === report.category)?.label || report.category}:
                    </span>
                  )}
                  {report.reason}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-white/30">
                    {new Date(report.reported_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {isOwnReport && (
                    <span className="text-[11px] text-purple-400 font-medium">Tu obra</span>
                  )}
                  {!report.is_active && (
                    <span className="text-[11px] text-green-400">✓ Resuelto</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      <Dialog open={!!detailReport} onOpenChange={open => !open && setDetailReport(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {detailReport && (
                <>
                  <span>{SEVERITY_CONFIG[detailReport.severity].emoji}</span>
                  Reporte de Confianza
                </>
              )}
            </DialogTitle>
          </DialogHeader>
          {detailReport && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {detailReport.photo_url ? (
                  <img src={detailReport.photo_url} alt="" className="w-16 h-16 rounded-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-lg font-medium text-muted-foreground">
                      {detailReport.person_name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </span>
                  </div>
                )}
                <div>
                  <p className="font-semibold text-lg">{detailReport.person_name}</p>
                  <p className="text-sm text-muted-foreground">CI: {detailReport.ci}</p>
                  {detailReport.contractor_name && (
                    <p className="text-sm text-muted-foreground">{detailReport.contractor_name}</p>
                  )}
                </div>
              </div>

              <div className={cn("p-3 rounded-lg border", SEVERITY_CONFIG[detailReport.severity].bg, SEVERITY_CONFIG[detailReport.severity].border)}>
                <p className={cn("text-sm font-medium", SEVERITY_CONFIG[detailReport.severity].text)}>
                  {SEVERITY_CONFIG[detailReport.severity].emoji} {SEVERITY_CONFIG[detailReport.severity].label}
                  {detailReport.category && ` — ${CATEGORIES.find(c => c.value === detailReport.category)?.label || detailReport.category}`}
                </p>
                <p className="text-sm mt-2">{detailReport.reason}</p>
              </div>

              <p className="text-xs text-muted-foreground">
                Reportado el {new Date(detailReport.reported_at).toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>

              {/* Resolve button (only for own reports) */}
              {detailReport.reported_by_site_id === currentSite?.id && detailReport.is_active && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  onClick={() => {
                    setResolveModal(detailReport);
                    setDetailReport(null);
                  }}
                >
                  <CheckCircle className="w-4 h-4" />
                  Marcar como Resuelto
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Report Modal */}
      <Dialog open={reportModal} onOpenChange={setReportModal}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Reportar a la Red de Seguridad</DialogTitle>
            <DialogDescription>
              Este reporte será visible para todas las obras de la plataforma.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>CI *</Label>
                <Input
                  value={reportForm.ci}
                  onChange={e => setReportForm(prev => ({ ...prev, ci: e.target.value }))}
                  placeholder="Ej: 12345678"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre completo *</Label>
                <Input
                  value={reportForm.person_name}
                  onChange={e => setReportForm(prev => ({ ...prev, person_name: e.target.value }))}
                  placeholder="Ej: Juan Pérez"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Contratista (opcional)</Label>
              <Input
                value={reportForm.contractor_name}
                onChange={e => setReportForm(prev => ({ ...prev, contractor_name: e.target.value }))}
                placeholder="Ej: MARISCAL"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <select
                value={reportForm.category}
                onChange={e => handleCategoryChange(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
              >
                <option value="">Seleccionar...</option>
                {CATEGORIES.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Severidad</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['leve', 'moderado', 'grave'] as const).map(sev => {
                  const cfg = SEVERITY_CONFIG[sev];
                  return (
                    <button
                      key={sev}
                      type="button"
                      onClick={() => setReportForm(prev => ({ ...prev, severity: sev }))}
                      className={cn(
                        "py-2 px-3 rounded-lg border text-sm font-medium transition-all",
                        reportForm.severity === sev
                          ? `${cfg.bg} ${cfg.border} ${cfg.text}`
                          : "border-border bg-card/30 text-white/50 hover:bg-card/50"
                      )}
                    >
                      {cfg.emoji} {cfg.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Motivo / Descripción *</Label>
              <Textarea
                value={reportForm.reason}
                onChange={e => setReportForm(prev => ({ ...prev, reason: e.target.value }))}
                placeholder="Describir el incidente con detalle..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setReportModal(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmitReport}
              disabled={submitting}
              className="bg-red-600 hover:bg-red-700 gap-1.5"
            >
              {submitting ? <Spinner size="sm" /> : <AlertTriangle className="w-4 h-4" />}
              Publicar Reporte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Resolve Modal */}
      <Dialog open={!!resolveModal} onOpenChange={open => !open && setResolveModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Reporte</DialogTitle>
            <DialogDescription>
              Marcar este reporte como resuelto lo eliminará del Banco de Confianza.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label>Motivo de resolución (opcional)</Label>
            <Textarea
              value={resolveReason}
              onChange={e => setResolveReason(e.target.value)}
              placeholder="Ej: Situación resuelta, fue un malentendido..."
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveModal(null)}>Cancelar</Button>
            <Button onClick={handleResolve} className="gap-1.5">
              <CheckCircle className="w-4 h-4" />
              Resolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
