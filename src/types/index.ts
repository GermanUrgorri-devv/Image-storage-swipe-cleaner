import type { Asset } from 'expo-media-library';

/**
 * Representa un asset fotográfico enriquecido con metadata de tamaño.
 */
export interface AssetItem extends Asset {
  /** Tamaño del archivo en bytes (null si aún no se ha calculado con lazy loading) */
  fileSizeBytes: number | null;
}

/**
 * Tipo para la navegación del stack principal.
 */
export type RootStackParamList = {
  Swipe: undefined;
  Review: undefined;
};

/**
 * Estado de los permisos del sistema de archivos multimedia.
 */
export type PermissionStatus = 'undetermined' | 'granted' | 'denied';

/**
 * Opciones de ordenación disponibles para la galería.
 * - date_*: Orden por fecha de creación (soportado nativamente por MediaLibrary).
 * - size_*: Orden por tamaño de archivo (requiere sort en memoria — TODO).
 * - name_*: Orden por nombre de archivo.
 */
export type SortOption =
  | 'date_desc'
  | 'date_asc'
  | 'size_desc'
  | 'size_asc'
  | 'name_asc'
  | 'name_desc';
