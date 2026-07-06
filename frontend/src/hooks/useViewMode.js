import { useEffect, useState } from 'react';

const MOBILE_BREAKPOINT_PX = 768;

function esMobil() {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_BREAKPOINT_PX;
}

export function useViewMode(storageKey) {
  const [modoGuardado, setModoGuardado] = useState(() => localStorage.getItem(storageKey) || 'lista');
  const [esVistaMovil, setEsVistaMovil] = useState(esMobil());

  useEffect(() => {
    function handleResize() {
      setEsVistaMovil(esMobil());
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function setModo(modo) {
    setModoGuardado(modo);
    localStorage.setItem(storageKey, modo);
  }

  const modoEfectivo = esVistaMovil ? 'tarjetas' : modoGuardado;

  return { modo: modoEfectivo, setModo, esVistaMovil };
}
