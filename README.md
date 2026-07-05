# 📱 Photo Swipe Cleaner

> Libera espacio en tu galería con mecánicas de swipe estilo Tinder.  
> Desliza izquierda para marcar, revisa en lote, y borra de una vez.

## Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Framework | React Native + Expo SDK 54 |
| Lenguaje | TypeScript (strict mode) |
| Estado global | Zustand |
| Animaciones | React Native Reanimated v3 |
| Gestos | React Native Gesture Handler |
| Galería nativa | expo-media-library |
| Filesystem | expo-file-system |
| Navegación | React Navigation v6 (Native Stack) |
| Estilos | NativeWind v4 (TailwindCSS) |

---

## 🚀 Instalación

### En tu teléfono (Android)

Este proyecto usa `expo-dev-client`, lo que significa que **necesitas un APK personalizado** instalado en tu dispositivo — la app genérica Expo Go **no funciona**.

1. 📲 **Descarga e instala el APK** desde EAS:
   [Photo Swipe Cleaner — Development Build](https://expo.dev/accounts/german-devv/projects/image-storage-swipe-cleaner/builds/7fb03e34-bcb4-48f7-b404-973251193309)

2. **Abre la app** en tu teléfono

3. **Escanea el QR** que aparece en la terminal de tu PC

> **Nota:** Si la conexión falla, asegúrate de estar en la misma red Wi-Fi o usa la opción `--tunnel` en el paso 3 de la instalación en PC.

### En tu PC

> **Prerrequisito:** Node.js v20 LTS — [Descargar aquí](https://nodejs.org/en/download)

```bash
# 1. Clonar el repositorio
git clone https://github.com/GermanUrgorri-devv/Image-storage-swipe-cleaner.git
cd Image-storage-swipe-cleaner

# 2. Instalar dependencias
npm install

# 3. Iniciar el servidor de desarrollo
npx expo start --dev-client --tunnel --scheme photoswipecleaner
```

---

## 📦 Cómo crear el APK (Producción / Preview)

Para generar un archivo `.apk` instalable en cualquier dispositivo Android, utilizamos EAS (Expo Application Services). El proyecto ya está configurado para ello.

```bash
# 1. Instalar la herramienta de Expo Application Services (si no la tienes)
npm install -g eas-cli

# 2. Iniciar sesión con tu cuenta de Expo
eas login

# 3. Construir el APK usando el perfil "preview" (configurado en eas.json)
eas build --platform android --profile preview
```
Al terminar, la terminal te dará un enlace directo para descargar tu archivo `.apk`.

---

## 📁 Estructura del Proyecto

```
image-storage-swipe-cleaner/
├── App.tsx                    # Raíz: NavigationContainer + GestureHandlerRootView
├── app.json                   # Configuración Expo + permisos nativos
├── eas.json                   # Perfiles de build EAS (development, preview, production)
├── babel.config.js            # Babel: nativewind + reanimated plugins
├── tailwind.config.js         # Configuración TailwindCSS / NativeWind
├── global.css                 # Directivas @tailwind
├── nativewind-env.d.ts        # Tipos para className prop
├── tsconfig.json              # TypeScript strict mode + path aliases
├── package.json               # Dependencias
└── src/
    ├── components/
    │   ├── SwipeCard.tsx      # Card animada (PanResponder + Animated) con ref imperativo
    │   ├── TopBar.tsx         # Ribbon de álbumes con tamaño de carpeta
    │   └── SortBottomSheet.tsx # Bottom sheet para ordenar fotos (tamaño, fecha)
    ├── hooks/
    │   └── useGalleryManager.ts  # Permisos, assets, álbumes, cálculo de tamaños
    ├── screens/
    │   ├── SwipeScreen.tsx    # Stack de cards + botones de acción + FAB revisar
    │   └── ReviewScreen.tsx   # Grid 3 cols + CTA de borrado nativo
    ├── store/
    │   └── useGalleryStore.ts # Zustand store (pendingDeletions, totalMegabytes)
    ├── types/
    │   └── index.ts           # Tipos compartidos (AssetItem, RootStackParamList)
    └── utils/
        └── fileUtils.ts       # bytesToMB, formatMB, sumFileSizes
```

---

## 🎮 Flujo de uso

1. **SwipeScreen** — Solicita permisos → Carga fotos en páginas de 20
2. **TopBar** — Selección de álbum con tamaño de carpeta calculado en background
3. **Swipe ← o botón Borrar** → El asset se agrega al store con su tamaño calculado
4. **Swipe → o botón Guardar** → Se descarta, pasa a la siguiente foto
5. **FAB Revisar** — Aparece cuando hay ≥1 foto marcada → Navega a ReviewScreen
6. **ReviewScreen** — Grid de fotos marcadas, tap para deseleccionar
7. **CTA** — "Liberar XX MB (Borrar XX fotos)" → `MediaLibrary.deleteAssetsAsync` → `clearPending`

---

## 🔐 Permisos necesarios

| Plataforma | Permiso |
|-----------|---------|
| Android | `READ_MEDIA_IMAGES`, `WRITE_EXTERNAL_STORAGE` |
| iOS | `NSPhotoLibraryUsageDescription` |

---

## 📝 Notas de arquitectura

- **`useGalleryManager`** usa `useRef` para el cursor de paginación (evita re-renders innecesarios)
- **Lazy loading de tamaños**: `getFileSizeLazy` usa un `Map` en ref para cachear tamaños ya consultados
- **Zustand**: `totalMegabytes` se recalcula en cada mutación de `pendingDeletions` (no es selector externo)
- **`SwipeCard`**: Envuelto en `React.memo` + `forwardRef` — expone `swipeLeft()`/`swipeRight()` via `useImperativeHandle`
- **NativeWind**: `GestureHandlerRootView` usa `className="flex-1"` directamente
