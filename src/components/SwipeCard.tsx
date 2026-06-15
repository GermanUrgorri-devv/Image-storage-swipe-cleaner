import React, { useRef, useEffect, useCallback } from 'react';
import {
  Animated,
  Image,
  View,
  Text,
  PanResponder,
  StyleSheet,
} from 'react-native';
import type { AssetItem } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SwipeCardProps {
  asset: AssetItem;
  onSwipeLeft: (asset: AssetItem) => void;
  onSwipeRight: (asset: AssetItem) => void;
  isTop: boolean;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const SWIPE_THRESHOLD = 110;
const ROTATION_ANGLE = 12;

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * Tarjeta de swipe usando Animated + PanResponder nativos de React Native.
 * Compatible con cualquier versión de Expo Go sin dependencia de Reanimated.
 */
export const SwipeCard = React.memo<SwipeCardProps>(
  ({ asset, onSwipeLeft, onSwipeRight, isTop }) => {
    const translateX = useRef(new Animated.Value(0)).current;
    const translateY = useRef(new Animated.Value(0)).current;

    // Mantener isTop en un ref para que el PanResponder (creado una vez) lo vea actualizado
    const isTopRef = useRef(isTop);
    useEffect(() => {
      isTopRef.current = isTop;
    }, [isTop]);

    // Callbacks en refs para evitar problemas de closure en PanResponder
    const onSwipeLeftRef = useRef(onSwipeLeft);
    const onSwipeRightRef = useRef(onSwipeRight);
    const assetRef = useRef(asset);
    useEffect(() => { onSwipeLeftRef.current = onSwipeLeft; }, [onSwipeLeft]);
    useEffect(() => { onSwipeRightRef.current = onSwipeRight; }, [onSwipeRight]);
    useEffect(() => { assetRef.current = asset; }, [asset]);

    // ─── Interpolaciones ──────────────────────────────────────────────────

    const rotate = translateX.interpolate({
      inputRange: [-SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD],
      outputRange: [`-${ROTATION_ANGLE}deg`, '0deg', `${ROTATION_ANGLE}deg`],
      extrapolate: 'clamp',
    });

    const deleteOpacity = translateX.interpolate({
      inputRange: [-SWIPE_THRESHOLD, -30, 0],
      outputRange: [1, 0.5, 0],
      extrapolate: 'clamp',
    });

    const keepOpacity = translateX.interpolate({
      inputRange: [0, 30, SWIPE_THRESHOLD],
      outputRange: [0, 0.5, 1],
      extrapolate: 'clamp',
    });

    // ─── PanResponder ────────────────────────────────────────────────────

    const panResponder = useRef(
      PanResponder.create({
        onStartShouldSetPanResponder: () => isTopRef.current,
        onMoveShouldSetPanResponder: () => isTopRef.current,
        onPanResponderGrant: () => {
          // Fijar los valores de inicio del gesto
          translateX.setOffset((translateX as any)._value);
          translateY.setOffset((translateY as any)._value);
          translateX.setValue(0);
          translateY.setValue(0);
        },
        onPanResponderMove: (_, gestureState) => {
          translateX.setValue(gestureState.dx);
          translateY.setValue(gestureState.dy * 0.3);
        },
        onPanResponderRelease: (_, gestureState) => {
          translateX.flattenOffset();
          translateY.flattenOffset();

          const dx = gestureState.dx;

          if (dx < -SWIPE_THRESHOLD) {
            // Swipe izquierdo → BORRAR
            Animated.spring(translateX, {
              toValue: -700,
              useNativeDriver: true,
              damping: 15,
            }).start(() => {
              onSwipeLeftRef.current(assetRef.current);
              // Resetear para reutilización
              translateX.setValue(0);
              translateY.setValue(0);
            });
          } else if (dx > SWIPE_THRESHOLD) {
            // Swipe derecho → GUARDAR
            Animated.spring(translateX, {
              toValue: 700,
              useNativeDriver: true,
              damping: 15,
            }).start(() => {
              onSwipeRightRef.current(assetRef.current);
              translateX.setValue(0);
              translateY.setValue(0);
            });
          } else {
            // No superó el umbral → volver al centro
            Animated.parallel([
              Animated.spring(translateX, {
                toValue: 0,
                useNativeDriver: true,
                damping: 20,
                stiffness: 180,
              }),
              Animated.spring(translateY, {
                toValue: 0,
                useNativeDriver: true,
                damping: 20,
                stiffness: 180,
              }),
            ]).start();
          }
        },
      }),
    ).current;

    // ─── Render ───────────────────────────────────────────────────────────

    return (
      <Animated.View
        style={[
          styles.card,
          {
            transform: [
              { translateX },
              { translateY },
              { rotate },
            ],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <Image
          source={{ uri: asset.uri }}
          style={styles.image}
          resizeMode="cover"
        />

        {/* Overlay BORRAR */}
        <Animated.View
          style={[styles.overlay, styles.deleteOverlay, { opacity: deleteOpacity }]}
          pointerEvents="none"
        >
          <View style={[styles.label, styles.labelDelete]}>
            <Text style={styles.labelText}>BORRAR</Text>
          </View>
        </Animated.View>

        {/* Overlay GUARDAR */}
        <Animated.View
          style={[styles.overlay, styles.keepOverlay, { opacity: keepOpacity }]}
          pointerEvents="none"
        >
          <View style={[styles.label, styles.labelKeep]}>
            <Text style={styles.labelText}>GUARDAR</Text>
          </View>
        </Animated.View>
      </Animated.View>
    );
  },
);

SwipeCard.displayName = 'SwipeCard';

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteOverlay: {
    backgroundColor: 'rgba(239, 68, 68, 0.55)',
  },
  keepOverlay: {
    backgroundColor: 'rgba(16, 185, 129, 0.55)',
  },
  label: {
    borderWidth: 4,
    borderColor: 'white',
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  labelDelete: {
    transform: [{ rotate: '-20deg' }],
  },
  labelKeep: {
    transform: [{ rotate: '20deg' }],
  },
  labelText: {
    color: 'white',
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 4,
  },
});
