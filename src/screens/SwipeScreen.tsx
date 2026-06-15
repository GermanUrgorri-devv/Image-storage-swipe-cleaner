import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Dimensions,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SwipeCard } from '../components/SwipeCard';
import { useGalleryManager } from '../hooks/useGalleryManager';
import { useGalleryStore } from '../store/useGalleryStore';
import type { AssetItem, RootStackParamList } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

type SwipeScreenNav = NativeStackNavigationProp<RootStackParamList, 'Swipe'>;

// ─── Constants ───────────────────────────────────────────────────────────────

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH * 0.88;
const CARD_HEIGHT = SCREEN_HEIGHT * 0.62;
const MAX_VISIBLE_CARDS = 3;

// ─── Screen ──────────────────────────────────────────────────────────────────

/**
 * Pantalla principal de clasificación por swipe.
 * Muestra un stack de hasta 3 fotos apiladas.
 */
export default function SwipeScreen(): React.JSX.Element {
  const navigation = useNavigation<SwipeScreenNav>();
  const { addToPending, pendingDeletions } = useGalleryStore();
  const {
    assets,
    isLoading,
    hasNextPage,
    permissionStatus,
    requestPermissions,
    loadAssets,
    loadNextPage,
    getFileSizeLazy,
  } = useGalleryManager();

  const [currentIndex, setCurrentIndex] = useState(0);

  // ─── Init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const init = async () => {
      const granted = await requestPermissions();
      if (granted) {
        await loadAssets({ reset: true });
      }
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Paginación automática cuando quedan pocas cards ─────────────────────

  useEffect(() => {
    const remaining = assets.length - currentIndex;
    if (remaining <= MAX_VISIBLE_CARDS && hasNextPage && !isLoading) {
      loadNextPage();
    }
  }, [currentIndex, assets.length, hasNextPage, isLoading, loadNextPage]);

  // ─── Swipe Handlers ──────────────────────────────────────────────────────

  const handleSwipeLeft = useCallback(
    async (asset: AssetItem) => {
      const bytes = await getFileSizeLazy(asset);
      addToPending({ ...asset, fileSizeBytes: bytes });
      setCurrentIndex((prev) => prev + 1);
    },
    [addToPending, getFileSizeLazy],
  );

  const handleSwipeRight = useCallback((_asset: AssetItem) => {
    setCurrentIndex((prev) => prev + 1);
  }, []);

  // ─── Estados especiales ───────────────────────────────────────────────────

  if (permissionStatus === 'denied') {
    return (
      <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center px-8">
        <Text className="text-6xl mb-4">📷</Text>
        <Text className="text-white text-xl font-bold text-center mb-3">
          Acceso a la galería denegado
        </Text>
        <Text className="text-neutral-400 text-center text-sm mb-8">
          Expo Go necesita acceso a tus fotos. Si ya lo concediste en Ajustes,
          pulsa "Reintentar".
        </Text>
        <TouchableOpacity
          onPress={async () => {
            const granted = await requestPermissions();
            if (granted) await loadAssets({ reset: true });
          }}
          className="bg-violet-600 rounded-xl px-8 py-4 mb-3 w-full items-center"
        >
          <Text className="text-white font-bold text-base">🔄 Reintentar</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => Linking.openSettings()}
          className="bg-neutral-800 rounded-xl px-8 py-4 w-full items-center"
        >
          <Text className="text-neutral-300 font-semibold text-base">⚙️ Abrir Ajustes</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  if (isLoading && assets.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-neutral-950 items-center justify-center">
        <ActivityIndicator size="large" color="#8b5cf6" />
        <Text className="text-neutral-400 mt-4 text-sm">
          Cargando tu galería…
        </Text>
      </SafeAreaView>
    );
  }

  const visibleAssets = assets.slice(currentIndex, currentIndex + MAX_VISIBLE_CARDS);
  const isEmpty = visibleAssets.length === 0 && !isLoading;

  return (
    <SafeAreaView className="flex-1 bg-neutral-950">
      {/* Header */}
      <View className="px-6 pt-4 pb-2">
        <Text className="text-neutral-500 text-xs font-semibold tracking-widest uppercase">
          Foto {currentIndex + 1} de {assets.length}
          {hasNextPage ? '+' : ''}
        </Text>
        <Text className="text-white text-2xl font-bold mt-1">
          Limpieza de galería
        </Text>
      </View>

      {/* Instrucciones */}
      <View className="flex-row justify-center gap-6 px-6 mb-4">
        <View className="flex-row items-center gap-2">
          <View className="w-3 h-3 rounded-full bg-red-500" />
          <Text className="text-neutral-400 text-xs">← Borrar</Text>
        </View>
        <View className="flex-row items-center gap-2">
          <View className="w-3 h-3 rounded-full bg-emerald-500" />
          <Text className="text-neutral-400 text-xs">Guardar →</Text>
        </View>
      </View>

      {/* Stack de cards */}
      <View className="flex-1 items-center justify-center">
        {isEmpty ? (
          <View className="items-center justify-center px-8">
            <Text className="text-6xl mb-4">✨</Text>
            <Text className="text-white text-xl font-bold text-center">
              ¡Todo revisado!
            </Text>
            <Text className="text-neutral-400 text-center mt-2">
              Has clasificado todas las fotos disponibles.
            </Text>
          </View>
        ) : (
          <View
            style={{ width: CARD_WIDTH, height: CARD_HEIGHT }}
            className="relative"
          >
            {[...visibleAssets].reverse().map((asset, reversedIdx) => {
              const stackIdx = visibleAssets.length - 1 - reversedIdx;
              const isTop = stackIdx === 0;
              const scale = 1 - stackIdx * 0.04;
              const cardTranslateY = stackIdx * 12;

              return (
                <View
                  key={asset.id}
                  style={{
                    position: 'absolute',
                    width: '100%',
                    height: '100%',
                    transform: [{ scale }, { translateY: cardTranslateY }],
                    zIndex: MAX_VISIBLE_CARDS - stackIdx,
                  }}
                >
                  <SwipeCard
                    asset={asset}
                    onSwipeLeft={handleSwipeLeft}
                    onSwipeRight={handleSwipeRight}
                    isTop={isTop}
                  />
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* FAB — Contador de pendientes */}
      {pendingDeletions.length > 0 && (
        <View className="absolute bottom-8 right-6">
          <TouchableOpacity
            onPress={() => navigation.navigate('Review')}
            className="bg-violet-600 rounded-2xl px-5 py-4 shadow-lg flex-row items-center gap-3"
            activeOpacity={0.85}
          >
            <View className="bg-white/20 rounded-full w-7 h-7 items-center justify-center">
              <Text className="text-white text-xs font-black">
                {pendingDeletions.length}
              </Text>
            </View>
            <Text className="text-white font-bold text-sm">
              Revisar selección
            </Text>
            <Text className="text-violet-300 text-lg">→</Text>
          </TouchableOpacity>
        </View>
      )}
    </SafeAreaView>
  );
}
