import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { ClipboardCheck } from 'lucide-react';
import evaluacionProveedorService from '../../api/evaluacionProveedor.service';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import DataTable from '../../components/common/Table/DataTable';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';

const OPCIONES_ESTADO = [
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'en_proceso', label: 'En proceso' },
  { value: 'completada', label: 'Completada' },
  { value: 'vencida', label: 'Vencida' },
];

export default function EvaluacionesListado() {
  const navigate = useNavigate();
  const { enqueueSnackbar } = useSnackbar();
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');

  async function cargarEvaluaciones() {
    setCargando(true);
    try {
      const filtros = {};
      if (filtroEstado) filtros.estado = filtroEstado;
      const data = await evaluacionProveedorService.listarTodas(filtros);
      setEvaluaciones(data);
    } catch (error) {
      setEvaluaciones([]);
      enqueueSnackbar(error?.message || 'No se pudieron cargar las evaluaciones', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarEvaluaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtroEstado]);

  const columnas = [
    { key: 'proveedor', label: 'Proveedor', render: (_, fila) => fila.Proveedor?.razonSocial || '—' },
    { key: 'periodo', label: 'Periodo' },
    { key: 'fechaProgramada', label: 'Fecha programada' },
    { key: 'fechaRealizada', label: 'Fecha realizada', render: (valor) => valor || '—' },
    { key: 'puntaje', label: 'Puntaje', render: (valor) => (valor != null ? valor : '—') },
    { key: 'estado', label: 'Estado', render: (valor) => <StatusChip status={valor} /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Evaluaciones de proveedores</h2>
      </div>

      <div className="flex flex-wrap gap-3 mb-6">
        <FilterDropdown label="Estado" options={OPCIONES_ESTADO} value={filtroEstado} onChange={setFiltroEstado} placeholder="Todos los estados" />
      </div>

      {!cargando && evaluaciones.length === 0 && (
        <EmptyState icon={ClipboardCheck} title="Sin evaluaciones todavía" description="Las evaluaciones aparecerán aquí a medida que se programen o se generen automáticamente." />
      )}

      {evaluaciones.length > 0 && (
        <DataTable
          columns={columnas}
          data={evaluaciones}
          loading={cargando}
          emptyMessage="Sin evaluaciones todavía"
          onRowClick={(evaluacion) => navigate(`/proveedores/${evaluacion.proveedorId}`)}
        />
      )}
    </div>
  );
}
