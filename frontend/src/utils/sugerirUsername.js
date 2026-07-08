function quitarAcentos(texto) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function sugerirUsername(nombre, apellido) {
  if (!nombre || !apellido) return '';
  const inicialNombre = quitarAcentos(nombre.trim()).charAt(0).toLowerCase();
  const apellidoNormalizado = quitarAcentos(apellido.trim()).toLowerCase().replace(/\s+/g, '');
  return `${inicialNombre}${apellidoNormalizado}`;
}
