import { create } from 'zustand';
import type { AssetItem } from '../types';
import { sumFileSizes } from '../utils/fileUtils';

// ─── State Shape ─────────────────────────────────────────────────────────────

interface GalleryState {
  /** Assets marcados para eliminación */
  pendingDeletions: AssetItem[];

  /** Megabytes totales calculados de los assets pendientes */
  totalMegabytes: number;

  // ─── Actions ───────────────────────────────────────────────────────────────

  /** Agrega un asset a la cola de borrado si no está ya incluido */
  addToPending: (asset: AssetItem) => void;

  /** Elimina un asset de la cola de borrado por su ID */
  removeFromPending: (id: string) => void;

  /** Vacía completamente la cola de borrado (llamar tras borrado nativo exitoso) */
  clearPending: () => void;
}

// ─── Derived Value Helper ────────────────────────────────────────────────────

function recalculateMB(assets: AssetItem[]): number {
  return sumFileSizes(assets.map((a) => a.fileSizeBytes));
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useGalleryStore = create<GalleryState>((set) => ({
  pendingDeletions: [],
  totalMegabytes: 0,

  addToPending: (asset) =>
    set((state) => {
      // Evitar duplicados
      if (state.pendingDeletions.some((a) => a.id === asset.id)) {
        return state;
      }
      const updated = [...state.pendingDeletions, asset];
      return {
        pendingDeletions: updated,
        totalMegabytes: recalculateMB(updated),
      };
    }),

  removeFromPending: (id) =>
    set((state) => {
      const updated = state.pendingDeletions.filter((a) => a.id !== id);
      return {
        pendingDeletions: updated,
        totalMegabytes: recalculateMB(updated),
      };
    }),

  clearPending: () =>
    set({
      pendingDeletions: [],
      totalMegabytes: 0,
    }),
}));
