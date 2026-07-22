import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { ArrowLeft, Download, Trash2, Upload, Truck, CheckCircle, XCircle } from 'lucide-react';
import proveedorService from '../../api/proveedor.service';
import requisitoProveedorService from '../../api/requisitoProveedor.service';
import proveedorDocumentoService from '../../api/proveedorDocumento.service';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import { validarArchivo, TIPOS_PERMITIDOS } from '../../utils/validarArchivo';

const TIPOS_PERMITIDOS_ACCEPT = [...TIPOS_PERMITIDOS].join(',');
const ORDEN_CRITICIDAD = { basico: 0, relevante: 1, critico: 2 };

function requisitoAplica(criticidadProveedor, criticidadMinimaRequisito) {
  return ORDEN_CRITICIDAD[criticidadProveedor] >= ORDEN_CRITICIDAD[criticidadMinimaRequisito];
}

const VOLVER_CLASSNAME =
  'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-centhrix-card text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors';

export default function ProveedorDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { tienePermiso } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [proveedor, setProveedor] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [tabActiva, setTabActiva] = useState('detalle');
  const [requisitos, setRequisitos] = useState([]);
  const [documentos, setDocumentos] = useState([]);
  const [archivoError, setArchivoError] = useState(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm();

  const {
    register: registerSubida,
    handleSubmit: handleSubmitSubida,
    reset: resetSubida,
  } = useForm();

  async function cargarProveedor() {
    setCargando(true);
    try {
      const data = await proveedorService.obtener(id);
      setProveedor(data);
      reset({
        razonSocial: data.razonSocial,
        criticidad: data.criticidad,
        categoria: data.categoria || '',
      });
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo cargar el proveedor', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarProveedor();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    async function cargarRequisitos() {
      try {
        const data = await requisitoProveedorService.listar();
        setRequisitos(data);
      } catch {
        setRequisitos([]);
      }
    }
    cargarRequisitos();
  }, []);

  async function cargarDocumentos() {
    try {
      const data = await proveedorDocumentoService.listar(id);
      setDocumentos(data);
    } catch {
      setDocumentos([]);
    }
  }

  useEffect(() => {
    cargarDocumentos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function onGuardar(valores) {
    try {
      await proveedorService.editar(id, {
        razonSocial: valores.razonSocial,
        criticidad: valores.criticidad,
        categoria: valores.categoria || null,
      });
      enqueueSnackbar('Proveedor actualizado', { variant: 'success' });
      await cargarProveedor();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo actualizar el proveedor', { variant: 'error' });
    }
  }

  async function onEliminar() {
    if (!window.confirm('¿Dar de baja este proveedor? Esta acción no se puede deshacer.')) return;
    try {
      await proveedorService.eliminar(id);
      enqueueSnackbar('Proveedor dado de baja', { variant: 'success' });
      navigate('/proveedores');
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo dar de baja el proveedor', { variant: 'error' });
    }
  }

  async function onAprobarRegistro() {
    if (!window.confirm('¿Aprobar el registro de este proveedor? Podrás continuar luego con la aprobación de sus requisitos documentales.')) return;
    try {
      await proveedorService.aprobarRegistro(id);
      enqueueSnackbar('Registro del proveedor aprobado', { variant: 'success' });
      await cargarProveedor();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo aprobar el registro del proveedor', { variant: 'error' });
    }
  }

  async function onAprobarRequisitos() {
    if (!window.confirm('¿Aprobar los requisitos documentales de este proveedor? Se creará su carpeta en el módulo de Documentos con los documentos ya subidos al expediente.')) return;
    try {
      const resultado = await proveedorService.aprobarRequisitos(id);
      enqueueSnackbar(`Proveedor aprobado. Se reflejaron ${resultado.documentosReflejados} documento(s) en su carpeta.`, { variant: 'success' });
      await cargarProveedor();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo aprobar los requisitos del proveedor', { variant: 'error' });
    }
  }

  async function onRechazar() {
    const motivo = window.prompt('Motivo del rechazo:');
    if (motivo === null) return;
    if (!motivo.trim()) {
      enqueueSnackbar('El motivo del rechazo es obligatorio', { variant: 'error' });
      return;
    }
    try {
      await proveedorService.rechazar(id, motivo);
      enqueueSnackbar('Proveedor rechazado', { variant: 'success' });
      await cargarProveedor();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo rechazar el proveedor', { variant: 'error' });
    }
  }

  async function onSubirDocumento(valores) {
    const archivo = valores.archivo?.[0];
    const errorArchivo = validarArchivo(archivo);
    if (errorArchivo) {
      setArchivoError(errorArchivo);
      return;
    }
    setArchivoError(null);

    const formData = new FormData();
    if (valores.requisitoId) formData.append('requisitoId', valores.requisitoId);
    if (valores.vigenciaDesde) formData.append('vigenciaDesde', valores.vigenciaDesde);
    if (valores.vigenciaHasta) formData.append('vigenciaHasta', valores.vigenciaHasta);
    formData.append('archivo', archivo);

    try {
      await proveedorDocumentoService.crear(id, formData);
      enqueueSnackbar('Documento subido al expediente', { variant: 'success' });
      resetSubida();
      setArchivoError(null);
      await cargarDocumentos();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo subir el documento', { variant: 'error' });
    }
  }

  async function onDescargar(documentoId) {
    try {
      await proveedorDocumentoService.descargar(id, documentoId);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo descargar el documento', { variant: 'error' });
    }
  }

  async function onEliminarDocumento(documentoId) {
    if (!window.confirm('¿Eliminar este documento del expediente?')) return;
    try {
      await proveedorDocumentoService.eliminar(id, documentoId);
      enqueueSnackbar('Documento eliminado', { variant: 'success' });
      await cargarDocumentos();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo eliminar el documento', { variant: 'error' });
    }
  }

  if (cargando) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>;

  if (!proveedor) {
    return (
      <EmptyState
        icon={Truck}
        title="No se pudo cargar el proveedor"
        description="El proveedor solicitado no existe o no está disponible."
        action={
          <Link to="/proveedores" className={VOLVER_CLASSNAME}>
            <ArrowLeft className="w-4 h-4" />
            Volver a Proveedores
          </Link>
        }
      />
    );
  }

  const requisitosAplicables = requisitos.filter((requisito) => requisitoAplica(proveedor.criticidad, requisito.criticidadMinima));

  function coberturaDeRequisito(requisitoId) {
    const documento = documentos.find((doc) => doc.requisitoId === requisitoId);
    return documento ? documento.estado : null;
  }

  return (
    <div>
      <button
        onClick={() => navigate('/proveedores')}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">{proveedor.razonSocial}</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">{proveedor.documentoIdentificacion}</p>
        </div>
        <StatusChip status={proveedor.estado} />
      </div>

      <div className="bg-white dark:bg-centhrix-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div role="tablist" aria-label="Secciones del proveedor" className="flex border-b border-gray-100 dark:border-slate-700">
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
            aria-selected={tabActiva === 'expediente'}
            onClick={() => setTabActiva('expediente')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'expediente' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Expediente documental
          </button>
        </div>

        <div className="p-6">
          {tabActiva === 'detalle' && (
            <form className="space-y-4">
              <Input label="Razón social *" error={errors.razonSocial?.message} {...register('razonSocial', { required: 'La razón social es obligatoria' })} disabled={!tienePermiso('proveedores', 'gestionar')} />

              <div>
                <label htmlFor="detalle-criticidad" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                  Criticidad
                </label>
                <select
                  id="detalle-criticidad"
                  disabled={!tienePermiso('proveedores', 'gestionar')}
                  className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100 disabled:bg-slate-50 dark:disabled:bg-centhrix-card"
                  {...register('criticidad')}
                >
                  <option value="critico">Crítico</option>
                  <option value="relevante">Relevante</option>
                  <option value="basico">Básico</option>
                </select>
              </div>

              <Input label="Categoría" {...register('categoria')} disabled={!tienePermiso('proveedores', 'gestionar')} />

              <div className="flex items-center gap-3 pt-2">
                {proveedor.estado === 'en_evaluacion' && tienePermiso('proveedores', 'aprobar') && (
                  <>
                    <Button variant="success" icon={CheckCircle} onClick={onAprobarRegistro}>
                      Aprobar registro
                    </Button>
                    <Button variant="danger" icon={XCircle} onClick={onRechazar}>
                      Rechazar
                    </Button>
                  </>
                )}
                {proveedor.estado === 'registro_aprobado' && tienePermiso('proveedores', 'aprobar') && (
                  <>
                    <Button variant="success" icon={CheckCircle} onClick={onAprobarRequisitos}>
                      Aprobar requisitos
                    </Button>
                    <Button variant="danger" icon={XCircle} onClick={onRechazar}>
                      Rechazar
                    </Button>
                  </>
                )}
                {tienePermiso('proveedores', 'gestionar') && <Button onClick={handleSubmit(onGuardar)}>Guardar cambios</Button>}
                {tienePermiso('proveedores', 'eliminar') && (
                  <Button variant="danger" onClick={onEliminar}>
                    Dar de baja
                  </Button>
                )}
              </div>
            </form>
          )}

          {tabActiva === 'expediente' && (
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Checklist de requisitos</h3>
                {requisitosAplicables.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">No hay requisitos aplicables a esta criticidad.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                    {requisitosAplicables.map((requisito) => {
                      const estadoCobertura = coberturaDeRequisito(requisito.id);
                      return (
                        <li key={requisito.id} className="py-3 flex items-center justify-between">
                          <span className="text-sm text-slate-600 dark:text-slate-300">{requisito.nombre}</span>
                          {estadoCobertura ? <StatusChip status={estadoCobertura} /> : <StatusChip status="vencido" customLabel="Falta" />}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Documentos subidos</h3>
                <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                  {documentos.length === 0 && <li className="py-4 text-sm text-slate-400 dark:text-slate-500">Sin documentos subidos.</li>}
                  {documentos.map((documento) => (
                    <li key={documento.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <StatusChip status={documento.estado} />
                        <span className="text-sm text-slate-600 dark:text-slate-300">{documento.RequisitoProveedor?.nombre || 'Sin requisito asociado'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" icon={Download} onClick={() => onDescargar(documento.id)}>
                          Descargar
                        </Button>
                        {tienePermiso('proveedores', 'gestionar') && (
                          <Button variant="outline" size="sm" icon={Trash2} onClick={() => onEliminarDocumento(documento.id)}>
                            Eliminar
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {tienePermiso('proveedores', 'gestionar') && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <div>
                    <label htmlFor="subida-requisitoId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Requisito (opcional)
                    </label>
                    <select
                      id="subida-requisitoId"
                      className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
                      {...registerSubida('requisitoId')}
                    >
                      <option value="">Sin requisito asociado</option>
                      {requisitos.map((requisito) => (
                        <option key={requisito.id} value={requisito.id}>
                          {requisito.nombre}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Input label="Vigencia desde" type="date" {...registerSubida('vigenciaDesde')} />
                    <Input label="Vigencia hasta" type="date" {...registerSubida('vigenciaHasta')} />
                  </div>

                  <div>
                    <label htmlFor="subida-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Archivo *
                    </label>
                    <input id="subida-archivo" type="file" accept={TIPOS_PERMITIDOS_ACCEPT} className="w-full text-sm" {...registerSubida('archivo', { required: true })} />
                    {archivoError && (
                      <p role="alert" className="text-xs text-red-500 mt-1">
                        {archivoError}
                      </p>
                    )}
                  </div>

                  <Button icon={Upload} onClick={handleSubmitSubida(onSubirDocumento)}>
                    Subir documento
                  </Button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
