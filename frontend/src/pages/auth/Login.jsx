import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/common/Button/Button';
import Input from '../../components/common/Input/Input';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [errorApi, setErrorApi] = useState('');
  const [enviando, setEnviando] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm();

  async function onSubmit({ username, password }) {
    setErrorApi('');
    setEnviando(true);
    try {
      await login(username, password);
      const destino = location.state?.from?.pathname || '/inicio';
      navigate(destino, { replace: true });
    } catch (error) {
      setErrorApi(error?.message || 'Usuario o contraseña incorrectos');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-centhrix-bg dark:to-centhrix-bg px-4">
      <div className="w-full max-w-sm bg-white dark:bg-centhrix-card rounded-2xl shadow-lg border border-gray-100 dark:border-slate-700 p-8">
        <h1 className="text-2xl font-display font-bold text-slate-800 dark:text-slate-100 mb-1 text-center">COD</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-6">Centro Operativo Documental</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <Input label="Usuario" error={errors.username?.message} {...register('username', { required: 'El usuario es obligatorio' })} />
          <Input
            label="Contraseña"
            type="password"
            error={errors.password?.message}
            {...register('password', { required: 'La contraseña es obligatoria' })}
          />

          {errorApi && (
            <p role="alert" className="text-sm text-red-500">
              {errorApi}
            </p>
          )}

          <Button type="submit" fullWidth loading={enviando}>
            Ingresar
          </Button>
        </form>
      </div>
    </div>
  );
}
