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
      if (p.contractor) {
        // Normalize to uppercase and trim to avoid duplicates like "Empresa X" and "empresa x"
        set.add(p.contractor.trim().toUpperCase());
      }
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
      return people.filter(p => (p.contractor || '').trim().toUpperCase() === selectedContractor.toUpperCase());
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
      query = query.ilike('contractor_snapshot', selectedContractor);
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

    // Get inspection notes for relevant workers in the date range
    const workerIds = [...new Set((logs || []).map(l => l.person_id).filter(Boolean))];
    const inspectionNotesMap: Record<string, string[]> = {};

    if (workerIds.length > 0) {
      // Get all note-worker links for these workers
      const { data: noteWorkers } = await (supabase as any)
        .from('inspection_note_workers')
        .select('person_id, note_id, inspection_notes:note_id(id, date, content)')
        .in('person_id', workerIds);

      // Filter notes within date range and organize by person+date
      (noteWorkers || []).forEach((nw: any) => {
        if (nw.inspection_notes) {
          const noteDate = nw.inspection_notes.date;
          if (noteDate >= dateFrom && noteDate <= dateTo) {
            const key = `${nw.person_id}_${noteDate}`;
            if (!inspectionNotesMap[key]) {
              inspectionNotesMap[key] = [];
            }
            // Strip HTML and add note
            const doc = new DOMParser().parseFromString(nw.inspection_notes.content, 'text/html');
            const plainText = doc.body.textContent || '';
            inspectionNotesMap[key].push(plainText);
          }
        }
      });
    }

    // Enrich logs with inspection notes
    const logsWithNotes = (logs || []).map(log => {
      const logDate = log.entry_at.split('T')[0];
      const key = `${log.person_id}_${logDate}`;
      const notes = inspectionNotesMap[key] || [];
      return {
        ...log,
        inspection_notes: notes.join(' | '),
      };
    });

    return {
      period: { from: dateFrom, to: dateTo },
      site: currentSite.name,
      filter: filterDescription,
      totalEntries,
      totalExits,
      totalHours: totalHours.toFixed(1),
      byDay,
      byContractor,
      logs: logsWithNotes,
    };
  };

  const downloadCSV = async () => {
    setGenerating(true);
    try {
      const data = await generateReportData();
      if (!data) return;

      // Create CSV content
      const headers = ['Fecha Entrada', 'Hora Entrada', 'Fecha Salida', 'Hora Salida', 'Horas', 'Nombre', 'CI', 'Tipo', 'Contratista', 'Observaciones', 'Comentarios Fiscalización'];
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
          log.inspection_notes || '',
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
            @media (max-width: 768px) {
              .stats { grid-template-columns: repeat(2, 1fr); }
            }
            .stat { 
              background: white; 
              padding: 20px; 
              border-radius: 16px; 
              border: 1px solid #e5e7eb;
              text-align: center;
              box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            }
            .stat-value { 
              font-size: 28px; 
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
              font-size: 13px; 
              background: white;
              border-radius: 12px;
              overflow: hidden;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            th { 
              background: #7c3aed; 
              color: white; 
              font-weight: 600;
              padding: 14px;
              text-align: left;
              white-space: nowrap;
            }
            td { 
              padding: 12px 14px; 
              border-bottom: 1px solid #f3f4f6; 
              color: #374151;
            }
            tr:last-child td { border-bottom: none; }
            tr:nth-child(even) { background: #f9fafb; }
            .footer { 
              margin-top: 48px; 
              padding-top: 24px;
              border-top: 1px solid #e5e7eb;
              display: flex;
              justify-content: space-between;
              font-size: 12px; 
              color: #9ca3af;
            }
            .footer .brand {
              color: #7c3aed;
              font-weight: 600;
            }
            .back-button {
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 10px 20px;
              background: rgba(255,255,255,0.2);
              border: 1px solid rgba(255,255,255,0.3);
              border-radius: 8px;
              color: white;
              text-decoration: none;
              font-size: 14px;
              font-weight: 500;
              cursor: pointer;
              transition: all 0.2s;
            }
            .back-button:hover { background: rgba(255,255,255,0.3); }
            
            /* Print styles */
            @media print {
              body { background: white; -webkit-print-color-adjust: exact; }
              .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 20px; }
              .stat { border: 1px solid #e5e7eb; break-inside: avoid; }
              th { -webkit-print-color-adjust: exact; print-color-adjust: exact; background-color: #7c3aed !important; color: white !important; }
              .back-button { display: none; }
              .stats { gap: 10px; }
              .content { padding: 0 20px 20px; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
              <div style="font-size: 32px; font-weight: 800; opacity: 1;">BRIK<span style="opacity:0.8; font-weight: 400;">PRO</span></div>
              <button class="back-button" onclick="window.close()">✕ Cerrar</button>
            </div>
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
            <div style="overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 12px;">
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
                  <th>Fiscalización</th>
                </tr>
              </thead>
              <tbody>
                ${data.logs.length === 0 ?
          '<tr><td colspan="8" style="text-align: center; padding: 40px; color: #9ca3af;">No hay registros en el período seleccionado</td></tr>' :
          data.logs.map(log => {
            const entry = new Date(log.entry_at);
            const exit = log.exit_at ? new Date(log.exit_at) : null;
            const hours = exit ? ((exit.getTime() - entry.getTime()) / (1000 * 60 * 60)).toFixed(1) : '-';
            const notesText = log.inspection_notes ? log.inspection_notes.substring(0, 100) + (log.inspection_notes.length > 100 ? '...' : '') : '-';
            return '<tr>' +
              '<td>' + entry.toLocaleDateString('es-BO') + '</td>' +
              '<td>' + entry.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) + '</td>' +
              '<td>' + (exit?.toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' }) || '-') + '</td>' +
              '<td>' + hours + '</td>' +
              '<td><span style="font-weight: 600; color: #1f2937;">' + (log.name_snapshot || '-') + '</span></td>' +
              '<td>' + (log.ci_snapshot || '-') + '</td>' +
              '<td>' + (log.contractor_snapshot || '-') + '</td>' +
              '<td style="font-size: 11px; color: #f97316; max-width: 150px;">' + notesText + '</td>' +
              '</tr>';
          }).join('')
        }
              </tbody>
            </table>
            </div>

            <div class="footer">
              <span>Generado: ${new Date().toLocaleString('es-BO')}</span>
              <span class="brand">BRIK Pro • Control de Accesos</span>
            </div>
          </div>
          <script>
            // Auto open print dialog when loaded
            window.onload = function() {
              setTimeout(function() { window.print(); }, 500);
            }
          </script>
        </body>
        </html>
      `;

      // Open in new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
      } else {
        toast({ title: 'Pop-up bloqueado', description: 'Por favor permite ventanas emergentes para ver el reporte.', variant: 'destructive' });
      }

      setGenerating(false);
    } catch (err: any) {
      console.error(err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
      setGenerating(false);
    }
  };

  const shareWhatsApp = async () => {
    setGenerating(true);
    try {
      const data = await generateReportData();
      if (!data) {
        setGenerating(false);
        return;
      }

      // Format hours by contractor
      const contractorLines = Object.entries(data.byContractor)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([contractor, count]) => `• ${contractor}: ${count} accesos`)
        .join('\n');

      // Create comprehensive text report
      const text = `*REPORTE BRIK PRO* 📊
*Obra:* ${data.site}
*Período:* ${data.period.from} al ${data.period.to}
${data.filter !== 'Todos' ? `*Filtro:* ${data.filter}\n` : ''}
*RESUMEN*
✅ Entradas: ${data.totalEntries}
🚪 Salidas: ${data.totalExits}
⏱️ Horas Total: ${data.totalHours}h
🏢 Contratistas: ${Object.keys(data.byContractor).length}

*POR CONTRATISTA*
${contractorLines || 'Sin datos'}

_Generado el ${new Date().toLocaleString('es-BO')}_`;

      const encoded = encodeURIComponent(text);
      window.open(`https://wa.me/?text=${encoded}`, '_blank');
      setGenerating(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
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
            onClick={() => { setFilterType('worker'); setSelectedContractor(''); setSelectedPersonId(''); }}
            className={filterType === 'worker'
              ? 'bg-gradient-to-r from-purple-500 to-blue-500'
              : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}
          >
            <User className="w-4 h-4 mr-2" />
            Trabajador
          </Button>
          <Button
            variant={filterType === 'visitor' ? 'default' : 'outline'}
            onClick={() => { setFilterType('visitor'); setSelectedContractor(''); setSelectedPersonId(''); }}
            className={filterType === 'visitor'
              ? 'bg-gradient-to-r from-purple-500 to-blue-500'
              : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}
          >
            <User className="w-4 h-4 mr-2" />
            Visita
          </Button>
        </div>

        {filterType === 'contractor' && (
          <div className="pt-2 animate-in fade-in slide-in-from-top-2">
            <Label className="text-white/70 mb-2 block">Seleccionar Contratista</Label>
            <Select value={selectedContractor} onValueChange={setSelectedContractor}>
              <SelectTrigger className="bg-white/10 border-white/20 text-white">
                <SelectValue placeholder="Seleccionar..." />
              </SelectTrigger>
              <SelectContent className="bg-slate-800/95 backdrop-blur-xl border-white/10">
                {contractors.map(c => (
                  <SelectItem key={c} value={c} className="text-white/80 focus:bg-white/10">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {(filterType === 'worker' || filterType === 'visitor' || (filterType === 'contractor' && selectedContractor)) && (
          <div className="pt-2 animate-in fade-in slide-in-from-top-2">
            <Label className="text-white/70 mb-2 block">Persona Específica (Opcional)</Label>
            <Select value={selectedPersonId} onValueChange={setSelectedPersonId}>
              <SelectTrigger className="bg-white/10 border-white/20 text-white">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent className="bg-slate-800/95 backdrop-blur-xl border-white/10 max-h-[200px]">
                <SelectItem value="all" className="text-white/80 focus:bg-white/10">Todas</SelectItem>
                {filteredPeople.map(p => (
                  <SelectItem key={p.id} value={p.id} className="text-white/80 focus:bg-white/10">{p.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
        <Button
          onClick={generatePDF}
          disabled={!isReady || generating}
          className="bg-red-500 hover:bg-red-600 text-white h-12"
        >
          {generating ? <Spinner className="mr-2" /> : <FileText className="w-5 h-5 mr-2" />}
          Generar PDF
        </Button>

        <Button
          onClick={downloadCSV}
          disabled={!isReady || generating}
          variant="outline"
          className="bg-white/10 border-white/20 text-white hover:bg-white/20 h-12"
        >
          {generating ? <Spinner className="mr-2" /> : <Download className="w-5 h-5 mr-2" />}
          Descargar CSV
        </Button>

        <Button
          onClick={shareWhatsApp}
          disabled={!isReady || generating}
          className="bg-green-500 hover:bg-green-600 text-white h-12"
        >
          {generating ? <Spinner className="mr-2" /> : <MessageSquare className="w-5 h-5 mr-2" />}
          Enviar a WhatsApp
        </Button>
      </div>

      {!isReady && (
        <AlertCosmos type="info" title="Selecciona un período">
          Para generar reportes, primero selecciona la fecha de inicio y fin.
        </AlertCosmos>
      )}
    </div>
  );
}
