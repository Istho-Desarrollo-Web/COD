export const TIPOS_PERMITIDOS = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'image/jpeg',
  'image/png',
]);

export const TAMANO_MAXIMO_BYTES = 20 * 1024 * 1024;

export function validarArchivo(file) {
  if (!file) return 'El archivo es obligatorio';
  if (!TIPOS_PERMITIDOS.has(file.type)) return 'Tipo de archivo no permitido';
  if (file.size > TAMANO_MAXIMO_BYTES) return 'El archivo excede el tamaño máximo de 20MB';
  return null;
}
