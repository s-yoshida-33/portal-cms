import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { Layout } from './components/Layout';
import { ProfileLayout } from './layouts/ProfileLayout';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { FacilityDetail } from './pages/FacilityDetail';
import { Placeholder } from './pages/Placeholder';
import { ProfileSettings } from './pages/profile/Settings';

function IndexRedirect() {
  const { user } = useAuth();
  const uuid = user?.uid ?? (import.meta.env.DEV ? 'dev' : '');
  return <Navigate to={`/${uuid}/home/overview`} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"  element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          {/* メインレイアウト */}
          <Route
            element={
              <PrivateRoute>
                <Layout />
              </PrivateRoute>
            }
          >
            <Route index element={<IndexRedirect />} />
            <Route path=":uuid">
              <Route path="home/overview" element={<Dashboard />} />
              <Route path="facilities">
                <Route index element={<Placeholder title="施設管理" />} />
                <Route path=":id" element={<FacilityDetail />} />
              </Route>
              <Route path="logs"     element={<Placeholder title="ログ" />} />
              <Route path="settings" element={<Placeholder title="設定" />} />
            </Route>
          </Route>

          {/* プロフィールレイアウト */}
          <Route
            path="profile"
            element={
              <PrivateRoute>
                <ProfileLayout />
              </PrivateRoute>
            }
          >
            <Route path="settings" element={<ProfileSettings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
