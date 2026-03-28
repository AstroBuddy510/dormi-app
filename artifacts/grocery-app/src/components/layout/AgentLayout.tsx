import { AgentSidebar } from "./AgentSidebar";

interface AgentLayoutProps {
  children: React.ReactNode;
}

export function AgentLayout({ children }: AgentLayoutProps) {
  return (
    <div className="flex min-h-screen bg-gray-50/50">
      <AgentSidebar />
      <div className="flex-1 overflow-auto py-6 px-4 md:py-8 md:px-12 pb-24 md:pb-8">
        {children}
      </div>
    </div>
  );
}
