import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { useAuth } from './contexts/AuthContext';
import { PrivateRoute } from './components/PrivateRoute';
import { Layout } from './components/Layout';
import { ProfileLayout } from './layouts/ProfileLayout';
import { Login } from './pages/Login';
import { Signup } from './pages/Signup';
import { Home } from './pages/Home';
import { ProjectDetail } from './pages/ProjectDetail';
import { Projects } from './pages/Projects';
import { DeletionRequests } from './pages/DeletionRequests';
import { UserManagement } from './pages/UserManagement';
import { ApiTokens } from './pages/ApiTokens';
import { PendingDevices } from './pages/PendingDevices';
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
              <Route path="home/overview" element={<Home />} />
              <Route path="projects">
                <Route index element={<Projects />} />
                <Route path=":id" element={<ProjectDetail />} />
              </Route>
              <Route path="deletion-requests" element={<DeletionRequests />} />
              <Route path="users"            element={<UserManagement />} />
              <Route path="api-tokens"        element={<ApiTokens />} />
              <Route path="pending-devices"  element={<PendingDevices />} />
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
