import { useState, useEffect, useMemo } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { FileText, Download, MessageSquare, Filter, Calendar, Building2, User, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type FilterType = 'all' | 'contractor' | 'worker' | 'visitor';

interface Person {
  id: string;
  full_name: string;
  ci: string;
  type: string;
  contractor: string | null;
}

export default function ReportsTab() {
  const { currentSite } = useSite();
  const { toast } = useToast();

  // Date filters
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Filter type
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [selectedContractor, setSelectedContractor] = useState<string>('');
  const [selectedPersonId, setSelectedPersonId] = useState<string>('all');

  // Data
  const [people, setPeople] = useState<Person[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Load people for filters
  useEffect(() => {
    const loadPeople = async () => {
      if (!currentSite) return;

      const { data } = await supabase
        .from('people')
        .select('id, full_name, ci, type, contractor')
        .eq('site_id', currentSite.id)
        .order('full_name');

      setPeople(data || []);
      setLoadingPeople(false);
    };

    loadPeople();
  }, [currentSite]);

  // Get unique contractors
  const contractors = useMemo(() => {
    const set = new Set<string>();
    people.forEach(p => {
      if (p.contractor) set.add(p.contractor);
    });
    return Array.from(set).sort();
  }, [people]);

  // Filter people based on type
  const filteredPeople = useMemo(() => {
    if (filterType === 'worker') {
      return people.filter(p => p.type === 'worker');
    } else if (filterType === 'visitor') {
      return people.filter(p => p.type === 'visitor');
    } else if (filterType === 'contractor' && selectedContractor) {
      return people.filter(p => p.contractor === selectedContractor);
    }
    return people;
  }, [people, filterType, selectedContractor]);

  const generateReportData = async () => {
    if (!currentSite || !dateFrom || !dateTo) {
      console.log('Missing required data:', { currentSite: !!currentSite, dateFrom, dateTo });
      return null;
    }

    const startDate = new Date(dateFrom);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);

    console.log('Generating report with params:', {
      siteId: currentSite.id,
      siteName: currentSite.name,
      dateFrom: startDate.toISOString(),
      dateTo: endDate.toISOString(),
      filterType,
      selectedContractor,
      selectedPersonId
    });

    // First, let's check if there are ANY logs for this site
    const { data: allLogs, count } = await supabase
      .from('access_logs')
      .select('*', { count: 'exact' })
      .eq('site_id', currentSite.id)
      .limit(5);

    console.log('Total logs for site (sample):', { count, sample: allLogs });

    // Build main query
    let query = supabase
      .from('access_logs')
      .select('*')
      .eq('site_id', currentSite.id)
      .gte('entry_at', startDate.toISOString())
      .lte('entry_at', endDate.toISOString());

    // Apply filters
    if (filterType === 'contractor' && selectedContractor) {
      query = query.eq('contractor_snapshot', selectedContractor);
    } else if (filterType === 'worker') {
      query = query.eq('type_snapshot', 'worker');
    } else if (filterType === 'visitor') {
      query = query.eq('type_snapshot', 'visitor');
    }

    if (selectedPersonId && selectedPersonId !== 'all') {
      query = query.eq('person_id', selectedPersonId);
    }

    const { data: logs, error } = await query.order('entry_at', { ascending: true });

    console.log('Report Query Result:', {
      logsCount: logs?.length || 0,
      error,
      firstLog: logs?.[0],
      lastLog: logs?.[logs?.length - 1]
    });

    // Calculate stats
    const totalEntries = (logs || []).length;
    const totalExits = (logs || []).filter(l => l.exit_at).length;
    const totalHours = (logs || []).reduce((acc, log) => {
      if (log.exit_at) {
        const hours = (new Date(log.exit_at).getTime() - new Date(log.entry_at).getTime()) / (1000 * 60 * 60);
        return acc + hours;
      }
      return acc;
    }, 0);

    // Group by day
    const byDay: Record<string, { entries: number; exits: number }> = {};
    (logs || []).forEach(log => {
      const day = log.entry_at.split('T')[0];
      if (!byDay[day]) byDay[day] = { entries: 0, exits: 0 };
      byDay[day].entries++;
      if (log.exit_at) byDay[day].exits++;
    });

    // Group by contractor
    const byContractor: Record<string, number> = {};
    (logs || []).forEach(log => {
      const c = log.contractor_snapshot || 'Sin contratista';
      byContractor[c] = (byContractor[c] || 0) + 1;
    });

    // Get filter description
    let filterDescription = 'Todos';
    if (filterType === 'contractor' && selectedContractor) {
      filterDescription = `Contratista: ${selectedContractor}`;
    } else if (filterType === 'worker') {
      filterDescription = 'Solo Trabajadores';
    } else if (filterType === 'visitor') {
      filterDescription = 'Solo Visitas';
    }
    if (selectedPersonId && selectedPersonId !== 'all') {
      const person = people.find(p => p.id === selectedPersonId);
      filterDescription = `Persona: ${person?.full_name || 'N/A'}`;
    }

    return {
      period: { from: dateFrom, to: dateTo },
      site: currentSite.name,
      filter: filterDescription,
      totalEntries,
      totalExits,
      totalHours: totalHours.toFixed(1),
      byDay,
      byContractor,
      logs: logs || [],
    };
  };

  const downloadCSV = async () => {
    setGenerating(true);
    try {
      const data = await generateReportData();
      if (!data) return;

      // Create CSV content
      const headers = ['Fecha Entrada', 'Hora Entrada', 'Fecha Salida', 'Hora Salida', 'Horas', 'Nombre', 'CI', 'Tipo', 'Contratista', 'Observaciones'];
      const rows = data.logs.map(log => {
        const entryDate = new Date(log.entry_at);
        const exitDate = log.exit_at ? new Date(log.exit_at) : null;
        const hours = exitDate ? ((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60)).toFixed(2) : '';
        return [
          entryDate.toLocaleDateString('es-BO'),
          entryDate.toLocaleTimeString('es-BO'),
          exitDate?.toLocaleDateString('es-BO') || '',
          exitDate?.toLocaleTimeString('es-BO') || '',
          hours,
          log.name_snapshot || '',
          log.ci_snapshot || '',
          log.type_snapshot || '',
          log.contractor_snapshot || '',
          log.observations || '',
        ].map(v => `"${v}"`).join(',');
      });

      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `reporte_${currentSite?.name}_${dateFrom}_${dateTo}.csv`;
      link.click();
      URL.revokeObjectURL(url);

      toast({ title: 'CSV descargado', description: 'El archivo se descargó correctamente.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const generatePDF = async () => {
    setGenerating(true);
    try {
      const data = await generateReportData();
      if (!data) return;

      // Create a printable HTML with BRIK branding
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Reporte ${data.site} - BRIK</title>
          <style>
            * { box-sizing: border-box; }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
              margin: 0; 
              padding: 0;
              color: #1e1b4b; 
              background: #fafafa;
            }
            .header {
              background: linear-gradient(135deg, #7c3aed 0%, #3b82f6 100%);
              color: white;
              padding: 32px 40px;
              margin-bottom: 32px;
            }
            .header h1 { 
              font-size: 28px; 
              margin: 0 0 8px 0; 
              font-weight: 700;
            }
            .header .subtitle { 
              opacity: 0.9; 
              font-size: 14px;
              margin: 0;
            }
            .header .filter-badge {
              display: inline-block;
              background: rgba(255,255,255,0.2);
              padding: 6px 12px;
              border-radius: 20px;
              font-size: 13px;
              margin-top: 12px;
            }
            .content { padding: 0 40px 40px; }
            .stats { 
              display: grid; 
              grid-template-columns: repeat(4, 1fr); 
              gap: 16px; 
              margin-bottom: 32px; 
            }
            .stat { 
              background: white; 
              padding: 20px; 
              border-radius: 16px; 
              border: 1px solid #e5e7eb;
              text-align: center;
            }
            .stat-value { 
              font-size: 32px; 
              font-weight: 700; 
              color: #7c3aed;
            }
            .stat-label { 
              color: #6b7280; 
              font-size: 13px; 
              margin-top: 4px;
            }
            h2 { 
              font-size: 18px; 
              margin: 32px 0 16px; 
              color: #1e1b4b;
              padding-bottom: 8px;
              border-bottom: 2px solid #7c3aed;
              display: inline-block;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              font-size: 12px; 
              background: white;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            th { 
              background: #7c3aed; 
              color: white; 
              font-weight: 600;
              padding: 12px;
              text-align: left;
            }
            td { 
              padding: 10px 12px; 
              border-bottom: 1px solid #f3f4f6; 
            }
            tr:last-child td { border-bottom: none; }
            tr:nth-child(even) { background: #fafafb; }
            .footer { 
              margin-top: 48px; 
              padding-top: 24px;
              border-top: 1px solid #e5e7eb;
              display: flex;
              justify-content: space-between;
              font-size: 11px; 
              color: #9ca3af;
            }
            .footer .brand {
              color: #7c3aed;
              font-weight: 600;
            }
            @media print {
              body { background: white; }
              .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .stat { border: 1px solid #e5e7eb; }
              th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <img src="/brik-logo-white.png" alt="BRIK" style="height: 48px; margin-bottom: 16px;" />
            <h1>Reporte de Accesos</h1>
            <p class="subtitle">${data.site} • ${data.period.from} al ${data.period.to}</p>
            <div class="filter-badge">${data.filter}</div>
          </div>
          
          <div class="content">
            <div class="stats">
              <div class="stat">
                <div class="stat-value">${data.totalEntries}</div>
                <div class="stat-label">Entradas</div>
              </div>
              <div class="stat">
                <div class="stat-value">${data.totalExits}</div>
                <div class="stat-label">Salidas</div>
              </div>
              <div class="stat">
                <div class="stat-value">${data.totalHours}h</div>
                <div class="stat-label">Horas Trabajadas</div>
              </div>
              <div class="stat">
                <div class="stat-value">${Object.keys(data.byContractor).length}</div>
                <div class="stat-label">Contratistas</div>
              </div>
            </div>

            <h2>Detalle de Accesos</h2>
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Entrada</th>
                  <th>Salida</th>
                  <th>Horas</th>
                  <th>Nombre</th>
                  <th>CI</th>
                  <th>Contratista</th>
                </tr>
              </thead>
              <tbody>
                ${data.logs.length === 0 ?
          '<tr><td colspan="7" style="text-align: center; padding: 40px; color: #9ca3af;">No hay registros en el período seleccionado</td></tr>' :
          data.logs.map(log => {
            const entry = new Date(log.entry_at);
            const exit = log.exit_at ? new Date(log.exit_at) : null;
            const hours = exit ? ((exit.getTime() - entry.getTime()) / (1000 * 60 * 60)).toFixed(1) : '-';
            return '<tr>' +
              '<td>' + entry.toLocaleDateString('es-BO') + '</td>' +
              '<td>' + entry.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) + '</td>' +
              '<td>' + (exit?.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) || '-') + '</td>' +
              '<td>' + hours + '</td>' +
              '<td><strong>' + (log.name_snapshot || '-') + '</strong></td>' +
              '<td>' + (log.ci_snapshot || '-') + '</td>' +
              '<td>' + (log.contractor_snapshot || '-') + '</td>' +
              '</tr>';
          }).join('')
        }
              </tbody>
            </table>

            <div class="footer">
              <span>Generado: ${new Date().toLocaleString('es-BO')}</span>
              <span class="brand">BRIK Pro • Control de Accesos</span>
            </div>
          </div>
        </body>
        </html>
      `;

      // Open in new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        printWindow.print();
      }

      toast({ title: 'PDF generado', description: 'Usa la ventana de impresión para guardar como PDF.' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const shareWhatsApp = async () => {
    setGenerating(true);
    try {
      const data = await generateReportData();
      if (!data) {
        toast({ title: 'Error', description: 'No se pudo generar el reporte', variant: 'destructive' });
        return;
      }

      // Format hours by contractor
      const contractorLines = Object.entries(data.byContractor)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([contractor, count]) => `• ${contractor}: ${count} accesos`)
        .join('\n');

      // Format summary by day (last 5 days)
      const dayLines = Object.entries(data.byDay)
        .slice(-5)
        .map(([day, stats]) => `• ${day}: ${stats.entries} entradas, ${stats.exits} salidas`)
        .join('\n');

      // Create comprehensive text report
      const text = `━━━━━━━━━━━━━━━━━━━━━
📊 *REPORTE BRIK*
━━━━━━━━━━━━━━━━━━━━━

🏗️ *Obra:* ${data.site}
📅 *Período:* ${data.period.from} al ${data.period.to}
🔎 *Filtro:* ${data.filter}

━━━━━━━━━━━━━━━━━━━━━
📈 *RESUMEN GENERAL*
━━━━━━━━━━━━━━━━━━━━━
✅ Total Entradas: *${data.totalEntries}*
🚪 Total Salidas: *${data.totalExits}*
⏱️ Horas Acumuladas: *${data.totalHours}h*
🏢 Contratistas: *${Object.keys(data.byContractor).length}*

${contractorLines ? `━━━━━━━━━━━━━━━━━━━━━
👷 *POR CONTRATISTA*
━━━━━━━━━━━━━━━━━━━━━
${contractorLines}` : ''}

${dayLines ? `━━━━━━━━━━━━━━━━━━━━━
📆 *ÚLTIMAS FECHAS*
━━━━━━━━━━━━━━━━━━━━━
${dayLines}` : ''}

━━━━━━━━━━━━━━━━━━━━━
_Generado por BRIK Pro_
_${new Date().toLocaleString('es-BO')}_`;

      const encoded = encodeURIComponent(text);
      window.open(`https://wa.me/?text=${encoded}`, '_blank');

      toast({
        title: 'Reporte listo para enviar',
        description: 'Selecciona el contacto en WhatsApp.'
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setGenerating(false);
    }
  };

  const isReady = dateFrom && dateTo;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="w-6 h-6 text-purple-400" />
        <h3 className="text-lg font-medium text-white">Reportes</h3>
      </div>

      {/* Date Filters */}
      <div className="card-cosmos p-6 space-y-6">
        <div className="flex items-center gap-2 text-white/80">
          <Calendar className="w-4 h-4" />
          <span className="font-medium">Período</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-white/70">Fecha desde</Label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="bg-white/10 border-white/20 text-white"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-white/70">Fecha hasta</Label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="bg-white/10 border-white/20 text-white"
            />
          </div>
        </div>
      </div>

      {/* Type Filter */}
      <div className="card-cosmos p-6 space-y-4">
        <div className="flex items-center gap-2 text-white/80">
          <Filter className="w-4 h-4" />
          <span className="font-medium">Filtros</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button
            variant={filterType === 'all' ? 'default' : 'outline'}
            onClick={() => { setFilterType('all'); setSelectedContractor(''); setSelectedPersonId(''); }}
            className={filterType === 'all'
              ? 'bg-gradient-to-r from-purple-500 to-blue-500'
              : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}
          >
            <Users className="w-4 h-4 mr-2" />
            Todos
          </Button>
          <Button
            variant={filterType === 'contractor' ? 'default' : 'outline'}
            onClick={() => { setFilterType('contractor'); setSelectedPersonId(''); }}
            className={filterType === 'contractor'
              ? 'bg-gradient-to-r from-purple-500 to-blue-500'
              : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}
          >
            <Building2 className="w-4 h-4 mr-2" />
            Contratista
          </Button>
          <Button
            variant={filterType === 'worker' ? 'default' : 'outline'}
            onClick={() => { setFilterType('worker'); setSelectedContractor(''); setSelectedPersonId('all'); }}
            className={filterType === 'worker'
              ? 'bg-gradient-to-r from-purple-500 to-blue-500'
              : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}
          >
            <User className="w-4 h-4 mr-2" />
            Trabajadores
          </Button>
          <Button
            variant={filterType === 'visitor' ? 'default' : 'outline'}
            onClick={() => { setFilterType('visitor'); setSelectedContractor(''); setSelectedPersonId('all'); }}
            className={filterType === 'visitor'
              ? 'bg-gradient-to-r from-purple-500 to-blue-500'
              : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}
          >
            <User className="w-4 h-4 mr-2" />
            Visitas
          </Button>
        </div>

        {/* Contractor selector */}
        {filterType === 'contractor' && (
          <Select value={selectedContractor} onValueChange={setSelectedContractor}>
            <SelectTrigger className="bg-white/10 border-white/20 text-white/80">
              <SelectValue placeholder="Seleccionar contratista" />
            </SelectTrigger>
            <SelectContent className="bg-slate-800/95 backdrop-blur-xl border-white/10">
              {contractors.map(c => (
                <SelectItem key={c} value={c} className="text-white/80 focus:bg-white/10">{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Person selector */}
        {(filterType === 'worker' || filterType === 'visitor' || (filterType === 'contractor' && selectedContractor)) && (
          <div className="space-y-2">
            <Label className="text-white/60 text-sm">Persona específica (opcional)</Label>
            <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
              <SelectTrigger className="bg-white/10 border-white/20 text-white/80">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800/95 backdrop-blur-xl border-white/10 max-h-60">
                <SelectItem value="all" className="text-white/80 focus:bg-white/10">Todos</SelectItem>
                {filteredPeople.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-white/80 focus:bg-white/10">
                    {p.full_name} ({p.ci})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Download & Share */}
      <div className="card-cosmos p-6 space-y-4">
        <h4 className="font-medium text-white">Descargar / Compartir</h4>

        {!isReady && (
          <AlertCosmos type="info">Selecciona las fechas para generar el reporte.</AlertCosmos>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={downloadCSV}
            disabled={generating || !isReady}
            className="bg-white/10 border border-white/20 text-white/80 hover:bg-white/20"
          >
            {generating ? <Spinner size="sm" className="mr-2" /> : <Download className="w-4 h-4 mr-2" />}
            Descargar CSV
          </Button>
          <Button
            onClick={generatePDF}
            disabled={generating || !isReady}
            className="bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600"
          >
            {generating ? <Spinner size="sm" className="mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
            Generar PDF
          </Button>
          <Button
            onClick={shareWhatsApp}
            disabled={generating || !isReady}
            className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
          >
            {generating ? <Spinner size="sm" className="mr-2" /> : <MessageSquare className="w-4 h-4 mr-2" />}
            Compartir WhatsApp
          </Button>
        </div>
      </div>
    </div>
  );
}
