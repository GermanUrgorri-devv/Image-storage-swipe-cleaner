/**
 * Convierte bytes a megabytes con precisión de 2 decimales.
 */
export function bytesToMB(bytes: number): number {
  return parseFloat((bytes / (1024 * 1024)).toFixed(2));
}

/**
 * Formatea megabytes para mostrar en la UI.
 * Ejemplo: 45.23 → "45.23 MB"
 */
export function formatMB(mb: number): string {
  if (mb < 1) {
    return `${(mb * 1024).toFixed(0)} KB`;
  }
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(2)} MB`;
}

/**
 * Calcula el total de megabytes a partir de un array de tamaños en bytes.
 */
export function sumFileSizes(fileSizes: (number | null)[]): number {
  return fileSizes.reduce<number>((acc, size) => {
    return acc + (size ? bytesToMB(size) : 0);
  }, 0);
}
