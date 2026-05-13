export function initRendererAntiDebug() {
  // 检测 DevTools 打开
  setInterval(() => {
    const threshold = 160;
    const widthThreshold = window.outerWidth - window.innerWidth > threshold;
    const heightThreshold = window.outerHeight - window.innerHeight > threshold;

    if (widthThreshold || heightThreshold) {
      document.body.innerHTML = '';
      window.location.reload();
    }
  }, 1000);

  // 禁用右键菜单
  window.addEventListener('contextmenu', (e) => e.preventDefault());

  // 禁用 F12、Ctrl+Shift+I、Ctrl+Shift+J、Ctrl+U
  window.addEventListener('keydown', (e) => {
    if (
      e.key === 'F12' ||
      (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
      (e.ctrlKey && e.key === 'U')
    ) {
      e.preventDefault();
      e.stopPropagation();
    }
  });
}
