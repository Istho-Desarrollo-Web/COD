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
import AreaDetalle from './pages/areas/AreaDetalle';
import DocumentosListado from './pages/documentos/DocumentosListado';
import DocumentoDetalle from './pages/documentos/DocumentoDetalle';
import CarpetasGestion from './pages/documentos/CarpetasGestion';
import ProveedoresListado from './pages/proveedores/ProveedoresListado';
import ProveedorDetalle from './pages/proveedores/ProveedorDetalle';
import ProximamentePage from './pages/proximamente/ProximamentePage';
import AdministracionInicio from './pages/administracion/AdministracionInicio';
import UsuariosListado from './pages/administracion/UsuariosListado';

const snackbarConfig = {
  maxSnack: 3,
  autoHideDuration: 3000,
  anchorOrigin: { vertical: 'bottom', horizontal: 'center' },
  preventDuplicate: true,
  dense: true,
  style: { zIndex: 99999 },
  classes: { containerRoot: 'notistack-SnackbarContainer' },
  iconVariant: { success: null, error: null, warning: null, info: null },
};

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <SnackbarProvider {...snackbarConfig}>
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
                  path="/areas/:id"
                  element={
                    <PermissionRoute modulo="areas" accion="ver">
                      <AreaDetalle />
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
                  path="/documentos/:id"
                  element={
                    <PermissionRoute modulo="documentos" accion="ver">
                      <DocumentoDetalle />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/documentos/carpetas"
                  element={
                    <PermissionRoute modulo="documentos" accion="crear">
                      <CarpetasGestion />
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
                      <ProveedoresListado />
                    </PermissionRoute>
                  }
                />
                <Route
                  path="/proveedores/:id"
                  element={
                    <PermissionRoute modulo="proveedores" accion="ver">
                      <ProveedorDetalle />
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
                <Route path="/administracion" element={<AdministracionInicio />} />
                <Route
                  path="/administracion/usuarios"
                  element={
                    <PermissionRoute modulo="usuarios" accion="ver">
                      <UsuariosListado />
                    </PermissionRoute>
                  }
                />
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
