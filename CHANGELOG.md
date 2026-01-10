# Changelog

All notable changes to Brik will be documented in this file.

## [1.2.0] - 2026-01-10

### Fixed
- **Face Recognition on Android APK**: Added `.bin` extension to all face-api.js model shard files for Android WebView compatibility
- **Camera Modal in BottomActionBar**: Added flip camera button that was missing, matching NewWorkerTab styling
- **AI Model Status Indicators**: Added loading/error/success states to camera modal so users can see if models are loading correctly
- **Tensor Shape Error**: Fixed "tensor should have 288 values but has 113" error caused by Android WebView truncating binary files without extension

### Changed
- Updated `BottomActionBar.tsx` to use full `useFace()` hook states (`loading`, `error`, `modelLoaded`)
- Camera modal now uses `bg-card` styling for consistency across all tabs
- Scan button is now disabled when AI models are loading or have errors

### Files Modified
- `public/models/*-shard*` → renamed to `*-shard*.bin`
- `public/models/*-weights_manifest.json` → updated paths to reference `.bin` files
- `src/components/layout/BottomActionBar.tsx` → major updates for camera modal
- `src/components/operation/EntryTab.tsx` → styling consistency
- `src/components/operation/ExitTab.tsx` → styling consistency

---

## [1.1.0] - 2026-01-09

### Added
- Push notifications system with FCM
- Contractor autocomplete component
- Notification preferences per user

### Fixed
- Reports tab crash (AlertCosmos prop fix)
- Contractor deduplication and case-insensitive filtering

---

## [1.0.0] - 2026-01-02

### Initial Release
- Face recognition entry/exit system
- Worker and visitor registration
- Dashboard with real-time attendance
- Multiple site support
- Audit logging
- Emergency roll call
