import { Users, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AgentSidebarProps {
  agents: Array<{ key: string; label: string }>;
  activeKey: string;
  onChange: (key: string) => void;
  fileCounts: Record<string, number>;
}

export function AgentSidebar({ agents, activeKey, onChange, fileCounts }: AgentSidebarProps) {
  const totalFiles = Object.values(fileCounts).reduce((a, b) => a + b, 0);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="w-[220px] flex flex-col border-r bg-muted/30 shrink-0">
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b">
          智能体
        </div>
        <div className="flex-1 overflow-y-auto min-h-0">
          {agents.map((agent) => {
            const count = fileCounts[agent.key] ?? 0;
            const isActive = activeKey === agent.key;
            const isMain = agent.key === "main";
            return (
              <Tooltip key={agent.key}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onChange(agent.key)}
                    className={cn(
                      "w-full text-left px-3 py-2 flex items-center gap-2 transition-colors relative group",
                      isActive
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] bg-primary rounded-r-full" />
                    )}
                    {isMain ? (
                      <Database className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    ) : (
                      <Users className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    )}
                    <span className="text-sm truncate flex-1">{agent.label}</span>
                    {count > 0 && (
                      <span className={cn(
                        "text-xs rounded-full px-1.5 py-0.5 shrink-0 min-w-[20px] text-center transition-colors",
                        isActive
                          ? "bg-primary/20 text-primary"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {count}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {agent.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        {agents.length > 0 && (
          <div className="px-3 py-2 border-t text-xs text-muted-foreground">
            共 {agents.length} 个 · {totalFiles} 份文件
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
