---
description: Deploy a producción (Vercel) y generar APK Android
---

# 🚀 Workflow de Deploy

## Parte 1: Deploy a Vercel (Web)

### 1.1 Verificar build
// turbo
```bash
npm run build
```
Si falla, corregir errores antes de continuar.

### 1.2 Commit y push
```bash
git add -A
git status
```
Revisar que solo se incluyen archivos deseados.

```bash
git commit -m "descripción del cambio"
git push origin main
```
Vercel detecta el push y deploya automáticamente (~1-2 min).

### 1.3 Verificar deploy
- Abrir https://brik-pro.vercel.app (o el dominio del proyecto)
- Confirmar que carga sin errores
- Probar la funcionalidad principal

---

## Parte 2: Generar APK Android

### 2.1 Verificar Java 21
// turbo
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export PATH="$JAVA_HOME/bin:$PATH"
java -version
```
Si no está instalado:
```bash
brew install openjdk@21
```

### 2.2 Build web + Sync Capacitor
// turbo
```bash
npm run build
npx cap sync android
```
Esto copia `dist/` al proyecto Android y sincroniza plugins.

### 2.3 Generar APK debug
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21
export PATH="$JAVA_HOME/bin:$PATH"
cd android && ./gradlew assembleDebug
```
APK generada en: `android/app/build/outputs/apk/debug/app-debug.apk`

### 2.4 Copiar APK al Desktop
// turbo
```bash
cp android/app/build/outputs/apk/debug/app-debug.apk ~/Desktop/app-nombre.apk
```

### 2.5 Instalar en dispositivo
- Enviar APK por WhatsApp, email, o cable USB
- En Android: Ajustes → Seguridad → Fuentes desconocidas → Activar
- Abrir el APK e instalar

---

## Parte 3: SQL (si hay migraciones pendientes)

Si se crearon archivos en `supabase/migrations/`:
1. Ir a **Supabase Dashboard → SQL Editor**
2. Pegar el contenido del archivo `.sql`
3. Ejecutar
4. Verificar que la tabla/cambio se creó correctamente

---

## Troubleshooting

| Problema | Solución |
|----------|----------|
| Build falla | Revisar errores TypeScript, corregir antes de push |
| Vercel no deploya | Verificar que el push llegó a `main` en GitHub |
| APK no instala | Verificar que "Fuentes desconocidas" está habilitado |
| Java no encontrado | `brew install openjdk@21` y configurar JAVA_HOME |
| Capacitor sync falla | `npm run build` primero, luego `npx cap sync android` |
