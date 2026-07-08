import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { ArrowLeft } from 'lucide-react';
import carpetaService from '../../api/carpeta.service';
import areaService from '../../api/area.service';
import { aplanarCarpetas } from './DocumentosListado';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';

export default function CarpetasGestion() {
  const { enqueueSnackbar } = useSnackbar();
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState('');
  const [carpetas, setCarpetas] = useState([]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  useEffect(() => {
    async function cargarAreas() {
      try {
        const data = await areaService.listar();
        setAreas(data);
      } catch {
        setAreas([]);
      }
    }
    cargarAreas();
  }, []);

  async function cargarCarpetas(area) {
    if (!area) {
      setCarpetas([]);
      return;
    }
    try {
      const arbol = await carpetaService.listar(Number(area));
      setCarpetas(aplanarCarpetas(arbol));
    } catch {
      setCarpetas([]);
    }
  }

  useEffect(() => {
    cargarCarpetas(areaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  async function onCrearCarpeta({ nombre, carpetaPadreId }) {
    try {
      await carpetaService.crear({ areaId: Number(areaId), nombre, carpetaPadreId: carpetaPadreId || null });
      enqueueSnackbar('Carpeta creada exitosamente', { variant: 'success' });
      reset();
      await cargarCarpetas(areaId);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear la carpeta', { variant: 'error' });
    }
  }

  const opcionesArea = areas.map((area) => ({ value: area.id, label: area.nombre }));

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/documentos"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-centhrix-card text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Documentos
        </Link>
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Gestión de carpetas</h2>
      </div>

      <div className="max-w-sm mb-6">
        <FilterDropdown
          label="Área de las carpetas"
          options={opcionesArea}
          value={areaId}
          onChange={setAreaId}
          placeholder="Selecciona un área"
        />
      </div>

      {areaId && (
        <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1 mb-6">
          {carpetas.length === 0 && <li className="text-slate-400 dark:text-slate-500">Sin carpetas todavía en esta área.</li>}
          {carpetas.map((carpeta) => (
            <li key={carpeta.id}>{carpeta.ruta}</li>
          ))}
        </ul>
      )}

      {areaId && (
        <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700 max-w-sm">
          <Input label="Nombre de la nueva carpeta" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />

          <div>
            <label htmlFor="carpetas-gestion-padre" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Carpeta padre (opcional)
            </label>
            <select
              id="carpetas-gestion-padre"
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
              {...register('carpetaPadreId')}
            >
              <option value="">Ninguna (carpeta raíz)</option>
              {carpetas.map((carpeta) => (
                <option key={carpeta.id} value={carpeta.id}>
                  {carpeta.ruta}
                </option>
              ))}
            </select>
          </div>

          <Button onClick={handleSubmit(onCrearCarpeta)}>Crear carpeta</Button>
        </form>
      )}
    </div>
  );
}
