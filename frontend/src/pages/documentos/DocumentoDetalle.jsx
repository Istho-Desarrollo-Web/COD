import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { ArrowLeft, Download } from 'lucide-react';
import documentoService from '../../api/documento.service';
import carpetaService from '../../api/carpeta.service';
import tipoDocumentoService from '../../api/tipoDocumento.service';
import areaService from '../../api/area.service';
import { aplanarCarpetas } from './DocumentosListado';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import StatusChip from '../../components/common/StatusChip/StatusChip';

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
    formState: { errors },
  } = useForm();

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

  useEffect(() => {
    async function cargarNombreArea() {
      await areaService.listar();
    }
    cargarNombreArea();
  }, []);

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

      <div className="bg-white dark:bg-centhrix-card rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-slate-700">
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
              className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50"
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
              className="w-full py-2.5 px-4 border border-slate-200 rounded-xl text-sm disabled:bg-slate-50"
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
      </div>
    </div>
  );
}
