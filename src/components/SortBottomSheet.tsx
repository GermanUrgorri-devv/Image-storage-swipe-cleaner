import React, { useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { useGalleryStore } from '../store/useGalleryStore';
import type { SortOption } from '../types';

// ─── Types ───────────────────────────────────────────────────────────────────

interface SortBottomSheetProps {
  visible: boolean;
  onClose: () => void;
}

interface SortOptionItem {
  value: SortOption;
  label: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCENT_COLOR = '#FAC03B';

const SORT_OPTIONS: SortOptionItem[] = [
  { value: 'date_desc', label: 'Fecha (más recientes primero)' },
  { value: 'date_asc', label: 'Fecha (más antiguos primero)' },
  { value: 'size_desc', label: 'Tamaño (más grandes primero)' },
  { value: 'size_asc', label: 'Tamaño (más pequeños primero)' },
  { value: 'name_asc', label: 'Nombre (de la A a la Z)' },
  { value: 'name_desc', label: 'Nombre (de la Z a la A)' },
];

// ─── Sub-Component: Radio Row ────────────────────────────────────────────────

interface RadioRowProps {
  item: SortOptionItem;
  isSelected: boolean;
  onSelect: (value: SortOption) => void;
}

const RadioRow = React.memo<RadioRowProps>(({ item, isSelected, onSelect }) => {
  return (
    <TouchableOpacity
      onPress={() => onSelect(item.value)}
      activeOpacity={0.7}
      className="flex-row items-center justify-between py-4 px-6"
    >
      <Text
        className="text-base"
        style={{ color: isSelected ? '#ffffff' : '#d4d4d4' }}
      >
        {item.label}
      </Text>

      {/* Radio button visual */}
      <View
        className="w-5 h-5 rounded-full items-center justify-center"
        style={{
          borderWidth: 2,
          borderColor: isSelected ? ACCENT_COLOR : '#737373',
        }}
      >
        {isSelected && (
          <View
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: ACCENT_COLOR }}
          />
        )}
      </View>
    </TouchableOpacity>
  );
});

RadioRow.displayName = 'RadioRow';

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Bottom Sheet modal para seleccionar la opción de ordenación.
 * Usa el Modal nativo de RN con animación slide-up.
 */
export const SortBottomSheet = React.memo<SortBottomSheetProps>(
  ({ visible, onClose }) => {
    const sortOption = useGalleryStore((s) => s.sortOption);
    const setSortOption = useGalleryStore((s) => s.setSortOption);

    const handleSelect = useCallback(
      (value: SortOption) => {
        setSortOption(value);
        onClose();
      },
      [setSortOption, onClose],
    );

    return (
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        {/* Fondo semitransparente — cerrar al pulsar */}
        <Pressable
          onPress={onClose}
          className="flex-1 bg-black/50 justify-end"
        >
          {/* Panel del bottom sheet — evitar que el tap propague al fondo */}
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="bg-neutral-900 rounded-t-3xl pb-8"
          >
            {/* Handle decorativo */}
            <View className="items-center pt-3 pb-2">
              <View className="w-10 h-1 rounded-full bg-neutral-600" />
            </View>

            {/* Título */}
            <Text className="text-white text-lg font-bold px-6 pt-2 pb-3">
              Ordenar por
            </Text>

            {/* Separador */}
            <View className="h-px bg-neutral-800 mx-4" />

            {/* Lista de opciones */}
            {SORT_OPTIONS.map((item) => (
              <RadioRow
                key={item.value}
                item={item}
                isSelected={item.value === sortOption}
                onSelect={handleSelect}
              />
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    );
  },
);

SortBottomSheet.displayName = 'SortBottomSheet';
