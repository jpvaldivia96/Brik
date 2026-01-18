# BRIK Pro - Guía de Contribución y Desarrollo

## 📋 Resumen

Este documento establece las **reglas obligatorias** para todo desarrollo en BRIK Pro, ya sea manual o asistido por IA.

---

## 🛡️ Directivas Principales (Prime Directives)

### 1. Sin Regresiones
Antes de modificar cualquier código compartido:
- Analiza qué otras partes dependen de él
- Si tocas un componente compartido, verifica que no rompa otras pantallas
- Los contextos (`SiteContext`, `AuthContext`) requieren máxima precaución

### 2. Seguridad Primero
- **NUNCA** expongas claves API o secretos en el código
- **NUNCA** desactives RLS (Row Level Security) para "hacer que funcione"
- **NUNCA** confíes en el input del usuario sin validar
- Todas las consultas a Supabase **DEBEN** respetar las políticas RLS

### 3. Tipado Estricto
- **PROHIBIDO** usar `any` - crear interfaces TypeScript apropiadas
- Todos los parámetros y retornos de funciones deben estar tipados
- Usar esquemas Zod para validación en tiempo de ejecución

### 4. Validación con Zod
- Todos los formularios **DEBEN** usar validación con esquema Zod
- Validar en frontend (para UX) **Y** en backend (para seguridad)
- Mensajes de error en español y amigables para el usuario

---

## 🔧 Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Estilos | Tailwind CSS + Shadcn UI |
| Backend | Supabase (PostgreSQL + Auth + RLS) |
| Validación | Zod + React Hook Form |
| Estado | React Context + TanStack Query (donde aplique) |
| Notificaciones | Sonner (toast) |

---

## 📝 Patrones de Código Obligatorios

### Formularios con Validación

```tsx
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const schema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  email: z.string().email('Email inválido'),
  cantidad: z.number().positive('Debe ser mayor a 0'),
});

type FormData = z.infer<typeof schema>;

const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
  resolver: zodResolver(schema)
});
```

### Manejo de Errores

```tsx
try {
  const { data, error } = await supabase.from('tabla').select('*');
  if (error) throw error;
  // Procesar data
} catch (error) {
  console.error('Contexto del error:', error);
  toast.error('Mensaje amigable para el usuario');
}
```

### Estados de Carga

```tsx
<Button disabled={isSubmitting}>
  {isSubmitting ? (
    <>
      <Spinner className="mr-2" />
      Guardando...
    </>
  ) : 'Guardar'}
</Button>
```

---

## 🧪 Verificación Antes de Merge

Antes de considerar cualquier feature completa, verificar:

- [ ] Funciona el caso feliz (happy path)
- [ ] Maneja inputs vacíos/inválidos graciosamente
- [ ] Muestra feedback de error apropiado
- [ ] Funciona para todos los roles (guard, supervisor, inspector, owner)
- [ ] No rompe funcionalidad existente
- [ ] Botones deshabilitados durante carga
- [ ] Textos en español

---

## 🔒 Seguridad - Checklist

- [ ] RLS activo en todas las tablas con datos sensibles
- [ ] Políticas RLS verifican `auth.uid()` y `site_id`
- [ ] No hay claves expuestas en el código
- [ ] Inputs sanitizados antes de mostrar (prevención XSS)
- [ ] Rate limiting en endpoints críticos (login)

---

## 📁 Estructura del Proyecto

```
src/
├── components/          # Componentes React
│   ├── ui/              # Componentes Shadcn base
│   ├── layout/          # Layout, headers, drawers
│   ├── dashboard/       # Componentes del dashboard
│   ├── supervisor/      # Paneles de administración
│   ├── inspection/      # Notas de fiscalización
│   └── operation/       # Registro de personas
├── contexts/            # React Contexts (Auth, Site)
├── pages/               # Páginas principales
├── hooks/               # Custom hooks
├── lib/                 # Utilidades
└── integrations/        # Configuración Supabase

supabase/
├── migrations/          # Archivos SQL de migración
└── functions/           # Edge Functions
```

---

## 🆘 Protocolo de Emergencia

Si el código generado por IA rompe la aplicación:

1. **DETENER** inmediatamente
2. Identificar qué cambio causó el problema
3. Revertir al último estado funcional (`git checkout`)
4. Analizar el error antes de intentar nuevamente
5. Proponer solución más conservadora

---

## 📞 Contacto

Para dudas sobre estas políticas, consultar antes de implementar.

*Última actualización: 18 de enero de 2026*
