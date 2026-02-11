-- =====================================================
-- BRIK Pro - Demo Auto-Simulation
-- Genera actividad automática para Proyecto X (demo)
-- SOLO afecta site_id = 'd67ff32e-5094-4d2a-ad3c-8d6f7ae07e37'
-- =====================================================

CREATE OR REPLACE FUNCTION simulate_demo_activity(p_site_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_tz TEXT := 'America/La_Paz';
  v_now TIMESTAMPTZ := now();
  v_local_now TIMESTAMP := v_now AT TIME ZONE v_tz;
  v_current_hour INTEGER := EXTRACT(HOUR FROM v_local_now);
  v_today DATE := (v_now AT TIME ZONE v_tz)::DATE;
  v_last_activity_date DATE;
  v_day DATE;
  v_worker RECORD;
  v_entry_time TIMESTAMPTZ;
  v_exit_time TIMESTAMPTZ;
  v_attendance_rate NUMERIC;
  v_entries_created INTEGER := 0;
  v_exits_created INTEGER := 0;
  v_backfill_days INTEGER := 0;
  v_stale_closed INTEGER := 0;
BEGIN
  -- =========================================
  -- PASO 1: Cerrar entradas viejas (stale)
  -- Workers que quedaron "dentro" de días anteriores
  -- =========================================
  UPDATE access_logs
  SET exit_at = ((entry_at AT TIME ZONE v_tz)::DATE + INTERVAL '18 hours' 
                + (floor(random() * 120) * INTERVAL '1 minute'))
                AT TIME ZONE v_tz
                -- Salida entre 6pm-8pm del mismo día
  WHERE site_id = p_site_id
    AND exit_at IS NULL
    AND voided_at IS NULL
    AND (entry_at AT TIME ZONE v_tz)::DATE < v_today;
  
  GET DIAGNOSTICS v_stale_closed = ROW_COUNT;

  -- =========================================
  -- PASO 2: Backfill de días faltantes
  -- Encontrar último día con actividad y rellenar hasta ayer
  -- =========================================
  SELECT MAX((entry_at AT TIME ZONE v_tz)::DATE)
  INTO v_last_activity_date
  FROM access_logs
  WHERE site_id = p_site_id;

  -- Si no hay datos o la última actividad es de antes de ayer
  IF v_last_activity_date IS NULL OR v_last_activity_date < v_today - 1 THEN
    -- Rellenar desde el día después de la última actividad hasta ayer
    v_day := COALESCE(v_last_activity_date + 1, v_today - 14);
    
    WHILE v_day < v_today LOOP
      -- Saltar domingos
      IF EXTRACT(DOW FROM v_day) != 0 THEN
        -- Asistencia variable (70-90%)
        v_attendance_rate := 0.70 + (random() * 0.20);
        
        FOR v_worker IN (
          SELECT p.id, p.ci, p.full_name, p.type, p.contractor
          FROM people p
          WHERE p.site_id = p_site_id AND p.type = 'worker'
          ORDER BY random()
        ) LOOP
          CONTINUE WHEN random() > v_attendance_rate;
          
          -- Entrada: 5:00-7:00 AM
          v_entry_time := (v_day + (5 * INTERVAL '1 hour') + 
                          (floor(random() * 120) * INTERVAL '1 minute'))
                          AT TIME ZONE v_tz;
          
          -- Salida: 2:00-8:00 PM
          v_exit_time := (v_day + (14 * INTERVAL '1 hour') +
                         (floor(random() * 360) * INTERVAL '1 minute'))
                         AT TIME ZONE v_tz;
          
          INSERT INTO access_logs (
            site_id, person_id, entry_at, exit_at,
            ci_snapshot, name_snapshot, type_snapshot, contractor_snapshot
          ) VALUES (
            p_site_id, v_worker.id, v_entry_time, v_exit_time,
            v_worker.ci, v_worker.full_name, v_worker.type, v_worker.contractor
          );
          
          v_entries_created := v_entries_created + 1;
        END LOOP;
        
        -- Agregar 1-3 visitantes por día de backfill
        FOR v_worker IN (
          SELECT p.id, p.ci, p.full_name, p.type, p.contractor
          FROM people p
          WHERE p.site_id = p_site_id AND p.type = 'visitor'
          ORDER BY random()
          LIMIT 1 + floor(random() * 3)::INTEGER
        ) LOOP
          v_entry_time := (v_day + (9 * INTERVAL '1 hour') +
                          (floor(random() * 240) * INTERVAL '1 minute'))
                          AT TIME ZONE v_tz;
          v_exit_time := v_entry_time + (1 + floor(random() * 4)) * INTERVAL '1 hour';
          
          INSERT INTO access_logs (
            site_id, person_id, entry_at, exit_at,
            ci_snapshot, name_snapshot, type_snapshot, contractor_snapshot
          ) VALUES (
            p_site_id, v_worker.id, v_entry_time, v_exit_time,
            v_worker.ci, v_worker.full_name, v_worker.type, v_worker.contractor
          );
          v_entries_created := v_entries_created + 1;
        END LOOP;
        
        v_backfill_days := v_backfill_days + 1;
      END IF;
      
      v_day := v_day + 1;
    END LOOP;
  END IF;

  -- =========================================
  -- PASO 3: Generar actividad de HOY
  -- Solo si es día laboral y horario laboral
  -- =========================================
  
  -- Saltar domingos
  IF EXTRACT(DOW FROM v_today) = 0 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Domingo - sin actividad',
      'stale_closed', v_stale_closed,
      'backfill_days', v_backfill_days,
      'entries_created', v_entries_created
    );
  END IF;
  
  -- Solo generar actividad entre 5am y 10pm
  IF v_current_hour < 5 OR v_current_hour >= 22 THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Fuera de horario laboral',
      'stale_closed', v_stale_closed,
      'backfill_days', v_backfill_days,
      'entries_created', v_entries_created
    );
  END IF;

  -- ENTRADAS: Generar nuevas entradas si es hora de ingreso (5am-10am)
  IF v_current_hour >= 5 AND v_current_hour < 10 THEN
    -- Calcular cuántos deberían entrar en esta ronda
    -- Más temprano = más entradas
    v_attendance_rate := CASE
      WHEN v_current_hour BETWEEN 5 AND 6 THEN 0.08  -- 8% del total
      WHEN v_current_hour BETWEEN 7 AND 8 THEN 0.06  -- 6% del total
      ELSE 0.03  -- 3% del total (llegadas tarde)
    END;
    
    FOR v_worker IN (
      SELECT p.id, p.ci, p.full_name, p.type, p.contractor
      FROM people p
      WHERE p.site_id = p_site_id 
        AND p.type = 'worker'
        -- Solo workers que NO están adentro hoy
        AND NOT EXISTS (
          SELECT 1 FROM access_logs al
          WHERE al.site_id = p_site_id
            AND al.person_id = p.id
            AND al.exit_at IS NULL
            AND al.voided_at IS NULL
        )
        -- Y que NO tienen entrada HOY (evitar doble entrada)
        AND NOT EXISTS (
          SELECT 1 FROM access_logs al
          WHERE al.site_id = p_site_id
            AND al.person_id = p.id
            AND (al.entry_at AT TIME ZONE v_tz)::DATE = v_today
        )
      ORDER BY random()
    ) LOOP
      CONTINUE WHEN random() > v_attendance_rate;
      
      -- Entrada con hora actual ± 15 min
      v_entry_time := v_now - (floor(random() * 15) * INTERVAL '1 minute');
      
      INSERT INTO access_logs (
        site_id, person_id, entry_at,
        ci_snapshot, name_snapshot, type_snapshot, contractor_snapshot
      ) VALUES (
        p_site_id, v_worker.id, v_entry_time,
        v_worker.ci, v_worker.full_name, v_worker.type, v_worker.contractor
      );
      
      v_entries_created := v_entries_created + 1;
    END LOOP;
  END IF;

  -- SALIDAS: Generar salidas si es hora de salida (14-22)
  IF v_current_hour >= 14 THEN
    -- Probabilidad de salir aumenta con la hora
    v_attendance_rate := CASE
      WHEN v_current_hour BETWEEN 14 AND 15 THEN 0.03  -- Pocas salidas tempranas
      WHEN v_current_hour BETWEEN 16 AND 17 THEN 0.08  -- Salidas normales
      WHEN v_current_hour BETWEEN 18 AND 19 THEN 0.15  -- Hora pico de salida
      WHEN v_current_hour >= 20 THEN 0.30              -- Todos salen
      ELSE 0.05
    END;
    
    FOR v_worker IN (
      SELECT al.id as log_id, al.person_id, al.entry_at
      FROM access_logs al
      WHERE al.site_id = p_site_id
        AND al.exit_at IS NULL
        AND al.voided_at IS NULL
        AND (al.entry_at AT TIME ZONE v_tz)::DATE = v_today
      ORDER BY random()
    ) LOOP
      CONTINUE WHEN random() > v_attendance_rate;
      
      -- Salida con hora actual ± 10 min
      v_exit_time := v_now - (floor(random() * 10) * INTERVAL '1 minute');
      
      UPDATE access_logs
      SET exit_at = v_exit_time
      WHERE id = v_worker.log_id;
      
      v_exits_created := v_exits_created + 1;
    END LOOP;
  END IF;

  -- VISITANTES: 10% de probabilidad de agregar un visitante
  IF random() < 0.10 AND v_current_hour BETWEEN 8 AND 17 THEN
    FOR v_worker IN (
      SELECT p.id, p.ci, p.full_name, p.type, p.contractor
      FROM people p
      WHERE p.site_id = p_site_id AND p.type = 'visitor'
      AND NOT EXISTS (
        SELECT 1 FROM access_logs al
        WHERE al.person_id = p.id
          AND al.exit_at IS NULL
          AND al.voided_at IS NULL
      )
      ORDER BY random()
      LIMIT 1
    ) LOOP
      v_entry_time := v_now - (floor(random() * 10) * INTERVAL '1 minute');
      
      INSERT INTO access_logs (
        site_id, person_id, entry_at,
        ci_snapshot, name_snapshot, type_snapshot, contractor_snapshot
      ) VALUES (
        p_site_id, v_worker.id, v_entry_time,
        v_worker.ci, v_worker.full_name, v_worker.type, v_worker.contractor
      );
      v_entries_created := v_entries_created + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'current_hour', v_current_hour,
    'stale_closed', v_stale_closed,
    'backfill_days', v_backfill_days,
    'entries_created', v_entries_created,
    'exits_created', v_exits_created,
    'inside_now', (
      SELECT COUNT(*) FROM access_logs
      WHERE site_id = p_site_id AND exit_at IS NULL AND voided_at IS NULL
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION simulate_demo_activity(UUID) IS 
'Genera actividad automática para el demo. Cierra entries viejas, backfills días faltantes, y genera entries/exits según hora actual. SOLO para Proyecto X demo.';
