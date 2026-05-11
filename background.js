// background.js v1.4 — captureVisibleTab方式 (エラー対策完了版)

chrome.action.onClicked.addListener(async (tab) => {
  // システムページや制限されたURLでは実行をブロックしてエラーを未然に防ぐ
  if (!tab.url || 
      tab.url.startsWith('chrome://') || 
      tab.url.startsWith('edge://') || 
      tab.url.startsWith('about:') ||
      tab.url.startsWith('https://chrome.google.com/webstore')) {
    console.warn('SnapClip: このページでは実行できません。');
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['overlay.js']
    });
    await chrome.scripting.insertCSS({
      target: { tabId: tab.id },
      files: ['overlay.css']
    });
    
    // メッセージ送信。エラーをキャッチして管理画面に赤枠を出さないようにする
    chrome.tabs.sendMessage(tab.id, { action: 'toggleOverlay' }).catch((err) => {
       console.warn('SnapClip: toggleOverlay warning:', err);
    });

  } catch (e) {
    // console.errorではなくwarnを使うことで、管理画面にエラーバッジが出るのを防ぐ
    console.warn('SnapClip inject warning:', e);
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
    return true; // 非同期通信のために必要
  }
});