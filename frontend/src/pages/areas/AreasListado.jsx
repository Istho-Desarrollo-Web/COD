// frontend/src/pages/areas/AreasListado.jsx
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { Plus, Building2 } from 'lucide-react';
import areaService from '../../api/area.service';
import usuarioService from '../../api/usuario.service';
import rolService from '../../api/rol.service';
import { sugerirUsername } from '../../utils/sugerirUsername';
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
  const [asignarLider, setAsignarLider] = useState(false);
  const [modoLider, setModoLider] = useState('nuevo');
  const [roles, setRoles] = useState([]);
  const [usuariosExistentes, setUsuariosExistentes] = useState([]);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm();

  const nombreLiderForm = watch('liderNombre');
  const apellidoLiderForm = watch('liderApellido');

  async function cargarAreas() {
    setCargando(true);
    try {
      const data = await areaService.listar();
      setAreas(data);
    } catch (error) {
      setAreas([]);
      enqueueSnackbar(error?.message || 'No se pudieron cargar las áreas', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarAreas();
  }, []);

  useEffect(() => {
    if (!asignarLider) return;
    async function cargarCatalogosLider() {
      try {
        const [rolesData, usuariosData] = await Promise.all([rolService.listar(), usuarioService.listar()]);
        setRoles(rolesData);
        setUsuariosExistentes(usuariosData);
      } catch {
        setRoles([]);
        setUsuariosExistentes([]);
      }
    }
    cargarCatalogosLider();
  }, [asignarLider]);

  function onApellidoLiderBlur() {
    if (nombreLiderForm && apellidoLiderForm) {
      setValue('liderUsername', sugerirUsername(nombreLiderForm, apellidoLiderForm));
    }
  }

  function cerrarModal() {
    setModalAbierto(false);
    setAsignarLider(false);
    setModoLider('nuevo');
    reset();
  }

  async function onCrear(valores) {
    const payload = { nombre: valores.nombre, codigo: valores.codigo };

    if (asignarLider && modoLider === 'nuevo') {
      payload.nuevoUsuario = {
        username: valores.liderUsername,
        email: valores.liderEmail,
        nombre: valores.liderNombre,
        apellido: valores.liderApellido,
        password: valores.liderPassword,
        rolId: Number(valores.liderRolId),
        requiereCambioPassword: true,
      };
    } else if (asignarLider && modoLider === 'existente') {
      payload.liderUsuarioId = Number(valores.liderUsuarioId);
    }

    try {
      await areaService.crear(payload);
      enqueueSnackbar('Área creada exitosamente', { variant: 'success' });
      cerrarModal();
      await cargarAreas();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo crear el área', { variant: 'error' });
    }
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
        onClose={cerrarModal}
        title="Crear área"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={cerrarModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit(onCrear)}>Crear</Button>
          </>
        }
      >
        <form className="space-y-4">
          <Input label="Nombre" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />
          <Input label="Código" error={errors.codigo?.message} {...register('codigo', { required: 'El código es obligatorio' })} />

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={asignarLider} onChange={(e) => setAsignarLider(e.target.checked)} />
            Asignar líder de área
          </label>

          {asignarLider && (
            <div className="space-y-4 pl-4 border-l-2 border-slate-100 dark:border-slate-700">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="radio" name="modoLider" checked={modoLider === 'nuevo'} onChange={() => setModoLider('nuevo')} />
                  Usuario nuevo
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input type="radio" name="modoLider" checked={modoLider === 'existente'} onChange={() => setModoLider('existente')} />
                  Usuario existente
                </label>
              </div>

              {modoLider === 'nuevo' && (
                <>
                  <Input label="Nombre del líder" {...register('liderNombre', { required: asignarLider && modoLider === 'nuevo' })} />
                  <Input
                    label="Apellido del líder"
                    {...register('liderApellido', { required: asignarLider && modoLider === 'nuevo', onBlur: onApellidoLiderBlur })}
                  />
                  <Input label="Email del líder" type="email" {...register('liderEmail', { required: asignarLider && modoLider === 'nuevo' })} />
                  <Input label="Username del líder" {...register('liderUsername', { required: asignarLider && modoLider === 'nuevo' })} />
                  <Input
                    label="Contraseña del líder"
                    type="password"
                    {...register('liderPassword', { required: asignarLider && modoLider === 'nuevo' })}
                  />
                  <div>
                    <label htmlFor="lider-rolId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                      Rol del líder
                    </label>
                    <select
                      id="lider-rolId"
                      className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
                      {...register('liderRolId', { required: asignarLider && modoLider === 'nuevo' })}
                    >
                      <option value="">Selecciona un rol</option>
                      {roles.map((rol) => (
                        <option key={rol.id} value={rol.id}>
                          {rol.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              {modoLider === 'existente' && (
                <div>
                  <label htmlFor="lider-usuarioId" className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">
                    Usuario líder
                  </label>
                  <select
                    id="lider-usuarioId"
                    className="w-full py-2.5 px-4 border border-slate-200 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-centhrix-surface text-slate-900 dark:text-slate-100"
                    {...register('liderUsuarioId', { required: asignarLider && modoLider === 'existente' })}
                  >
                    <option value="">Selecciona un usuario</option>
                    {usuariosExistentes.map((usuario) => (
                      <option key={usuario.id} value={usuario.id}>
                        {usuario.nombre} {usuario.apellido} ({usuario.username})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}
        </form>
      </Modal>
    </div>
  );
}
