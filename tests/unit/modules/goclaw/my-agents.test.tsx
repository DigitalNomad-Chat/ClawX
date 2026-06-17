import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { MyAgents } from '@/modules/goclaw/my-agents';

vi.mock('@/lib/kernel-client', () => ({
  kernelClient: {
    listCustomAgents: vi.fn().mockResolvedValue({ success: true, agents: [] }),
    deleteCustomAgent: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe('MyAgents', () => {
  it('renders empty state text', async () => {
    render(
      <MemoryRouter>
        <MyAgents />
      </MemoryRouter>
    );
    expect(await screen.findByText('暂无自定义 Agent，点击右上角创建')).toBeInTheDocument();
  });
});
