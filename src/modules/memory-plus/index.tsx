import type { FrontendModule } from "../types";
import { Route } from "react-router-dom";
import { Brain } from "lucide-react";
import { MemoryPage } from "./MemoryPage";

const memoryPlusModule: FrontendModule = {
  id: "memory-plus",
  name: "记忆增强",
  routes: [
    <Route key="memory-plus" path="/memory-plus" element={<MemoryPage />} />,
  ],
  navItems: [
    {
      to: "/memory-plus",
      label: "记忆增强",
      icon: <Brain className="w-4 h-4" />,
      order: 26,
    },
  ],
  enabledByDefault: true,
};

export default memoryPlusModule;
