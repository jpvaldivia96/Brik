import { useState, useRef } from 'react';
import { useSite } from '@/contexts/SiteContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCosmos } from '@/components/ui/alert-cosmos';
import { Spinner } from '@/components/ui/spinner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileSpreadsheet, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

type ImportType = 'workers' | 'visitors' | 'records';

interface ImportResult {
  success: number;
  errors: string[];
}

export default function ImportTab() {
  const { currentSite } = useSite();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importType, setImportType] = useState<ImportType>('workers');
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  const parseCSV = (text: string): string[][] => {
    const lines = text.split('\n').filter(line => line.trim());
    return lines.map(line => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      return values;
    });
  };

  const parseDate = (dateStr: string): string | null => {
    if (!dateStr) return null;
    // Try dd/MM/yyyy format
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    // Try ISO format
    if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
      return dateStr.split('T')[0];
    }
    return null;
  };

  const parseDateTime = (dateStr: string, timeStr: string): string | null => {
    const date = parseDate(dateStr);
    if (!date) return null;
    const time = timeStr || '00:00:00';
    const timeParts = time.split(':');
    const hours = timeParts[0]?.padStart(2, '0') || '00';
    const mins = timeParts[1]?.padStart(2, '0') || '00';
    const secs = timeParts[2]?.padStart(2, '0') || '00';
    return `${date}T${hours}:${mins}:${secs}`;
  };

  const importWorkers = async (rows: string[][]): Promise<ImportResult> => {
    const result: ImportResult = { success: 0, errors: [] };
    // Skip header row
    for (let i = 1; i < rows.length; i++) {
      const [ci, name, contractor, insuranceNum, insuranceExp, phone, emergency, blood, photoUrl] = rows[i];
      if (!ci || !name) {
        result.errors.push(`Fila ${i + 1}: CI y Nombre son obligatorios`);
        continue;
      }

      try {
        // Check if person exists
        const { data: existing } = await supabase
          .from('people')
          .select('id')
          .eq('site_id', currentSite!.id)
          .eq('ci', ci.trim())
          .maybeSingle();

        let personId: string;
        if (existing) {
          personId = existing.id;
        } else {
          const { data: person, error: personError } = await supabase
            .from('people')
            .insert({
              site_id: currentSite!.id,
              ci: ci.trim(),
              full_name: name.trim(),
              type: 'worker',
              contractor: contractor?.trim() || null,
              photo_url: photoUrl?.trim() || null,
            })
            .select('id')
            .single();

          if (personError) throw personError;
          personId = person.id;
        }

        // Upsert worker profile
        await supabase
          .from('workers_profile')
          .upsert({
            person_id: personId,
            insurance_number: insuranceNum?.trim() || null,
            insurance_expiry: parseDate(insuranceExp || ''),
            phone: phone?.trim() || null,
            emergency_contact: emergency?.trim() || null,
            blood_type: blood?.trim() || null,
          });

        result.success++;
      } catch (err: any) {
        result.errors.push(`Fila ${i + 1} (${ci}): ${err.message}`);
      }
    }
    return result;
  };

  const importVisitors = async (rows: string[][]): Promise<ImportResult> => {
    const result: ImportResult = { success: 0, errors: [] };
    for (let i = 1; i < rows.length; i++) {
      const [ci, name, company] = rows[i];
      if (!ci || !name) {
        result.errors.push(`Fila ${i + 1}: CI y Nombre son obligatorios`);
        continue;
      }

      try {
        const { data: existing } = await supabase
          .from('people')
          .select('id')
          .eq('site_id', currentSite!.id)
          .eq('ci', ci.trim())
          .maybeSingle();

        let personId: string;
        if (existing) {
          personId = existing.id;
        } else {
          const { data: person, error: personError } = await supabase
            .from('people')
            .insert({
              site_id: currentSite!.id,
              ci: ci.trim(),
              full_name: name.trim(),
              type: 'visitor',
              contractor: company?.trim() || null,
            })
            .select('id')
            .single();

          if (personError) throw personError;
          personId = person.id;
        }

        await supabase
          .from('visitors_profile')
          .upsert({
            person_id: personId,
            company: company?.trim() || null,
          });

        result.success++;
      } catch (err: any) {
        result.errors.push(`Fila ${i + 1} (${ci}): ${err.message}`);
      }
    }
    return result;
  };

  const importRecords = async (rows: string[][]): Promise<ImportResult> => {
    const result: ImportResult = { success: 0, errors: [] };
    for (let i = 1; i < rows.length; i++) {
      const [dateEnt, timeEnt, dateSal, timeSal, type, ci, name, contractor, obs] = rows[i];
      if (!dateEnt || !ci) {
        result.errors.push(`Fila ${i + 1}: Fecha entrada y CI son obligatorios`);
        continue;
      }

      try {
        // Find or create person
        let { data: person } = await supabase
          .from('people')
          .select('id')
          .eq('site_id', currentSite!.id)
          .eq('ci', ci.trim())
          .maybeSingle();

        if (!person) {
          const personType = type?.toLowerCase() === 'visitor' || type?.toLowerCase() === 'visitante' 
            ? 'visitor' : 'worker';
          const { data: newPerson, error: personError } = await supabase
            .from('people')
            .insert({
              site_id: currentSite!.id,
              ci: ci.trim(),
              full_name: name?.trim() || 'Sin nombre',
              type: personType,
              contractor: contractor?.trim() || null,
            })
            .select('id')
            .single();

          if (personError) throw personError;
          person = newPerson;
        }

        const entryAt = parseDateTime(dateEnt, timeEnt);
        if (!entryAt) {
          result.errors.push(`Fila ${i + 1}: Formato de fecha/hora inválido`);
          continue;
        }

        const exitAt = dateSal ? parseDateTime(dateSal, timeSal || '') : null;

        await supabase
          .from('access_logs')
          .insert({
            site_id: currentSite!.id,
            person_id: person.id,
            entry_at: entryAt,
            exit_at: exitAt,
            observations: obs?.trim() || null,
            ci_snapshot: ci.trim(),
            name_snapshot: name?.trim() || null,
            contractor_snapshot: contractor?.trim() || null,
            type_snapshot: type?.toLowerCase() === 'visitor' || type?.toLowerCase() === 'visitante' 
              ? 'visitor' : 'worker',
          });

        result.success++;
      } catch (err: any) {
        result.errors.push(`Fila ${i + 1} (${ci}): ${err.message}`);
      }
    }
    return result;
  };

  const handleImport = async () => {
    if (!file || !currentSite) return;
    setImporting(true);
    setResult(null);

    try {
      const text = await file.text();
      const rows = parseCSV(text);

      let importResult: ImportResult;
      switch (importType) {
        case 'workers':
          importResult = await importWorkers(rows);
          break;
        case 'visitors':
          importResult = await importVisitors(rows);
          break;
        case 'records':
          importResult = await importRecords(rows);
          break;
      }

      // Log audit event
      await supabase.from('audit_events').insert({
        site_id: currentSite.id,
        action: 'IMPORT_COMPLETED',
        entity_type: importType,
        after: {
          file_name: file.name,
          success_count: importResult.success,
          error_count: importResult.errors.length,
        },
      });

      setResult(importResult);
      if (importResult.success > 0) {
        toast({ 
          title: 'Importación completada', 
          description: `${importResult.success} registros importados correctamente.` 
        });
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const getColumnInfo = () => {
    switch (importType) {
      case 'workers':
        return 'CI, NOMBRE, CONTRATISTA, N°SEGURO, FECHA_VENC, CELULAR, CONTACTO_REF, TIPO_SANGRE, FOTO_URL';
      case 'visitors':
        return 'CI, NOMBRE, EMPRESA';
      case 'records':
        return 'FECHA_ENT, HORA_ENT, FECHA_SAL, HORA_SAL, TIPO, CI, NOMBRE, CONTRATISTA, OBSERVACIONES';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Upload className="w-6 h-6 text-primary" />
        <h3 className="text-lg font-medium">Importar CSV</h3>
      </div>

      <div className="card-cosmos p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label>Tipo de importación</Label>
            <Select value={importType} onValueChange={(v) => setImportType(v as ImportType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="workers">Trabajadores</SelectItem>
                <SelectItem value="visitors">Visitantes</SelectItem>
                <SelectItem value="records">Registros de acceso</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Archivo CSV</Label>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </div>
        </div>

        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm font-medium mb-2">Columnas esperadas:</p>
          <code className="text-xs text-muted-foreground">{getColumnInfo()}</code>
          <p className="text-xs text-muted-foreground mt-2">
            Formato fecha: dd/MM/yyyy | Formato hora: HH:mm:ss
          </p>
        </div>

        <Button 
          onClick={handleImport} 
          disabled={importing || !file}
          className="w-full md:w-auto"
        >
          {importing ? (
            <><Spinner size="sm" className="mr-2" /> Importando...</>
          ) : (
            <><FileSpreadsheet className="w-4 h-4 mr-2" /> Importar</>
          )}
        </Button>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex items-center gap-2 text-status-ok">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">{result.success} exitosos</span>
            </div>
            {result.errors.length > 0 && (
              <div className="flex items-center gap-2 text-status-crit">
                <XCircle className="w-5 h-5" />
                <span className="font-medium">{result.errors.length} errores</span>
              </div>
            )}
          </div>

          {result.errors.length > 0 && (
            <div className="card-cosmos p-4 max-h-60 overflow-y-auto">
              <p className="text-sm font-medium mb-2">Errores:</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
