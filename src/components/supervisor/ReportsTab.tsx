import { useState } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { FileText, Download, Mail, MessageSquare } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function ReportsTab() {
  const { currentSite, currentSettings } = useSite();
  const { toast } = useToast();
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [generating, setGenerating] = useState(false);
  const [email, setEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const generateReportData = async () => {
    if (!currentSite || !dateFrom || !dateTo) return null;

    const startDate = new Date(dateFrom);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(dateTo);
    endDate.setHours(23, 59, 59, 999);

    // Get all logs in range
    const { data: logs } = await supabase
      .from('access_logs')
      .select('*')
      .eq('site_id', currentSite.id)
      .is('voided_at', null)
      .gte('entry_at', startDate.toISOString())
      .lte('entry_at', endDate.toISOString())
      .order('entry_at', { ascending: true });

    // Calculate stats
    const totalEntries = (logs || []).length;
    const totalExits = (logs || []).filter(l => l.exit_at).length;
    
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

    return {
      period: { from: dateFrom, to: dateTo },
      site: currentSite.name,
      totalEntries,
      totalExits,
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
      const headers = ['Fecha Entrada', 'Hora Entrada', 'Fecha Salida', 'Hora Salida', 'Nombre', 'CI', 'Tipo', 'Contratista', 'Observaciones'];
      const rows = data.logs.map(log => {
        const entryDate = new Date(log.entry_at);
        const exitDate = log.exit_at ? new Date(log.exit_at) : null;
        return [
          entryDate.toLocaleDateString('es-BO'),
          entryDate.toLocaleTimeString('es-BO'),
          exitDate?.toLocaleDateString('es-BO') || '',
          exitDate?.toLocaleTimeString('es-BO') || '',
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

      // Create a printable HTML
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Reporte ${data.site}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 40px; color: #1a1a2e; }
            h1 { font-size: 24px; margin-bottom: 8px; }
            h2 { font-size: 18px; margin-top: 32px; margin-bottom: 16px; color: #4a4a6a; }
            .subtitle { color: #6b7280; margin-bottom: 32px; }
            .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
            .stat { background: #f6f7fb; padding: 16px; border-radius: 12px; }
            .stat-value { font-size: 28px; font-weight: 600; }
            .stat-label { color: #6b7280; font-size: 14px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
            th { background: #f6f7fb; font-weight: 500; }
            .footer { margin-top: 48px; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <h1>Reporte de Accesos - ${data.site}</h1>
          <p class="subtitle">Período: ${data.period.from} al ${data.period.to}</p>
          
          <div class="stats">
            <div class="stat">
              <div class="stat-value">${data.totalEntries}</div>
              <div class="stat-label">Total Entradas</div>
            </div>
            <div class="stat">
              <div class="stat-value">${data.totalExits}</div>
              <div class="stat-label">Total Salidas</div>
            </div>
            <div class="stat">
              <div class="stat-value">${Object.keys(data.byContractor).length}</div>
              <div class="stat-label">Contratistas</div>
            </div>
          </div>

          <h2>Resumen por Día</h2>
          <table>
            <thead><tr><th>Fecha</th><th>Entradas</th><th>Salidas</th></tr></thead>
            <tbody>
              ${Object.entries(data.byDay).map(([day, stats]) => 
                `<tr><td>${day}</td><td>${stats.entries}</td><td>${stats.exits}</td></tr>`
              ).join('')}
            </tbody>
          </table>

          <h2>Por Contratista</h2>
          <table>
            <thead><tr><th>Contratista</th><th>Accesos</th></tr></thead>
            <tbody>
              ${Object.entries(data.byContractor)
                .sort(([,a], [,b]) => b - a)
                .map(([contractor, count]) => 
                  `<tr><td>${contractor}</td><td>${count}</td></tr>`
                ).join('')}
            </tbody>
          </table>

          <div class="footer">
            Generado: ${new Date().toLocaleString('es-BO')} | BRIK Control de Accesos
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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <FileText className="w-6 h-6 text-primary" />
        <h3 className="text-lg font-medium">Reportes</h3>
      </div>

      <div className="card-cosmos p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Fecha desde</Label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Fecha hasta</Label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button onClick={downloadCSV} disabled={generating || !dateFrom || !dateTo} variant="outline">
            {generating ? <Spinner size="sm" className="mr-2" /> : <Download className="w-4 h-4 mr-2" />}
            Descargar CSV
          </Button>
          <Button onClick={generatePDF} disabled={generating || !dateFrom || !dateTo}>
            {generating ? <Spinner size="sm" className="mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
            Generar PDF
          </Button>
        </div>
      </div>

      {/* Email section */}
      <div className="card-cosmos p-6 space-y-4">
        <h4 className="font-medium">Enviar por correo</h4>
        <AlertCosmos type="info">
          Configura RESEND_API_KEY en las variables de entorno para habilitar el envío por correo.
        </AlertCosmos>
        <div className="flex gap-3">
          <Input 
            type="email" 
            placeholder="correo@ejemplo.com" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1"
          />
          <Button variant="outline" disabled>
            <Mail className="w-4 h-4 mr-2" /> Enviar
          </Button>
        </div>
      </div>

      {/* WhatsApp section */}
      <div className="card-cosmos p-6 space-y-4">
        <h4 className="font-medium">Enviar por WhatsApp</h4>
        <AlertCosmos type="info">
          Configura WHATSAPP_PROVIDER y WHATSAPP_TOKEN para habilitar el envío por WhatsApp.
        </AlertCosmos>
        <Button variant="outline" disabled>
          <MessageSquare className="w-4 h-4 mr-2" /> Enviar por WhatsApp
        </Button>
      </div>
    </div>
  );
}
