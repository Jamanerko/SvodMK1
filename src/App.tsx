import { useEffect, useState } from 'react';
import { LayoutDashboard, MapPin, Package, ClipboardList, Truck, FileText, Users, Warehouse, History } from 'lucide-react';
import Dashboard from '@/pages/Dashboard';
import Objects from '@/pages/Objects';
import Materials from '@/pages/Materials';
import Requirements from '@/pages/Requirements';
import WarehouseReceipts from '@/pages/WarehouseReceipts';
import PurchaseRequests from '@/pages/PurchaseRequests';
import WarehouseIssues from '@/pages/WarehouseIssues';
import Contractors from '@/pages/Contractors';
import Corrections from '@/pages/Corrections';
import ContractorPortal from '@/pages/ContractorPortal';

export type PageKey =
  | 'dashboard'
  | 'objects'
  | 'materials'
  | 'requirements'
  | 'corrections'
  | 'receipts'
  | 'purchase-requests'
  | 'issues'
  | 'contractors'
  | 'contractor-portal';

interface NavItem {
  key: PageKey;
  label: string;
  icon: typeof LayoutDashboard;
  group: string;
}

const NAV: NavItem[] = [
  { key: 'dashboard', label: 'Дашборд', icon: LayoutDashboard, group: 'Обзор' },
  { key: 'objects', label: 'Объекты', icon: MapPin, group: 'Справочники' },
  { key: 'materials', label: 'Материалы', icon: Package, group: 'Справочники' },
  { key: 'contractors', label: 'Подрядчики', icon: Users, group: 'Справочники' },
  { key: 'requirements', label: 'Потребность', icon: ClipboardList, group: 'Проект' },
  { key: 'corrections', label: 'Корректировки', icon: History, group: 'Проект' },
  { key: 'receipts', label: 'Приход на склад', icon: Warehouse, group: 'Склад' },
  { key: 'issues', label: 'Выдача подрядчикам', icon: Truck, group: 'Склад' },
  { key: 'purchase-requests', label: 'Заявки на закуп', icon: FileText, group: 'Закупки' },
  { key: 'contractor-portal', label: 'Кабинет подрядчика', icon: Users, group: 'Сервис' },
];

function App() {
  const [page, setPage] = useState<PageKey>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setPage(page);
  }, [page]);

  const groups = [...new Set(NAV.map((n) => n.group))];

  const renderPage = () => {
    switch (page) {
      case 'dashboard':
        return <Dashboard />;
      case 'objects':
        return <Objects />;
      case 'materials':
        return <Materials />;
      case 'requirements':
        return <Requirements />;
      case 'corrections':
        return <Corrections />;
      case 'receipts':
        return <WarehouseReceipts />;
      case 'purchase-requests':
        return <PurchaseRequests />;
      case 'issues':
        return <WarehouseIssues />;
      case 'contractors':
        return <Contractors />;
      case 'contractor-portal':
        return <ContractorPortal />;
      default:
        return <Dashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-slate-900 text-slate-300 flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-blue-600 flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">СМК-Строй</div>
            <div className="text-xs text-slate-400">Управление материалами</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-4">
          {groups.map((group) => (
            <div key={group}>
              <div className="text-xs uppercase tracking-wider text-slate-500 px-2 mb-1.5 font-medium">
                {group}
              </div>
              <div className="space-y-0.5">
                {NAV.filter((n) => n.group === group).map((item) => {
                  const Icon = item.icon;
                  const active = page === item.key;
                  return (
                    <button
                      key={item.key}
                      onClick={() => {
                        setPage(item.key);
                        setSidebarOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                        active
                          ? 'bg-blue-600 text-white'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-slate-700 text-xs text-slate-500">
          Склад: г. Каражал
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
          >
            <LayoutDashboard className="w-5 h-5 text-slate-600" />
          </button>
          <h1 className="text-lg font-semibold text-slate-800 hidden sm:block">
            {NAV.find((n) => n.key === page)?.label}
          </h1>
          <div className="text-sm text-slate-500">
            {new Date().toLocaleDateString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-x-hidden">{renderPage()}</main>
      </div>
    </div>
  );
}

export default App;
