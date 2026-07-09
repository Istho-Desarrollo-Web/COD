import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { Plus, Truck, AlertCircle } from 'lucide-react';
import proveedorService from '../../api/proveedor.service';
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
  { value: 'activo', label: 'Activo' },
  { value: 'inactivo', label: 'Inactivo' },
  { value: 'en_evaluacion', label: 'En evaluación' },
  { value: 'suspendido', label: 'Suspendido' },
];
const OPCIONES_TIPO = [
  { value: 'proveedor', label: 'Proveedor' },
  { value: 'contratista', label: 'Contratista' },
];
const OPCIONES_CRITICIDAD = [
  { value: 'alta', label: 'Alta' },
  { value: 'media', label: 'Media' },
  { value: 'baja', label: 'Baja' },
];

function ProveedorCard({ proveedor, onClick }) {
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
          <p className="font-semibold text-slate-800 dark:text-slate-100">{proveedor.razonSocial}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{proveedor.documentoIdentificacion}</p>
        </div>
        <Truck className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <StatusChip status={proveedor.estado} />
    </div>
  );
}

export default function ProveedoresListado() {
  const { tienePermiso } = useAuth();
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const { modo, setModo, esVistaMovil } = useViewMode('cod_view_proveedores');
  const [proveedores, setProveedores] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCriticidad, setFiltroCriticidad] = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);
  const [areas, setAreas] = useState([]);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  async function cargarProveedores() {
    setCargando(true);
    try {
      const filtros = {};
      if (filtroEstado) filtros.estado = filtroEstado;
      if (filtroTipo) filtros.tipo = filtroTipo;
      if (filtroCriticidad) filtros.criticidad = filtroCriticidad;
      const data = await proveedorService.listar(filtros);
      setProveedores(data);
    } catch (error) {
      setProveedores([]);
      enqueueSnackbar(error?.message || 'No se pudieron cargar los proveedores', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarProveedores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado, filtroTipo, filtroCriticidad]);

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

  function cerrarModal() {
    setModalAbierto(false);
    reset();
  }

  async function onCrear(valores) {
    try {
      await proveedorService.crear({
        tipo: valores.tipo,
        documentoIdentificacion: valores.documentoIdentificacion,
        razonSocial: valores.razonSocial,
        criticidad: valores.criticidad,
        categoria: valores.categoria || null,
        areaSolicitanteId: Number(valores.areaSolicitanteId),
      });
      enqueueSnackbar('Proveedor creado exitosamente', { variant: 'success' });
      cerrarModal();
      await cargarProveedores();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear el proveedor', { variant: 'error' });
    }
  }

  const columnas = [
    { key: 'razonSocial', label: 'Razón social' },
    { key: 'documentoIdentificacion', label: 'Documento' },
    { key: 'tipo', label: 'Tipo' },
    { key: 'criticidad', label: 'Criticidad' },
    { key: 'estado', label: 'Estado', render: (valor) => <StatusChip status={valor} /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Proveedores y contratistas</h2>
        <div className="flex items-center gap-3">
          {!esVistaMovil && <ViewToggle modo={modo} onChange={setModo} />}
          {tienePermiso('proveedores', 'crear') && (
            <Button icon={Plus} onClick={() => setModalAbierto(true)}>
              Crear proveedor
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <FilterDropdown label="Estado" options={OPCIONES_ESTADO} value={filtroEstado} onChange={setFiltroEstado} placeholder="Todos los estados" />
        <FilterDropdown label="Tipo" options={OPCIONES_TIPO} value={filtroTipo} onChange={setFiltroTipo} placeholder="Todos los tipos" />
        <FilterDropdown label="Criticidad" options={OPCIONES_CRITICIDAD} value={filtroCriticidad} onChange={setFiltroCriticidad} placeholder="Toda criticidad" />
      </div>

      {!cargando && proveedores.length === 0 && (
        <EmptyState icon={Truck} title="Sin proveedores todavía" description="Crea el primer proveedor o contratista para empezar su expediente." />
      )}

      {proveedores.length > 0 && modo === 'lista' && (
        <DataTable columns={columnas} data={proveedores} loading={cargando} emptyMessage="Sin proveedores todavía" onRowClick={(proveedor) => navigate(`/proveedores/${proveedor.id}`)} />
      )}

      {proveedores.length > 0 && modo === 'tarjetas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {proveedores.map((proveedor) => (
            <ProveedorCard key={proveedor.id} proveedor={proveedor} onClick={() => navigate(`/proveedores/${proveedor.id}`)} />
          ))}
        </div>
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={cerrarModal}
        title="Crear proveedor"
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
            <label htmlFor="crear-tipo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Tipo
            </label>
            <select
              id="crear-tipo"
              defaultValue="proveedor"
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
              {...register('tipo', { required: 'El tipo es obligatorio' })}
            >
              <option value="proveedor">Proveedor</option>
              <option value="contratista">Contratista</option>
            </select>
            {errors.tipo?.message && (
              <p role="alert" className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                {errors.tipo.message}
              </p>
            )}
          </div>

          <Input label="Documento de identificación" error={errors.documentoIdentificacion?.message} {...register('documentoIdentificacion', { required: 'El documento de identificación es obligatorio' })} />
          <Input label="Razón social" error={errors.razonSocial?.message} {...register('razonSocial', { required: 'La razón social es obligatoria' })} />

          <div>
            <label htmlFor="crear-criticidad" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Criticidad
            </label>
            <select
              id="crear-criticidad"
              defaultValue="media"
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
              {...register('criticidad')}
            >
              <option value="alta">Alta</option>
              <option value="media">Media</option>
              <option value="baja">Baja</option>
            </select>
          </div>

          <div>
            <label htmlFor="crear-area-solicitante" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Área solicitante
            </label>
            <select
              id="crear-area-solicitante"
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

          <Input label="Categoría" {...register('categoria')} />
        </form>
      </Modal>
    </div>
  );
}
