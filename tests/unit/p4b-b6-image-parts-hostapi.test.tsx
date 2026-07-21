import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImageLightbox } from '@/components/chat-message-parts/ImageParts';
import { hostApi } from '@/lib/host-api';

vi.mock('@/lib/host-api', () => ({
  hostApi: {
    shell: { showItemInFolder: vi.fn() },
  },
}));

describe('P4b-B6 ImageParts media periphery', () => {
  beforeEach(() => {
    vi.mocked(hostApi.shell.showItemInFolder).mockReset();
  });

  it('uses hostApi.shell.showItemInFolder in the lightbox reveal button', () => {
    vi.mocked(hostApi.shell.showItemInFolder).mockResolvedValueOnce(undefined);

    render(
      <ImageLightbox
        src="data:image/png;base64,abc"
        fileName="test.png"
        filePath="/tmp/test.png"
        onClose={vi.fn()}
      />,
    );

    const revealButton = screen.getByTitle('在文件夹中显示');
    fireEvent.click(revealButton);

    expect(hostApi.shell.showItemInFolder).toHaveBeenCalledWith('/tmp/test.png');
  });
});
