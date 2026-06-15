# 📱 Photo Swipe Cleaner

> Libera espacio en tu galería con mecánicas de swipe estilo Tinder.  
> Desliza izquierda para marcar, revisa en lote, y borra de una vez.

## Stack Técnico

| Capa | Tecnología |
|------|-----------|
| Framework | React Native + Expo SDK 51 |
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

> **Prerrequisito:** Node.js v20 LTS — [Descargar aquí](https://nodejs.org/en/download)

```bash
# 1. Instalar dependencias
npm install

# 2. Instalar dependencias nativas con Expo CLI
npx expo install

# 3. Iniciar el servidor de desarrollo
npx expo start

# Para Android (emulador o dispositivo físico)
npx expo start --android

# Para iOS (requiere macOS + Xcode)
npx expo start --ios
```

---

## 📁 Estructura del Proyecto

```
image-storage-swipe-cleaner/
├── App.tsx                    # Raíz: NavigationContainer + GestureHandlerRootView
├── app.json                   # Configuración Expo + permisos nativos
├── babel.config.js            # Babel: nativewind + reanimated plugins
├── tailwind.config.js         # Configuración TailwindCSS / NativeWind
├── global.css                 # Directivas @tailwind
├── nativewind-env.d.ts        # Tipos para className prop
├── tsconfig.json              # TypeScript strict mode + path aliases
├── package.json               # Dependencias
└── src/
    ├── components/
    │   └── SwipeCard.tsx      # Card animada (PanGestureHandler + Reanimated)
    ├── hooks/
    │   └── useGalleryManager.ts  # Permisos, assets, álbumes, lazy file size
    ├── screens/
    │   ├── SwipeScreen.tsx    # Stack de cards + FAB contador
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
2. **Swipe ←** (BORRAR) → El asset se agrega al store con su tamaño calculado
3. **Swipe →** (GUARDAR) → Se descarta, pasa a la siguiente foto
4. **FAB** — Aparece cuando hay ≥1 foto marcada → Navega a ReviewScreen
5. **ReviewScreen** — Grid de fotos marcadas, tap para deseleccionar
6. **CTA** — "Liberar XX MB (Borrar XX fotos)" → `MediaLibrary.deleteAssetsAsync` → `clearPending`

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
- **`SwipeCard`**: Envuelto en `React.memo` para evitar re-renders del stack
- **NativeWind**: `GestureHandlerRootView` usa `className="flex-1"` directamente
