import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as MediaLibrary from 'expo-media-library';
import { useGalleryStore } from '../store/useGalleryStore';
import { formatMB } from '../utils/fileUtils';
import type { AssetItem } from '../types';

// ─── Constants ───────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const NUM_COLUMNS = 3;
const GRID_PADDING = 12;
const ITEM_GAP = 2;
const ITEM_SIZE =
  (SCREEN_WIDTH - GRID_PADDING * 2 - ITEM_GAP * (NUM_COLUMNS - 1)) /
  NUM_COLUMNS;

// ─── Sub-Components ──────────────────────────────────────────────────────────

interface GridItemProps {
  asset: AssetItem;
  onRemove: (id: string) => void;
}

const GridItem = React.memo<GridItemProps>(({ asset, onRemove }) => {
  return (
    <View>
      <TouchableOpacity
        onPress={() => onRemove(asset.id)}
        activeOpacity={0.7}
        style={{ width: ITEM_SIZE, height: ITEM_SIZE, margin: ITEM_GAP / 2 }}
      >
        <Image
          source={{ uri: asset.uri }}
          style={{ width: '100%', height: '100%' }}
          resizeMode="cover"
          className="rounded-lg"
        />
        {/* Badge de eliminar */}
        <View className="absolute top-1.5 right-1.5 bg-red-600 rounded-full w-5 h-5 items-center justify-center shadow-md">
          <Text className="text-white text-xs font-black leading-none">✕</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
});

GridItem.displayName = 'GridItem';

// ─── Screen ──────────────────────────────────────────────────────────────────

/**
 * Pantalla de revisión de fotos marcadas para borrar.
 * FlatList en 3 columnas — tap para deseleccionar.
 * Footer CTA ejecuta el borrado nativo.
 */
export default function ReviewScreen(): React.JSX.Element {
  const navigation = useNavigation();
  const { pendingDeletions, totalMegabytes, removeFromPending, clearPending } =
    useGalleryStore();
  const [isDeleting, setIsDeleting] = useState(false);

  // ─── Handlers ─────────────────────────────────────────────────────────

  const handleRemove = useCallback(
    (id: string) => {
      removeFromPending(id);
    },
    [removeFromPending],
  );

  const handleDeleteAll = useCallback(async () => {
    if (pendingDeletions.length === 0) return;

    Alert.alert(
      '⚠️ Confirmar eliminación',
      `Se eliminarán permanentemente ${pendingDeletions.length} foto${
        pendingDeletions.length !== 1 ? 's' : ''
      } (${formatMB(totalMegabytes)}). Esta acción no se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar definitivamente',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              const ids = pendingDeletions.map((a) => a.id);
              const deleted = await MediaLibrary.deleteAssetsAsync(ids);
              if (deleted) {
                clearPending();
                navigation.goBack();
              } else {
                Alert.alert(
                  'Error',
                  'No se pudieron eliminar algunas fotos. Verifica los permisos.',
                );
              }
            } catch (err) {
              Alert.alert(
                'Error',
                'Ocurrió un error durante la eliminación.',
              );
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ],
    );
  }, [pendingDeletions, totalMegabytes, clearPending, navigation]);

  // ─── Empty State ─────────────────────────────────────────────────────

  if (pendingDeletions.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center px-8">
        <Text className="text-6xl mb-4">🎉</Text>
        <Text className="text-white text-xl font-bold text-center">
          No hay fotos seleccionadas
        </Text>
        <Text className="text-neutral-400 text-center mt-2 text-sm">
          Desliza fotos hacia la izquierda en la pantalla anterior para
          seleccionarlas.
        </Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          className="mt-6 bg-violet-600 px-6 py-3 rounded-xl"
        >
          <Text className="text-white font-semibold">Volver a clasificar</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  // ─── Main Render ─────────────────────────────────────────────────────

  return (
    <SafeAreaView className="flex-1 bg-neutral-950" edges={['top']}>
      {/* Header */}
      <View className="px-5 pt-4 pb-3 border-b border-neutral-800">
        <Text className="text-neutral-500 text-xs font-semibold tracking-widest uppercase">
          Revisión
        </Text>
        <Text className="text-white text-2xl font-bold mt-1">
          Fotos seleccionadas
        </Text>
        <Text className="text-neutral-400 text-sm mt-0.5">
          Toca una foto para deseleccionarla
        </Text>
      </View>

      {/* Stats bar */}
      <View className="flex-row items-center justify-between px-5 py-3 bg-neutral-900/60">
        <View className="flex-row items-center gap-2">
          <View className="bg-red-500/20 rounded-lg px-3 py-1.5">
            <Text className="text-red-400 font-bold text-sm">
              {pendingDeletions.length} foto{pendingDeletions.length !== 1 ? 's' : ''}
            </Text>
          </View>
          <View className="bg-orange-500/20 rounded-lg px-3 py-1.5">
            <Text className="text-orange-400 font-bold text-sm">
              {formatMB(totalMegabytes)}
            </Text>
          </View>
        </View>
        <Text className="text-neutral-500 text-xs">se liberarán</Text>
      </View>

      {/* Grid */}
      <FlatList<AssetItem>
        data={pendingDeletions}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={{
          padding: GRID_PADDING,
          paddingBottom: 120,
        }}
        columnWrapperStyle={{
          gap: ITEM_GAP,
          marginBottom: ITEM_GAP,
        }}
        renderItem={({ item }) => (
          <GridItem asset={item} onRemove={handleRemove} />
        )}
        showsVerticalScrollIndicator={false}
        initialNumToRender={18}
        maxToRenderPerBatch={12}
        windowSize={5}
      />

      {/* Footer CTA */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-neutral-950/95 px-5 pb-8 pt-4 border-t border-neutral-800"
      >
        <TouchableOpacity
          onPress={handleDeleteAll}
          disabled={isDeleting}
          activeOpacity={0.85}
          className="bg-red-600 rounded-2xl py-5 items-center justify-center shadow-lg"
          style={{ opacity: isDeleting ? 0.7 : 1 }}
        >
          {isDeleting ? (
            <View className="flex-row items-center gap-3">
              <ActivityIndicator color="white" size="small" />
              <Text className="text-white font-bold text-base">
                Eliminando…
              </Text>
            </View>
          ) : (
            <>
              <Text className="text-white font-black text-lg tracking-wide">
                Liberar {formatMB(totalMegabytes)}
              </Text>
              <Text className="text-red-200 text-sm font-medium mt-0.5">
                Borrar {pendingDeletions.length} foto
                {pendingDeletions.length !== 1 ? 's' : ''} permanentemente
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
