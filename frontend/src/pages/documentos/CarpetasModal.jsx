import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import PropTypes from 'prop-types';
import carpetaService from '../../api/carpeta.service';
import { aplanarCarpetas } from './DocumentosListado';
import Modal from '../../components/common/Modal/Modal';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';

export default function CarpetasModal({ isOpen, onClose, areas, onCarpetaCreada }) {
  const { enqueueSnackbar } = useSnackbar();
  const [areaId, setAreaId] = useState('');
  const [carpetas, setCarpetas] = useState([]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

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
      onCarpetaCreada?.(Number(areaId));
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear la carpeta', { variant: 'error' });
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Gestionar carpetas">
      <div className="space-y-4">
        <div>
          <label htmlFor="carpetas-modal-area" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Área de las carpetas
          </label>
          <select
            id="carpetas-modal-area"
            value={areaId}
            onChange={(e) => setAreaId(e.target.value)}
            className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
          >
            <option value="">Selecciona un área</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.nombre}
              </option>
            ))}
          </select>
        </div>

        {areaId && (
          <ul className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
            {carpetas.length === 0 && <li className="text-slate-400 dark:text-slate-500">Sin carpetas todavía en esta área.</li>}
            {carpetas.map((carpeta) => (
              <li key={carpeta.id}>{carpeta.ruta}</li>
            ))}
          </ul>
        )}

        {areaId && (
          <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
            <Input label="Nombre de la nueva carpeta" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />

            <div>
              <label htmlFor="carpetas-modal-padre" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                Carpeta padre (opcional)
              </label>
              <select id="carpetas-modal-padre" className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100" {...register('carpetaPadreId')}>
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
    </Modal>
  );
}

CarpetasModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  areas: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number.isRequired, nombre: PropTypes.string.isRequired })).isRequired,
  onCarpetaCreada: PropTypes.func,
};
