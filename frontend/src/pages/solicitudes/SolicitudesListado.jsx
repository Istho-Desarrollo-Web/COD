import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { Plus, ClipboardList, AlertCircle } from 'lucide-react';
import solicitudService from '../../api/solicitud.service';
import areaService from '../../api/area.service';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../hooks/useViewMode';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import DataTable from '../../components/common/Table/DataTable';
import ViewToggle from '../../components/common/ViewToggle';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';

const OPCIONES_ESTADO = [
  { value: 'cotizando', label: 'Cotizando' },
  { value: 'en_aprobacion', label: 'En aprobación' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
  { value: 'confirmada', label: 'Confirmada' },
  { value: 'cancelada', label: 'Cancelada' },
];

function SolicitudCard({ solicitud, onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">{solicitud.codigo}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{solicitud.descripcion}</p>
        </div>
        <ClipboardList className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <StatusChip status={solicitud.estado} />
    </div>
  );
}

export default function SolicitudesListado() {
  const { tienePermiso } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { modo, setModo, esVistaMovil } = useViewMode('cod_view_solicitudes');
  const [solicitudes, setSolicitudes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [areas, setAreas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  async function cargarSolicitudes() {
    setCargando(true);
    try {
      const filtros = {};
      if (filtroEstado) filtros.estado = filtroEstado;
      if (filtroTipo) filtros.tipoSolicitudId = filtroTipo;
      const data = await solicitudService.listar(filtros);
      setSolicitudes(data);
    } catch (error) {
      setSolicitudes([]);
      enqueueSnackbar(error?.message || 'No se pudieron cargar las solicitudes', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarSolicitudes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroTipo]);

  useEffect(() => {
    async function cargarCatalogos() {
      try {
        const [datosAreas, datosTipos] = await Promise.all([areaService.listar(), solicitudService.listarTipos()]);
        setAreas(datosAreas);
        setTipos(datosTipos);
      } catch {
        setAreas([]);
        setTipos([]);
      }
    }
    cargarCatalogos();
  }, []);

  function cerrarModal() {
    setModalAbierto(false);
    reset();
  }

  async function onCrear(valores) {
    try {
      await solicitudService.crear({
        tipoSolicitudId: Number(valores.tipoSolicitudId),
        areaSolicitanteId: Number(valores.areaSolicitanteId),
        descripcion: valores.descripcion,
        montoEstimado: valores.montoEstimado ? Number(valores.montoEstimado) : null,
      });
      enqueueSnackbar('Solicitud creada exitosamente', { variant: 'success' });
      cerrarModal();
      await cargarSolicitudes();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear la solicitud', { variant: 'error' });
    }
  }

  const opcionesTipo = tipos.map((tipo) => ({ value: tipo.id, label: tipo.nombre }));

  const columnas = [
    { key: 'codigo', label: 'Código' },
    { key: 'descripcion', label: 'Descripción' },
    { key: 'montoEstimado', label: 'Monto estimado' },
    { key: 'estado', label: 'Estado', render: (valor) => <StatusChip status={valor} /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Solicitudes de compra</h2>
        <div className="flex items-center gap-3">
          {!esVistaMovil && <ViewToggle modo={modo} onChange={setModo} />}
          {tienePermiso('solicitudes', 'crear') && (
            <Button icon={Plus} onClick={() => setModalAbierto(true)}>
              Crear solicitud
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <FilterDropdown label="Estado" options={OPCIONES_ESTADO} value={filtroEstado} onChange={setFiltroEstado} placeholder="Todos los estados" />
        <FilterDropdown label="Tipo" options={opcionesTipo} value={filtroTipo} onChange={setFiltroTipo} placeholder="Todos los tipos" />
      </div>

      {!cargando && solicitudes.length === 0 && (
        <EmptyState icon={ClipboardList} title="Sin solicitudes todavía" description="Crea la primera solicitud de compra para empezar su seguimiento." />
      )}

      {solicitudes.length > 0 && modo === 'lista' && (
        <DataTable columns={columnas} data={solicitudes} loading={cargando} emptyMessage="Sin solicitudes todavía" onRowClick={(solicitud) => navigate(`/solicitudes/${solicitud.id}`)} />
      )}

      {solicitudes.length > 0 && modo === 'tarjetas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {solicitudes.map((solicitud) => (
            <SolicitudCard key={solicitud.id} solicitud={solicitud} onClick={() => navigate(`/solicitudes/${solicitud.id}`)} />
          ))}
        </div>
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={cerrarModal}
        title="Crear solicitud"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={cerrarModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit(onCrear)}>Crear</Button>
          </>
        }
      >
        <form className="space-y-4">
          <div>
            <label htmlFor="crear-tipo-solicitud" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Tipo de solicitud
            </label>
            <select
              id="crear-tipo-solicitud"
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
              {...register('tipoSolicitudId', { required: 'El tipo de solicitud es obligatorio' })}
            >
              <option value="">Selecciona un tipo</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
            {errors.tipoSolicitudId?.message && (
              <p role="alert" className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                {errors.tipoSolicitudId.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="crear-area-solicitante-sol" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Área solicitante
            </label>
            <select
              id="crear-area-solicitante-sol"
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
              {...register('areaSolicitanteId', { required: 'El área solicitante es obligatoria' })}
            >
              <option value="">Selecciona un área</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.nombre}
                </option>
              ))}
            </select>
            {errors.areaSolicitanteId?.message && (
              <p role="alert" className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                {errors.areaSolicitanteId.message}
              </p>
            )}
          </div>

          <Input label="Descripción" error={errors.descripcion?.message} {...register('descripcion', { required: 'La descripción es obligatoria' })} />
          <Input label="Monto estimado" type="number" {...register('montoEstimado')} />
        </form>
      </Modal>
    </div>
  );
}
