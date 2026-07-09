import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { ArrowLeft, ChevronRight, FileText, Folder, Info, Plus } from 'lucide-react';
import carpetaService from '../../api/carpeta.service';
import areaService from '../../api/area.service';
import { aplanarCarpetas } from './DocumentosListado';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';

function CarpetaCard({ carpeta, onAbrir, onVerDetalle }) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={carpeta.nombre}
      onClick={onAbrir}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onAbrir();
        }
      }}
      className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer flex items-start justify-between gap-2"
    >
      <div className="flex items-center gap-3 min-w-0">
        <Folder className="w-8 h-8 text-slate-300 dark:text-slate-600 shrink-0" aria-hidden="true" />
        <p className="font-semibold text-slate-800 dark:text-slate-100 truncate">{carpeta.nombre}</p>
      </div>
      <button
        type="button"
        aria-label={`Ver detalle de ${carpeta.nombre}`}
        onClick={(e) => {
          e.stopPropagation();
          onVerDetalle();
        }}
        className="p-1.5 text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-centhrix-surface rounded-lg transition-colors shrink-0"
      >
        <Info className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function CarpetasGestion() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { enqueueSnackbar } = useSnackbar();
  const [areas, setAreas] = useState([]);
  const [areaId, setAreaId] = useState(() => {
    const areaIdParam = searchParams.get('areaId');
    return areaIdParam ? Number(areaIdParam) : '';
  });
  const [arbol, setArbol] = useState([]);
  const [carpetaActualId, setCarpetaActualId] = useState(null);
  const [detalleId, setDetalleId] = useState(null);
  const [crearModalAbierto, setCrearModalAbierto] = useState(false);
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
      setArbol([]);
      return;
    }
    try {
      const data = await carpetaService.listar(Number(area));
      setArbol(data);
    } catch {
      setArbol([]);
    }
  }

  useEffect(() => {
    setCarpetaActualId(null);
    setDetalleId(null);
    setCrearModalAbierto(false);
    cargarCarpetas(areaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaId]);

  const carpetasPlanas = useMemo(() => aplanarCarpetas(arbol), [arbol]);
  const nivelActual = carpetasPlanas.filter((carpeta) => carpeta.carpetaPadreId === carpetaActualId);

  function calcularAncestros(id) {
    const ancestros = [];
    let actual = id != null ? carpetasPlanas.find((carpeta) => carpeta.id === id) : null;
    while (actual) {
      ancestros.unshift(actual);
      actual = actual.carpetaPadreId != null ? carpetasPlanas.find((carpeta) => carpeta.id === actual.carpetaPadreId) : null;
    }
    return ancestros;
  }
  const ancestros = calcularAncestros(carpetaActualId);
  const areaSeleccionada = areas.find((area) => area.id === Number(areaId));
  const carpetaDetalle = detalleId != null ? carpetasPlanas.find((carpeta) => carpeta.id === detalleId) : null;

  async function onCrearCarpeta({ nombre }) {
    try {
      await carpetaService.crear({ areaId: Number(areaId), nombre, carpetaPadreId: carpetaActualId });
      enqueueSnackbar('Carpeta creada exitosamente', { variant: 'success' });
      reset();
      setCrearModalAbierto(false);
      await cargarCarpetas(areaId);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear la carpeta', { variant: 'error' });
    }
  }

  function cerrarModalCrear() {
    setCrearModalAbierto(false);
    reset();
  }

  function irADocumentos() {
    navigate(`/documentos?areaId=${carpetaDetalle.areaId}&carpetaId=${carpetaDetalle.id}`);
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
        <>
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <nav aria-label="Ruta de carpetas" className="flex items-center flex-wrap gap-1 text-sm">
              <button
                type="button"
                onClick={() => setCarpetaActualId(null)}
                className={`px-2 py-1 rounded-lg transition-colors ${
                  carpetaActualId === null
                    ? 'font-semibold text-slate-800 dark:text-slate-100'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {areaSeleccionada?.nombre || 'Área'}
              </button>
              {ancestros.map((carpeta) => (
                <span key={carpeta.id} className="flex items-center gap-1">
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                  <button
                    type="button"
                    onClick={() => setCarpetaActualId(carpeta.id)}
                    className={`px-2 py-1 rounded-lg transition-colors ${
                      carpeta.id === carpetaActualId
                        ? 'font-semibold text-slate-800 dark:text-slate-100'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                    }`}
                  >
                    {carpeta.nombre}
                  </button>
                </span>
              ))}
            </nav>

            <Button icon={Plus} onClick={() => setCrearModalAbierto(true)}>
              Nueva carpeta
            </Button>
          </div>

          {nivelActual.length === 0 ? (
            <EmptyState icon={Folder} title="Sin subcarpetas aquí" description='Usa "Nueva carpeta" arriba para crear la primera.' />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {nivelActual.map((carpeta) => (
                <CarpetaCard
                  key={carpeta.id}
                  carpeta={carpeta}
                  onAbrir={() => setCarpetaActualId(carpeta.id)}
                  onVerDetalle={() => setDetalleId(carpeta.id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={crearModalAbierto}
        onClose={cerrarModalCrear}
        title="Nueva carpeta"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={cerrarModalCrear}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit(onCrearCarpeta)}>Crear carpeta</Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input label="Nombre de la nueva carpeta" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />
        </form>
      </Modal>

      <Modal isOpen={detalleId != null} onClose={() => setDetalleId(null)} title={carpetaDetalle?.nombre || ''} size="sm">
        {carpetaDetalle && (
          <div className="space-y-4">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Ruta</dt>
                <dd className="text-slate-800 dark:text-slate-100 font-medium">{carpetaDetalle.ruta}</dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Creada el</dt>
                <dd className="text-slate-800 dark:text-slate-100 font-medium">
                  {new Date(carpetaDetalle.createdAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500 dark:text-slate-400">Subcarpetas</dt>
                <dd className="text-slate-800 dark:text-slate-100 font-medium">{carpetaDetalle.subcarpetasCount}</dd>
              </div>
            </dl>
            <Button icon={FileText} onClick={irADocumentos} fullWidth>
              Ver documentos de esta carpeta
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
