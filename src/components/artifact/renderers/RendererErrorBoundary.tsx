import React from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class RendererErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ArtifactRenderer] Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="p-4 rounded border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800">
            <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-2">
              渲染失败
            </h4>
            <pre className="text-xs text-red-600 dark:text-red-300 whitespace-pre-wrap">
              {this.state.error?.message}
            </pre>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-3 px-3 py-1 text-xs rounded bg-red-100 hover:bg-red-200 dark:bg-red-800 dark:hover:bg-red-700 text-red-700 dark:text-red-300"
            >
              重试
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
