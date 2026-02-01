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
        sidebarCollapsed ? "w-[60px]" : "w-[220px]"
      )}
    >
      {/* Brand */}
      <div className="p-4 border-b border-sidebar-border">
        <h1 className={cn(
          "font-bold flex items-center gap-2",
          sidebarCollapsed ? "text-base justify-center" : "text-base"
        )}>
          <span className="animate-float">⚡</span>
          {!sidebarCollapsed && <span className="gradient-text">西联平台</span>}
        </h1>
        {!sidebarCollapsed && (
          <p className="text-[10px] text-muted-foreground mt-1 tracking-wider">
            工业智能诊断系统
          </p>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-2 overflow-y-auto">
        <div className={cn(
          "px-4 py-2 text-[0.6rem] text-muted-foreground uppercase tracking-widest font-semibold",
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
                "flex items-center gap-2.5 mx-2 px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-300 relative overflow-hidden group",
                "hover:bg-sidebar-accent hover:translate-x-1",
                currentPage === item.id && !item.children && "nav-active text-sidebar-primary",
                sidebarCollapsed && "justify-center px-0"
              )}
            >
              {/* Left border indicator */}
              <div className={cn(
                "absolute left-0 top-0 bottom-0 w-[3px] bg-sidebar-primary transform scale-y-0 transition-transform duration-300",
                (currentPage === item.id || expandedMenus.includes(item.id)) && "scale-y-100"
              )} />
              
              <span className="text-base shrink-0">{item.icon}</span>
              
              {!sidebarCollapsed && (
                <>
                  <span className="text-xs font-medium text-sidebar-foreground group-hover:text-foreground">
                    {item.label}
                  </span>
                  {item.children && (
                    <ChevronRight 
                      className={cn(
                        "ml-auto w-4 h-4 text-muted-foreground transition-transform duration-300",
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
                      "flex items-center gap-2 py-2 px-4 pl-9 cursor-pointer transition-all duration-200 text-muted-foreground text-xs",
                      "hover:text-foreground hover:bg-sidebar-accent",
                      currentPage === item.id && useAppStore.getState().currentSubPage === subItem.id && "text-sidebar-primary bg-sidebar-primary/10"
                    )}
                  >
                    <span className="text-xs">{subItem.icon}</span>
                    <span>{subItem.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-sidebar-border bg-background/50">
        {!sidebarCollapsed ? (
          <>
            <div className="text-xs text-sidebar-foreground">Llama 3.1 70B</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Mac Studio M3 Ultra</div>
          </>
        ) : (
          <div className="flex justify-center">
            <span className="text-lg">🦙</span>
          </div>
        )}
      </div>
    </aside>
  );
}
