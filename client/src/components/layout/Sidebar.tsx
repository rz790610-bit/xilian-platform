import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { navigationConfig } from '@/config/navigation';
import { ChevronRight } from 'lucide-react';
import { useLocation } from 'wouter';

export function Sidebar() {
  const { 
    sidebarCollapsed, 
    expandedMenus, 
    toggleMenu,
    currentPage,
    setCurrentPage,
    setCurrentSubPage
  } = useAppStore();
  const [, setLocation] = useLocation();

  const handleNavClick = (item: typeof navigationConfig[0]) => {
    if (item.children) {
      toggleMenu(item.id);
    } else if (item.path) {
      setCurrentPage(item.id);
      setLocation(item.path);
    }
  };

  const handleSubNavClick = (parentId: string, subItem: { id: string; path: string }) => {
    setCurrentPage(parentId);
    setCurrentSubPage(subItem.id);
    setLocation(subItem.path);
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 h-screen bg-gradient-to-b from-sidebar to-background border-r border-sidebar-border z-50 transition-all duration-300 flex flex-col",
        sidebarCollapsed ? "w-[50px]" : "w-[180px]"
      )}
    >
      {/* Brand */}
      <div className="p-2.5 border-b border-sidebar-border">
        <h1 className={cn(
          "font-bold flex items-center gap-1.5",
          sidebarCollapsed ? "text-sm justify-center" : "text-sm"
        )}>
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663271388233/dthcCVUTooiXlemp.png" alt="PortAI Nexus" className="w-6 h-6 object-contain" />
          {!sidebarCollapsed && <span className="gradient-text">PortAI Nexus</span>}
        </h1>
        {!sidebarCollapsed && (
          <p className="text-[9px] text-muted-foreground mt-0.5 tracking-wider">
            Industrial AI Platform
          </p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-1.5 overflow-y-auto">
        <div className={cn(
          "px-3 py-1.5 text-[9px] text-muted-foreground uppercase tracking-widest font-semibold",
          sidebarCollapsed && "hidden"
        )}>
          主要功能
        </div>

        {navigationConfig.map((item) => (
          <div key={item.id}>
            {/* Main nav item */}
            <div
              onClick={() => handleNavClick(item)}
              className={cn(
                "flex items-center gap-2 mx-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-all duration-300 relative overflow-hidden group",
                "hover:bg-sidebar-accent hover:translate-x-0.5",
                currentPage === item.id && !item.children && "nav-active text-sidebar-primary",
                sidebarCollapsed && "justify-center px-0"
              )}
            >
              {/* Left border indicator */}
              <div className={cn(
                "absolute left-0 top-0 bottom-0 w-[2px] bg-sidebar-primary transform scale-y-0 transition-transform duration-300",
                (currentPage === item.id || expandedMenus.includes(item.id)) && "scale-y-100"
              )} />
              
              <span className="text-sm shrink-0">{item.icon}</span>
              
              {!sidebarCollapsed && (
                <>
                  <span className="text-[11px] font-medium text-sidebar-foreground group-hover:text-foreground">
                    {item.label}
                  </span>
                  {item.children && (
                    <ChevronRight 
                      className={cn(
                        "ml-auto w-3 h-3 text-muted-foreground transition-transform duration-300",
                        expandedMenus.includes(item.id) && "rotate-90"
                      )}
                    />
                  )}
                </>
              )}
            </div>

            {/* Sub menu */}
            {item.children && !sidebarCollapsed && (
              <div 
                className={cn(
                  "overflow-hidden transition-all duration-300 bg-black/20",
                  expandedMenus.includes(item.id) ? "max-h-[300px]" : "max-h-0"
                )}
              >
                {item.children.map((subItem) => (
                  <div
                    key={subItem.id}
                    onClick={() => handleSubNavClick(item.id, subItem)}
                    className={cn(
                      "flex items-center gap-1.5 py-1.5 px-3 pl-7 cursor-pointer transition-all duration-200 text-muted-foreground text-[10px]",
                      "hover:text-foreground hover:bg-sidebar-accent",
                      currentPage === item.id && useAppStore.getState().currentSubPage === subItem.id && "text-sidebar-primary bg-sidebar-primary/10"
                    )}
                  >
                    <span className="text-[10px]">{subItem.icon}</span>
                    <span>{subItem.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border bg-background/50">
        {!sidebarCollapsed ? (
          <>
            <div className="text-[10px] text-sidebar-foreground">Llama 3.1 70B</div>
            <div className="text-[9px] text-muted-foreground">Mac Studio M3 Ultra</div>
          </>
        ) : (
          <div className="flex justify-center">
            <span className="text-sm">🦙</span>
          </div>
        )}
      </div>
    </aside>
  );
}
