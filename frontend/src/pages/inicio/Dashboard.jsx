import { ClipboardList, AlertTriangle, CheckCircle2 } from 'lucide-react';
import KpiCard from '../../components/common/Card/KpiCard';

const KPIS_DE_MUESTRA = [
  {
    titulo: 'Aprobaciones pendientes',
    valor: 4,
    icono: ClipboardList,
    iconBg: 'bg-violet-100 dark:bg-violet-900/30',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    titulo: 'Alertas de vigencia documental',
    valor: 7,
    icono: AlertTriangle,
    iconBg: 'bg-amber-100 dark:bg-amber-900/30',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
  {
    titulo: '% documentos al día',
    valor: '82%',
    icono: CheckCircle2,
    iconBg: 'bg-emerald-100 dark:bg-emerald-900/30',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
];

export default function Dashboard() {
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Inicio</h2>
        <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 dark:bg-centhrix-surface text-slate-500 dark:text-slate-400">
          Datos de muestra
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {KPIS_DE_MUESTRA.map((kpi) => (
          <KpiCard key={kpi.titulo} title={kpi.titulo} value={kpi.valor} icon={kpi.icono} iconBg={kpi.iconBg} iconColor={kpi.iconColor} />
        ))}
      </div>
    </div>
  );
}
