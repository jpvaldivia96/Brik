-- Script para solucionar problema de invitación de 'jsergio@levent.com'
-- Este script busca al usuario por email y lo ELIMINA de la tabla de autenticación.
-- Esto "limpia" el registro para que puedas volver a enviarle la invitación como si fuera nuevo.

DO $$
DECLARE
    v_email TEXT := 'jsergio@levent.com';
    v_user_id UUID;
BEGIN
    -- 1. Buscar el usuario
    SELECT id INTO v_user_id FROM auth.users WHERE email = v_email;

    IF v_user_id IS NOT NULL THEN
        -- 2. Eliminar usuario (esto eliminará en cascada sus perfiles/membresías si están vinculados correctamente)
        DELETE FROM auth.users WHERE id = v_user_id;
        RAISE NOTICE '✅ Usuario % eliminado. Ahora puedes volver a invitarlo.', v_email;
    ELSE
        RAISE NOTICE '⚠️ El usuario % no fue encontrado en la base de datos.', v_email;
    END IF;
END $$;
