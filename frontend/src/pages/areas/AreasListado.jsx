import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { Plus, Building2 } from 'lucide-react';
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

function nivelSalud(pct) {
  const valor = Number(pct);
  if (valor >= 80) return 'saludable';
  if (valor >= 50) return 'atencion';
  return 'critico';
}

function AreaCard({ area }) {
  return (
    <div className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">{area.nombre}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{area.codigo}</p>
        </div>
        <Building2 className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <StatusChip status={nivelSalud(area.saludDocumentalPct)} customLabel={`${area.saludDocumentalPct}% al día`} />
    </div>
  );
}

export default function AreasListado() {
  const { isAdmin } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { modo, setModo, esVistaMovil } = useViewMode('cod_view_areas');
  const [areas, setAreas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  async function cargarAreas() {
    setCargando(true);
    const data = await areaService.listar();
    setAreas(data);
    setCargando(false);
  }

  useEffect(() => {
    cargarAreas();
  }, []);

  async function onCrear({ nombre, codigo }) {
    await areaService.crear({ nombre, codigo });
    enqueueSnackbar('Área creada exitosamente', { variant: 'success' });
    reset();
    setModalAbierto(false);
    await cargarAreas();
  }

  const columnas = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'codigo', label: 'Código' },
    {
      key: 'saludDocumentalPct',
      label: 'Salud documental',
      render: (valor) => <StatusChip status={nivelSalud(valor)} customLabel={`${valor}%`} />,
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Áreas</h2>
        <div className="flex items-center gap-3">
          {!esVistaMovil && <ViewToggle modo={modo} onChange={setModo} />}
          {isAdmin && (
            <Button icon={Plus} onClick={() => setModalAbierto(true)}>
              Crear área
            </Button>
          )}
        </div>
      </div>

      {!cargando && areas.length === 0 && (
        <EmptyState icon={Building2} title="Sin áreas todavía" description="Crea la primera área para empezar a organizar documentos y solicitudes." />
      )}

      {areas.length > 0 && modo === 'lista' && <DataTable columns={columnas} data={areas} loading={cargando} emptyMessage="Sin áreas todavía" />}

      {areas.length > 0 && modo === 'tarjetas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {areas.map((area) => (
            <AreaCard key={area.id} area={area} />
          ))}
        </div>
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title="Crear área"
        footer={
          <>
            <Button variant="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit(onCrear)}>Crear</Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input label="Nombre" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />
          <Input label="Código" error={errors.codigo?.message} {...register('codigo', { required: 'El código es obligatorio' })} />
        </form>
      </Modal>
    </div>
  );
}
