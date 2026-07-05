import React, { useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { Album } from 'expo-media-library';
import { useGalleryStore } from '../store/useGalleryStore';
import { formatBytes } from '../utils/fileUtils';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  /** Lista de álbumes obtenida desde useGalleryManager */
  albums: Album[];
  /** Callback para abrir el bottom sheet de ordenación */
  onSortPress: () => void;
  /** Mapa de tamaños totales por álbum: albumId → total bytes */
  albumSizes: Map<string, number>;
  /** Tamaño total de todos los assets (para la pestaña "Todo") */
  totalSize: number;
  /** Set de IDs de álbumes cuyo tamaño ya ha sido calculado */
  albumSizesComputed: Set<string>;
  /** true mientras se están calculando los tamaños de álbumes */
  albumSizesLoading: boolean;
}

/** Modelo interno para ítems de la ribbon (incluye "Todo") */
interface RibbonItem {
  id: string | null;
  title: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCENT_COLOR = '#FAC03B';

// ─── Sub-Component: Album Tab ────────────────────────────────────────────────

interface AlbumTabProps {
  item: RibbonItem;
  isActive: boolean;
  onPress: (albumId: string | null) => void;
  sizeLabel: string | null;
  isComputing: boolean;
}

const AlbumTab = React.memo<AlbumTabProps>(({ item, isActive, onPress, sizeLabel, isComputing }) => {
  const sizeColor = isActive ? '#d4a017' : '#525252';

  return (
    <TouchableOpacity
      onPress={() => onPress(item.id)}
      activeOpacity={0.7}
      className="px-4 pb-3 pt-2"
    >
      <View className="flex-row items-center">
        <Text
          className="text-sm font-semibold"
          style={{ color: isActive ? ACCENT_COLOR : '#737373' }}
          numberOfLines={1}
        >
          {item.title}
          {sizeLabel != null && (
            <Text
              className="text-xs font-normal"
              style={{ color: sizeColor }}
            >
              {' '}({sizeLabel})
            </Text>
          )}
        </Text>
        {isComputing && (
          <ActivityIndicator
            size={10}
            color={sizeColor}
            style={{ marginLeft: 4 }}
          />
        )}
      </View>
      {/* Barra inferior indicadora */}
      <View
        className="mt-1.5 h-0.5 rounded-full"
        style={{
          backgroundColor: isActive ? ACCENT_COLOR : 'transparent',
        }}
      />
    </TouchableOpacity>
  );
});

AlbumTab.displayName = 'AlbumTab';

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Ribbon UI para selección de álbumes + botón de opciones de ordenación.
 * Layout inspirado en la Galería nativa de Android (ver mockups).
 */
export const TopBar = React.memo<TopBarProps>(({
  albums,
  onSortPress,
  albumSizes,
  totalSize,
  albumSizesComputed,
  albumSizesLoading,
}) => {
  const activeAlbumId = useGalleryStore((s) => s.activeAlbumId);
  const setActiveAlbum = useGalleryStore((s) => s.setActiveAlbum);

  // Construir la lista con "Todo" como primer ítem fijo
  const ribbonData: RibbonItem[] = React.useMemo(() => {
    const items: RibbonItem[] = [{ id: null, title: 'Todo' }];
    for (const album of albums) {
      items.push({ id: album.id, title: album.title });
    }
    return items;
  }, [albums]);

  const handleAlbumPress = useCallback(
    (albumId: string | null) => {
      setActiveAlbum(albumId);
    },
    [setActiveAlbum],
  );

  /**
   * Devuelve la etiqueta formateada del tamaño.
   * - Si el álbum ya ha sido calculado y tiene 0 bytes → "0.00 KB"
   * - Si tiene tamaño → formateado (ej. "2.04 GB")
   * - Si aún no ha sido calculado → null (solo spinner)
   */
  const getSizeLabel = useCallback(
    (albumId: string | null): string | null => {
      if (albumId === null) {
        // Pestaña "Todo": mostrar tamaño global (o 0.00 KB si ya terminó y es 0)
        if (totalSize > 0) return formatBytes(totalSize);
        if (!albumSizesLoading && albumSizesComputed.size > 0) return '0.00 KB';
        return null;
      }
      const isComputed = albumSizesComputed.has(albumId);
      const size = albumSizes.get(albumId);
      if (size != null && size > 0) return formatBytes(size);
      if (isComputed) return '0.00 KB';
      return null;
    },
    [albumSizes, totalSize, albumSizesComputed, albumSizesLoading],
  );

  /**
   * Determina si un álbum concreto está todavía computando su tamaño.
   * - Para "Todo": loading es true si la computación global sigue activa.
   * - Para un álbum: loading si no ha sido marcado como computed y la computación sigue activa.
   */
  const getIsComputing = useCallback(
    (albumId: string | null): boolean => {
      if (albumId === null) return albumSizesLoading;
      return albumSizesLoading && !albumSizesComputed.has(albumId);
    },
    [albumSizesLoading, albumSizesComputed],
  );

  const renderAlbumTab = useCallback(
    ({ item }: { item: RibbonItem }) => (
      <AlbumTab
        item={item}
        isActive={item.id === activeAlbumId}
        onPress={handleAlbumPress}
        sizeLabel={getSizeLabel(item.id)}
        isComputing={getIsComputing(item.id)}
      />
    ),
    [activeAlbumId, handleAlbumPress, getSizeLabel, getIsComputing],
  );

  const keyExtractor = useCallback(
    (item: RibbonItem) => item.id ?? '__all__',
    [],
  );

  return (
    <View className="bg-neutral-950 border-b border-neutral-800/50 pt-2">
      {/* Fila superior: Flecha, Título e Iconos de Acción */}
      <View className="flex items-end px-4 py-2">
        <TouchableOpacity
          onPress={onSortPress}
          activeOpacity={0.7}
          className="p-1"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-neutral-400 text-xl font-black">⋮</Text>
        </TouchableOpacity>
      </View>

      {/* Fila inferior: Ribbon de selección de carpetas */}
      <View className="mt-1">
        <FlatList<RibbonItem>
          data={ribbonData}
          keyExtractor={keyExtractor}
          renderItem={renderAlbumTab}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 12 }}
        />
      </View>
    </View>
  );
});

TopBar.displayName = 'TopBar';


