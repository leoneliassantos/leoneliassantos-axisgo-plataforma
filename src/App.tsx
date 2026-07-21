import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { FrenteLayout } from './components/FrenteLayout'
import { Login } from './pages/Login'
import { Hub } from './pages/Hub'
import { Usuarios } from './pages/admin/Usuarios'
import { MeuPerfil } from './pages/MeuPerfil'
import { FRENTES } from './modules/registry'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route
            element={
              <ProtectedRoute>
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Hub />} />

            {/* Frentes e módulos gerados a partir do painel de montagem (registry) */}
            {FRENTES.map((frente) => (
              <Route key={frente.slug} path={frente.slug} element={<FrenteLayout frente={frente} />}>
                <Route index element={<Navigate to={frente.modulos[0].slug} replace />} />
                {frente.modulos.map((modulo) => (
                  <Route key={modulo.slug} path={modulo.slug} element={modulo.element} />
                ))}
              </Route>
            ))}

            <Route path="perfil" element={<MeuPerfil />} />

            <Route
              path="admin/usuarios"
              element={
                <ProtectedRoute requireAdmin>
                  <Usuarios />
                </ProtectedRoute>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
