import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, FileText, Folder } from 'lucide-react';
import areaService from '../../api/area.service';
import usuarioService from '../../api/usuario.service';
import carpetaService from '../../api/carpeta.service';
import documentoService from '../../api/documento.service';
import { aplanarCarpetas } from '../documentos/DocumentosListado';
import Button from '../../components/common/Button/Button';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import StatusChip from '../../components/common/StatusChip/StatusChip';

function nivelSalud(pct) {
  const valor = Number(pct);
  if (valor >= 80) return 'saludable';
  if (valor >= 50) return 'atencion';
  return 'critico';
}

const ESTADOS_DOCUMENTO = ['vigente', 'por_vencer', 'vencido'];

const VOLVER_CLASSNAME =
  'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-white dark:bg-centhrix-card text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-centhrix-surface transition-colors';

export default function AreaDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [area, setArea] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [lider, setLider] = useState(null);
  const [cantidadCarpetas, setCantidadCarpetas] = useState(null);
  const [conteoDocumentos, setConteoDocumentos] = useState(null);

  useEffect(() => {
    async function cargarArea() {
      setCargando(true);
      setErrorCarga(null);
      try {
        const data = await areaService.obtener(id);
        setArea(data);
      } catch (error) {
        setArea(null);
        setErrorCarga(error?.message || 'No se pudo cargar el área');
      } finally {
        setCargando(false);
      }
    }
    cargarArea();
  }, [id]);

  useEffect(() => {
    if (!area?.liderUsuarioId) {
      setLider(null);
      return;
    }
    async function cargarLider() {
      try {
        const data = await usuarioService.obtener(area.liderUsuarioId);
        setLider(data);
      } catch {
        setLider(null);
      }
    }
    cargarLider();
  }, [area?.liderUsuarioId]);

  useEffect(() => {
    if (!area?.id) return;
    async function cargarCantidadCarpetas() {
      try {
        const arbol = await carpetaService.listar(area.id);
        setCantidadCarpetas(aplanarCarpetas(arbol).length);
      } catch {
        setCantidadCarpetas(null);
      }
    }
    cargarCantidadCarpetas();
  }, [area?.id]);

  useEffect(() => {
    if (!area?.id) return;
    async function cargarConteoDocumentos() {
      try {
        const [total, ...porEstado] = await Promise.all([
          documentoService.listar({ areaId: area.id, limit: 1 }),
          ...ESTADOS_DOCUMENTO.map((estado) => documentoService.listar({ areaId: area.id, estado, limit: 1 })),
        ]);
        setConteoDocumentos({
          total: total.pagination.total,
          vigente: porEstado[0].pagination.total,
          por_vencer: porEstado[1].pagination.total,
          vencido: porEstado[2].pagination.total,
        });
      } catch {
        setConteoDocumentos(null);
      }
    }
    cargarConteoDocumentos();
  }, [area?.id]);

  if (cargando) return <p className="text-sm text-slate-500 dark:text-slate-400">Cargando...</p>;

  if (!area) {
    return (
      <EmptyState
        icon={Building2}
        title="No se pudo cargar el área"
        description={errorCarga || 'El área solicitada no existe o no está disponible.'}
        action={
          <Link to="/areas" className={VOLVER_CLASSNAME}>
            <ArrowLeft className="w-4 h-4" />
            Volver a Áreas
          </Link>
        }
      />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link to="/areas" className={VOLVER_CLASSNAME}>
          <ArrowLeft className="w-4 h-4" />
          Volver a Áreas
        </Link>
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">{area.nombre}</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="font-semibold text-slate-800 dark:text-slate-100">{area.nombre}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{area.codigo}</p>
            </div>
            <Building2 className="w-8 h-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-2 mb-3">
            <StatusChip status={area.activo ? 'activo' : 'inactivo'} />
            <StatusChip status={nivelSalud(area.saludDocumentalPct)} customLabel={`${area.saludDocumentalPct}% al día`} />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">{lider ? `Líder: ${lider.nombre} ${lider.apellido}` : 'Sin líder asignado'}</p>
        </div>

        <div className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <Folder className="w-8 h-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="font-semibold text-slate-800 dark:text-slate-100">Carpetas</p>
          </div>
          <p className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-3">{cantidadCarpetas ?? '—'}</p>
          <Button variant="outline" fullWidth onClick={() => navigate(`/documentos/carpetas?areaId=${area.id}`)}>
            Ver carpetas
          </Button>
        </div>

        <div className="bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
            <p className="font-semibold text-slate-800 dark:text-slate-100">Documentos</p>
          </div>
          <p className="text-2xl font-semibold text-slate-800 dark:text-slate-100 mb-1">{conteoDocumentos?.total ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
            {conteoDocumentos ? `${conteoDocumentos.vigente} vigentes · ${conteoDocumentos.por_vencer} por vencer · ${conteoDocumentos.vencido} vencidos` : '—'}
          </p>
          <Button variant="outline" fullWidth onClick={() => navigate(`/documentos?areaId=${area.id}`)}>
            Ver documentos
          </Button>
        </div>
      </div>
    </div>
  );
}
