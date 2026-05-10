// background.js v1.3 — captureVisibleTab方式

chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['overlay.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['overlay.css']
    });
    chrome.tabs.sendMessage(tab.id, { action: 'toggleOverlay' });
  } catch (e) {
    console.error('inject error:', e);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 画面共有ダイアログなしでタブをキャプチャ
  if (message.action === 'captureTab') {
    chrome.tabs.captureVisibleTab(
      sender.tab.windowId,
      { format: 'png' },
      (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          sendResponse({ success: true, dataUrl });
        }
      }
    );
    return true;
  }
});
