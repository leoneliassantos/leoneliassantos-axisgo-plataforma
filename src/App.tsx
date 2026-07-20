import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProtectedRoute } from './components/ProtectedRoute'
import { AppLayout } from './components/AppLayout'
import { Login } from './pages/Login'
import { Hub } from './pages/Hub'
import { ComercialHome } from './pages/comercial/ComercialHome'
import { OperacoesHome } from './pages/operacoes/OperacoesHome'
import { FinanceiroLayout } from './pages/financeiro/FinanceiroLayout'
import { DRE } from './pages/financeiro/DRE'
import { Rentabilidade } from './pages/financeiro/Rentabilidade'
import { Indicadores } from './pages/financeiro/Indicadores'
import { Usuarios } from './pages/admin/Usuarios'
import { MeuPerfil } from './pages/MeuPerfil'

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
            <Route path="comercial" element={<ComercialHome />} />
            <Route path="operacoes" element={<OperacoesHome />} />

            <Route path="financeiro" element={<FinanceiroLayout />}>
              <Route index element={<Navigate to="dre" replace />} />
              <Route path="dre" element={<DRE />} />
              <Route path="rentabilidade" element={<Rentabilidade />} />
              <Route path="indicadores" element={<Indicadores />} />
            </Route>

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
