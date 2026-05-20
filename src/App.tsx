import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { Layout } from './components/Layout';
import { ProfileLayout } from './layouts/ProfileLayout';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Dashboard } from './pages/Dashboard';
import { FacilityDetail } from './pages/FacilityDetail';
import { Placeholder } from './pages/Placeholder';
import { ProfileSettings } from './pages/profile/Settings';

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
            <Route index element={<Dashboard />} />
            <Route path="facilities">
              <Route index element={<Placeholder title="施設管理" />} />
              <Route path=":id" element={<FacilityDetail />} />
            </Route>
            <Route path="logs"     element={<Placeholder title="ログ" />} />
            <Route path="settings" element={<Placeholder title="設定" />} />
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
