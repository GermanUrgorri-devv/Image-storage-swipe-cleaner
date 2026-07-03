import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';
import type { AssetItem, PermissionStatus, SortOption } from '../types';
import { bytesToMB } from '../utils/fileUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

/** Raw permission response from expo-media-library, for debug purposes */
export interface PermissionDebugInfo {
  granted: boolean;
  status: string;
  canAskAgain: boolean;
  accessPrivileges?: string;
  expires?: string;
  android?: {
    apiLevel: number;
    readMediaImagesGranted?: boolean;
  };
  raw: string; // JSON.stringify of the full response
  timestamp: string;
  method: 'getPermissionsAsync' | 'requestPermissionsAsync';
}

interface GalleryManagerState {
  assets: AssetItem[];
  albums: MediaLibrary.Album[];
  permissionStatus: PermissionStatus;
  isLoading: boolean;
  hasNextPage: boolean;
  error: string | null;
  /** Debug info for the last permission check (both get and request) */
  permissionDebug: PermissionDebugInfo[];
}

interface GalleryManagerActions {
  requestPermissions: () => Promise<boolean>;
  loadAssets: (options?: LoadOptions) => Promise<void>;
  loadNextPage: () => Promise<void>;
  loadAlbums: () => Promise<void>;
  getFileSizeLazy: (asset: AssetItem) => Promise<number | null>;
  /** Precalcula tamaños de todos los assets cargados en background (fire-and-forget) */
  preloadAllSizes: () => void;
  /** Force refresh permission debug info without requesting new permissions */
  refreshPermissionDebug: () => Promise<void>;
}

