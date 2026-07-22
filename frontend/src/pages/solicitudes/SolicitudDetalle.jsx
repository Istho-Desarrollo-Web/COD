import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { ArrowLeft, CheckCircle, XCircle, Send, Upload, Ban, ClipboardList, Star } from 'lucide-react';
import solicitudService from '../../api/solicitud.service';
import cotizacionService from '../../api/cotizacion.service';
import solicitudComentarioService from '../../api/solicitudComentario.service';
import proveedorService from '../../api/proveedor.service';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import StatusChip from '../../components/common/StatusChip/StatusChip';
import { validarArchivo, TIPOS_PERMITIDOS } from '../../utils/validarArchivo';

const TIPOS_PERMITIDOS_ACCEPT = [...TIPOS_PERMITIDOS].join(',');

const VOLVER_CLASSNAME =
  'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-centhrix-card text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors';

export default function SolicitudDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, tienePermiso } = useAuth();
  const { enqueueSnackbar } = useSnackbar();

  const [solicitud, setSolicitud] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [tabActiva, setTabActiva] = useState('detalle');
  const [cotizaciones, setCotizaciones] = useState([]);
  const [comentarios, setComentarios] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [archivoErrorCotizacion, setArchivoErrorCotizacion] = useState(null);
  const [archivoErrorConfirmar, setArchivoErrorConfirmar] = useState(null);

  const { register: registerCotizacion, handleSubmit: handleSubmitCotizacion, reset: resetCotizacion } = useForm();
  const { register: registerComentario, handleSubmit: handleSubmitComentario, reset: resetComentario } = useForm();
  const { register: registerConfirmar, handleSubmit: handleSubmitConfirmar, reset: resetConfirmar } = useForm();

  async function cargarSolicitud() {
    setCargando(true);
    try {
      const data = await solicitudService.obtener(id);
      setSolicitud(data);
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo cargar la solicitud', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarSolicitud();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cargarCotizaciones() {
    try {
      const data = await cotizacionService.listar(id);
      setCotizaciones(data);
    } catch {
      setCotizaciones([]);
    }
  }

  useEffect(() => {
    cargarCotizaciones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function cargarComentarios() {
    try {
      const data = await solicitudComentarioService.listar(id);
      setComentarios(data);
    } catch {
      setComentarios([]);
    }
  }

  useEffect(() => {
    cargarComentarios();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    async function cargarProveedores() {
      try {
        const data = await proveedorService.listar({ estado: 'activo' });
        setProveedores(data);
      } catch {
        setProveedores([]);
      }
    }
    cargarProveedores();
  }, []);

  async function onEnviarAprobacion() {
    if (!window.confirm('¿Enviar esta solicitud a aprobación con la cotización seleccionada?')) return;
    try {
      await solicitudService.enviarAprobacion(id);
      enqueueSnackbar('Solicitud enviada a aprobación', { variant: 'success' });
      await cargarSolicitud();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo enviar la solicitud a aprobación', { variant: 'error' });
    }
  }

  async function onAprobar() {
    if (!window.confirm('¿Aprobar esta solicitud?')) return;
    try {
      await solicitudService.aprobar(id);
      enqueueSnackbar('Solicitud aprobada', { variant: 'success' });
      await cargarSolicitud();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo aprobar la solicitud', { variant: 'error' });
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
      await solicitudService.rechazar(id, motivo);
      enqueueSnackbar('Solicitud rechazada', { variant: 'success' });
      await cargarSolicitud();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo rechazar la solicitud', { variant: 'error' });
    }
  }

  async function onCancelar() {
    if (!window.confirm('¿Cancelar esta solicitud? Esta acción no se puede deshacer.')) return;
    try {
      await solicitudService.cancelar(id);
      enqueueSnackbar('Solicitud cancelada', { variant: 'success' });
      await cargarSolicitud();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo cancelar la solicitud', { variant: 'error' });
    }
  }

  async function onConfirmar(valores) {
    const archivo = valores.archivo?.[0];
    const errorArchivo = validarArchivo(archivo);
    if (errorArchivo) {
      setArchivoErrorConfirmar(errorArchivo);
      return;
    }
    setArchivoErrorConfirmar(null);

    const formData = new FormData();
    formData.append('ordenFormalNumero', valores.ordenFormalNumero);
    formData.append('archivo', archivo);

    try {
      await solicitudService.confirmar(id, formData);
      enqueueSnackbar('Solicitud confirmada', { variant: 'success' });
      resetConfirmar();
      await cargarSolicitud();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo confirmar la solicitud', { variant: 'error' });
    }
  }

  async function onCrearCotizacion(valores) {
    const archivo = valores.archivo?.[0];
    if (archivo) {
      const errorArchivo = validarArchivo(archivo);
      if (errorArchivo) {
        setArchivoErrorCotizacion(errorArchivo);
        return;
      }
    }
    setArchivoErrorCotizacion(null);

    const formData = new FormData();
    if (valores.proveedorId) formData.append('proveedorId', valores.proveedorId);
    formData.append('monto', valores.monto);
    if (valores.observaciones) formData.append('observaciones', valores.observaciones);
    if (archivo) formData.append('archivo', archivo);

    try {
      await cotizacionService.crear(id, formData);
      enqueueSnackbar('Cotización agregada', { variant: 'success' });
      resetCotizacion();
      setArchivoErrorCotizacion(null);
      await cargarCotizaciones();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo agregar la cotización', { variant: 'error' });
    }
  }

  async function onSeleccionarCotizacion(cotizacionId) {
    try {
      await cotizacionService.seleccionar(id, cotizacionId);
      enqueueSnackbar('Cotización seleccionada', { variant: 'success' });
      await cargarCotizaciones();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo seleccionar la cotización', { variant: 'error' });
    }
  }

  async function onCrearComentario(valores) {
    try {
      await solicitudComentarioService.crear(id, valores.texto);
      enqueueSnackbar('Comentario agregado', { variant: 'success' });
      resetComentario();
      await cargarComentarios();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo agregar el comentario', { variant: 'error' });
    }
  }

  if (cargando) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>;

  if (!solicitud) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No se pudo cargar la solicitud"
        description="La solicitud solicitada no existe o no está disponible."
        action={
          <Link to="/solicitudes" className={VOLVER_CLASSNAME}>
            <ArrowLeft className="w-4 h-4" />
            Volver a Solicitudes
          </Link>
        }
      />
    );
  }

  const esDueño = solicitud.solicitanteUsuarioId === user?.id;
  const hayCotizacionSeleccionada = cotizaciones.some((cotizacion) => cotizacion.seleccionada);

  return (
    <div>
      <button
        onClick={() => navigate('/solicitudes')}
        className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Volver
      </button>

      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">{solicitud.codigo}</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500">{solicitud.descripcion}</p>
        </div>
        <StatusChip status={solicitud.estado} />
      </div>

      <div className="bg-white dark:bg-centhrix-card rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
        <div role="tablist" aria-label="Secciones de la solicitud" className="flex border-b border-gray-100 dark:border-slate-700">
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
            aria-selected={tabActiva === 'cotizaciones'}
            onClick={() => setTabActiva('cotizaciones')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'cotizaciones' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Cotizaciones
          </button>
          <button
            role="tab"
            aria-selected={tabActiva === 'comentarios'}
            onClick={() => setTabActiva('comentarios')}
            className={`px-6 py-4 text-sm font-medium ${tabActiva === 'comentarios' ? 'text-slate-900 dark:text-slate-100' : 'text-slate-500 dark:text-slate-400'}`}
          >
            Comentarios
          </button>
        </div>

        <div className="p-6">
          {tabActiva === 'detalle' && (
            <div className="space-y-4">
              {solicitud.montoEstimado && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Monto estimado</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{solicitud.montoEstimado}</p>
                </div>
              )}
              {solicitud.ordenFormalNumero && (
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Orden formal</p>
                  <p className="text-sm text-slate-700 dark:text-slate-200">{solicitud.ordenFormalNumero}</p>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2 flex-wrap">
                {solicitud.estado === 'cotizando' && tienePermiso('solicitudes', 'cotizar') && (
                  <Button icon={Send} onClick={onEnviarAprobacion} disabled={!hayCotizacionSeleccionada}>
                    Enviar a aprobación
                  </Button>
                )}
                {solicitud.estado === 'en_aprobacion' && tienePermiso('solicitudes', 'aprobar') && (
                  <>
                    <Button variant="success" icon={CheckCircle} onClick={onAprobar}>
                      Aprobar
                    </Button>
                    <Button variant="danger" icon={XCircle} onClick={onRechazar}>
                      Rechazar
                    </Button>
                  </>
                )}
                {['cotizando', 'en_aprobacion'].includes(solicitud.estado) && esDueño && (
                  <Button variant="danger" icon={Ban} onClick={onCancelar}>
                    Cancelar
                  </Button>
                )}
              </div>

              {solicitud.estado === 'aprobada' && tienePermiso('solicitudes', 'confirmar') && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Confirmar con orden formal</h3>
                  <Input label="Número de orden formal" {...registerConfirmar('ordenFormalNumero', { required: true })} />
                  <div>
                    <label htmlFor="confirmar-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Archivo de la orden formal *
                    </label>
                    <input id="confirmar-archivo" type="file" accept={TIPOS_PERMITIDOS_ACCEPT} className="w-full text-sm" {...registerConfirmar('archivo', { required: true })} />
                    {archivoErrorConfirmar && (
                      <p role="alert" className="text-xs text-red-500 mt-1">
                        {archivoErrorConfirmar}
                      </p>
                    )}
                  </div>
                  <Button icon={Upload} onClick={handleSubmitConfirmar(onConfirmar)}>
                    Confirmar
                  </Button>
                </form>
              )}
            </div>
          )}

          {tabActiva === 'cotizaciones' && (
            <div className="space-y-8">
              <div>
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">Cotizaciones recibidas</h3>
                {cotizaciones.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500">Sin cotizaciones todavía.</p>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                    {cotizaciones.map((cotizacion) => (
                      <li key={cotizacion.id} className="py-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm text-slate-700 dark:text-slate-200">
                            {cotizacion.Proveedor?.razonSocial || 'Sin proveedor asociado'} — {cotizacion.monto}
                          </p>
                          {cotizacion.observaciones && <p className="text-xs text-slate-400 dark:text-slate-500">{cotizacion.observaciones}</p>}
                        </div>
                        <div className="flex items-center gap-2">
                          {cotizacion.seleccionada && <StatusChip status="aprobado" customLabel="Seleccionada" />}
                          {!cotizacion.seleccionada && solicitud.estado === 'cotizando' && tienePermiso('solicitudes', 'cotizar') && (
                            <Button variant="outline" size="sm" icon={Star} onClick={() => onSeleccionarCotizacion(cotizacion.id)}>
                              Seleccionar
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {solicitud.estado === 'cotizando' && tienePermiso('solicitudes', 'cotizar') && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <Input label="Monto" type="number" {...registerCotizacion('monto', { required: true })} />
                  <div>
                    <label htmlFor="cotizacion-proveedorId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Proveedor (opcional)
                    </label>
                    <select
                      id="cotizacion-proveedorId"
                      className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
                      {...registerCotizacion('proveedorId')}
                    >
                      <option value="">Sin proveedor asociado</option>
                      {proveedores.map((proveedor) => (
                        <option key={proveedor.id} value={proveedor.id}>
                          {proveedor.razonSocial}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input label="Observaciones" {...registerCotizacion('observaciones')} />
                  <div>
                    <label htmlFor="cotizacion-archivo" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Archivo (opcional)
                    </label>
                    <input id="cotizacion-archivo" type="file" accept={TIPOS_PERMITIDOS_ACCEPT} className="w-full text-sm" {...registerCotizacion('archivo')} />
                    {archivoErrorCotizacion && (
                      <p role="alert" className="text-xs text-red-500 mt-1">
                        {archivoErrorCotizacion}
                      </p>
                    )}
                  </div>
                  <Button icon={Upload} onClick={handleSubmitCotizacion(onCrearCotizacion)}>
                    Agregar cotización
                  </Button>
                </form>
              )}
            </div>
          )}

          {tabActiva === 'comentarios' && (
            <div className="space-y-6">
              <ul className="divide-y divide-gray-100 dark:divide-slate-700">
                {comentarios.length === 0 && <li className="py-4 text-sm text-slate-400 dark:text-slate-500">Sin comentarios todavía.</li>}
                {comentarios.map((comentario) => (
                  <li key={comentario.id} className="py-3">
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {comentario.Usuario ? `${comentario.Usuario.nombre} ${comentario.Usuario.apellido}` : 'Usuario'} — {new Date(comentario.createdAt).toLocaleString()}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-200">{comentario.texto}</p>
                  </li>
                ))}
              </ul>

              {tienePermiso('solicitudes', 'comentar') && (
                <form className="space-y-4 pt-4 border-t border-gray-100 dark:border-slate-700">
                  <Input label="Comentario" {...registerComentario('texto', { required: true })} />
                  <Button onClick={handleSubmitComentario(onCrearComentario)}>Comentar</Button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
