import { AgentSidebar } from "./AgentSidebar";

interface AgentLayoutProps {
  children: React.ReactNode;
}

export function AgentLayout({ children }: AgentLayoutProps) {
  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AgentSidebar />
      <div className="flex-1 p-6 md:p-8 overflow-auto">
        {children}
      </div>
    </div>
  );
}
