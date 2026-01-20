---
description: Protocolo para implementar nuevas funciones en BRIK Pro
---

# 🚀 Protocolo de Nueva Función

Este protocolo se activa automáticamente cuando el usuario solicita una nueva función.

## Paso 1: Entender el Objetivo
- Confirmar qué funcionalidad se quiere agregar
- Identificar qué problema resuelve para el usuario

## Paso 2: Consultar Reglas
- Leer `.cursorrules` antes de cualquier cambio
- Verificar que la función no viole:
  - ❌ Regla #1: No Regresión
  - ❌ Regla #2: Seguridad Primero
  - ❌ Regla #3: Tipado Estricto
  - ❌ Regla #4: Validación con Zod

## Paso 3: Presentar Plan (ANTES de codificar)
- Listar archivos que se van a modificar
- Listar archivos nuevos que se van a crear
- Explicar cómo se verificará que no se rompió nada:
  - Tests existentes pasan (`npm run test:e2e`)
  - Build exitoso (`npm run build`)
  - Sin errores de TypeScript

## Paso 4: Implementar
- Escribir código siguiendo los patrones de CONTRIBUTING.md
- Si hay formularios: usar Zod + React Hook Form
- Si hay datos sensibles: verificar RLS en Supabase

## Paso 5: Verificar
- Ejecutar `npm run build` ✅
- Ejecutar `npm run test:e2e` ✅
- Probar manualmente en localhost

## Paso 6: Entregar con Test
- Crear nuevo test Playwright que demuestre la función
- Ubicación: `tests/[nombre-funcion].spec.ts`
- El test debe verificar el "happy path" mínimo

## Paso 7: Commit y Deploy
- Commit con mensaje descriptivo
- Push a GitHub
- Verificar que CI/CD pasa (verde)
- Opcional: Deploy a Vercel si se requiere

---

## Ejemplo de Entrega

```
✅ Nueva función implementada: [Nombre]

### Archivos modificados:
- src/components/xxx.tsx
- src/lib/xxx.ts

### Archivos nuevos:
- tests/xxx.spec.ts

### Verificación:
- ✅ Build exitoso
- ✅ Tests existentes pasan
- ✅ Nuevo test agregado

### Siguiente paso:
- Probar en http://localhost:8080
```
