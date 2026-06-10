import type { FrontendModule } from "../types";
import { Route } from "react-router-dom";
import { FileText } from "lucide-react";
import { DocumentsPage } from "./DocumentsPage";

const documentsModule: FrontendModule = {
  id: "documents",
  name: "人设管理",
  routes: [
    <Route key="documents" path="/documents" element={<DocumentsPage />} />,
  ],
  navItems: [
    {
      to: "/documents",
      label: "人设管理",
      icon: <FileText className="w-4 h-4" />,
      order: 25,
    },
  ],
  enabledByDefault: true,
};

export default documentsModule;
