import { cn } from '@/lib/utils';
import { useAppStore } from '@/stores/appStore';
import { navigationConfig } from '@/config/navigation';
import { ChevronRight } from 'lucide-react';
import { useLocation } from 'wouter';
import type { NavSubItem } from '@/types';

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

  const handleSubNavClick = (parentId: string, subItem: NavSubItem) => {
    if (subItem.children) {
      toggleMenu(subItem.id);
    } else if (subItem.path) {
      setCurrentPage(parentId);
      setCurrentSubPage(subItem.id);
      setLocation(subItem.path);
    }
  };

  const handleLeafClick = (parentId: string, leafItem: NavSubItem) => {
    if (leafItem.path) {
      setCurrentPage(parentId);
      setCurrentSubPage(leafItem.id);
      setLocation(leafItem.path);
    }
  };

  return (
    <aside 
      className={cn(
        "fixed left-0 top-0 h-screen bg-gradient-to-b from-sidebar to-background border-r border-sidebar-border z-50 transition-all duration-300 flex flex-col overflow-hidden",
        sidebarCollapsed ? "w-[50px]" : "w-[200px]"
      )}
    >
      {/* Brand */}
      <div className="shrink-0 p-2.5 border-b border-sidebar-border">
        <h1 className={cn(
          "font-bold flex items-center gap-1.5",
          sidebarCollapsed ? "text-sm justify-center" : "text-sm"
        )}>
          <img src="https://files.manuscdn.com/user_upload_by_module/session_file/310519663271388233/lrbfSYMnZzxyEVGx.png" alt="PortAI Nexus" className="w-6 h-6 object-contain shrink-0" />
          {!sidebarCollapsed && <span className="gradient-text truncate">PortAI Nexus</span>}
        </h1>
        {!sidebarCollapsed && (
          <p className="text-[9px] text-muted-foreground mt-0.5 tracking-wider">
            Industrial AI Platform
          </p>
        )}
      </div>

      {/* Navigation — scrollable area */}
      <nav className="flex-1 py-1 overflow-y-auto overflow-x-hidden sidebar-scroll">
        {navigationConfig.map((item) => (
          <div key={item.id}>
            {/* Section separator — expanded */}
            {item.section && !sidebarCollapsed && (
              <div className="px-3 pt-3 pb-1">
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-sidebar-border/60" />
                  <span className="text-[9px] text-muted-foreground/70 uppercase tracking-widest font-medium whitespace-nowrap select-none">
                    {item.section}
                  </span>
                  <div className="h-px flex-1 bg-sidebar-border/60" />
                </div>
              </div>
            )}
            {/* Section separator — collapsed */}
            {item.section && sidebarCollapsed && (
              <div className="mx-2 my-2">
                <div className="h-px bg-sidebar-border/50" />
              </div>
            )}

            {/* Main nav item (Level 1) */}
            <div
              onClick={() => handleNavClick(item)}
              className={cn(
                "flex items-center gap-2 mx-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-all duration-200 relative group",
                "hover:bg-sidebar-accent",
                currentPage === item.id && !item.children && "nav-active text-sidebar-primary",
                sidebarCollapsed && "justify-center px-0"
              )}
              title={sidebarCollapsed ? item.label : undefined}
            >
              {/* Left border indicator */}
              <div className={cn(
                "absolute left-0 top-0 bottom-0 w-[2px] bg-sidebar-primary transform scale-y-0 transition-transform duration-200",
                (currentPage === item.id || expandedMenus.includes(item.id)) && "scale-y-100"
              )} />
              
              <span className="text-sm shrink-0 leading-none">{item.icon}</span>
              
              {!sidebarCollapsed && (
                <>
                  <span className="text-xs font-medium text-sidebar-foreground group-hover:text-foreground truncate">
                    {item.label}
                  </span>
                  {item.children && (
                    <ChevronRight 
                      className={cn(
                        "ml-auto w-3 h-3 shrink-0 text-muted-foreground transition-transform duration-200",
                        expandedMenus.includes(item.id) && "rotate-90"
                      )}
                    />
                  )}
                </>
              )}
            </div>

            {/* Sub menu (Level 2) */}
            {item.children && !sidebarCollapsed && (
              <div 
                className={cn(
                  "overflow-hidden transition-all duration-300 bg-black/20",
                  expandedMenus.includes(item.id) ? "max-h-[600px] opacity-100" : "max-h-0 opacity-0"
                )}
              >
                {item.children.map((subItem) => (
                  <div key={subItem.id}>
                    {/* Level 2 item */}
                    <div
                      onClick={() => handleSubNavClick(item.id, subItem)}
                      className={cn(
                        "flex items-center gap-1.5 py-1 px-3 pl-7 cursor-pointer transition-all duration-200 text-muted-foreground",
                        "hover:text-foreground hover:bg-sidebar-accent",
                        subItem.children && "font-medium",
                        !subItem.children && currentPage === item.id && useAppStore.getState().currentSubPage === subItem.id && "text-sidebar-primary bg-sidebar-primary/10"
                      )}
                    >
                      <span className="text-xs leading-none shrink-0">{subItem.icon}</span>
                      <span className="text-[11px] truncate">{subItem.label}</span>
                      {subItem.children && (
                        <ChevronRight 
                          className={cn(
                            "ml-auto w-2.5 h-2.5 shrink-0 text-muted-foreground transition-transform duration-200",
                            expandedMenus.includes(subItem.id) && "rotate-90"
                          )}
                        />
                      )}
                    </div>

                    {/* Level 3 items */}
                    {subItem.children && (
                      <div
                        className={cn(
                          "overflow-hidden transition-all duration-300 bg-black/10",
                          expandedMenus.includes(subItem.id) ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"
                        )}
                      >
                        {subItem.children.map((leafItem) => (
                          <div
                            key={leafItem.id}
                            onClick={() => handleLeafClick(item.id, leafItem)}
                            className={cn(
                              "flex items-center gap-1.5 py-1 px-3 pl-10 cursor-pointer transition-all duration-200 text-muted-foreground",
                              "hover:text-foreground hover:bg-sidebar-accent",
                              currentPage === item.id && useAppStore.getState().currentSubPage === leafItem.id && "text-sidebar-primary bg-sidebar-primary/10"
                            )}
                          >
                            <span className="text-[10px] leading-none shrink-0">{leafItem.icon}</span>
                            <span className="text-[10px] truncate">{leafItem.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="shrink-0 p-2 border-t border-sidebar-border bg-background/50">
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
