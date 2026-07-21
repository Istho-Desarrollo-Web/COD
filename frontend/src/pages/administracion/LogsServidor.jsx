import { useEffect, useState } from 'react';
import { useSnackbar } from 'notistack';
import { RefreshCw, ScrollText } from 'lucide-react';
import logServidorService from '../../api/logServidor.service';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import DataTable from '../../components/common/Table/DataTable';
import Pagination from '../../components/common/Pagination/Pagination';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import FilterDropdown from '../../components/common/FilterDropdown/FilterDropdown';
import DatePicker from '../../components/common/DatePicker/DatePicker';

const OPCIONES_NIVEL = [
  { value: '', label: 'Todos' },
  { value: 'info', label: 'info' },
  { value: 'warn', label: 'warn' },
  { value: 'error', label: 'error' },
];

export default function LogsServidor() {
  const { enqueueSnackbar } = useSnackbar();
  const [logs, setLogs] = useState([]);
  const [paginacion, setPaginacion] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ nivel: '', metodo: '', desde: '', hasta: '', q: '', page: 1 });

  async function cargarLogs() {
    setCargando(true);
    try {
      const { data, pagination } = await logServidorService.listar({
        nivel: filtros.nivel || undefined,
        metodo: filtros.metodo || undefined,
        desde: filtros.desde || undefined,
        hasta: filtros.hasta || undefined,
        q: filtros.q || undefined,
        page: filtros.page,
      });
      setLogs(data);
      setPaginacion(pagination);
    } catch (error) {
      setLogs([]);
      setPaginacion({ page: 1, limit: 20, total: 0, totalPages: 0 });
      enqueueSnackbar(error?.message || 'No se pudieron cargar los logs', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({ ...prev, [campo]: valor, page: 1 }));
  }

  const columnas = [
    { key: 'createdAt', label: 'Fecha', render: (valor) => new Date(valor).toLocaleString('es-CO') },
    { key: 'nivel', label: 'Nivel', render: (valor) => <StatusChip status={valor} /> },
    { key: 'metodo', label: 'Método' },
    { key: 'ruta', label: 'Ruta' },
    { key: 'statusCode', label: 'Status' },
    { key: 'duracionMs', label: 'Duración', render: (valor) => (valor != null ? `${valor} ms` : '—') },
    { key: 'usuarioNombre', label: 'Usuario', render: (valor) => valor || '—' },
    { key: 'mensaje', label: 'Mensaje' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Logs del servidor</h2>
        <Button variant="outline" icon={RefreshCw} onClick={cargarLogs}>
          Actualizar
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <FilterDropdown label="Nivel" options={OPCIONES_NIVEL} value={filtros.nivel} onChange={(valor) => actualizarFiltro('nivel', valor)} placeholder="Todos" />
        <Input label="Método" value={filtros.metodo} onChange={(e) => actualizarFiltro('metodo', e.target.value)} />
        <DatePicker label="Desde" value={filtros.desde} onChange={(valor) => actualizarFiltro('desde', valor)} />
        <DatePicker label="Hasta" value={filtros.hasta} onChange={(valor) => actualizarFiltro('hasta', valor)} />
        <Input label="Buscar" value={filtros.q} onChange={(e) => actualizarFiltro('q', e.target.value)} />
      </div>

      {!cargando && logs.length === 0 && (
        <EmptyState icon={ScrollText} title="Sin logs para mostrar" description="No hay logs que coincidan con los filtros actuales." />
      )}

      {logs.length > 0 && <DataTable columns={columnas} data={logs} loading={cargando} emptyMessage="Sin logs para mostrar" />}

      <Pagination pagination={paginacion} onPageChange={(page) => setFiltros((prev) => ({ ...prev, page }))} />
    </div>
  );
}
