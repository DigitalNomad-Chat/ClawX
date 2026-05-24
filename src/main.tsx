/**
 * React Application Entry Point
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './i18n';
import './styles/globals.css';
import './styles/theme-niceai.css';
import 'katex/dist/katex.min.css';
import { initializeDefaultTransports } from './lib/api-client';
import { streamArtifactRegistry } from '@/lib/artifact/registry';
import { DocumentRenderer } from '@/components/artifact/renderers/DocumentRenderer';
import { CodeRenderer } from '@/components/artifact/renderers/CodeRenderer';
import { HtmlRenderer } from '@/components/artifact/renderers/HtmlRenderer';
import { SvgRenderer } from '@/components/artifact/renderers/SvgRenderer';
import { MermaidRenderer } from '@/components/artifact/renderers/MermaidRenderer';

initializeDefaultTransports();

function setupStreamArtifactRenderers() {
  streamArtifactRegistry.register({
    type: 'document', displayName: '文档', icon: '📄',
    component: DocumentRenderer, fileExtension: 'md',
  });
  streamArtifactRegistry.register({
    type: 'code', displayName: '代码', icon: '💻',
    component: CodeRenderer, canEdit: true, fileExtension: 'txt',
  });
  streamArtifactRegistry.register({
    type: 'html', displayName: 'HTML', icon: '🌐',
    component: HtmlRenderer, canEdit: true, fileExtension: 'html',
  });
  streamArtifactRegistry.register({
    type: 'svg', displayName: 'SVG', icon: '🎨',
    component: SvgRenderer, canEdit: true, fileExtension: 'svg',
  });
  streamArtifactRegistry.register({
    type: 'mermaid', displayName: 'Mermaid', icon: '📊',
    component: MermaidRenderer, fileExtension: 'mmd',
  });
}

setupStreamArtifactRenderers();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>,
);
