import { beforeEach, describe, expect, it, vi } from 'vitest';

const getSkillConfigMock = vi.fn();
const getAllSkillConfigsMock = vi.fn();
const updateSkillConfigMock = vi.fn();

vi.mock('../../electron/utils/skill-config', () => ({
  getSkillConfig: (...args: unknown[]) => getSkillConfigMock(...args),
  getAllSkillConfigs: (...args: unknown[]) => getAllSkillConfigsMock(...args),
  updateSkillConfig: (...args: unknown[]) => updateSkillConfigMock(...args),
}));

describe('createSkillsApi', () => {
  beforeEach(() => {
    vi.resetModules();
    getSkillConfigMock.mockReset().mockResolvedValue({ apiKey: 'sk-***' });
    getAllSkillConfigsMock.mockReset().mockResolvedValue({});
    updateSkillConfigMock.mockReset().mockResolvedValue({ success: true });
  });

  it('getConfig requires skillKey', async () => {
    const { createSkillsApi } = await import('../../electron/services/skills-api');
    await expect(createSkillsApi().getConfig({})).rejects.toThrow(/skillKey/);
  });

  it('updateConfig forwards apiKey/env without throwing on success', async () => {
    const { createSkillsApi } = await import('../../electron/services/skills-api');
    await expect(
      createSkillsApi().updateConfig({ skillKey: 's1', apiKey: 'secret', env: { A: '1' } }),
    ).resolves.toEqual({ success: true });
    expect(updateSkillConfigMock).toHaveBeenCalledWith('s1', {
      apiKey: 'secret',
      env: { A: '1' },
    });
  });

  it('getAllConfigs delegates', async () => {
    const { createSkillsApi } = await import('../../electron/services/skills-api');
    await createSkillsApi().getAllConfigs();
    expect(getAllSkillConfigsMock).toHaveBeenCalled();
  });

  it('omits status so host:invoke can return UNSUPPORTED (HTTP-only)', async () => {
    const { createSkillsApi } = await import('../../electron/services/skills-api');
    const api = createSkillsApi() as Record<string, unknown>;
    expect(api.status).toBeUndefined();
  });
});
