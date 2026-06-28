import { useState, useCallback, useRef } from 'react';
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import type { AssetItem, PermissionStatus } from '../types';
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
  /** Force refresh permission debug info without requesting new permissions */
  refreshPermissionDebug: () => Promise<void>;
}

interface LoadOptions {
  albumId?: string;
  reset?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

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
      const { albumId, reset = false } = options;

      setState((prev) => ({ ...prev, isLoading: true, error: null }));

      if (reset) {
        endCursorRef.current = undefined;
      }

      currentAlbumRef.current = albumId;

      try {
        const query: MediaLibrary.AssetsOptions = {
          first: PAGE_SIZE,
          sortBy: [MediaLibrary.SortBy.creationTime],
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
    if (!state.hasNextPage || state.isLoading) return;
    await loadAssets({ albumId: currentAlbumRef.current });
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

  return {
    ...state,
    requestPermissions,
    loadAlbums,
    loadAssets,
    loadNextPage,
    getFileSizeLazy,
    refreshPermissionDebug,
  };
}
