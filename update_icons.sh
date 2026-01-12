#!/bin/bash
SOURCE="logo-source.png"
RES="android/app/src/main/res"

echo "Updating Android Icons..."

# Standard Icons (Legacy)
sips -z 48 48 $SOURCE --out $RES/mipmap-mdpi/ic_launcher.png
sips -z 48 48 $SOURCE --out $RES/mipmap-mdpi/ic_launcher_round.png
sips -z 72 72 $SOURCE --out $RES/mipmap-hdpi/ic_launcher.png
sips -z 72 72 $SOURCE --out $RES/mipmap-hdpi/ic_launcher_round.png
sips -z 96 96 $SOURCE --out $RES/mipmap-xhdpi/ic_launcher.png
sips -z 96 96 $SOURCE --out $RES/mipmap-xhdpi/ic_launcher_round.png
sips -z 144 144 $SOURCE --out $RES/mipmap-xxhdpi/ic_launcher.png
sips -z 144 144 $SOURCE --out $RES/mipmap-xxhdpi/ic_launcher_round.png
sips -z 192 192 $SOURCE --out $RES/mipmap-xxxhdpi/ic_launcher.png
sips -z 192 192 $SOURCE --out $RES/mipmap-xxxhdpi/ic_launcher_round.png

# Adaptive Foreground Icons (Adaptive)
sips -z 108 108 $SOURCE --out $RES/mipmap-mdpi/ic_launcher_foreground.png
sips -z 162 162 $SOURCE --out $RES/mipmap-hdpi/ic_launcher_foreground.png
sips -z 216 216 $SOURCE --out $RES/mipmap-xhdpi/ic_launcher_foreground.png
sips -z 324 324 $SOURCE --out $RES/mipmap-xxhdpi/ic_launcher_foreground.png
sips -z 432 432 $SOURCE --out $RES/mipmap-xxxhdpi/ic_launcher_foreground.png

echo "Updating Web/PWA Icons..."
sips -z 192 192 $SOURCE --out public/pwa-192x192.png
sips -z 512 512 $SOURCE --out public/pwa-512x512.png
sips -z 512 512 $SOURCE --out public/icon.png
cp public/icon.png public/logo.png

echo "Icons updated successfully."
