import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import { useForm } from 'react-hook-form';
import { FileText } from 'lucide-react';
import documentoService from '../../api/documento.service';
import carpetaService from '../../api/carpeta.service';
import tipoDocumentoService from '../../api/tipoDocumento.service';
import areaService from '../../api/area.service';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../hooks/useViewMode';
import Button from '../../components/common/Button/Button';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import DataTable from '../../components/common/Table/DataTable';
import ViewToggle from '../../components/common/ViewToggle';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import Pagination from '../../components/common/Pagination/Pagination';
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import CarpetasModal from './CarpetasModal';
import { validarArchivo, TIPOS_PERMITIDOS } from '../../utils/validarArchivo';

const ESTADOS = ['vigente', 'por_vencer', 'vencido', 'sin_vigencia'];
const TIPOS_PERMITIDOS_ACCEPT = Array.from(TIPOS_PERMITIDOS).join(',');

export function aplanarCarpetas(arbol, prefijo = '') {
  return arbol.flatMap((carpeta) => {
    const ruta = prefijo ? `${prefijo} / ${carpeta.nombre}` : carpeta.nombre;
    return [{ id: carpeta.id, nombre: carpeta.nombre, ruta, areaId: carpeta.areaId }, ...aplanarCarpetas(carpeta.subcarpetas || [], ruta)];
  });
}

function DocumentoCard({ documento, nombresPorId, onClick }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onClick()}
      className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">{documento.nombre}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{documento.codigo}</p>
        </div>
        <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">
        {nombresPorId.areas[documento.areaId] || documento.areaId} / {nombresPorId.carpetas[documento.carpetaId] || documento.carpetaId} ·{' '}
        {nombresPorId.tipos[documento.tipoDocumentoId] || documento.tipoDocumentoId}
      </p>
      <StatusChip status={documento.estado} />
    </div>
  );
}

