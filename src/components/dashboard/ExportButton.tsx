import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileSpreadsheet } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';

interface ExportButtonProps {
    data: Array<{
        full_name: string;
        ci: string;
        contractor_snapshot: string | null;
        role?: string | null;
        entry_at: string;
        hours: number;
        status: 'ok' | 'warn' | 'crit';
        insurance_expiry: string | null;
        induction_date: string | null;
    }>;
    selectedDate: string;
    siteName?: string;
}

export function ExportButton({ data, selectedDate, siteName = 'Obra' }: ExportButtonProps) {
    const [exporting, setExporting] = useState(false);

    const formatTime = (dateStr: string) => {
        return new Date(dateStr).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return '-';
        return new Date(dateStr).toLocaleDateString('es-BO');
    };

    const statusLabel = (status: 'ok' | 'warn' | 'crit') => {
        switch (status) {
            case 'crit': return 'Alerta';
            case 'warn': return 'Riesgo';
            default: return 'OK';
        }
    };

    const handleExport = () => {
        setExporting(true);

        try {
            // CSV Header
            const headers = [
                'Nombre',
                'CI',
                'Contratista',
                'Cargo',
                'Hora Entrada',
                'Horas',
                'Estado',
                'Venc. Seguro',
                'Inducción'
            ];

            // CSV Rows
            const rows = data.map(row => [
                row.full_name,
                row.ci,
                row.contractor_snapshot || 'Sin contratista',
                row.role || '-',
                formatTime(row.entry_at),
                row.hours.toFixed(1),
                statusLabel(row.status),
                formatDate(row.insurance_expiry),
                row.induction_date ? 'Sí' : 'No'
            ]);

            // Create CSV content with BOM for Excel compatibility
            const BOM = '\uFEFF';
            const csvContent = BOM + [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
            ].join('\n');

            // Create and download file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `asistencia_${siteName}_${selectedDate}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    };

    return (
        <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || data.length === 0}
            className="gap-2"
        >
            {exporting ? (
                <Spinner size="sm" />
            ) : (
                <FileSpreadsheet className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Exportar</span>
        </Button>
    );
}
