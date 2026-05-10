// overlay.js v1.3 — captureVisibleTab + 範囲トリミング
if (window.__snapclipLoaded) {
  chrome.runtime.sendMessage({ action: 'toggleOverlay' });
} else {
  window.__snapclipLoaded = true;

  // ── DOM構築 ──────────────────────────────────────────
  const root = document.createElement('div');
  root.id = 'snapclip-root';
  root.innerHTML = `
    <div id="snapclip-panel">
      <div id="snapclip-header">
        <div class="sc-logo">Snap<span>Clip</span></div>
        <button id="snapclip-close" title="閉じる">✕</button>
      </div>
      <div id="snapclip-main">
        <div id="snapclip-preview">
          <div class="sc-ph">
            <div class="sc-ph-icon">📸</div>
            <div class="sc-ph-txt">スクショがここに表示されます</div>
          </div>
          <img id="snapclip-img" alt="screenshot">
          <div class="sc-copied-badge" id="sc-copied">✓ コピー済み</div>
        </div>
        <div class="sc-btns">
          <button class="sc-btn sc-btn-capture sc-idle" id="sc-btn-capture">
            <span id="sc-cap-icon">📷</span>
            <span id="sc-cap-label">範囲を選んでスクショ</span>
          </button>
          <button class="sc-btn sc-btn-copy" id="sc-btn-copy" disabled>
            <span>📋</span><span>再コピー</span>
          </button>
          <button class="sc-btn sc-btn-clear" id="sc-btn-clear" disabled>
            <span>🗑</span><span>クリア</span>
          </button>
        </div>
        <div class="sc-toast" id="sc-toast">
          <span id="sc-toast-icon">✓</span>
          <span id="sc-toast-msg"></span>
        </div>
      </div>
      <div id="snapclip-footer">
        <div class="sc-hint">貼り付け: <span class="sc-kbd">Ctrl</span>+<span class="sc-kbd">V</span></div>
        <div class="sc-hint">ドラッグ → 範囲選択</div>
      </div>
    </div>

    <!-- 範囲選択レイヤー -->
    <div id="snapclip-selector">
      <div id="snapclip-selection">
        <div id="snapclip-sel-label">0 × 0</div>
      </div>
      <div id="snapclip-sel-hint">
        ドラッグして範囲を選択
        <small>Esc でキャンセル</small>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  // ── 要素取得 ─────────────────────────────────────────
  const panel      = root.querySelector('#snapclip-panel');
  const closeBtn   = root.querySelector('#snapclip-close');
  const preview    = root.querySelector('#snapclip-preview');
  const img        = root.querySelector('#snapclip-img');
  const copiedBadge= root.querySelector('#sc-copied');
  const btnCapture = root.querySelector('#sc-btn-capture');
  const btnCopy    = root.querySelector('#sc-btn-copy');
  const btnClear   = root.querySelector('#sc-btn-clear');
  const toast      = root.querySelector('#sc-toast');
  const toastIcon  = root.querySelector('#sc-toast-icon');
  const toastMsg   = root.querySelector('#sc-toast-msg');
  const capIcon    = root.querySelector('#sc-cap-icon');
  const capLabel   = root.querySelector('#sc-cap-label');
  const selector   = root.querySelector('#snapclip-selector');
  const selBox     = root.querySelector('#snapclip-selection');
  const selLabel   = root.querySelector('#snapclip-sel-label');
  const selHint    = root.querySelector('#snapclip-sel-hint');

  let capturedDataUrl = null;
  let toastTimer = null;

  // ── パネル表示 ────────────────────────────────────────
  requestAnimationFrame(() => panel.classList.add('sc-visible'));

  // ── ドラッグ移動 ──────────────────────────────────────
  let drag = false, dragOX = 0, dragOY = 0;
  const header = root.querySelector('#snapclip-header');
  header.addEventListener('mousedown', e => {
    drag = true;
    const r = panel.getBoundingClientRect();
    dragOX = e.clientX - r.left;
    dragOY = e.clientY - r.top;
  });
  document.addEventListener('mousemove', e => {
    if (!drag) return;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = (e.clientX - dragOX) + 'px';
    panel.style.top  = (e.clientY - dragOY) + 'px';
  });
  document.addEventListener('mouseup', () => { drag = false; });

  // ── ユーティリティ ────────────────────────────────────
  function showToast(msg, type = 'success') {
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    toast.className = `sc-toast sc-show sc-${type}`;
    toastIcon.textContent = icons[type];
    toastMsg.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.className = 'sc-toast'; }, 3500);
  }

  function setImage(dataUrl) {
    capturedDataUrl = dataUrl;
    img.src = dataUrl;
    preview.classList.add('sc-has-img');
    btnCopy.disabled = false;
    btnClear.disabled = false;
    btnCapture.classList.remove('sc-idle');
    copiedBadge.classList.remove('sc-show');
  }

  function clearImage() {
    capturedDataUrl = null;
    img.src = '';
    preview.classList.remove('sc-has-img');
    btnCopy.disabled = true;
    btnClear.disabled = true;
    btnCapture.classList.add('sc-idle');
    copiedBadge.classList.remove('sc-show');
  }

  function dataUrlToBlob(dataUrl) {
    const [header, data] = dataUrl.split(',');
    const mime = header.match(/:(.*?);/)[1];
    const bytes = atob(data);
    const arr = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  async function copyToClipboard(dataUrl) {
    const blob = dataUrlToBlob(dataUrl);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    copiedBadge.classList.add('sc-show');
  }

  // ── 範囲選択ロジック ──────────────────────────────────
  let selStart = null, selRect = null;

  function startSelector() {
    selBox.classList.remove('sc-show');
    selHint.style.display = 'block';
    selector.classList.add('sc-active');
    // パネルを一時的に非表示にしてキャプチャから除外
    panel.style.visibility = 'hidden';
  }

  function endSelector() {
    selector.classList.remove('sc-active');
    selBox.classList.remove('sc-show');
    panel.style.visibility = '';
    panel.style.pointerEvents = '';
    selStart = null;
    selRect = null;
  }

  selector.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    selStart = { x: e.clientX, y: e.clientY };
    selHint.style.display = 'none';
    selBox.style.left = e.clientX + 'px';
    selBox.style.top  = e.clientY + 'px';
    selBox.style.width  = '0';
    selBox.style.height = '0';
    selBox.classList.add('sc-show');
  });

  selector.addEventListener('mousemove', e => {
    if (!selStart) return;
    const x = Math.min(e.clientX, selStart.x);
    const y = Math.min(e.clientY, selStart.y);
    const w = Math.abs(e.clientX - selStart.x);
    const h = Math.abs(e.clientY - selStart.y);
    selBox.style.left   = x + 'px';
    selBox.style.top    = y + 'px';
    selBox.style.width  = w + 'px';
    selBox.style.height = h + 'px';
    selLabel.textContent = `${Math.round(w)} × ${Math.round(h)}`;
    selRect = { x, y, w, h };
  });

  selector.addEventListener('mouseup', async e => {
    if (!selStart || !selRect || selRect.w < 5 || selRect.h < 5) {
      endSelector();
      capIcon.textContent = '📷';
      capLabel.textContent = '範囲を選んでスクショ';
      btnCapture.disabled = false;
      if (!capturedDataUrl) btnCapture.classList.add('sc-idle');
      showToast('範囲が小さすぎます。もう一度試してください', 'info');
      return;
    }

    const rect = { ...selRect };

    // 選択UIを消してから一瞬待ち、UIが描画から消えたタイミングでキャプチャ
    selector.classList.remove('sc-active');
    selBox.classList.remove('sc-show');

    await new Promise(r => setTimeout(r, 80));

    // captureVisibleTab でタブを高解像度キャプチャ（ダイアログなし）
    const res = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'captureTab' }, resolve);
    });

    // パネルを戻す
    panel.style.visibility = '';
    panel.style.pointerEvents = '';
    selStart = null;
    selRect = null;

    if (!res || !res.success) {
      capIcon.textContent = '📷';
      capLabel.textContent = '範囲を選んでスクショ';
      btnCapture.disabled = false;
      if (!capturedDataUrl) btnCapture.classList.add('sc-idle');
      showToast('キャプチャに失敗しました: ' + (res?.error || '不明'), 'error');
      return;
    }

    try {
      // DPR（デバイスピクセル比）を考慮してトリミング
      const dpr = window.devicePixelRatio || 1;

      const fullImg = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = res.dataUrl;
      });

      // captureVisibleTab はビューポートをDPR倍で返す
      const cropX = Math.round(rect.x * dpr);
      const cropY = Math.round(rect.y * dpr);
      const cropW = Math.round(rect.w * dpr);
      const cropH = Math.round(rect.h * dpr);

      const canvas = document.createElement('canvas');
      canvas.width  = cropW;
      canvas.height = cropH;
      canvas.getContext('2d').drawImage(
        fullImg,
        cropX, cropY, cropW, cropH,
        0, 0, cropW, cropH
      );

      const dataUrl = canvas.toDataURL('image/png');
      setImage(dataUrl);
      await copyToClipboard(dataUrl);
      showToast('クリップボードにコピーしました ✓', 'success');
    } catch (err) {
      showToast('エラー: ' + err.message, 'error');
      console.error(err);
    }

    capIcon.textContent = '📷';
    capLabel.textContent = '範囲を選んでスクショ';
    btnCapture.disabled = false;
    if (!capturedDataUrl) btnCapture.classList.add('sc-idle');
  });

  // Escキャンセル
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && selector.classList.contains('sc-active')) {
      endSelector();
      capIcon.textContent = '📷';
      capLabel.textContent = '範囲を選んでスクショ';
      btnCapture.disabled = false;
      if (!capturedDataUrl) btnCapture.classList.add('sc-idle');
      showToast('キャンセルしました', 'info');
    }
  });

  // ── ボタン ────────────────────────────────────────────
  btnCapture.addEventListener('click', () => {
    btnCapture.disabled = true;
    capIcon.innerHTML = '<div class="sc-spinner"></div>';
    capLabel.textContent = 'ドラッグで範囲選択...';
    btnCapture.classList.remove('sc-idle');
    startSelector();
  });

  btnCopy.addEventListener('click', async () => {
    if (!capturedDataUrl) return;
    try {
      await copyToClipboard(capturedDataUrl);
      showToast('コピーしました！Ctrl+V で貼り付け', 'success');
    } catch (err) {
      showToast('コピー失敗: ' + err.message, 'error');
    }
  });

  btnClear.addEventListener('click', () => {
    clearImage();
    showToast('クリアしました', 'info');
  });

  closeBtn.addEventListener('click', () => {
    panel.classList.remove('sc-visible');
    setTimeout(() => {
      root.remove();
      window.__snapclipLoaded = false;
    }, 300);
  });

  // background.jsからのメッセージ
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'toggleOverlay') {
      panel.classList.toggle('sc-visible');
    }
    if (message.action === 'destroyOverlay') {
      root.remove();
      window.__snapclipLoaded = false;
    }
  });
}
