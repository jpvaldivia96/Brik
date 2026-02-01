-- =====================================================
-- BRIK Pro - Demo Seed Data v2
-- "Proyecto X" - ~130 trabajadores bolivianos
-- Fotos RandomUser, Inducción 70%, Horarios 6am-6pm±4h
-- =====================================================

-- Función para generar datos de demo
CREATE OR REPLACE FUNCTION seed_demo_data(p_site_id UUID)
RETURNS void AS $$
DECLARE
  v_person_id UUID;
  v_ci_base INTEGER := 10000000; -- Base para generar CIs únicos
  v_worker_count INTEGER := 0;
  
  -- 15 Contratistas
  v_contractors TEXT[] := ARRAY[
    'Constructora Axis SRL',
    'Instalaciones Eléctricas ProVolt',
    'Climatización Frío Sur Ltda',
    'Pinturas y Terminaciones Deco',
    'Estructuras Metálicas del Sur',
    'Servicios de Seguridad Shield',
    'Limpieza Industrial CleanPro',
    'Hormigones Ready Mix',
    'Cerámicas y Revestimientos Tile',
    'Gasfitería Integral Aqua',
    'Carpintería Madera Noble',
    'Impermeabilizaciones WaterStop',
    'Vidriería Cristal Plus',
    'Instalaciones Sanitarias Flow',
    'Paisajismo Verde Vivo'
  ];
  
  -- Roles por contratista (8-10 trabajadores cada uno)
  v_roles_construccion TEXT[] := ARRAY[
    'Capataz',
    'Albañil',
    'Encofrador',
    'Fierrero',
    'Operador de Maquinaria',
    'Ayudante General',
    'Maestro de Obra',
    'Topógrafo',
    'Jornal'
  ];
  
  v_roles_electricos TEXT[] := ARRAY[
    'Electricista Jefe',
    'Electricista',
    'Técnico Eléctrico',
    'Ayudante Electricista',
    'Programador PLC',
    'Instalador de Tableros',
    'Técnico en Corrientes Débiles',
    'Supervisor Eléctrico'
  ];
  
  v_roles_clima TEXT[] := ARRAY[
    'Técnico HVAC',
    'Instalador de Ductos',
    'Soldador de Cobre',
    'Técnico en Refrigeración',
    'Ayudante de Climatización',
    'Supervisor HVAC',
    'Técnico en VRV',
    'Instalador Split'
  ];
  
  v_roles_pinturas TEXT[] := ARRAY[
    'Maestro Pintor',
    'Pintor',
    'Estucador',
    'Empastador',
    'Aplicador de Textura',
    'Lijador',
    'Ayudante Pintor',
    'Supervisor de Terminaciones'
  ];
  
  v_roles_estructura TEXT[] := ARRAY[
    'Soldador Certificado',
    'Armador de Estructura',
    'Operador de Grúa',
    'Plegador',
    'Cortador de Metal',
    'Tornero',
    'Ayudante Soldador',
    'Supervisor Estructural',
    'Rigger'
  ];
  
  v_roles_seguridad TEXT[] := ARRAY[
    'Jefe de Seguridad',
    'Guardia',
    'Prevencionista de Riesgos',
    'Controlador de Acceso',
    'Paramédico',
    'Técnico en Emergencias',
    'Guardia Nocturno',
    'Supervisor de Turno'
  ];
  
  v_roles_limpieza TEXT[] := ARRAY[
    'Supervisor de Limpieza',
    'Operador de Hidrolavado',
    'Personal de Aseo',
    'Recolector de Escombros',
    'Operador de Contenedores',
    'Auxiliar de Limpieza',
    'Conductor de Camión',
    'Encargado de Residuos'
  ];
  
  v_roles_hormigon TEXT[] := ARRAY[
    'Operador de Mixer',
    'Bombearista',
    'Vibratorista',
    'Allanador',
    'Pulidor de Hormigón',
    'Ayudante de Hormigón',
    'Supervisor de Vaciado',
    'Laboratorista'
  ];
  
  v_roles_ceramica TEXT[] := ARRAY[
    'Maestro Ceramista',
    'Colocador de Porcelanato',
    'Fragüador',
    'Cortador de Cerámica',
    'Instalador de Piedra',
    'Ayudante Ceramista',
    'Pulidor',
    'Supervisor de Revestimientos'
  ];
  
  v_roles_gasfiteria TEXT[] := ARRAY[
    'Gasfíter Jefe',
    'Gasfíter',
    'Instalador Sanitario',
    'Soldador de PVC',
    'Técnico en Gas',
    'Ayudante Gasfíter',
    'Instalador de Artefactos',
    'Supervisor Sanitario'
  ];
  
  v_roles_carpinteria TEXT[] := ARRAY[
    'Maestro Carpintero',
    'Carpintero',
    'Instalador de Muebles',
    'Diseñador de Cocinas',
    'Laminador',
    'Ayudante Carpintero',
    'Tornero en Madera',
    'Supervisor de Carpintería'
  ];
  
  v_roles_impermeab TEXT[] := ARRAY[
    'Especialista en Membranas',
    'Aplicador de Impermeabilizantes',
    'Técnico en Juntas',
    'Instalador de Geomembranas',
    'Soldador de Mantas',
    'Ayudante de Impermeabilización',
    'Supervisor de Impermeabilización',
    'Control de Calidad'
  ];
  
  v_roles_vidrieria TEXT[] := ARRAY[
    'Maestro Vidriero',
    'Instalador de Ventanas',
    'Cortador de Vidrio',
    'Instalador de Muro Cortina',
    'Sellador',
    'Ayudante Vidriero',
    'Pulidor de Cristal',
    'Supervisor de Vidriería'
  ];
  
  v_roles_sanitarias TEXT[] := ARRAY[
    'Ingeniero Sanitario',
    'Técnico en Tratamiento de Agua',
    'Instalador de Bombas',
    'Plomero Industrial',
    'Técnico en Alcantarillado',
    'Ayudante Sanitario',
    'Operador de Equipos',
    'Supervisor de Instalaciones'
  ];
  
  v_roles_paisajismo TEXT[] := ARRAY[
    'Paisajista',
    'Jardinero',
    'Instalador de Riego',
    'Podador',
    'Técnico en Césped',
    'Operador de Maquinaria Verde',
    'Ayudante de Jardinería',
    'Supervisor de Áreas Verdes'
  ];
  
  -- Nombres bolivianos comunes
  v_nombres TEXT[] := ARRAY[
    'Juan Carlos', 'María', 'Carlos', 'Ana María', 'Pedro',
    'Rosa', 'Miguel', 'Carmen', 'José', 'Isabel',
    'Jorge', 'Patricia', 'Roberto', 'Marcela', 'Antonio',
    'Claudia', 'Sergio', 'Francisca', 'Mauricio', 'Camila',
    'Luis', 'Elena', 'Fernando', 'Silvia', 'Ramón',
    'Verónica', 'Hernán', 'Mónica', 'Oscar', 'Teresa',
    'Ricardo', 'Alejandra', 'Hugo', 'Sandra', 'Víctor',
    'Carla', 'Gonzalo', 'Paola', 'Enrique', 'Lorena',
    'Arturo', 'Gloria', 'Alberto', 'Beatriz', 'Marco',
    'Adriana', 'Nelson', 'Ximena', 'Edgar', 'Sonia',
    'Rubén', 'Liliana', 'Jaime', 'Cecilia', 'Rolando',
    'Magaly', 'Milton', 'Rosario', 'Edwin', 'Norma',
    'Freddy', 'Ruth', 'Iván', 'Miriam', 'Jhonny',
    'Yolanda', 'Willy', 'Nancy', 'Ever', 'Marlene',
    'Boris', 'Gladys', 'Limbert', 'Deysi', 'Grover',
    'Elvira', 'Efraín', 'Juana', 'Zenón', 'Petrona'
  ];
  
  -- Apellidos bolivianos típicos
  v_apellidos TEXT[] := ARRAY[
    'Mamani', 'Quispe', 'Condori', 'Choque', 'Flores',
    'Huanca', 'Limachi', 'Calle', 'Apaza', 'Marca',
    'Poma', 'Vela', 'Yujra', 'Callisaya', 'Gemio',
    'Nina', 'Tito', 'Ramos', 'Vargas', 'Fernández',
    'Cruz', 'López', 'García', 'Ticona', 'Chambi',
    'Churata', 'Copa', 'Tarqui', 'Alanoca', 'Layme',
    'Colque', 'Suxo', 'Catari', 'Ayala', 'Morales',
    'Rojas', 'Castro', 'Torrez', 'Aguilar', 'Chura',
    'Villca', 'Mendoza', 'Paredes', 'Escobar', 'Gonzales',
    'Gutiérrez', 'Herrera', 'Jiménez', 'Sánchez', 'Rivera'
  ];
  
  -- Grupos sanguíneos
  v_blood_types TEXT[] := ARRAY['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
  
  -- Variables temporales
  v_contractor TEXT;
  v_role TEXT;
  v_full_name TEXT;
  v_phone TEXT;
  v_emergency_phone TEXT;
  v_blood_type TEXT;
  v_insurance_expiry DATE;
  v_insurance_number TEXT;
  v_induction_date DATE;
  v_roles_array TEXT[];
  v_workers_per_contractor INTEGER;
  v_photo_url TEXT;
  v_is_female BOOLEAN;
  v_photo_num INTEGER;
  
BEGIN
  -- Iterar por cada contratista
  FOR c_idx IN 1..array_length(v_contractors, 1) LOOP
    v_contractor := v_contractors[c_idx];
    
    -- Determinar roles según tipo de contratista
    CASE c_idx
      WHEN 1 THEN v_roles_array := v_roles_construccion;
      WHEN 2 THEN v_roles_array := v_roles_electricos;
      WHEN 3 THEN v_roles_array := v_roles_clima;
      WHEN 4 THEN v_roles_array := v_roles_pinturas;
      WHEN 5 THEN v_roles_array := v_roles_estructura;
      WHEN 6 THEN v_roles_array := v_roles_seguridad;
      WHEN 7 THEN v_roles_array := v_roles_limpieza;
      WHEN 8 THEN v_roles_array := v_roles_hormigon;
      WHEN 9 THEN v_roles_array := v_roles_ceramica;
      WHEN 10 THEN v_roles_array := v_roles_gasfiteria;
      WHEN 11 THEN v_roles_array := v_roles_carpinteria;
      WHEN 12 THEN v_roles_array := v_roles_impermeab;
      WHEN 13 THEN v_roles_array := v_roles_vidrieria;
      WHEN 14 THEN v_roles_array := v_roles_sanitarias;
      WHEN 15 THEN v_roles_array := v_roles_paisajismo;
      ELSE v_roles_array := v_roles_construccion;
    END CASE;
    
    -- 8-10 trabajadores por contratista
    v_workers_per_contractor := 8 + floor(random() * 3)::INTEGER;
    
    FOR w_idx IN 1..v_workers_per_contractor LOOP
      v_worker_count := v_worker_count + 1;
      
      -- 15% mujeres en construcción
      v_is_female := random() < 0.15;
      
      -- Generar datos del trabajador
      v_full_name := v_nombres[1 + floor(random() * array_length(v_nombres, 1))::INTEGER] || ' ' ||
                     v_apellidos[1 + floor(random() * array_length(v_apellidos, 1))::INTEGER] || ' ' ||
                     v_apellidos[1 + floor(random() * array_length(v_apellidos, 1))::INTEGER];
      
      v_role := v_roles_array[1 + ((w_idx - 1) % array_length(v_roles_array, 1))];
      v_phone := '+591' || (60000000 + floor(random() * 39999999)::INTEGER)::TEXT;
      v_emergency_phone := '+591' || (60000000 + floor(random() * 39999999)::INTEGER)::TEXT;
      v_blood_type := v_blood_types[1 + floor(random() * array_length(v_blood_types, 1))::INTEGER];
      
      -- Foto usando RandomUser.me (fotos reales variadas)
      v_photo_num := floor(random() * 99)::INTEGER;
      IF v_is_female THEN
        v_photo_url := 'https://randomuser.me/api/portraits/women/' || v_photo_num || '.jpg';
      ELSE
        v_photo_url := 'https://randomuser.me/api/portraits/men/' || v_photo_num || '.jpg';
      END IF;
      
      -- Seguro: mayoría vigente, algunos por vencer, 5% sin seguro
      IF random() < 0.05 THEN
        -- 5% sin seguro
        v_insurance_expiry := NULL;
        v_insurance_number := NULL;
      ELSIF random() < 0.15 THEN
        -- 15% próximo a vencer (dentro de 30 días)
        v_insurance_expiry := CURRENT_DATE + (1 + floor(random() * 29))::INTEGER;
        v_insurance_number := 'SEG-' || LPAD(v_worker_count::TEXT, 6, '0');
      ELSIF random() < 0.10 THEN
        -- 10% ya vencido
        v_insurance_expiry := CURRENT_DATE - (1 + floor(random() * 30))::INTEGER;
        v_insurance_number := 'SEG-' || LPAD(v_worker_count::TEXT, 6, '0');
      ELSE
        -- Resto con seguro vigente (30 días a 1 año)
        v_insurance_expiry := CURRENT_DATE + (30 + floor(random() * 335))::INTEGER;
        v_insurance_number := 'SEG-' || LPAD(v_worker_count::TEXT, 6, '0');
      END IF;
      
      -- Inducción: 70% completada, 30% pendiente
      IF random() < 0.70 THEN
        -- Inducción completada en los últimos 6 meses
        v_induction_date := CURRENT_DATE - floor(random() * 180)::INTEGER;
      ELSE
        v_induction_date := NULL;
      END IF;
      
      -- Insertar persona
      INSERT INTO people (
        site_id, ci, full_name, type, contractor, photo_url
      ) VALUES (
        p_site_id,
        (v_ci_base + v_worker_count)::TEXT || '-' || ((v_worker_count % 10) + 1)::TEXT,
        v_full_name,
        'worker',
        v_contractor,
        v_photo_url
      ) RETURNING id INTO v_person_id;
      
      -- Insertar perfil de trabajador
      INSERT INTO workers_profile (
        person_id, 
        insurance_number, 
        insurance_expiry,
        phone,
        emergency_contact,
        blood_type,
        induction_date,
        role
      ) VALUES (
        v_person_id,
        v_insurance_number,
        v_insurance_expiry,
        v_phone,
        v_emergency_phone,
        v_blood_type,
        v_induction_date,
        v_role
      );
      
    END LOOP;
  END LOOP;
  
  -- Generar 15 visitantes
  FOR v_idx IN 1..15 LOOP
    v_is_female := random() < 0.40; -- 40% mujeres visitantes
    v_full_name := v_nombres[1 + floor(random() * array_length(v_nombres, 1))::INTEGER] || ' ' ||
                   v_apellidos[1 + floor(random() * array_length(v_apellidos, 1))::INTEGER];
    
    v_photo_num := floor(random() * 99)::INTEGER;
    IF v_is_female THEN
      v_photo_url := 'https://randomuser.me/api/portraits/women/' || v_photo_num || '.jpg';
    ELSE
      v_photo_url := 'https://randomuser.me/api/portraits/men/' || v_photo_num || '.jpg';
    END IF;
    
    INSERT INTO people (
      site_id, ci, full_name, type, contractor, photo_url
    ) VALUES (
      p_site_id,
      (20000000 + v_idx)::TEXT || '-K',
      v_full_name,
      'visitor',
      NULL,
      v_photo_url
    ) RETURNING id INTO v_person_id;
    
    INSERT INTO visitors_profile (person_id, company)
    VALUES (
      v_person_id,
      (ARRAY[
        'Inmobiliaria Norte Sur',
        'Banco Unión',
        'Alcaldía Municipal',
        'Inspección Técnica de Obra',
        'Proveedor de Materiales',
        'Arquitecto Supervisor',
        'Ingeniero Estructural',
        'Cliente Final',
        'Auditoría de Calidad',
        'Seguros Illimani'
      ])[1 + (v_idx % 10)]
    );
  END LOOP;
  
  -- =========================================
  -- Generar registros de acceso del último mes
  -- Horario: 6am entrada, 6pm±4h salida (2pm-10pm)
  -- =========================================
  DECLARE
    v_day DATE;
    v_entry_time TIMESTAMP;
    v_exit_time TIMESTAMP;
    v_worker RECORD;
    v_attendance_rate NUMERIC;
  BEGIN
    -- Iterar por los últimos 30 días (excluyendo domingos)
    FOR day_offset IN 0..29 LOOP
      v_day := CURRENT_DATE - day_offset;
      
      -- Saltar solo domingos (sábado trabajan en construcción boliviana)
      CONTINUE WHEN EXTRACT(DOW FROM v_day) = 0;
      
      -- Asistencia variable por día (70-95%)
      v_attendance_rate := 0.70 + (random() * 0.25);
      
      -- Para cada trabajador, decidir si asiste
      FOR v_worker IN (
        SELECT p.id, p.ci, p.full_name, p.type, p.contractor
        FROM people p
        WHERE p.site_id = p_site_id AND p.type = 'worker'
        ORDER BY random()
      ) LOOP
        -- Verificar si asiste hoy
        CONTINUE WHEN random() > v_attendance_rate;
        
        -- Hora de entrada: 5:00 - 7:00 AM (centrado en 6am)
        v_entry_time := v_day + 
          (5 * INTERVAL '1 hour') + 
          (floor(random() * 120) * INTERVAL '1 minute');  -- 5:00 a 7:00
        
        -- Hora de salida: 14:00 - 22:00 (6pm ± 4 horas)
        -- Permanencia variable de 8 a 14+ horas
        IF day_offset = 0 AND random() < 0.4 THEN
          -- 40% de entradas del día de hoy sin salida (aún adentro)
          v_exit_time := NULL;
        ELSE
          v_exit_time := v_day + 
            (14 * INTERVAL '1 hour') +
            (floor(random() * 480) * INTERVAL '1 minute');  -- 2pm a 10pm
        END IF;
        
        INSERT INTO access_logs (
          site_id, person_id, 
          entry_at, exit_at,
          ci_snapshot, name_snapshot, type_snapshot, contractor_snapshot
        ) VALUES (
          p_site_id, v_worker.id,
          v_entry_time, v_exit_time,
          v_worker.ci, v_worker.full_name, v_worker.type, v_worker.contractor
        );
        
      END LOOP;
      
      -- Agregar algunas visitas (1-3 por día)
      FOR v_worker IN (
        SELECT p.id, p.ci, p.full_name, p.type, p.contractor
        FROM people p
        WHERE p.site_id = p_site_id AND p.type = 'visitor'
        ORDER BY random()
        LIMIT 1 + floor(random() * 3)::INTEGER
      ) LOOP
        v_entry_time := v_day + 
          (9 * INTERVAL '1 hour') +
          (floor(random() * 240) * INTERVAL '1 minute');
        
        v_exit_time := v_entry_time + 
          (1 + floor(random() * 4)) * INTERVAL '1 hour';
        
        INSERT INTO access_logs (
          site_id, person_id, 
          entry_at, exit_at,
          ci_snapshot, name_snapshot, type_snapshot, contractor_snapshot
        ) VALUES (
          p_site_id, v_worker.id,
          v_entry_time, v_exit_time,
          v_worker.ci, v_worker.full_name, v_worker.type, v_worker.contractor
        );
      END LOOP;
      
    END LOOP;
  END;
  
  RAISE NOTICE 'Demo data seeded: % workers, 15 visitors, ~26 days of access logs', v_worker_count;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Función para resetear el site demo a valores iniciales
-- =====================================================
CREATE OR REPLACE FUNCTION reset_demo_site(p_site_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_people_deleted INTEGER;
  v_logs_deleted INTEGER;
BEGIN
  -- Contar antes de eliminar
  SELECT COUNT(*) INTO v_logs_deleted FROM access_logs WHERE site_id = p_site_id;
  SELECT COUNT(*) INTO v_people_deleted FROM people WHERE site_id = p_site_id;
  
  -- Eliminar todos los datos relacionados
  DELETE FROM access_logs WHERE site_id = p_site_id;
  DELETE FROM favorites WHERE site_id = p_site_id;
  DELETE FROM audit_events WHERE site_id = p_site_id;
  DELETE FROM people WHERE site_id = p_site_id; -- Cascade elimina workers_profile y visitors_profile
  
  -- Regenerar datos frescos
  PERFORM seed_demo_data(p_site_id);
  
  RETURN jsonb_build_object(
    'success', true,
    'deleted', jsonb_build_object(
      'people', v_people_deleted,
      'access_logs', v_logs_deleted
    ),
    'message', 'Demo reset successfully'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- Comentarios para documentación
-- =====================================================
COMMENT ON FUNCTION seed_demo_data(UUID) IS 
'Genera datos de demo bolivianos: ~130 trabajadores, 15 contratistas, 15 visitantes, 1 mes de registros. Fotos RandomUser, 70% con inducción, horarios 6am-6pm±4h';

COMMENT ON FUNCTION reset_demo_site(UUID) IS 
'Elimina todos los datos de un site demo y regenera datos frescos usando seed_demo_data';
