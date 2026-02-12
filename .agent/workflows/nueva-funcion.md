---
description: Protocolo para implementar nuevas funciones (usar con /nueva-funcion)
---

# 🚀 Protocolo de Nueva Función

Este protocolo se activa cuando el usuario solicita una nueva función o cambio.

## Paso 1: Entender el Objetivo
- Confirmar qué funcionalidad se quiere agregar
- Identificar qué problema resuelve para el usuario
- Preguntar si hay algo que NO quiere que cambie

## Paso 2: Consultar Reglas
- Leer `.cursorrules` si existe
- Verificar que la función no viole:
  - ❌ No Regresión — no romper funcionalidad existente
  - ❌ Seguridad — RLS en Supabase, roles verificados
  - ❌ Tipado — usar `as any` solo cuando sea necesario para tablas no tipadas
  - ❌ Validación — Zod + React Hook Form en formularios

## Paso 3: Presentar Plan (ANTES de codificar)
- Crear `implementation_plan.md` con:
  - Archivos a modificar y archivos nuevos
  - Cambios de base de datos (migraciones SQL)
  - Riesgos identificados y mitigaciones
- Esperar aprobación del usuario

## Paso 4: Implementar
- Seguir patrones existentes del proyecto
- Migraciones SQL → `supabase/migrations/YYYYMMDD_nombre.sql`
- Componentes React → respetar estructura de carpetas existente
- RLS siempre que se cree tabla nueva
- Audit logging para operaciones sensibles

## Paso 5: Verificar
// turbo
- Ejecutar `npm run build` — debe pasar sin errores
- Revisar lint errors en la salida
- Si hay errores, corregir antes de continuar

## Paso 6: Test Manual
- Probar en localhost que funciona
- Si el usuario quiere probar, esperar su feedback
- Corregir bugs reportados

## Paso 7: Deploy
- `git add -A && git status` — revisar qué se incluye
- `git commit -m "feat: descripción clara del cambio"`
- `git push origin main` — Vercel deploya automáticamente
- Si piden APK, ejecutar el workflow `/deploy`

---

## Checklist Rápido

```
✅ Nueva función: [Nombre]
📁 Archivos modificados: [lista]
📁 Archivos nuevos: [lista]
🗄️ SQL ejecutado: [sí/no]
🔨 Build: ✅
🚀 Push: ✅
```
