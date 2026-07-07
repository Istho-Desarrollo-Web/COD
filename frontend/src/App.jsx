import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { PrivateRoute } from './components/auth/PrivateRoute';
import { PermissionRoute } from './components/auth/PermissionRoute';
import ProtectedLayout from './components/layout/ProtectedLayout';
import Login from './pages/auth/Login';
import Dashboard from './pages/inicio/Dashboard';
import AreasListado from './pages/areas/AreasListado';
import DocumentosListado from './pages/documentos/DocumentosListado';
import ProximamentePage from './pages/proximamente/ProximamentePage';

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <SnackbarProvider maxSnack={3}>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route
                element={
                  <PrivateRoute>
                    <ProtectedLayout />
                  </PrivateRoute>
                }
              >
                <Route path="/" element={<Navigate to="/inicio" replace />} />
                <Route path="/inicio" element={<Dashboard />} />
                <Route
                  path="/areas"
                  element={
                    <PermissionRoute modulo="areas" accion="ver">
                      <AreasListado />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/documentos"
                  element={
                    <PermissionRoute modulo="documentos" accion="ver">
                      <DocumentosListado />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/solicitudes"
                  element={
                    <PermissionRoute modulo="solicitudes" accion="ver">
                      <ProximamentePage nombre="Solicitudes" />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/proveedores"
                  element={
                    <PermissionRoute modulo="proveedores" accion="ver">
                      <ProximamentePage nombre="Proveedores y contratistas" />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/formularios"
                  element={
                    <PermissionRoute modulo="formularios" accion="ver">
                      <ProximamentePage nombre="Formularios" />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/reportes"
                  element={
                    <PermissionRoute modulo="reportes" accion="ver">
                      <ProximamentePage nombre="Reportes" />
                    </PermissionRoute>
                  }
                />
                <Route path="/administracion" element={<ProximamentePage nombre="Administración" />} />
              </Route>

              <Route path="*" element={<Navigate to="/inicio" replace />} />
            </Routes>
          </BrowserRouter>
        </SnackbarProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
