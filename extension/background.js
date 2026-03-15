// ==================== Toxic Analyzer v3 - Background ====================

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ enabled: true });
  console.log("Toxic Analyzer v3 installed. Default = enabled.");
});

// Lắng nghe message từ content / popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  try {
    // Bật / tắt phân tích
    if (msg.type === "FILTER_TOGGLE") {
      chrome.storage.local.set({ enabled: msg.enabled }, () => {
        sendResponse({ ok: true });
      });
    }

    // Cập nhật thống kê từ content script
    else if (msg.type === "TOXIC_STATS") {
      if (sender.tab && sender.tab.id != null) {
        const key = "stats_tab_" + sender.tab.id;
        chrome.storage.local.set({ [key]: msg.stats }, () => {
          // không cần sendResponse
        });
      }
    }

    // Popup yêu cầu lấy thống kê
    else if (msg.type === "GET_STATS") {
      const key = "stats_tab_" + msg.tabId;
      chrome.storage.local.get(key, (result) => {
        sendResponse({ stats: result[key] || null });
      });
    }
  } catch (err) {
    console.warn("Background error:", err);
  }

  // Giữ channel mở cho các call async (chrome.storage)
  return true;
});