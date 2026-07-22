import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import { Grid3x3 } from 'lucide-react';
import rolService from '../../api/rol.service';
import EmptyState from '../../components/common/EmptyState/EmptyState';

export default function MatrizAccesos() {
  const { enqueueSnackbar } = useSnackbar();
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function cargar() {
      setCargando(true);
      try {
        const data = await rolService.matrizAccesos();
        setDatos(data);
      } catch (error) {
        setDatos(null);
        enqueueSnackbar(error?.message || 'No se pudo cargar la matriz de accesos', { variant: 'error' });
      } finally {
        setCargando(false);
      }
    }
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (cargando) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>;

  if (!datos) {
    return <EmptyState icon={Grid3x3} title="No se pudo cargar la matriz de accesos" description="Intenta recargar la página." />;
  }

  const { roles, modulos, permisos } = datos;
  const nombresModulo = Object.keys(modulos);

  function accionesDe(rolId, modulo) {
    const permiso = permisos.find((p) => p.rolId === rolId && p.modulo === modulo);
    return permiso?.acciones || [];
  }

  return (
    <div>
      <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100 mb-2">Matriz de accesos</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Los permisos son globales por rol. El área de cada usuario se filtra por separado, en Administración &gt; Usuarios.
      </p>

      <div className="bg-white dark:bg-centhrix-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-slate-700">
              <th className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">Módulo</th>
              {roles.map((rol) => (
                <th key={rol.id} className="text-left px-4 py-3 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                  {rol.nombre}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {nombresModulo.map((modulo) => (
              <tr key={modulo} className="border-b border-gray-100 dark:border-slate-700 last:border-0">
                <td className="px-4 py-3 text-slate-600 dark:text-slate-300 whitespace-nowrap">{modulo}</td>
                {roles.map((rol) => {
                  const acciones = accionesDe(rol.id, modulo);
                  return (
                    <td key={rol.id} className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {acciones.length === 0 ? '—' : acciones.join(', ')}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
