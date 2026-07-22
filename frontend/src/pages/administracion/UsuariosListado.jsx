import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSnackbar } from 'notistack';
import { Plus, UserRound, AlertCircle } from 'lucide-react';
import usuarioService from '../../api/usuario.service';
import rolService from '../../api/rol.service';
import { useAuth } from '../../context/AuthContext';
import { useViewMode } from '../../hooks/useViewMode';
import { sugerirUsername } from '../../utils/sugerirUsername';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';
import Modal from '../../components/common/Modal/Modal';
import EmptyState from '../../components/common/EmptyState/EmptyState';
import DataTable from '../../components/common/Table/DataTable';
import ViewToggle from '../../components/common/ViewToggle';
import StatusChip from '../../components/common/StatusChip/StatusChip';

function nombresDeRoles(usuario) {
  return (usuario.roles || []).map((rol) => rol.nombre).join(', ');
}

function UsuarioCard({ usuario, nombreRol, onEditar }) {
  const interactivo = Boolean(onEditar);
  return (
    <div
      role={interactivo ? 'button' : undefined}
      tabIndex={interactivo ? 0 : undefined}
      onClick={interactivo ? onEditar : undefined}
      onKeyDown={interactivo ? (e) => (e.key === 'Enter' || e.key === ' ') && onEditar() : undefined}
      className={`bg-white dark:bg-centhrix-card rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-slate-700${interactivo ? ' cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">
            {usuario.nombre} {usuario.apellido}
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">@{usuario.username}</p>
        </div>
        <UserRound className="w-8 h-8 text-slate-300 dark:text-slate-600" />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{nombreRol}</p>
      <StatusChip status={usuario.activo ? 'activo' : 'inactivo'} />
    </div>
  );
}

export default function UsuariosListado() {
  const { tienePermiso } = useAuth();
  const { enqueueSnackbar } = useSnackbar();
  const { modo, setModo, esVistaMovil } = useViewMode('cod_view_usuarios');

  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [usuarioEditando, setUsuarioEditando] = useState(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm();

  const nombreForm = watch('nombre');
  const apellidoForm = watch('apellido');

  async function cargarUsuarios() {
    setCargando(true);
    try {
      const data = await usuarioService.listar();
      setUsuarios(data);
    } catch (error) {
      setUsuarios([]);
      enqueueSnackbar(error?.message || 'No se pudieron cargar los usuarios', { variant: 'error' });
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarUsuarios();
  }, []);

  useEffect(() => {
    async function cargarRoles() {
      try {
        const data = await rolService.listar();
        setRoles(data);
      } catch {
        setRoles([]);
      }
    }
    cargarRoles();
  }, []);

  function abrirCrear() {
    setUsuarioEditando(null);
    reset({ nombre: '', apellido: '', email: '', username: '', password: '', rolIds: [], requiereCambioPassword: true, activo: true });
    setModalAbierto(true);
  }

  function abrirEditar(usuario) {
    setUsuarioEditando(usuario);
    reset({
      nombre: usuario.nombre,
      apellido: usuario.apellido,
      email: usuario.email,
      username: usuario.username,
      password: '',
      rolIds: (usuario.roles || []).map((rol) => String(rol.id)),
      requiereCambioPassword: usuario.requiereCambioPassword,
      activo: usuario.activo,
    });
    setModalAbierto(true);
  }

  function onApellidoBlur() {
    if (!usuarioEditando && nombreForm && apellidoForm) {
      setValue('username', sugerirUsername(nombreForm, apellidoForm));
    }
  }

  async function onGuardar(valores) {
    try {
      const rolIds = (valores.rolIds || []).map(Number);
      if (usuarioEditando) {
        const cambios = {
          nombre: valores.nombre,
          apellido: valores.apellido,
          email: valores.email,
          rolIds,
          requiereCambioPassword: valores.requiereCambioPassword,
          activo: valores.activo,
        };
        if (valores.password) cambios.password = valores.password;
        await usuarioService.editar(usuarioEditando.id, cambios);
        enqueueSnackbar('Usuario actualizado', { variant: 'success' });
      } else {
        await usuarioService.crear({
          username: valores.username,
          email: valores.email,
          nombre: valores.nombre,
          apellido: valores.apellido,
          password: valores.password,
          rolIds,
          requiereCambioPassword: valores.requiereCambioPassword,
        });
        enqueueSnackbar('Usuario creado exitosamente', { variant: 'success' });
      }
      reset();
      setModalAbierto(false);
      await cargarUsuarios();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo guardar el usuario', { variant: 'error' });
    }
  }

  async function onEliminar(id) {
    if (!window.confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
    try {
      await usuarioService.eliminar(id);
      enqueueSnackbar('Usuario eliminado', { variant: 'success' });
      setModalAbierto(false);
      await cargarUsuarios();
    } catch (error) {
      enqueueSnackbar(error?.message || 'No se pudo eliminar el usuario', { variant: 'error' });
    }
  }

  const columnas = [
    { key: 'nombre', label: 'Nombre', render: (valor, row) => `${row.nombre} ${row.apellido}` },
    { key: 'username', label: 'Usuario' },
    { key: 'email', label: 'Email' },
    { key: 'roles', label: 'Rol', render: (valor, row) => nombresDeRoles(row) },
    { key: 'activo', label: 'Estado', render: (valor) => <StatusChip status={valor ? 'activo' : 'inactivo'} /> },
  ];

  const puedeEditar = tienePermiso('usuarios', 'editar');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-display font-semibold text-slate-800 dark:text-slate-100">Usuarios</h2>
        <div className="flex items-center gap-3">
          {!esVistaMovil && <ViewToggle modo={modo} onChange={setModo} />}
          {tienePermiso('usuarios', 'crear') && (
            <Button icon={Plus} onClick={abrirCrear}>
              Crear usuario
            </Button>
          )}
        </div>
      </div>

      {!cargando && usuarios.length === 0 && (
        <EmptyState icon={UserRound} title="Sin usuarios todavía" description="Crea el primer usuario para empezar a dar acceso al sistema." />
      )}

      {usuarios.length > 0 && modo === 'lista' && (
        <DataTable
          columns={columnas}
          data={usuarios}
          loading={cargando}
          emptyMessage="Sin usuarios todavía"
          onRowClick={puedeEditar ? (row) => abrirEditar(row) : undefined}
        />
      )}

      {usuarios.length > 0 && modo === 'tarjetas' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {usuarios.map((usuario) => (
            <UsuarioCard
              key={usuario.id}
              usuario={usuario}
              nombreRol={nombresDeRoles(usuario)}
              onEditar={puedeEditar ? () => abrirEditar(usuario) : undefined}
            />
          ))}
        </div>
      )}

      <Modal
        isOpen={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={usuarioEditando ? 'Editar usuario' : 'Crear usuario'}
        footer={
          <>
            <Button variant="outline" onClick={() => setModalAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit(onGuardar)}>{usuarioEditando ? 'Guardar' : 'Crear'}</Button>
            {usuarioEditando && tienePermiso('usuarios', 'eliminar') && (
              <Button variant="danger" onClick={() => onEliminar(usuarioEditando.id)}>
                Eliminar
              </Button>
            )}
          </>
        }
      >
        <form className="space-y-4">
          <Input label="Nombre" error={errors.nombre?.message} {...register('nombre', { required: 'El nombre es obligatorio' })} />
          <Input
            label="Apellido"
            error={errors.apellido?.message}
            {...register('apellido', { required: 'El apellido es obligatorio', onBlur: onApellidoBlur })}
          />
          <Input label="Email" type="email" error={errors.email?.message} {...register('email', { required: 'El email es obligatorio' })} />
          <Input
            label="Username"
            error={errors.username?.message}
            disabled={!!usuarioEditando}
            {...register('username', { required: 'El username es obligatorio' })}
          />
          <Input
            label={usuarioEditando ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña'}
            type="password"
            error={errors.password?.message}
            {...register('password', { required: usuarioEditando ? false : 'La contraseña es obligatoria' })}
          />

          <fieldset>
            <legend className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Roles</legend>
            <div className="space-y-1">
              {roles.map((rol) => (
                <label key={rol.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    value={rol.id}
                    {...register('rolIds', { validate: (value) => (value && value.length > 0) || 'Selecciona al menos un rol' })}
                  />
                  {rol.nombre}
                </label>
              ))}
            </div>
            {errors.rolIds?.message && (
              <p role="alert" className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                {errors.rolIds.message}
              </p>
            )}
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" {...register('requiereCambioPassword')} />
            Requiere cambio de contraseña en el próximo inicio de sesión
          </label>

          {usuarioEditando && (
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
              <input type="checkbox" {...register('activo')} />
              Usuario activo
            </label>
          )}
        </form>
      </Modal>
    </div>
  );
}
