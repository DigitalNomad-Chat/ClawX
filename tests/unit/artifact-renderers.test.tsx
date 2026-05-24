import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodeRenderer } from '@/components/artifact/renderers/CodeRenderer';
import { DocumentRenderer } from '@/components/artifact/renderers/DocumentRenderer';
import { SvgRenderer } from '@/components/artifact/renderers/SvgRenderer';
import { RendererErrorBoundary } from '@/components/artifact/renderers/RendererErrorBoundary';
import type { StreamArtifact } from '@/lib/artifact/types';

function makeArtifact(overrides: Partial<StreamArtifact> = {}): StreamArtifact {
  return {
    id: 'test-id',
    type: 'code',
    title: 'Test',
    content: 'console.log("hello")',
    status: 'complete',
    meta: { language: 'javascript' },
    position: { start: 0, end: 20 },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sessionKey: 'test-session',
    ...overrides,
  };
}

describe('CodeRenderer', () => {
  it('renders code with language label', () => {
    render(<CodeRenderer artifact={makeArtifact()} />);
    expect(screen.getByText('javascript')).toBeInTheDocument();
    expect(screen.getByText('console.log("hello")')).toBeInTheDocument();
  });

  it('shows copy button', () => {
    render(<CodeRenderer artifact={makeArtifact()} />);
    expect(screen.getByText('复制')).toBeInTheDocument();
  });
});

describe('DocumentRenderer', () => {
  it('renders markdown content', () => {
    render(<DocumentRenderer artifact={makeArtifact({ type: 'document', content: '# Hello' })} />);
    expect(screen.getByRole('heading', { name: 'Hello' })).toBeInTheDocument();
  });
});

describe('SvgRenderer', () => {
  it('renders svg content', () => {
    render(<SvgRenderer artifact={makeArtifact({ type: 'svg', content: '<svg><circle cx="50" cy="50" r="40"/></svg>' })} />);
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('falls back to code for non-svg content', () => {
    render(<SvgRenderer artifact={makeArtifact({ type: 'svg', content: 'not svg' })} />);
    expect(screen.getByText('not svg')).toBeInTheDocument();
  });
});

describe('RendererErrorBoundary', () => {
  it('catches rendering errors and shows fallback', () => {
    const ThrowingComponent = () => {
      throw new Error('Test error');
    };

    render(
      <RendererErrorBoundary>
        <ThrowingComponent />
      </RendererErrorBoundary>
    );

    expect(screen.getByText('渲染失败')).toBeInTheDocument();
    expect(screen.getByText('Test error')).toBeInTheDocument();
  });
});
