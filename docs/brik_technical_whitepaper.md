# Brik - Especificación Técnica y Funcional
> *Documento maestro para desarrollo de landing pages, materiales de marketing y estrategias de venta.*

---

## 1. Resumen Ejecutivo
**Brik** es una solución integral de **control de acceso y gestión de personal** basada en inteligencia artificial biométrica. Diseñada para la era moderna, Brik reemplaza las bitácoras manuales y tarjetas físicas con un sistema de **reconocimiento facial de alta velocidad** que funciona tanto en web como en dispositivos móviles dedicados (Android), ofreciendo seguridad, trazabilidad y control en tiempo real para proyectos de construcción, complejos residenciales y oficinas corporativas.

---

## 2. Arquitectura Técnica (Stack Tecnológico)

La robustez de Brik reside en su arquitectura híbrida y moderna, diseñada para escalabilidad y rendimiento en el borde (Edge Computing).

### Frontend & Aplicación Móvil
- **Core Framework**: React 18 + Vite (Velocidad y optimización).
- **Lenguaje**: TypeScript (Seguridad de tipos y robustez de código).
- **Estilos**: Tailwind CSS + Shadcn/UI (Diseño modular, responsivo y estéticamente premium "Glassmorphism").
- **Movilidad**: Capacitor JS (Conversión de la web app a APK nativo de Android con acceso a hardware).
- **Iconografía**: Lucide React.

### Inteligencia Artificial (Core Biométrico)
- **Motor**: TensorFlow.js adaptado para web y móvil.
- **Librería**: `face-api.js` optimizada.
- **Modelos**: Tiny Face Detector, Face Landmark 68, Face Recognition Net (redes neuronales convolucionales).
- **Edge Processing**: El reconocimiento facial se ejecuta **localmente en el dispositivo** del cliente.
    - *Ventaja 1*: Privacidad (las fotos crudas no necesitan viajar al servidor).
    - *Ventaja 2*: Velocidad extrema (latencia cero de red para la inferencia).
    - *Ventaja 3*: Funcionamiento offline para la detección.
- **Optimización Android**: Carga de modelos binarios (`.bin`) customizada para compatibilidad total con WebViews de Android.

### Backend & Infraestructura (Serverless)
- **Plataforma**: Supabase (Alternativa Open Source a Firebase).
- **Base de Datos**: PostgreSQL (Relacional, robusta, escalable).
- **Seguridad de Datos**: Row Level Security (RLS) - Cada petición está autenticada y autorizada a nivel de base de datos.
- **Tiempo Real**: Supabase Realtime (WebSockets) para actualización instantánea de dashboards sin recargar.
- **Almacenamiento**: Supabase Storage para fotos de perfil y evidencia de auditoría.
- **Notificaciones**: Integración con Firebase Cloud Messaging (FCM) vía Supabase Edge Functions.

---

## 3. Características y Funcionalidades (Features)

### A. Módulo de Control de Acceso (La "Portería")
1.  **Reconocimiento Facial Instantáneo**:
    -   Detección de "vida" y captura automática al reconocer un rostro registrado.
    -   Indicadores visuales de estado de IA (Cargando, Listo, Error, Éxito).
    -   Modal de cámara con soporte para cámara frontal/trasera (Flip).
2.  **Modo Entrada / Salida**:
    -   Flujos separados para registrar ingresos y egresos con un solo toque.
    -   Validación de estado ("¿La persona ya está adentro?").
3.  **Búsqueda Manual Inteligente**:
    -   Búsqueda por nombre, CI o empresa en caso de fallo biométrico.
    -   Autocompletado predictivo.

### B. Gestión de Personal (New Worker)
1.  **Onboarding Digital**:
    -   Registro completo de perfil: Foto, Nombre, CI, Cargo.
    -   **Asignación de Contratistas**: Sistema inteligente de autocompletado y gestión de empresas contratistas para evitar duplicados.
    -   Captura biométrica de alta calidad para enrolamiento.
2.  **Perfiles de Usuario**:
    -   Visualización de historial, estado actual (dentro/fuera) y datos personales.

### C. Dashboard Administrativo (Control Room)
1.  **Monitor de Ocupación en Tiempo Real**:
    -   Contadores vivos de personal en sitio.
    -   Desglose por tipo (Obrero, Arquitecto, Visita).
2.  **Feed de Actividad (Audit Log)**:
    -   Bitácora inalterable de todos los eventos (ingresos, salidas, registros).
    -   Trazabilidad completa: Quién, Cuándo, Dónde.
3.  **Gestión Multisito**:
    -   Capacidad de cambiar entre diferentes obras o edificios (Site Context) instantáneamente.
4.  **Reportes y Alertas**:
    -   Panel de reportes para incidencias o análisis de asistencia.

### D. Sistema de Notificaciones
1.  **Push Notifications**: Alertas nativas en Android para eventos críticos o avisos generales.
2.  **Gestión de Preferencias**: Los usuarios pueden elegir qué notificaciones recibir.

---

## 4. Casos de Uso y Aplicación

### 🏗️ Construcción y Obras Civiles
- **Problema**: Controlar cientos de obreros y subcontratistas que entran y salen, fraude en horas trabajadas (buddy punching).
- **Solución Brik**: Fichaje facial inalterable. Reporte exacto de contratistas en obra.

### 🏢 Edificios Corporativos y Coworking
- **Problema**: Gestión de visitas y seguridad de acceso.
- **Solución Brik**: Registro rápido de visitantes, look & feel tecnológico que mejora la imagen del edificio.

### 🏘️ Complejos Residenciales
- **Problema**: Control de personal de servicio y proveedores.
- **Solución Brik**: Saber exactamente quién está dentro del perímetro residencial en todo momento.

---

## 5. Robustez y Seguridad (Selling Points)

1.  **"Privacy First" Biometrics**: Al procesar la biometría en el dispositivo, Brik protege la privacidad del usuario mejor que los sistemas 100% nube.
2.  **Resiliencia Híbrida**: Funciona como PWA en cualquier navegador moderno y como App Nativa en Android, adaptándose al hardware disponible (tablets baratas, celulares robustos).
3.  **Seguridad Bancaria**: Uso de PostgreSQL con RLS y Auth Tokens. Los datos no son accesibles públicamente.
4.  **Tolerancia a Fallos**: Sistema de manejo de errores en IA (como el implementado para tensores corruptos) que asegura continuidad operativa.
5.  **Auditabilidad**: Cada acción deja un rastro digital inmutable.

---

## 6. Diferenciadores Clave para Marketing
- **"Cero Fricción"**: No requiere tarjetas, llaves ni recordar códigos. Tu cara es tu llave.
- **"Deploy Instantáneo"**: No requiere instalación de servidores físicos ni cableado complejo. Solo una tablet/celular y WiFi.
- **"Control Total"**: Dashboard en tiempo real accesible desde cualquier lugar del mundo.
- **"Estética Premium"**: Interfaz diseñada no solo para funcionar, sino para impresionar (UI Moderna, Dark Mode, Animaciones fluidas).