interface LoadOptions {
  albumId?: string;
  reset?: boolean;
  sortOption?: SortOption;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

// ─── Sort Mapping ────────────────────────────────────────────────────────────

/**
 * Mapea la SortOption del store a parámetros de MediaLibrary.SortBy.
 * - size_desc / size_asc no son soportados nativamente → fallback a creationTime.
 */
function mapSortOption(
  option: SortOption = 'date_desc',
): MediaLibrary.AssetsOptions['sortBy'] {
  switch (option) {
    case 'date_desc':
      return [[MediaLibrary.SortBy.creationTime, false]];
    case 'date_asc':
      return [[MediaLibrary.SortBy.creationTime, true]];
    case 'name_asc':
      return [[MediaLibrary.SortBy.default, true]];
    case 'name_desc':
      return [[MediaLibrary.SortBy.default, false]];
    default:
      // size_desc / size_asc: se gestionan aparte en loadAllAndSortBySize
      return [[MediaLibrary.SortBy.creationTime, false]];
  }
}

/** Devuelve true si el sort requiere cargar todos los assets y ordenar en memoria. */
function isSizeSort(option: SortOption): boolean {
  return option === 'size_desc' || option === 'size_asc';
}

/**
 * Obtiene el tamaño en bytes de un asset.
 * Fast path: intenta stat() directo sobre asset.uri (funciona en dev builds con file:// URIs).
 * Slow path: resuelve a localUri vía getAssetInfoAsync y luego stat().
 */
async function fetchAssetSize(
  asset: MediaLibrary.Asset,
  cache: Map<string, number>,
): Promise<number> {
  if (cache.has(asset.id)) return cache.get(asset.id)!;

  // Fast path: stat() directo sobre el URI del asset
  try {
    const direct = await FileSystem.getInfoAsync(asset.uri);
    if (direct.exists && 'size' in direct && typeof direct.size === 'number') {
      cache.set(asset.id, direct.size);
      return direct.size;
    }
  } catch {
    // URI no soportada por FileSystem (e.g. content://), seguir al slow path
  }

  // Slow path: resolver localUri primero
  try {
    const info = await MediaLibrary.getAssetInfoAsync(asset.id);
    const uri = info.localUri ?? info.uri;
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (fileInfo.exists && 'size' in fileInfo && typeof fileInfo.size === 'number') {
      cache.set(asset.id, fileInfo.size);
      return fileInfo.size;
    }
  } catch {
    // fall through to 0
  }
  return 0;
}

/**
 * Ejecuta un array de funciones async en lotes de tamaño `concurrency`.
 * Devuelve los resultados en el mismo orden que las tareas de entrada.
 */
async function runConcurrent<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const i = index++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determina si tenemos acceso suficiente a la galería.
 * En Android 13+ (API 33+), `granted` puede ser false pero
 * `accessPrivileges` puede ser 'limited' o 'all', lo cual sí da acceso.
 */
function hasMediaAccess(permResponse: MediaLibrary.PermissionResponse): boolean {
  // Caso directo: granted es true
  if (permResponse.granted) return true;

  // Android 13+ con permisos granulares: chequear accessPrivileges
  const privileges = (permResponse as any).accessPrivileges;
  if (privileges === 'all' || privileges === 'limited') return true;

  // Status puede ser 'granted' incluso si granted es false en algunos edge cases
  if (permResponse.status === MediaLibrary.PermissionStatus.GRANTED) return true;

  return false;
}

/** Extrae info de debug de una respuesta de permisos */
function extractDebugInfo(
  permResponse: MediaLibrary.PermissionResponse,
  method: PermissionDebugInfo['method'],
): PermissionDebugInfo {
  return {
    granted: permResponse.granted,
    status: permResponse.status,
    canAskAgain: permResponse.canAskAgain,
    accessPrivileges: (permResponse as any).accessPrivileges,
    expires: String((permResponse as any).expires ?? 'N/A'),
    android: Platform.OS === 'android' ? {
      apiLevel: Platform.Version as number,
    } : undefined,
    raw: JSON.stringify(permResponse, null, 2),
    timestamp: new Date().toISOString(),
    method,
  };
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Hook principal para gestionar la galería fotográfica.
 * Encapsula: permisos, paginación de assets, álbumes y tamaño lazy.
 */
export function useGalleryManager(): GalleryManagerState & GalleryManagerActions {
  const [state, setState] = useState<GalleryManagerState>({
    assets: [],
    albums: [],
    permissionStatus: 'undetermined',
    isLoading: false,
    hasNextPage: true,
    error: null,
    permissionDebug: [],
  });

  // Cursor para la paginación de expo-media-library
  const endCursorRef = useRef<string | undefined>(undefined);
  const currentAlbumRef = useRef<string | undefined>(undefined);
  const currentSortRef = useRef<SortOption>('date_desc');

  // Cache de tamaños ya calculados: assetId → bytes
  const fileSizeCache = useRef<Map<string, number>>(new Map());

  // ─── refreshPermissionDebug ─────────────────────────────────────────────

  const refreshPermissionDebug = useCallback(async (): Promise<void> => {
    try {
      const current = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
      const debugInfo = extractDebugInfo(current, 'getPermissionsAsync');

      console.log('═══════════════════════════════════════════════════════');
      console.log('[PERM DEBUG] getPermissionsAsync response:');
      console.log('  granted:', current.granted);
      console.log('  status:', current.status);
      console.log('  canAskAgain:', current.canAskAgain);
      console.log('  accessPrivileges:', (current as any).accessPrivileges);
      console.log('  hasMediaAccess:', hasMediaAccess(current));
      console.log('  Platform:', Platform.OS, 'Version:', Platform.Version);
      console.log('  Full response:', JSON.stringify(current, null, 2));
      console.log('═══════════════════════════════════════════════════════');

      setState((prev) => ({
        ...prev,
        permissionDebug: [debugInfo],
        error: null,
      }));
    } catch (err) {
      console.warn('[PERM DEBUG] Error refreshing:', err);
      setState((prev) => ({
        ...prev,
        error: `Error al refrescar permisos: ${err instanceof Error ? err.message : String(err)}`,
      }));
    }
  }, []);

  // ─── requestPermissions ─────────────────────────────────────────────────

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    const debugEntries: PermissionDebugInfo[] = [];

    try {
      // Primero verificamos si ya tenemos permiso (sin mostrar diálogo)
      const current = await MediaLibrary.getPermissionsAsync(false, ['photo', 'video']);
      debugEntries.push(extractDebugInfo(current, 'getPermissionsAsync'));

      console.log('═══════════════════════════════════════════════════════');
      console.log('[PERM] getPermissionsAsync response:');
      console.log('  granted:', current.granted);
      console.log('  status:', current.status);
      console.log('  canAskAgain:', current.canAskAgain);
      console.log('  accessPrivileges:', (current as any).accessPrivileges);
      console.log('  hasMediaAccess:', hasMediaAccess(current));
      console.log('  Platform:', Platform.OS, 'Version:', Platform.Version);
      console.log('  Full response:', JSON.stringify(current, null, 2));
      console.log('═══════════════════════════════════════════════════════');

      if (hasMediaAccess(current)) {
        setState((prev) => ({
          ...prev,
          permissionStatus: 'granted',
          permissionDebug: debugEntries,
        }));
        return true;
      }

      // Si podemos pedir de nuevo, mostramos el diálogo
      if (current.canAskAgain) {
        const result = await MediaLibrary.requestPermissionsAsync(false, ['photo', 'video']);
        debugEntries.push(extractDebugInfo(result, 'requestPermissionsAsync'));

        console.log('═══════════════════════════════════════════════════════');
        console.log('[PERM] requestPermissionsAsync response:');
        console.log('  granted:', result.granted);
        console.log('  status:', result.status);
        console.log('  canAskAgain:', result.canAskAgain);
        console.log('  accessPrivileges:', (result as any).accessPrivileges);
        console.log('  hasMediaAccess:', hasMediaAccess(result));
        console.log('  Full response:', JSON.stringify(result, null, 2));
        console.log('═══════════════════════════════════════════════════════');

        const access = hasMediaAccess(result);
        setState((prev) => ({
          ...prev,
          permissionStatus: access ? 'granted' : 'denied',
          permissionDebug: debugEntries,
        }));
        return access;
      }

      // No podemos pedir, y no hay acceso
      setState((prev) => ({
        ...prev,
        permissionStatus: 'denied',
        permissionDebug: debugEntries,
      }));
      return false;
    } catch (err) {
      console.warn('[useGalleryManager] requestPermissions error:', err);
      setState((prev) => ({
        ...prev,
        permissionStatus: 'denied',
        permissionDebug: debugEntries,
        error: `Error de permisos: ${err instanceof Error ? err.message : String(err)}`,
      }));
      return false;
    }
  }, []);

