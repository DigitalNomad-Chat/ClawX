// renderer.js - ClawX License Admin frontend logic

const api = window.licenseAdminAPI;

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.toggle('active', b === btn));
    panels.forEach(p => p.classList.toggle('active', p.id === `panel-${tab}`));
    if (tab === 'history') loadHistory();
  });
});

// Generate
const displayCodeInput = document.getElementById('displayCode');
const factorsJsonInput = document.getElementById('factorsJson');
const editionInput = document.getElementById('edition');
const daysInput = document.getElementById('days');
const noteInput = document.getElementById('note');
const btnGenerate = document.getElementById('btnGenerate');
const resultArea = document.getElementById('resultArea');
const licenseCodeEl = document.getElementById('licenseCode');
const btnCopy = document.getElementById('btnCopy');
const btnReset = document.getElementById('btnReset');

btnGenerate.addEventListener('click', async () => {
  const displayCode = displayCodeInput.value.trim();
  const factorsText = factorsJsonInput.value.trim();
  const edition = editionInput.value;
  const days = parseInt(daysInput.value, 10);
  const note = noteInput.value.trim();

  if (!displayCode) {
    showToast('请输入机器码', 'error');
    return;
  }
  if (!factorsText) {
    showToast('请输入机器因子 JSON', 'error');
    return;
  }

  let factors;
  try {
    factors = JSON.parse(factorsText);
  } catch {
    showToast('机器因子 JSON 格式错误', 'error');
    return;
  }

  factors.displayCode = displayCode;

  btnGenerate.disabled = true;
  btnGenerate.textContent = '生成中...';

  try {
    const result = await api.generate({ factors, days, edition, note });
    if (result.success) {
      licenseCodeEl.textContent = result.license;
      resultArea.classList.remove('hidden');
      btnGenerate.classList.add('hidden');
      showToast('授权码生成成功');
    } else {
      showToast(`生成失败: ${result.error}`, 'error');
    }
  } catch (err) {
    showToast(`错误: ${String(err)}`, 'error');
  } finally {
    btnGenerate.disabled = false;
    btnGenerate.textContent = '生成授权码';
  }
});

btnCopy.addEventListener('click', async () => {
  const code = licenseCodeEl.textContent.trim();
  if (code) {
    await api.copy(code);
    showToast('已复制到剪贴板');
  }
});

btnReset.addEventListener('click', () => {
  displayCodeInput.value = '';
  factorsJsonInput.value = '';
  noteInput.value = '';
  resultArea.classList.add('hidden');
  btnGenerate.classList.remove('hidden');
  displayCodeInput.focus();
});

// History
const historyTable = document.getElementById('historyTable');
const btnRefresh = document.getElementById('btnRefresh');
const btnExport = document.getElementById('btnExport');

async function loadHistory() {
  historyTable.innerHTML = '<div class="empty-state">加载中...</div>';
  try {
    const result = await api.list();
    if (result.success) {
      renderHistory(result.records);
    } else {
      historyTable.innerHTML = `<div class="empty-state">加载失败: ${result.error}</div>`;
    }
  } catch (err) {
    historyTable.innerHTML = `<div class="empty-state">错误: ${String(err)}</div>`;
  }
}

function renderHistory(records) {
  if (!records || records.length === 0) {
    historyTable.innerHTML = '<div class="empty-state">暂无授权记录</div>';
    return;
  }

  const badgeClass = {
    standard: 'badge-standard',
    pro: 'badge-pro',
    enterprise: 'badge-enterprise',
  };

  const rows = records
    .slice()
    .reverse()
    .map(r => {
      const date = new Date(r.createdAt).toLocaleString('zh-CN');
      const editionClass = badgeClass[r.edition] || 'badge-standard';
      return `
        <tr>
          <td>${r.machine}</td>
          <td><span class="badge ${editionClass}">${r.edition}</span></td>
          <td>${r.days} 天</td>
          <td class="license-code" title="${r.license}">${r.license}</td>
          <td>${r.note || '-'}</td>
          <td>${date}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="copyLicense('${r.license}')">复制</button>
          </td>
        </tr>
      `;
    })
    .join('');

  historyTable.innerHTML = `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>机器码</th>
            <th>版本</th>
            <th>有效期</th>
            <th>授权码</th>
            <th>备注</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

window.copyLicense = async (code) => {
  await api.copy(code);
  showToast('已复制到剪贴板');
};

btnRefresh.addEventListener('click', loadHistory);

btnExport.addEventListener('click', async () => {
  const result = await api.export();
  if (result.success) {
    showToast('导出成功');
  } else if (result.error !== 'Canceled') {
    showToast(`导出失败: ${result.error}`, 'error');
  }
});

// Toast
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// Auto-focus
displayCodeInput.focus();
