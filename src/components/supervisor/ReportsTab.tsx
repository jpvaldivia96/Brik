import { useState, useEffect, useMemo } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { FileText, Download, MessageSquare, Filter, Calendar, Building2, User, Users, Search, CheckSquare, Square, X, Layers } from 'lucide-react';
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
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [showPeopleSelector, setShowPeopleSelector] = useState(false);
  const [peopleSearchQuery, setPeopleSearchQuery] = useState('');

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
      selectedPersonIds: Array.from(selectedPersonIds)
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
      // Filter by category if selected
      if (selectedCategory && selectedCategory !== '__all__') {
        query = query.ilike('categories_snapshot', `%${selectedCategory}%`);
      }
    } else if (filterType === 'worker') {
      query = query.eq('type_snapshot', 'worker');
    } else if (filterType === 'visitor') {
      query = query.eq('type_snapshot', 'visitor');
    }

    if (selectedPersonIds.size > 0) {
      query = query.in('person_id', Array.from(selectedPersonIds));
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

    // Group by day (with hours)
    const byDay: Record<string, { entries: number; exits: number; hours: number }> = {};
    (logs || []).forEach(log => {
      const day = log.entry_at.split('T')[0];
      if (!byDay[day]) byDay[day] = { entries: 0, exits: 0, hours: 0 };
      byDay[day].entries++;
      if (log.exit_at) {
        byDay[day].exits++;
        byDay[day].hours += (new Date(log.exit_at).getTime() - new Date(log.entry_at).getTime()) / 3600000;
      }
    });

    // Group by day + contractor
    const byDayContractor: Record<string, Record<string, { entries: number; exits: number; hours: number }>> = {};
    (logs || []).forEach(log => {
      const day = log.entry_at.split('T')[0];
      const c = log.contractor_snapshot || 'Sin contratista';
      if (!byDayContractor[day]) byDayContractor[day] = {};
      if (!byDayContractor[day][c]) byDayContractor[day][c] = { entries: 0, exits: 0, hours: 0 };
      byDayContractor[day][c].entries++;
      if (log.exit_at) {
        byDayContractor[day][c].exits++;
        byDayContractor[day][c].hours += (new Date(log.exit_at).getTime() - new Date(log.entry_at).getTime()) / 3600000;
      }
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
    if (selectedPersonIds.size > 0) {
      const names = Array.from(selectedPersonIds).map(id => {
        const person = people.find(p => p.id === id);
        return person?.full_name || 'N/A';
      });
      filterDescription = selectedPersonIds.size === 1
        ? `Persona: ${names[0]}`
        : `${selectedPersonIds.size} personas seleccionadas`;
    }

    // Get inspection notes for relevant workers in the date range
    const workerIds = [...new Set((logs || []).map(l => l.person_id).filter(Boolean))];
    const inspectionNotesMap: Record<string, string[]> = {};

    if (workerIds.length > 0) {
      // First, get all note-worker links for these workers
      const { data: noteWorkers, error: nwError } = await (supabase as any)
        .from('inspection_note_workers')
        .select('person_id, note_id')
        .in('person_id', workerIds);

      if (!nwError && noteWorkers && noteWorkers.length > 0) {
        // Get unique note IDs
        const noteIds = [...new Set(noteWorkers.map((nw: any) => nw.note_id))];

        // Fetch the actual notes
        const { data: notes, error: notesError } = await (supabase as any)
          .from('inspection_notes')
          .select('id, date, content')
          .in('id', noteIds)
          .gte('date', dateFrom)
          .lte('date', dateTo);

        if (!notesError && notes) {
          // Create a lookup map for notes by ID
          const notesById: Record<string, { date: string; content: string }> = {};
          notes.forEach((n: any) => {
            notesById[n.id] = { date: n.date, content: n.content };
          });

          // Organize by person+date
          noteWorkers.forEach((nw: any) => {
            const note = notesById[nw.note_id];
            if (note) {
              const key = `${nw.person_id}_${note.date}`;
              if (!inspectionNotesMap[key]) {
                inspectionNotesMap[key] = [];
              }
              // Strip HTML and add note
              const doc = new DOMParser().parseFromString(note.content, 'text/html');
              const plainText = doc.body.textContent || '';
              if (plainText.trim()) {
                inspectionNotesMap[key].push(plainText);
              }
            }
          });
        }
      }
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
      byDayContractor,
      byContractor,
      logs: logsWithNotes,
    };
  };

  const downloadCSV = async () => {
    setGenerating(true);
    try {
      const data = await generateReportData();
      if (!data) return;

      // Daily summary section for CSV
      const summaryHeader = ['--- RESUMEN DIARIO ---', '', '', '', '', '', '', '', '', '', ''];
      const summaryColHeaders = ['Fecha', 'Entradas', 'Salidas', 'Horas', '', '', '', '', '', '', ''];
      const days = Object.keys(data.byDay).sort();
      const summaryRows = days.map(day => {
        const d = data.byDay[day];
        const dateStr = new Date(day + 'T12:00:00').toLocaleDateString('es-BO');
        return [dateStr, String(d.entries), String(d.exits), d.hours.toFixed(1), '', '', '', '', '', '', ''].map(v => `"${v}"`).join(',');
      });
      const summaryTotals = days.reduce((acc, day) => {
        acc.entries += data.byDay[day].entries;
        acc.exits += data.byDay[day].exits;
        acc.hours += data.byDay[day].hours;
        return acc;
      }, { entries: 0, exits: 0, hours: 0 });
      const summaryTotalRow = ['TOTAL', String(summaryTotals.entries), String(summaryTotals.exits), summaryTotals.hours.toFixed(1), '', '', '', '', '', '', ''].map(v => `"${v}"`).join(',');

      // Detail section
      const detailSeparator = ['', '', '', '', '', '', '', '', '', '', ''];
      const detailHeader = ['--- DETALLE DE ACCESOS ---', '', '', '', '', '', '', '', '', '', ''];

      // Create CSV content
      const headers = ['Fecha Entrada', 'Hora Entrada', 'Fecha Salida', 'Hora Salida', 'Horas', 'Nombre', 'CI', 'Tipo', 'Contratista', 'Categoría', 'Observaciones', 'Comentarios Fiscalización'];
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
          log.categories_snapshot || '',
          log.observations || '',
          log.inspection_notes || '',
        ].map(v => `"${v}"`).join(',');
      });

      const csv = [
        summaryHeader.map(v => `"${v}"`).join(','),
        summaryColHeaders.map(v => `"${v}"`).join(','),
        ...summaryRows,
        summaryTotalRow,
        detailSeparator.map(v => `"${v}"`).join(','),
        detailHeader.map(v => `"${v}"`).join(','),
        headers.join(','),
        ...rows,
      ].join('\n');
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

            ${selectedPersonIds.size > 1 ? (() => {
              // Per-person breakdown section
              const personGroups: Record<string, { name: string; ci: string; contractor: string; entries: number; exits: number; hours: number }> = {};
              data.logs.forEach((log: any) => {
                const pid = log.person_id || 'unknown';
                if (!personGroups[pid]) {
                  personGroups[pid] = {
                    name: log.name_snapshot || 'Sin nombre',
                    ci: log.ci_snapshot || '-',
                    contractor: log.contractor_snapshot || '-',
                    entries: 0,
                    exits: 0,
                    hours: 0,
                  };
                }
                personGroups[pid].entries++;
                if (log.exit_at) {
                  personGroups[pid].exits++;
                  personGroups[pid].hours += (new Date(log.exit_at).getTime() - new Date(log.entry_at).getTime()) / (1000 * 60 * 60);
                }
              });
              const rows = Object.values(personGroups)
                .sort((a, b) => b.hours - a.hours)
                .map(p =>
                  '<tr>' +
                  '<td><span style="font-weight:600;color:#1f2937;">' + p.name + '</span></td>' +
                  '<td>' + p.ci + '</td>' +
                  '<td>' + p.contractor + '</td>' +
                  '<td style="text-align:center;">' + p.entries + '</td>' +
                  '<td style="text-align:center;">' + p.exits + '</td>' +
                  '<td style="text-align:center;font-weight:600;color:#7c3aed;">' + p.hours.toFixed(1) + 'h</td>' +
                  '</tr>'
                ).join('');
              return '<h2>Resumen por Persona</h2>' +
                '<div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:32px;">' +
                '<table><thead><tr>' +
                '<th>Nombre</th><th>CI</th><th>Contratista</th>' +
                '<th style="text-align:center;">Entradas</th><th style="text-align:center;">Salidas</th><th style="text-align:center;">Horas</th>' +
                '</tr></thead><tbody>' + rows + '</tbody></table></div>';
            })() : ''}

            ${(() => {
              // Daily summary table
              const days = Object.keys(data.byDay).sort();
              if (days.length === 0) return '';

              const dayRows = days.map(day => {
                const d = data.byDay[day];
                const dateStr = new Date(day + 'T12:00:00').toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' });
                return '<tr>' +
                  '<td style="font-weight:500;">' + dateStr + '</td>' +
                  '<td style="text-align:center;">' + d.entries + '</td>' +
                  '<td style="text-align:center;">' + d.exits + '</td>' +
                  '<td style="text-align:center;font-weight:600;color:#7c3aed;">' + d.hours.toFixed(1) + 'h</td>' +
                  '</tr>';
              }).join('');

              const totals = days.reduce((acc, day) => {
                acc.entries += data.byDay[day].entries;
                acc.exits += data.byDay[day].exits;
                acc.hours += data.byDay[day].hours;
                return acc;
              }, { entries: 0, exits: 0, hours: 0 });

              const totalRow = '<tr style="background:#7c3aed;color:white;font-weight:700;">' +
                '<td>TOTAL</td>' +
                '<td style="text-align:center;">' + totals.entries + '</td>' +
                '<td style="text-align:center;">' + totals.exits + '</td>' +
                '<td style="text-align:center;">' + totals.hours.toFixed(1) + 'h</td>' +
                '</tr>';

              return '<h2>Resumen Diario</h2>' +
                '<div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:12px;margin-bottom:32px;">' +
                '<table><thead><tr>' +
                '<th>Fecha</th><th style="text-align:center;">Entradas</th><th style="text-align:center;">Salidas</th><th style="text-align:center;">Horas</th>' +
                '</tr></thead><tbody>' + dayRows + totalRow + '</tbody></table></div>';
            })()}

            ${(() => {
              // Per-contractor per-day breakdown (only if NOT filtered by single contractor)
              if (filterType === 'contractor' && selectedContractor) return '';
              const days = Object.keys(data.byDayContractor || {}).sort();
              if (days.length === 0) return '';

              const allContractors = new Set<string>();
              days.forEach(day => {
                Object.keys(data.byDayContractor[day]).forEach(c => allContractors.add(c));
              });
              const contractorList = Array.from(allContractors).sort();

              // Build a table per contractor with daily entries
              const tables = contractorList.map(contractor => {
                const contractorDayRows = days.map(day => {
                  const d = data.byDayContractor[day]?.[contractor];
                  if (!d) return null;
                  const dateStr = new Date(day + 'T12:00:00').toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' });
                  return '<tr>' +
                    '<td>' + dateStr + '</td>' +
                    '<td style="text-align:center;">' + d.entries + '</td>' +
                    '<td style="text-align:center;">' + d.hours.toFixed(1) + 'h</td>' +
                    '</tr>';
                }).filter(Boolean).join('');

                if (!contractorDayRows) return '';

                const totals = days.reduce((acc, day) => {
                  const d = data.byDayContractor[day]?.[contractor];
                  if (d) { acc.entries += d.entries; acc.hours += d.hours; }
                  return acc;
                }, { entries: 0, hours: 0 });

                return '<div style="margin-bottom:24px;">' +
                  '<h3 style="font-size:15px;color:#4b5563;margin:0 0 8px;">' + contractor + ' <span style="color:#7c3aed;font-weight:700;">(' + totals.entries + ' entradas, ' + totals.hours.toFixed(1) + 'h)</span></h3>' +
                  '<div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:12px;">' +
                  '<table><thead><tr>' +
                  '<th>Fecha</th><th style="text-align:center;">Entradas</th><th style="text-align:center;">Horas</th>' +
                  '</tr></thead><tbody>' + contractorDayRows + '</tbody></table></div></div>';
              }).join('');

              return tables ? '<h2>Detalle por Contratista</h2>' + tables : '';
            })()}

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
                  <th>Categoría</th>
                  <th>Fiscalización</th>
                </tr>
              </thead>
              <tbody>
                ${data.logs.length === 0 ?
          '<tr><td colspan="9" style="text-align: center; padding: 40px; color: #9ca3af;">No hay registros en el período seleccionado</td></tr>' :
          data.logs.map((log: any) => {
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
              '<td style="font-size: 11px; color: #3b82f6;">' + (log.categories_snapshot || '-') + '</td>' +
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

      // Daily summary
      const days = Object.keys(data.byDay).sort();
      const dailyLines = days.map(day => {
        const d = data.byDay[day];
        const dateStr = new Date(day + 'T12:00:00').toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' });
        return `📅 ${dateStr}: ${d.entries} entradas, ${d.hours.toFixed(1)}h`;
      }).join('\n');

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

*RESUMEN DIARIO*
${dailyLines || 'Sin datos'}

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
            onClick={() => { setFilterType('all'); setSelectedContractor(''); setSelectedPersonIds(new Set()); }}
            className={filterType === 'all'
              ? 'bg-gradient-to-r from-purple-500 to-blue-500'
              : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}
          >
            <Users className="w-4 h-4 mr-2" />
            Todos
          </Button>
          <Button
            variant={filterType === 'contractor' ? 'default' : 'outline'}
            onClick={() => { setFilterType('contractor'); setSelectedPersonIds(new Set()); }}
            className={filterType === 'contractor'
              ? 'bg-gradient-to-r from-purple-500 to-blue-500'
              : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}
          >
            <Building2 className="w-4 h-4 mr-2" />
            Contratista
          </Button>
          <Button
            variant={filterType === 'worker' ? 'default' : 'outline'}
            onClick={() => { setFilterType('worker'); setSelectedContractor(''); setSelectedPersonIds(new Set()); }}
            className={filterType === 'worker'
              ? 'bg-gradient-to-r from-purple-500 to-blue-500'
              : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}
          >
            <User className="w-4 h-4 mr-2" />
            Trabajador
          </Button>
          <Button
            variant={filterType === 'visitor' ? 'default' : 'outline'}
            onClick={() => { setFilterType('visitor'); setSelectedContractor(''); setSelectedPersonIds(new Set()); }}
            className={filterType === 'visitor'
              ? 'bg-gradient-to-r from-purple-500 to-blue-500'
              : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'}
          >
            <User className="w-4 h-4 mr-2" />
            Visita
          </Button>
        </div>

        {filterType === 'contractor' && (
          <div className="pt-2 animate-in fade-in slide-in-from-top-2 space-y-3">
            <div>
              <Label className="text-white/70 mb-2 block">Seleccionar Contratista</Label>
              <Select value={selectedContractor} onValueChange={(val) => {
                setSelectedContractor(val);
                setSelectedCategory('');
                // Load categories for this contractor
                if (currentSite && val) {
                  (supabase as any)
                    .from('contractor_categories')
                    .select('category_name')
                    .eq('site_id', currentSite.id)
                    .ilike('contractor_name', val)
                    .order('sort_order', { ascending: true })
                    .then(({ data }: any) => {
                      setAvailableCategories((data || []).map((d: any) => d.category_name));
                    });
                } else {
                  setAvailableCategories([]);
                }
              }}>
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

            {/* Category filter (optional) */}
            {selectedContractor && availableCategories.length > 0 && (
              <div className="animate-in fade-in slide-in-from-top-1">
                <Label className="text-white/70 mb-2 flex items-center gap-2">
                  <Layers className="w-3 h-3 text-blue-400" />
                  Filtrar por Categoría de Trabajo (Opcional)
                </Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="bg-white/10 border-white/20 text-white">
                    <SelectValue placeholder="Todas las categorías" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800/95 backdrop-blur-xl border-white/10">
                    <SelectItem value="__all__" className="text-white/80 focus:bg-white/10">Todas las categorías</SelectItem>
                    {availableCategories.map(c => (
                      <SelectItem key={c} value={c} className="text-white/80 focus:bg-white/10">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCategory && selectedCategory !== '__all__' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('')}
                    className="mt-1 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  >
                    <X className="w-3 h-3" /> Quitar filtro de categoría
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Multi-Person Selector */}
        {(filterType === 'worker' || filterType === 'visitor' || (filterType === 'contractor' && selectedContractor)) && (
          <div className="pt-2 animate-in fade-in slide-in-from-top-2 space-y-3">
            <button
              type="button"
              onClick={() => setShowPeopleSelector(!showPeopleSelector)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-lg border bg-white/10 border-white/20 text-white hover:bg-white/15 transition-colors"
            >
              <span className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-purple-400" />
                {selectedPersonIds.size === 0
                  ? 'Seleccionar Personas (Opcional)'
                  : `${selectedPersonIds.size} persona${selectedPersonIds.size > 1 ? 's' : ''} seleccionada${selectedPersonIds.size > 1 ? 's' : ''}`}
              </span>
              <span className={`text-xs text-white/50 transition-transform ${showPeopleSelector ? 'rotate-180' : ''}`}>▼</span>
            </button>

            {/* Selected People Chips */}
            {selectedPersonIds.size > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {Array.from(selectedPersonIds).map(id => {
                  const person = filteredPeople.find(p => p.id === id);
                  if (!person) return null;
                  return (
                    <span
                      key={id}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-purple-500/30 text-purple-200 border border-purple-400/20 cursor-pointer hover:bg-purple-500/40 transition-colors"
                      onClick={() => {
                        const next = new Set(selectedPersonIds);
                        next.delete(id);
                        setSelectedPersonIds(next);
                      }}
                    >
                      {person.full_name}
                      <X className="w-3 h-3" />
                    </span>
                  );
                })}
                <button
                  type="button"
                  onClick={() => setSelectedPersonIds(new Set())}
                  className="text-xs text-red-400 hover:text-red-300 px-2 py-1 transition-colors"
                >
                  Limpiar todo
                </button>
              </div>
            )}

            {/* Expandable People Panel */}
            {showPeopleSelector && (
              <div className="border border-white/10 rounded-lg bg-white/5 overflow-hidden animate-in fade-in slide-in-from-top-2">
                {/* Search inside panel */}
                <div className="p-3 border-b border-white/10">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                    <input
                      type="text"
                      placeholder="Buscar por nombre o CI..."
                      value={peopleSearchQuery}
                      onChange={(e) => setPeopleSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-3 py-2 bg-white/10 border border-white/20 rounded-md text-sm text-white placeholder:text-white/40 outline-none focus:border-purple-400/50 transition-colors"
                    />
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="px-3 py-2 flex items-center justify-between border-b border-white/10 bg-white/[0.03]">
                  <span className="text-xs text-white/50">
                    {filteredPeople.filter(p => !peopleSearchQuery.trim() || p.full_name.toLowerCase().includes(peopleSearchQuery.toLowerCase()) || p.ci.includes(peopleSearchQuery)).length} personas
                  </span>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        const visible = filteredPeople.filter(p => !peopleSearchQuery.trim() || p.full_name.toLowerCase().includes(peopleSearchQuery.toLowerCase()) || p.ci.includes(peopleSearchQuery));
                        const next = new Set(selectedPersonIds);
                        visible.forEach(p => next.add(p.id));
                        setSelectedPersonIds(next);
                      }}
                      className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                    >
                      Seleccionar todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPersonIds(new Set())}
                      className="text-xs text-red-400 hover:text-red-300 transition-colors"
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                {/* People List with Checkboxes */}
                <div className="max-h-[250px] overflow-y-auto">
                  {filteredPeople
                    .filter(p => {
                      if (!peopleSearchQuery.trim()) return true;
                      const q = peopleSearchQuery.toLowerCase();
                      return p.full_name.toLowerCase().includes(q) || p.ci.includes(q);
                    })
                    .map(p => {
                      const isSelected = selectedPersonIds.has(p.id);
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedPersonIds);
                            if (isSelected) {
                              next.delete(p.id);
                            } else {
                              next.add(p.id);
                            }
                            setSelectedPersonIds(next);
                          }}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-white/10 transition-colors ${
                            isSelected ? 'bg-purple-500/10' : ''
                          }`}
                        >
                          {isSelected
                            ? <CheckSquare className="w-4 h-4 text-purple-400 shrink-0" />
                            : <Square className="w-4 h-4 text-white/30 shrink-0" />
                          }
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="w-7 h-7 rounded-full bg-purple-500/30 flex items-center justify-center text-xs font-medium text-white shrink-0">
                              {p.full_name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                            </div>
                            <div className="min-w-0">
                              <div className={`text-sm truncate ${isSelected ? 'text-white font-medium' : 'text-white/80'}`}>
                                {p.full_name}
                              </div>
                              <div className="text-xs text-white/40 truncate">
                                CI: {p.ci}{p.contractor ? ` • ${p.contractor}` : ''}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  {filteredPeople.filter(p => {
                    if (!peopleSearchQuery.trim()) return true;
                    const q = peopleSearchQuery.toLowerCase();
                    return p.full_name.toLowerCase().includes(q) || p.ci.includes(q);
                  }).length === 0 && (
                    <div className="text-center text-white/40 text-sm py-6">No se encontraron personas</div>
                  )}
                </div>
              </div>
            )}
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
