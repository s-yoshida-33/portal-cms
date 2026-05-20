import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { FacilityDetail } from './pages/FacilityDetail';
import { Placeholder } from './pages/Placeholder';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="facilities">
            <Route index element={<Placeholder title="施設管理" />} />
            <Route path=":id" element={<FacilityDetail />} />
          </Route>
          <Route path="logs"     element={<Placeholder title="ログ" />} />
          <Route path="settings" element={<Placeholder title="設定" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