  // ─── loadAlbums ─────────────────────────────────────────────────────────

  const loadAlbums = useCallback(async (): Promise<void> => {
    try {
      const albums = await MediaLibrary.getAlbumsAsync({
        includeSmartAlbums: true,
      });
      setState((prev) => ({ ...prev, albums }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        error: 'Error al cargar los álbumes.',
      }));
    }
  }, []);

  // ─── loadAssets ─────────────────────────────────────────────────────────

  const loadAssets = useCallback(
    async (options: LoadOptions = {}): Promise<void> => {
      const { albumId, reset = false, sortOption } = options;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      if (reset) {
        endCursorRef.current = undefined;
      }

      currentAlbumRef.current = albumId;
      if (sortOption) {
        currentSortRef.current = sortOption;
      }

      const activeSortOption = currentSortRef.current;

      // ── Rama especial: sort por tamaño ─────────────────────────────────
      if (isSizeSort(activeSortOption)) {
        try {
          // 1. Cargar TODOS los assets de forma paginada
          const allRaw: MediaLibrary.Asset[] = [];
          let cursor: string | undefined = reset ? undefined : endCursorRef.current;
          let hasMore = true;

          while (hasMore) {
            const page = await MediaLibrary.getAssetsAsync({
              first: 500, // páginas grandes para minimizar roundtrips
              sortBy: [[MediaLibrary.SortBy.creationTime, false]],
              mediaType: [MediaLibrary.MediaType.photo],
              ...(albumId && { album: albumId }),
              ...(cursor && { after: cursor }),
            });

            allRaw.push(...page.assets);
            hasMore = page.hasNextPage;
            cursor = page.endCursor;

            // Actualizar UI con progreso mientras carga
            setState((prev) => ({ ...prev, isLoading: true }));
          }

          // 2. Calcular tamaños — solo los que no estén cacheados
          const uncachedTasks = allRaw
            .filter((a) => !fileSizeCache.current.has(a.id))
            .map((asset) => () => fetchAssetSize(asset, fileSizeCache.current));

          if (uncachedTasks.length > 0) {
            await runConcurrent(uncachedTasks, 25);
          }

          // 3. Construir AssetItems con tamaño ya calculado (del cache)
          const itemsWithSize: AssetItem[] = allRaw.map((asset) => {
            const size = fileSizeCache.current.get(asset.id);
            return {
              ...asset,
              fileSizeBytes: size != null && size > 0 ? size : null,
            };
          });

          // 4. Ordenar en memoria
          const sorted = [...itemsWithSize].sort((a, b) => {
            const sa = a.fileSizeBytes ?? 0;
            const sb = b.fileSizeBytes ?? 0;
            return activeSortOption === 'size_desc' ? sb - sa : sa - sb;
          });

          // 5. No hay páginación adicional: ya tenemos todo
          endCursorRef.current = undefined;

          setState((prev) => ({
            ...prev,
            assets: reset ? sorted : [...prev.assets, ...sorted],
            hasNextPage: false,
            isLoading: false,
          }));
        } catch (err) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: 'Error al cargar y ordenar las fotos por tamaño.',
          }));
        }
        return;
      }

      // ── Rama normal: sort nativo de MediaLibrary ────────────────────────
      try {
        const query: MediaLibrary.AssetsOptions = {
          first: PAGE_SIZE,
          sortBy: mapSortOption(activeSortOption),
          mediaType: [MediaLibrary.MediaType.photo],
          ...(albumId && { album: albumId }),
          ...(endCursorRef.current && { after: endCursorRef.current }),
        };

        const result = await MediaLibrary.getAssetsAsync(query);

        // Mapear a AssetItem con fileSizeBytes null (lazy)
        const newItems: AssetItem[] = result.assets.map((asset) => ({
          ...asset,
          fileSizeBytes: fileSizeCache.current.get(asset.id) ?? null,
        }));

        endCursorRef.current = result.endCursor;

        setState((prev) => ({
          ...prev,
          assets: reset ? newItems : [...prev.assets, ...newItems],
          hasNextPage: result.hasNextPage,
          isLoading: false,
        }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Error al cargar las fotos.',
        }));
      }
    },
    [],
  );

  // ─── loadNextPage ───────────────────────────────────────────────────────

  const loadNextPage = useCallback(async (): Promise<void> => {
    // Size sort ya cargó todo: no hay siguiente página real
    if (isSizeSort(currentSortRef.current)) return;
    if (!state.hasNextPage || state.isLoading) return;
    await loadAssets({
      albumId: currentAlbumRef.current,
      sortOption: currentSortRef.current,
    });
  }, [state.hasNextPage, state.isLoading, loadAssets]);

  // ─── getFileSizeLazy ────────────────────────────────────────────────────

  /**
   * Calcula el tamaño de un asset de forma lazy (con caché en memoria).
   * Usa expo-file-system para obtener el tamaño real del archivo en disco.
   * Devuelve el tamaño en bytes, o null si no se puede determinar.
   */
  const getFileSizeLazy = useCallback(
    async (asset: AssetItem): Promise<number | null> => {
      // Retornar de caché si ya fue calculado
      if (fileSizeCache.current.has(asset.id)) {
        return fileSizeCache.current.get(asset.id)!;
      }

      try {
        // Método 1: usar getAssetInfoAsync que da localUri (funciona en dev builds)
        const assetInfo = await MediaLibrary.getAssetInfoAsync(asset.id);
        const uri = assetInfo.localUri ?? assetInfo.uri;

        const info = await FileSystem.getInfoAsync(uri);
        
        let bytes: number | null = null;

        if (info.exists && 'size' in info && typeof info.size === 'number') {
          bytes = info.size;
        } else {
          // Método 2: Fallback usando fetch HEAD request para leer el tamaño del content:// URI
          try {
            const response = await fetch(asset.uri, { method: 'HEAD' });
            const contentLength = response.headers.get('content-length');
            if (contentLength) {
              bytes = parseInt(contentLength, 10);
            }
          } catch (fetchError) {
            console.warn(`[getFileSizeLazy] Fallback fetch failed for ${asset.id}:`, fetchError);
          }
        }

        if (bytes == null || isNaN(bytes)) {
          return null;
        }

        fileSizeCache.current.set(asset.id, bytes);

        // Actualizar el asset en el estado si está presente
        setState((prev) => ({
          ...prev,
          assets: prev.assets.map((a) =>
            a.id === asset.id ? { ...a, fileSizeBytes: bytes } : a,
          ),
        }));

        return bytes;
      } catch (error) {
        console.warn(`[getFileSizeLazy] Error calculating size for ${asset.id}:`, error);
        return null;
      }
    },
    [],
  );

  // ─── preloadAllSizes ─────────────────────────────────────────────────────────

  /**
   * Precalcula tamaños de TODOS los assets cargados en background.
   * Usa baja concurrencia (5) para no competir con la UI.
   * Cuando el usuario active sort por tamaño, la mayoría de tamaños ya estarán cacheados.
   */
  const preloadAllSizes = useCallback(() => {
    const currentAssets = state.assets;
    const uncached = currentAssets.filter((a) => !fileSizeCache.current.has(a.id));
    if (uncached.length === 0) return;

    // Fire-and-forget: no bloquea la UI
    const tasks = uncached.map(
      (asset) => () => fetchAssetSize(asset, fileSizeCache.current),
    );
    runConcurrent(tasks, 5).then((sizes) => {
      // Actualizar assets con los tamaños calculados en batch
      setState((prev) => ({
        ...prev,
        assets: prev.assets.map((a) => {
          if (a.fileSizeBytes != null) return a;
          const cached = fileSizeCache.current.get(a.id);
          return cached != null && cached > 0 ? { ...a, fileSizeBytes: cached } : a;
        }),
      }));
    }).catch(() => {
      // Silencioso — es preloading en background
    });
  }, [state.assets]);

  return {
    ...state,
    requestPermissions,
    loadAlbums,
    loadAssets,
    loadNextPage,
    getFileSizeLazy,
    preloadAllSizes,
    refreshPermissionDebug,
  };
}
