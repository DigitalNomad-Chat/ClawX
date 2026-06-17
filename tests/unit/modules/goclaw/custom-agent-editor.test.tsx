import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CustomAgentEditor } from '@/modules/goclaw/custom-agent-editor';

const mockGenerateAgentProfile = vi.fn();
vi.mock('@/lib/kernel-client', () => ({
  kernelClient: {
    generateAgentProfile: (...args: unknown[]) => mockGenerateAgentProfile(...args),
    createCustomAgent: vi.fn(() => Promise.resolve({ success: true })),
    updateCustomAgent: vi.fn(() => Promise.resolve({ success: true })),
  },
}));

describe('CustomAgentEditor', () => {
  beforeEach(() => {
    mockGenerateAgentProfile.mockReset();
  });

  it('renders form fields', () => {
    render(
      <MemoryRouter>
        <CustomAgentEditor />
      </MemoryRouter>
    );
    expect(screen.getByPlaceholderText('给 Agent 取个名字')).toBeDefined();
  });

  it('renders AI generation section', () => {
    render(
      <MemoryRouter>
        <CustomAgentEditor />
      </MemoryRouter>
    );
    expect(screen.getByText('AI 生成 Agent')).toBeDefined();
    expect(screen.getByRole('button', { name: /AI 生成配置/ })).toBeDefined();
  });

  it('fills generated profile into form', async () => {
    mockGenerateAgentProfile.mockResolvedValue({
      success: true,
      profile: {
        id: 'test-agent',
        name: '测试Agent',
        nickname: '测测',
        emoji: '🧪',
        creature: '测试专用',
        vibe: '认真',
        description: '用来测试',
        tags: ['专项'],
        scenarios: ['写测试', '跑测试'],
        soul: '你是测试Agent。',
        agents: '',
        tools: '',
        user: '',
        memory: '',
      },
    });

    render(
      <MemoryRouter>
        <CustomAgentEditor />
      </MemoryRouter>
    );

    const textarea = screen.getByPlaceholderText(/帮我生成/);
    fireEvent.change(textarea, { target: { value: '生成测试Agent' } });
    fireEvent.click(screen.getByRole('button', { name: /AI 生成配置/ }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('测试Agent')).toBeDefined();
    });
    expect(screen.getByDisplayValue('测测')).toBeDefined();
  });
});
