import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { ArrowLeft, Download } from 'lucide-react';
import documentoService from '../../api/documento.service';
import carpetaService from '../../api/carpeta.service';
import tipoDocumentoService from '../../api/tipoDocumento.service';
import { aplanarCarpetas } from './DocumentosListado';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import { validarArchivo, TIPOS_PERMITIDOS } from '../../utils/validarArchivo';

const TIPOS_PERMITIDOS_ACCEPT = [...TIPOS_PERMITIDOS].join(',');

export default function DocumentoDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tienePermiso } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [documento, setDocumento] = useState(null);
  const [tipos, setTipos] = useState([]);
  const [carpetas, setCarpetas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm();

  const [tabActiva, setTabActiva] = useState('detalle');
  const [versiones, setVersiones] = useState([]);
  const [archivoVersionError, setArchivoVersionError] = useState(null);
  const {
    register: registerVersion,
    handleSubmit: handleSubmitVersion,
    reset: resetVersion,
  } = useForm();

  async function cargarVersiones() {
    try {
      const data = await documentoService.listarVersiones(id);
      setVersiones(data);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo cargar el historial de versiones', { variant: 'error' });
    }
  }

  useEffect(() => {
    cargarVersiones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onSubirVersion(valores) {
    const archivo = valores.archivo?.[0];
    const errorArchivo = validarArchivo(archivo);
    if (errorArchivo) {
      setArchivoVersionError(errorArchivo);
      return;
    }
    setArchivoVersionError(null);

    const formData = new FormData();
    formData.append('version', valores.version);
    if (valores.vigenciaDesde) formData.append('vigenciaDesde', valores.vigenciaDesde);
    if (valores.vigenciaHasta) formData.append('vigenciaHasta', valores.vigenciaHasta);
    formData.append('archivo', archivo);

    try {
      await documentoService.subirVersion(id, formData);
      enqueueSnackbar('Nueva versión subida', { variant: 'success' });
      resetVersion();
      setArchivoVersionError(null);
      await Promise.all([cargarDocumento(), cargarVersiones()]);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo subir la nueva versión', { variant: 'error' });
    }
  }

  async function onDescargarVersion(versionId) {
    try {
      await documentoService.descargarVersion(id, versionId);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo descargar la versión', { variant: 'error' });
    }
  }

  async function cargarDocumento() {
    setCargando(true);
    try {
      const data = await documentoService.obtener(id);
      setDocumento(data);
      reset({
        nombre: data.nombre,
        codigo: data.codigo || '',
        tipoDocumentoId: String(data.tipoDocumentoId),
        carpetaId: String(data.carpetaId),
        vigenciaDesde: data.vigenciaDesde || '',
        vigenciaHasta: data.vigenciaHasta || '',
        diasAlertaVencimiento: data.diasAlertaVencimiento || '',
      });
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo cargar el documento', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarDocumento();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    async function cargarCatalogos() {
      try {
        const tiposData = await tipoDocumentoService.listar();
        setTipos(tiposData);
      } catch {
        setTipos([]);
      }
    }
    cargarCatalogos();
  }, []);

  useEffect(() => {
    async function cargarCarpetasDelArea() {
      if (!documento?.areaId) return;
      try {
        const arbol = await carpetaService.listar(documento.areaId);
        setCarpetas(aplanarCarpetas(arbol));
      } catch {
        setCarpetas([]);
      }
    }
    cargarCarpetasDelArea();
  }, [documento?.areaId]);

  // Los catálogos de tipos y carpetas se cargan de forma asíncrona e independiente
  // del documento. Si `reset()` (en cargarDocumento) se ejecuta antes de que el
  // <select> correspondiente tenga sus <option>s, el navegador auto-selecciona la
  // primera opción disponible al llegar el catálogo, ignorando el valor real del
  // documento. Estos efectos vuelven a fijar explícitamente el valor real cada vez
  // que el catálogo cambia, sin importar el orden en que resuelvan los fetches.
  useEffect(() => {
    if (documento && tipos.length > 0) {
      setValue('tipoDocumentoId', String(documento.tipoDocumentoId));
    }
  }, [tipos, documento, setValue]);

  useEffect(() => {
    if (documento && carpetas.length > 0) {
      setValue('carpetaId', String(documento.carpetaId));
    }
  }, [carpetas, documento, setValue]);

  async function onGuardar(valores) {
    try {
      await documentoService.editar(id, {
        nombre: valores.nombre,
        codigo: valores.codigo || null,
        tipoDocumentoId: Number(valores.tipoDocumentoId),
        carpetaId: Number(valores.carpetaId),
        vigenciaDesde: valores.vigenciaDesde || null,
        vigenciaHasta: valores.vigenciaHasta || null,
        diasAlertaVencimiento: valores.diasAlertaVencimiento ? Number(valores.diasAlertaVencimiento) : null,
      });
      enqueueSnackbar('Documento actualizado', { variant: 'success' });
      await cargarDocumento();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo actualizar el documento', { variant: 'error' });
    }
  }

  async function onEliminar() {
    if (!window.confirm('¿Eliminar este documento? Esta acción no se puede deshacer.')) return;
    try {
      await documentoService.eliminar(id);
      enqueueSnackbar('Documento eliminado', { variant: 'success' });
      navigate('/documentos');
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo eliminar el documento', { variant: 'error' });
    }
  }

  async function onDescargar() {
    try {
      await documentoService.descargar(id);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo descargar el documento', { variant: 'error' });
    }
  }

  if (cargando) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>;
  if (!documento) return null;

  return (
    <div>
      <button
        onClick={() => navigate('/documentos')}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">{documento.nombre}</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">{documento.codigo}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusChip status={documento.estado} />
          {tienePermiso('documentos', 'exportar') && (
            <Button variant="outline" icon={Download} onClick={onDescargar}>
              Descargar versión vigente
            </Button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-centhrix-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div role="tablist" aria-label="Secciones del documento" className="flex border-b border-gray-100 dark:border-slate-700">
          <button
            role="tab"
            aria-selected={tabActiva === 'detalle'}
            onClick={() => setTabActiva('detalle')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'detalle' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Detalle
          </button>
          <button
            role="tab"
            aria-selected={tabActiva === 'historial'}
            onClick={() => setTabActiva('historial')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'historial' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Historial de versiones
          </button>
        </div>

        <div className="p-6">
          {tabActiva === 'detalle' && (
            <form className="space-y-4">
              <Input label="Nombre *" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} disabled={!tienePermiso('documentos', 'editar')} />
              <Input label="Código" {...register('codigo')} disabled={!tienePermiso('documentos', 'editar')} />

              <div>
                <label htmlFor="detalle-tipoDocumentoId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Tipo de documento
                </label>
                <select
                  id="detalle-tipoDocumentoId"
                  disabled={!tienePermiso('documentos', 'editar')}
                  className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-centhrix-card"
                  {...register('tipoDocumentoId')}
                >
                  {tipos.map((tipo) => (
                    <option key={tipo.id} value={tipo.id}>
                      {tipo.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="detalle-carpetaId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Carpeta
                </label>
                <select
                  id="detalle-carpetaId"
                  disabled={!tienePermiso('documentos', 'editar')}
                  className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-centhrix-card"
                  {...register('carpetaId')}
                >
                  {carpetas.map((carpeta) => (
                    <option key={carpeta.id} value={carpeta.id}>
                      {carpeta.ruta}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <Input label="Vigencia desde" type="date" {...register('vigenciaDesde')} disabled={!tienePermiso('documentos', 'editar')} />
                <Input label="Vigencia hasta" type="date" {...register('vigenciaHasta')} disabled={!tienePermiso('documentos', 'editar')} />
              </div>

              <Input label="Días de alerta de vencimiento" type="number" {...register('diasAlertaVencimiento')} disabled={!tienePermiso('documentos', 'editar')} />

              <div className="flex items-center gap-3 pt-2">
                {tienePermiso('documentos', 'editar') && <Button onClick={handleSubmit(onGuardar)}>Guardar cambios</Button>}
                {tienePermiso('documentos', 'eliminar') && (
                  <Button variant="danger" onClick={onEliminar}>
                    Eliminar
                  </Button>
                )}
              </div>
            </form>
          )}

          {tabActiva === 'historial' && (
            <div className="space-y-6">
              <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                {versiones.length === 0 && <li className="py-4 text-sm text-slate-400 dark:text-slate-500">Sin versiones anteriores.</li>}
                {versiones.map((version) => (
                  <li key={version.id} className="py-3 flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-300">{version.version}</span>
                    {tienePermiso('documentos', 'exportar') && (
                      <Button variant="outline" size="sm" onClick={() => onDescargarVersion(version.id)}>
                        Descargar {version.version}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>

              {tienePermiso('documentos', 'aprobar_version') && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <Input label="Nueva versión *" placeholder="v2" {...registerVersion('version', { required: true })} />

                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Vigencia desde" type="date" {...registerVersion('vigenciaDesde')} />
                    <Input label="Vigencia hasta" type="date" {...registerVersion('vigenciaHasta')} />
                  </div>

                  <div>
                    <label htmlFor="version-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Archivo *
                    </label>
                    <input id="version-archivo" type="file" accept={TIPOS_PERMITIDOS_ACCEPT} className="w-full text-sm" {...registerVersion('archivo', { required: true })} />
                    {archivoVersionError && (
                      <p role="alert" className="text-xs text-red-500 mt-1">
                        {archivoVersionError}
                      </p>
                    )}
                  </div>

                  <Button onClick={handleSubmitVersion(onSubirVersion)}>Subir nueva versión</Button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
