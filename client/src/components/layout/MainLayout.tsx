import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';

interface MainLayoutProps {
  children: React.ReactNode;
  title: string;
}

export function MainLayout({ children, title }: MainLayoutProps) {
  const { sidebarCollapsed } = useAppStore();

  return (
    <div className="min-h-screen bg-background">
      {/* Background gradient effect */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute top-0 left-0 w-1/2 h-1/2 bg-gradient-radial from-primary/10 to-transparent opacity-50" />
        <div className="absolute bottom-0 right-0 w-1/2 h-1/2 bg-gradient-radial from-purple/8 to-transparent opacity-50" />
      </div>

      <Sidebar />

      <main 
        className={cn(
          "min-h-screen flex flex-col transition-all duration-300 relative z-10",
          sidebarCollapsed ? "ml-[50px]" : "ml-[200px]"
        )}
      >
        <Topbar title={title} />
        <div className="flex-1 p-3 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
