import React, { useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import type { Album } from 'expo-media-library';
import { useGalleryStore } from '../store/useGalleryStore';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopBarProps {
  /** Lista de álbumes obtenida desde useGalleryManager */
  albums: Album[];
  /** Callback para abrir el bottom sheet de ordenación */
  onSortPress: () => void;
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
}

const AlbumTab = React.memo<AlbumTabProps>(({ item, isActive, onPress }) => {
  return (
    <TouchableOpacity
      onPress={() => onPress(item.id)}
      activeOpacity={0.7}
      className="px-4 pb-3 pt-2"
    >
      <Text
        className="text-sm font-semibold"
        style={{ color: isActive ? ACCENT_COLOR : '#737373' }}
        numberOfLines={1}
      >
        {item.title}
      </Text>
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
export const TopBar = React.memo<TopBarProps>(({ albums, onSortPress }) => {
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

  const renderAlbumTab = useCallback(
    ({ item }: { item: RibbonItem }) => (
      <AlbumTab
        item={item}
        isActive={item.id === activeAlbumId}
        onPress={handleAlbumPress}
      />
    ),
    [activeAlbumId, handleAlbumPress],
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
