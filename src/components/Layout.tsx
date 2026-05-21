import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Footer } from './Footer';

export function Layout() {
  return (
    <div className="flex min-h-screen bg-black">
      <Sidebar />
      <main className="flex-1 flex flex-col overflow-auto">
        <div className="flex-1">
          <Outlet />
        </div>
        <Footer />
      </main>
    </div>
  );
}
