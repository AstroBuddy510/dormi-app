import { AgentSidebar } from "./AgentSidebar";
import { cn } from "@/lib/utils";

interface AgentLayoutProps {
  children: React.ReactNode;
  fullHeight?: boolean;
}

export function AgentLayout({ children, fullHeight = false }: AgentLayoutProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50/50">
      <AgentSidebar />
      <div className={cn(
        "flex-1 min-h-0",
        fullHeight
          ? "overflow-hidden flex flex-col p-3 md:p-5 gap-0 pb-16 md:pb-5"
          : "overflow-y-auto py-6 px-4 md:py-8 md:px-12 pb-24 md:pb-8",
      )}>
        {children}
      </div>
    </div>
  );
}
