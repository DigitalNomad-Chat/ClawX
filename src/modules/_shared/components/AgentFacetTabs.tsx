interface AgentFacetTabsProps {
  agents: Array<{ key: string; label: string }>;
  activeKey: string;
  onChange: (key: string) => void;
  includeAll?: boolean;
}

export function AgentFacetTabs({ agents, activeKey, onChange, includeAll = false }: AgentFacetTabsProps) {
  const tabs = includeAll ? [{ key: "all", label: "全部" }, ...agents] : agents;
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      {tabs.map((agent) => (
        <button
          key={agent.key}
          onClick={() => onChange(agent.key)}
          className={`px-3 py-1.5 text-sm rounded-md transition-colors whitespace-nowrap ${
            activeKey === agent.key
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          {agent.label}
        </button>
      ))}
    </div>
  );
}
