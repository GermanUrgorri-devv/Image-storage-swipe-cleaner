import { useState, useCallback, useRef } from 'react';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import type { AssetItem, PermissionStatus } from '../types';
import { bytesToMB } from '../utils/fileUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface GalleryManagerState {
  assets: AssetItem[];
  albums: MediaLibrary.Album[];
  permissionStatus: PermissionStatus;
  isLoading: boolean;
  hasNextPage: boolean;
  error: string | null;
}

interface GalleryManagerActions {
  requestPermissions: () => Promise<boolean>;
  loadAssets: (options?: LoadOptions) => Promise<void>;
  loadNextPage: () => Promise<void>;
  loadAlbums: () => Promise<void>;
  getFileSizeLazy: (asset: AssetItem) => Promise<number | null>;
}

interface LoadOptions {
  albumId?: string;
  reset?: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

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
  });

  // Cursor para la paginación de expo-media-library
  const endCursorRef = useRef<string | undefined>(undefined);
  const currentAlbumRef = useRef<string | undefined>(undefined);

  // Cache de tamaños ya calculados: assetId → bytes
  const fileSizeCache = useRef<Map<string, number>>(new Map());

  // ─── requestPermissions ─────────────────────────────────────────────────

  const requestPermissions = useCallback(async (): Promise<boolean> => {
    try {
      // Primero verificamos si ya tenemos permiso (sin mostrar diálogo)
      const current = await MediaLibrary.getPermissionsAsync();
      if (current.granted) {
        setState((prev) => ({ ...prev, permissionStatus: 'granted' }));
        return true;
      }

      // Si podemos pedir de nuevo, mostramos el diálogo
      const result = await MediaLibrary.requestPermissionsAsync();

      // Usamos result.granted (cubre 'granted' Y 'limited' en Android 13+)
      const hasAccess = result.granted;

      setState((prev) => ({
        ...prev,
        permissionStatus: hasAccess ? 'granted' : 'denied',
      }));
      return hasAccess;
    } catch (err) {
      console.warn('[useGalleryManager] requestPermissions error:', err);
      setState((prev) => ({
        ...prev,
        permissionStatus: 'denied',
        error: 'No se pudieron obtener los permisos de galería.',
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
        const info = await FileSystem.getInfoAsync(asset.uri, { size: true });
        if (!info.exists || !('size' in info)) return null;

        const bytes = info.size;
        fileSizeCache.current.set(asset.id, bytes);

        // Actualizar el asset en el estado si está presente
        setState((prev) => ({
          ...prev,
          assets: prev.assets.map((a) =>
            a.id === asset.id ? { ...a, fileSizeBytes: bytes } : a,
          ),
        }));

        return bytes;
      } catch {
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
  };
}
