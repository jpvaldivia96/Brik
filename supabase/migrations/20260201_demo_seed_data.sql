-- =====================================================
-- BRIK Pro - Demo Seed Data
-- "Proyecto X" - ~130 trabajadores, 15 contratistas
-- =====================================================

-- Función para generar datos de demo
CREATE OR REPLACE FUNCTION seed_demo_data(p_site_id UUID)
RETURNS void AS $$
DECLARE
  v_person_id UUID;
  v_ci_base INTEGER := 10000000; -- Base para generar CIs únicos
  v_worker_count INTEGER := 0;
  
  -- 15 Contratistas reales
  v_contractors TEXT[] := ARRAY[
    'Constructora Axis SpA',
    'Instalaciones Eléctricas ProVolt',
    'Climatización Frío Sur Ltda',
    'Pinturas y Terminaciones Deco',
    'Estructuras Metálicas ValSur',
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
  
  -- Nombres chilenos realistas (primeros nombres)
  v_nombres TEXT[] := ARRAY[
    'Juan Carlos', 'María José', 'Carlos Alberto', 'Ana María', 'Pedro Pablo',
    'Laura Andrea', 'Miguel Ángel', 'Carmen Gloria', 'Francisco Javier', 'Isabel Cristina',
    'Jorge Eduardo', 'Patricia Elena', 'Roberto Andrés', 'Marcela Alejandra', 'Antonio José',
    'Claudia Valentina', 'Sergio Esteban', 'Francisca Belén', 'Mauricio Alejandro', 'Camila Fernanda',
    'Rodrigo Ignacio', 'Valentina Paz', 'Felipe Andrés', 'Daniela Sofía', 'Gonzalo Patricio',
    'Javiera Antonia', 'Cristián Nicolás', 'Carolina Andrea', 'Diego Fernando', 'Constanza María',
    'Pablo Enrique', 'Macarena Isabel', 'Sebastián Felipe', 'Katalina Alejandra', 'Tomás Ignacio',
    'Fernanda Paula', 'Maximiliano José', 'Isidora Paz', 'Martín Eduardo', 'Antonia Belén',
    'Vicente Pablo', 'Josefina María', 'Ignacio Andrés', 'Trinidad Elena', 'Bastián Alonso',
    'Agustina Rosa', 'Lucas Gabriel', 'Florencia Andrea', 'Matías Esteban', 'Renata Carolina',
    'Alejandro David', 'Rocío Valentina', 'Nicolás Patricio', 'Catalina Paz', 'Andrés Benjamín',
    'Sophia Isabella', 'Emiliano José', 'Victoria Esperanza', 'Santiago Alonso', 'Julieta Macarena',
    'Leonardo Mateo', 'Emma Valentina', 'Gabriel Ignacio', 'Amanda Cristina', 'Samuel Esteban',
    'Olivia Fernanda', 'Daniel Andrés', 'Mía Sofía', 'Fernando Javier', 'Luna Esperanza',
    'Joaquín Pablo', 'Amparo María', 'Alan Ricardo', 'Blanca Elena', 'Héctor Manuel',
    'Verónica Andrea', 'Raúl Enrique', 'Silvia Patricia', 'Óscar Eduardo', 'Mónica Isabel',
    'Ramón Alejandro', 'Teresa Fernanda', 'Iván Nicolás', 'Lorena Alejandra', 'Arturo José',
    'Gloria Esperanza', 'César Augusto', 'Adriana Beatriz', 'Hugo Leonardo', 'Sandra Paulina',
    'Rafael Antonio', 'Pilar Constanza', 'Víctor Manuel', 'Elena Antonia', 'Julio César',
    'Jimena Alejandra', 'Esteban Alonso', 'Paola Andrea', 'Marco Antonio', 'Natalia Fernanda',
    'Luis Alberto', 'Javiera Belén', 'Claudio Enrique', 'Bernardita Paz', 'Eduardo José',
    'Monserrat Andrea', 'Aldo Marcelo', 'Soledad María', 'Nelson Patricio', 'Ximena Carolina',
    'Cristóbal Ignacio', 'Paz Valentina', 'Fabián Andrés', 'Dominga Elena', 'Alonso Felipe',
    'Maite Antonia', 'Bruno Alejandro', 'Consuelo María', 'Luciano José', 'Esperanza Isabel',
    'Franco Sebastián', 'Almendra Rosa', 'Damián Eduardo', 'Aurora Beatriz', 'Dante Gabriel'
  ];
  
  -- Apellidos chilenos realistas
  v_apellidos TEXT[] := ARRAY[
    'González', 'Muñoz', 'Rojas', 'Díaz', 'Pérez',
    'Soto', 'Contreras', 'Silva', 'Martínez', 'Sepúlveda',
    'Morales', 'Rodríguez', 'López', 'Fuentes', 'Hernández',
    'García', 'Garrido', 'Bravo', 'Reyes', 'Núñez',
    'Jara', 'Vera', 'Torres', 'Araya', 'Ruiz',
    'Espinoza', 'Castillo', 'Tapia', 'Castro', 'Carrasco',
    'Sánchez', 'Fernández', 'Figueroa', 'Flores', 'Valenzuela',
    'Olivares', 'Campos', 'Vega', 'Ramírez', 'Riquelme',
    'Aravena', 'Pizarro', 'Vargas', 'Sandoval', 'Salazar',
    'Cárdenas', 'Vidal', 'Gutiérrez', 'Moya', 'Parra'
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
  v_roles_array TEXT[];
  v_workers_per_contractor INTEGER;
  v_photo_url TEXT;
  
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
      
      -- Generar datos del trabajador
      v_full_name := v_nombres[1 + floor(random() * array_length(v_nombres, 1))::INTEGER] || ' ' ||
                     v_apellidos[1 + floor(random() * array_length(v_apellidos, 1))::INTEGER] || ' ' ||
                     v_apellidos[1 + floor(random() * array_length(v_apellidos, 1))::INTEGER];
      
      v_role := v_roles_array[1 + ((w_idx - 1) % array_length(v_roles_array, 1))];
      v_phone := '+569' || (10000000 + floor(random() * 89999999)::INTEGER)::TEXT;
      v_emergency_phone := '+569' || (10000000 + floor(random() * 89999999)::INTEGER)::TEXT;
      v_blood_type := v_blood_types[1 + floor(random() * array_length(v_blood_types, 1))::INTEGER];
      
      -- Foto placeholder (usamos UI Avatars como URL de imagen)
      v_photo_url := 'https://ui-avatars.com/api/?name=' || 
                     replace(split_part(v_full_name, ' ', 1), ' ', '+') || '+' ||
                     replace(split_part(v_full_name, ' ', 2), ' ', '+') ||
                     '&size=200&background=random&color=fff&bold=true';
      
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
      
      -- Insertar perfil de trabajador con rol en observations/phone
      INSERT INTO workers_profile (
        person_id, 
        insurance_number, 
        insurance_expiry,
        phone,
        emergency_contact,
        blood_type
      ) VALUES (
        v_person_id,
        v_insurance_number,
        v_insurance_expiry,
        v_phone || ' - ' || v_role,  -- Incluimos el rol en el teléfono
        v_emergency_phone,
        v_blood_type
      );
      
    END LOOP;
  END LOOP;
  
  -- Generar 15 visitantes
  FOR v_idx IN 1..15 LOOP
    v_full_name := v_nombres[1 + floor(random() * array_length(v_nombres, 1))::INTEGER] || ' ' ||
                   v_apellidos[1 + floor(random() * array_length(v_apellidos, 1))::INTEGER];
    
    v_photo_url := 'https://ui-avatars.com/api/?name=' || 
                   replace(split_part(v_full_name, ' ', 1), ' ', '+') || '+' ||
                   replace(split_part(v_full_name, ' ', 2), ' ', '+') ||
                   '&size=200&background=6366f1&color=fff&bold=true';
    
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
        'Banco de Chile',
        'Municipalidad',
        'Inspección Técnica de Obra',
        'Proveedor de Materiales',
        'Arquitecto Supervisor',
        'Ingeniero Estructural',
        'Cliente Final',
        'Auditoría de Calidad',
        'Seguro Industrial SpA'
      ])[1 + (v_idx % 10)]
    );
  END LOOP;
  
  -- =========================================
  -- Generar registros de acceso del último mes
  -- =========================================
  DECLARE
    v_day DATE;
    v_entry_time TIMESTAMP;
    v_exit_time TIMESTAMP;
    v_worker RECORD;
    v_attendance_rate NUMERIC;
  BEGIN
    -- Iterar por los últimos 30 días (excluyendo fines de semana)
    FOR day_offset IN 0..29 LOOP
      v_day := CURRENT_DATE - day_offset;
      
      -- Saltar fines de semana
      CONTINUE WHEN EXTRACT(DOW FROM v_day) IN (0, 6);
      
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
        
        -- Hora de entrada variada (6:30 - 9:00)
        v_entry_time := v_day + 
          (6 * INTERVAL '1 hour') + 
          (30 * INTERVAL '1 minute') +
          (floor(random() * 150) * INTERVAL '1 minute');
        
        -- Hora de salida variada (16:00 - 19:30)
        -- Si es hoy y la hora actual es antes de las 17:00, algunos pueden no tener salida
        IF day_offset = 0 AND random() < 0.3 THEN
          -- 30% de entradas del día de hoy sin salida (aún adentro)
          v_exit_time := NULL;
        ELSE
          v_exit_time := v_day + 
            (16 * INTERVAL '1 hour') +
            (floor(random() * 210) * INTERVAL '1 minute');
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
  
  RAISE NOTICE 'Demo data seeded: % workers, 15 visitors, ~22 days of access logs', v_worker_count;
  
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
'Genera datos de demo para un site: ~130 trabajadores de 15 contratistas, 15 visitantes, 1 mes de registros de acceso';

COMMENT ON FUNCTION reset_demo_site(UUID) IS 
'Elimina todos los datos de un site demo y regenera datos frescos usando seed_demo_data';
