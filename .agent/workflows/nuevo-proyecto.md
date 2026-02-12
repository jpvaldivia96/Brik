---
description: Protocolo para iniciar un nuevo proyecto SaaS desde cero
---

# 🏗️ Nuevo Proyecto SaaS

Guía para crear un nuevo SaaS siguiendo el stack y patrones probados en BRIK Pro.

## Paso 1: Definir el Producto
Antes de escribir código, responder:
- ¿Qué problema resuelve?
- ¿Quiénes son los usuarios? (roles, permisos)
- ¿Qué funcionalidad es el MVP mínimo?
- ¿Se necesita app móvil (APK)?

## Paso 2: Crear Proyecto Base

### 2.1 Inicializar con Vite + React + TypeScript
// turbo
```bash
npx -y create-vite@latest ./ --template react-ts
npm install
```

### 2.2 Instalar dependencias core
```bash
npm install @supabase/supabase-js react-router-dom lucide-react sonner
npm install -D tailwindcss @tailwindcss/vite
```

### 2.3 Instalar UI (shadcn/ui)
```bash
npx -y shadcn@latest init
npx -y shadcn@latest add button input label dialog toast card tabs
```

### 2.4 Configurar PWA
```bash
npm install vite-plugin-pwa
```
Agregar en `vite.config.ts`:
```ts
import { VitePWA } from 'vite-plugin-pwa';
// En plugins: VitePWA({ registerType: 'autoUpdate', manifest: { name: 'Mi App', short_name: 'App', theme_color: '#7c3aed' } })
```

### 2.5 Configurar Capacitor (para APK)
```bash
npm install @capacitor/core @capacitor/cli
npx cap init "NombreApp" "com.miempresa.app" --web-dir dist
npx cap add android
npm install @capacitor/camera @capacitor/splash-screen @capacitor/status-bar
```

## Paso 3: Configurar Supabase

### 3.1 Crear proyecto en supabase.com
- Nombre del proyecto
- Región: preferir la más cercana al usuario
- Guardar la URL y anon key

### 3.2 Variables de entorno
Crear `.env` en la raíz:
```
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
```

### 3.3 Cliente Supabase
Crear `src/integrations/supabase/client.ts`:
```ts
import { createClient } from '@supabase/supabase-js';
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = createClient(supabaseUrl, supabaseKey);
```

### 3.4 Activar Auth
- Supabase Dashboard → Authentication → Settings
- Activar Email/Password
- Configurar redirect URLs

### 3.5 Tablas base
Crear tablas mínimas con RLS:
```sql
-- Ejemplo: tabla principal
CREATE TABLE IF NOT EXISTS mi_tabla (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE mi_tabla ENABLE ROW LEVEL SECURITY;
```

## Paso 4: Estructura de Carpetas

```
src/
├── components/          # Componentes React
│   ├── ui/             # shadcn/ui components
│   ├── auth/           # Login, Register
│   └── dashboard/      # Vista principal
├── contexts/           # React Context (Auth, Site)
├── hooks/              # Custom hooks
├── integrations/       # Supabase client
├── lib/                # Utilidades
├── pages/              # Páginas por ruta
└── main.tsx
```

## Paso 5: Implementar Auth + Layout Base
1. Crear AuthContext con login/logout/session
2. Crear ProtectedRoute que redirija si no autenticado
3. Crear layout con sidebar/header
4. Crear página de login con diseño atractivo

## Paso 6: Configurar Deploy

### GitHub
```bash
git init
git add -A
git commit -m "feat: proyecto inicial"
git remote add origin https://github.com/usuario/repo.git
git push -u origin main
```

### Vercel
1. Ir a vercel.com → New Project
2. Importar repo de GitHub
3. Framework: Vite
4. Variables de entorno: copiar VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
5. Deploy

## Paso 7: Copiar Workflows
Copiar la carpeta `.agent/workflows/` al nuevo proyecto para tener:
- `/nueva-funcion` — protocolo para agregar funciones
- `/deploy` — protocolo de deploy + APK
- `/nuevo-proyecto` — esta guía

---

## Checklist de Nuevo Proyecto

```
[ ] Vite + React + TypeScript inicializado
[ ] Supabase proyecto creado
[ ] .env con credenciales
[ ] Auth funcionando (login/registro)
[ ] Layout base con navegación
[ ] PWA configurado
[ ] Capacitor configurado (si app móvil)
[ ] GitHub repo creado
[ ] Vercel conectado
[ ] Primer deploy exitoso
[ ] Workflows copiados
```