export default function DocumentosListado() {
  const navigate = useNavigate();
  const { tienePermiso } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { modo, setModo, esVistaMovil } = useViewMode('cod_view_documentos');

  const [areas, setAreas] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [carpetas, setCarpetas] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [paginacion, setPaginacion] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [cargando, setCargando] = useState(true);
  const [carpetasModalAbierto, setCarpetasModalAbierto] = useState(false);
  const [crearModalAbierto, setCrearModalAbierto] = useState(false);
  const [filtros, setFiltros] = useState({ areaId: '', carpetaId: '', tipoDocumentoId: '', estado: '', page: 1 });

  const [archivoError, setArchivoError] = useState(null);
  const {
    register: registerCrear,
    handleSubmit: handleSubmitCrear,
    reset: resetCrear,
    watch: watchCrear,
    formState: { errors: erroresCrear },
  } = useForm();

  const areaSeleccionadaCrear = watchCrear('areaId');
  const [carpetasCrear, setCarpetasCrear] = useState([]);

  async function cargarCarpetasCrear(area) {
    if (!area) {
      setCarpetasCrear([]);
      return;
    }
    try {
      const arbol = await carpetaService.listar(Number(area));
      setCarpetasCrear(aplanarCarpetas(arbol));
    } catch {
      setCarpetasCrear([]);
    }
  }

  useEffect(() => {
    cargarCarpetasCrear(areaSeleccionadaCrear);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaSeleccionadaCrear]);

  async function onCrearDocumento(valores) {
    const archivo = valores.archivo?.[0];
    const errorArchivo = validarArchivo(archivo);
    if (errorArchivo) {
      setArchivoError(errorArchivo);
      return;
    }
    setArchivoError(null);

    const formData = new FormData();
    formData.append('nombre', valores.nombre);
    formData.append('areaId', valores.areaId);
    formData.append('carpetaId', valores.carpetaId);
    formData.append('tipoDocumentoId', valores.tipoDocumentoId);
    if (valores.codigo) formData.append('codigo', valores.codigo);
    if (valores.vigenciaDesde) formData.append('vigenciaDesde', valores.vigenciaDesde);
    if (valores.vigenciaHasta) formData.append('vigenciaHasta', valores.vigenciaHasta);
    if (valores.diasAlertaVencimiento) formData.append('diasAlertaVencimiento', valores.diasAlertaVencimiento);
    formData.append('archivo', archivo);

    try {
      await documentoService.crear(formData);
      enqueueSnackbar('Documento creado exitosamente', { variant: 'success' });
      resetCrear();
      setArchivoError(null);
      setCrearModalAbierto(false);
      await cargarDocumentos();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear el documento', { variant: 'error' });
    }
  }

  useEffect(() => {
    async function cargarCatalogos() {
      try {
        const [areasData, tiposData] = await Promise.all([areaService.listar(), tipoDocumentoService.listar()]);
        setAreas(areasData);
        setTipos(tiposData);
      } catch {
        setAreas([]);
        setTipos([]);
      }
    }
    cargarCatalogos();
  }, []);

  async function cargarCarpetasFiltro(area) {
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
    cargarCarpetasFiltro(filtros.areaId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros.areaId]);

  function onCarpetaCreada(areaIdAfectada) {
    if (filtros.areaId && Number(filtros.areaId) === areaIdAfectada) cargarCarpetasFiltro(filtros.areaId);
    if (areaSeleccionadaCrear && Number(areaSeleccionadaCrear) === areaIdAfectada) cargarCarpetasCrear(areaSeleccionadaCrear);
  }

  async function cargarDocumentos() {
    setCargando(true);
    try {
      const { data, pagination } = await documentoService.listar({
        areaId: filtros.areaId || undefined,
        carpetaId: filtros.carpetaId || undefined,
        tipoDocumentoId: filtros.tipoDocumentoId || undefined,
        estado: filtros.estado || undefined,
        page: filtros.page,
      });
      setDocumentos(data);
      setPaginacion(pagination);
    } catch (error) {
      setDocumentos([]);
      setPaginacion({ page: 1, limit: 20, total: 0, totalPages: 0 });
      enqueueSnackbar(error?.message || 'No se pudieron cargar los documentos', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDocumentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros]);

  function cerrarModalCrear() {
    setCrearModalAbierto(false);
    resetCrear();
    setArchivoError(null);
  }

  function actualizarFiltro(campo, valor) {
    setFiltros((prev) => ({
      ...prev,
      [campo]: valor,
      ...(campo === 'areaId' ? { carpetaId: '' } : {}),
      page: 1,
    }));
  }

  const nombresPorId = {
    areas: Object.fromEntries(areas.map((a) => [a.id, a.nombre])),
    carpetas: Object.fromEntries(carpetas.map((c) => [c.id, c.ruta])),
    tipos: Object.fromEntries(tipos.map((t) => [t.id, t.nombre])),
  };

  const columnas = [
    { key: 'nombre', label: 'Nombre' },
    { key: 'codigo', label: 'Código' },
    { key: 'areaId', label: 'Área', render: (valor) => nombresPorId.areas[valor] || valor },
    { key: 'carpetaId', label: 'Carpeta', render: (valor) => nombresPorId.carpetas[valor] || valor },
    { key: 'tipoDocumentoId', label: 'Tipo', render: (valor) => nombresPorId.tipos[valor] || valor },
    { key: 'estado', label: 'Estado', render: (valor) => <StatusChip status={valor} /> },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Documentos</h2>
        <div className="flex items-center gap-3">
          {!esVistaMovil && <ViewToggle modo={modo} onChange={setModo} />}
          {tienePermiso('documentos', 'crear') && (
            <>
              <Button variant="outline" onClick={() => setCarpetasModalAbierto(true)}>
                Gestionar carpetas
              </Button>
              <Button onClick={() => setCrearModalAbierto(true)}>Crear documento</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div>
          <label htmlFor="filtro-area" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Área
          </label>
          <select
            id="filtro-area"
            value={filtros.areaId}
            onChange={(e) => actualizarFiltro('areaId', e.target.value)}
            className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
          >
            <option value="">Todas</option>
            {areas.map((area) => (
              <option key={area.id} value={area.id}>
                {area.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filtro-carpeta" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Carpeta
          </label>
          <select
            id="filtro-carpeta"
            value={filtros.carpetaId}
            disabled={!filtros.areaId}
            onChange={(e) => actualizarFiltro('carpetaId', e.target.value)}
            className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-centhrix-card"
          >
            <option value="">Todas</option>
            {carpetas.map((carpeta) => (
              <option key={carpeta.id} value={carpeta.id}>
                {carpeta.ruta}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filtro-tipo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Tipo
          </label>
          <select
            id="filtro-tipo"
            value={filtros.tipoDocumentoId}
            onChange={(e) => actualizarFiltro('tipoDocumentoId', e.target.value)}
            className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
          >
            <option value="">Todos</option>
            {tipos.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="filtro-estado" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
            Estado
          </label>
          <select
            id="filtro-estado"
            value={filtros.estado}
            onChange={(e) => actualizarFiltro('estado', e.target.value)}
            className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
          >
            <option value="">Todos</option>
            {ESTADOS.map((estado) => (
              <option key={estado} value={estado}>
                {estado}
              </option>
            ))}
          </select>
        </div>
      </div>

      {!cargando && documentos.length === 0 && (
        <EmptyState icon={FileText} title="Sin documentos todavía" description="Crea el primer documento para empezar a organizar el centro documental." />
      )}

      {documentos.length > 0 && modo === 'lista' && (
        <DataTable columns={columnas} data={documentos} loading={cargando} emptyMessage="Sin documentos todavía" onRowClick={(row) => navigate(`/documentos/${row.id}`)} />
      )}

      {documentos.length > 0 && modo === 'tarjetas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {documentos.map((documento) => (
            <DocumentoCard key={documento.id} documento={documento} nombresPorId={nombresPorId} onClick={() => navigate(`/documentos/${documento.id}`)} />
          ))}
        </div>
      )}

      <Pagination pagination={paginacion} onPageChange={(page) => setFiltros((prev) => ({ ...prev, page }))} />

      <Modal
        isOpen={crearModalAbierto}
        onClose={cerrarModalCrear}
        title="Crear documento"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={cerrarModalCrear}>
              Cancelar
            </Button>
            <Button onClick={handleSubmitCrear(onCrearDocumento)}>Crear</Button>
          </>
        }
      >
        <form className="space-y-4">
          <div>
            <label htmlFor="crear-areaId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Área *
            </label>
            <select id="crear-areaId" className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100" {...registerCrear('areaId', { required: true })}>
              <option value="">Selecciona un área</option>
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.nombre}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="crear-carpetaId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Carpeta *
            </label>
            <select
              id="crear-carpetaId"
              disabled={!areaSeleccionadaCrear}
              className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-centhrix-card"
              {...registerCrear('carpetaId', { required: true })}
            >
              <option value="">Selecciona una carpeta</option>
              {carpetasCrear.map((carpeta) => (
                <option key={carpeta.id} value={carpeta.id}>
                  {carpeta.ruta}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="crear-tipoDocumentoId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Tipo de documento *
            </label>
            <select id="crear-tipoDocumentoId" className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100" {...registerCrear('tipoDocumentoId', { required: true })}>
              <option value="">Selecciona un tipo</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </div>

          <Input label="Nombre *" error={erroresCrear.nombre?.message} {...registerCrear('nombre', { required: 'El nombre es obligatorio' })} />
          <Input label="Código" {...registerCrear('codigo')} />

          <div className="grid grid-cols-2 gap-4">
            <Input label="Vigencia desde" type="date" {...registerCrear('vigenciaDesde')} />
            <Input label="Vigencia hasta" type="date" {...registerCrear('vigenciaHasta')} />
          </div>

          <Input label="Días de alerta de vencimiento" type="number" {...registerCrear('diasAlertaVencimiento')} />

          <div>
            <label htmlFor="crear-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
              Archivo *
            </label>
            <input
              id="crear-archivo"
              type="file"
              accept={TIPOS_PERMITIDOS_ACCEPT}
              className="w-full text-sm"
              {...registerCrear('archivo', { required: true })}
            />
            {archivoError && (
              <p role="alert" className="text-xs text-red-500 mt-1">
                {archivoError}
              </p>
            )}
          </div>
        </form>
      </Modal>

      <CarpetasModal
        isOpen={carpetasModalAbierto}
        onClose={() => setCarpetasModalAbierto(false)}
        areas={areas}
        onCarpetaCreada={onCarpetaCreada}
      />
    </div>
  );
}
