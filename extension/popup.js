document.addEventListener("DOMContentLoaded", () => {
  // --- DOM ELEMENTS ---
  const lockScreen = document.getElementById("lock-screen");
  const mainApp = document.getElementById("main-app");
  const lockInput = document.getElementById("lock-input");
  const btnUnlock = document.getElementById("btn-unlock");
  const lockError = document.getElementById("lock-error");

  const btnToggle = document.getElementById("toggle");
  const btnClear = document.getElementById("clear-data");
  const btnPass = document.getElementById("btn-password");
  const levelSelect = document.getElementById("level-select");
  const statusEl = document.getElementById("status");
  const summaryEl = document.getElementById("summary");
  const barFillEl = document.getElementById("chart-bar-fill");
  const barTextEl = document.getElementById("chart-bar-text");
  const pieEl = document.getElementById("chart-pie");

  // --- STATE ---
  let savedPassword = null;

  // --- 1. KHỞI TẠO ỨNG DỤNG ---
  chrome.storage.local.get({ enabled: true, level: "teen", password: null }, (data) => {
      savedPassword = data.password;
      updateToggleUI(data.enabled);
      if (data.level) levelSelect.value = data.level; 
      else levelSelect.value = "teen";

      if (savedPassword) {
          showScreen("lock");
          btnPass.textContent = "🔑 Đổi mật khẩu";
      } else {
          showScreen("main");
          btnPass.textContent = "➕ Tạo mật khẩu bảo vệ";
      }
  });

  // --- 2. LOGIC MÀN HÌNH KHÓA ---
  function showScreen(screenName) {
      if (screenName === "lock") {
          lockScreen.classList.remove("hidden");
          mainApp.classList.add("hidden");
          lockInput.value = "";
          lockInput.focus();
      } else {
          lockScreen.classList.add("hidden");
          mainApp.classList.remove("hidden");
          fetchLiveStats();
          setInterval(fetchLiveStats, 1000);
      }
  }

  btnUnlock.addEventListener("click", () => checkPassword());
  lockInput.addEventListener("keypress", (e) => { if (e.key === "Enter") checkPassword(); });

  function checkPassword() {
      if (lockInput.value === savedPassword) {
          showScreen("main");
          lockError.textContent = "";
      } else {
          lockError.textContent = "❌ Mật khẩu không đúng!";
          lockInput.classList.add("shake");
          setTimeout(() => lockInput.classList.remove("shake"), 300);
      }
  }

  // --- 3. LOGIC CÀI ĐẶT ---
  levelSelect.addEventListener("change", (e) => {
      const newLevel = e.target.value;
      chrome.storage.local.set({ level: newLevel }, () => {
          sendMessageToTabs({ type: "UPDATE_SETTINGS", level: newLevel });
      });
  });

  btnPass.addEventListener("click", () => {
      const newPass = prompt("Nhập mật khẩu mới (Để trống để xóa mật khẩu):");
      if (newPass !== null) {
          const savePass = newPass.trim() === "" ? null : newPass;
          chrome.storage.local.set({ password: savePass }, () => {
              savedPassword = savePass;
              alert(savePass ? "✅ Đã cập nhật mật khẩu!" : "⚠️ Đã xóa mật khẩu bảo vệ!");
              btnPass.textContent = savePass ? "🔑 Đổi mật khẩu" : "➕ Tạo mật khẩu bảo vệ";
          });
      }
  });

  btnToggle.addEventListener("click", () => {
      chrome.storage.local.get({ enabled: true }, (data) => {
          const newState = !data.enabled;
          chrome.storage.local.set({ enabled: newState }, () => {
              updateToggleUI(newState);
              sendMessageToTabs({ type: "UPDATE_SETTINGS", enabled: newState });
          });
      });
  });

  btnClear.addEventListener("click", () => {
      if(confirm("Xóa dữ liệu & Quét lại?")) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: "CMD_RESET_ALL" });
          });
          renderStats(null);
      }
  });

  // --- 4. RENDER STATS (ĐÃ SỬA) ---
  function renderStats(stats) {
      const safeStats = stats || { postsAnalyzed: 0, toxicPosts: 0, totalComments: 0, toxicComments: 0 };
      const { postsAnalyzed, toxicPosts, totalComments, toxicComments } = safeStats;
      
      const toxicCmtPercent = totalComments > 0 ? ((toxicComments / totalComments) * 100).toFixed(1) : "0.0";
      
      // [CHỈNH SỬA Ở ĐÂY] Chỉ hiện số lượng bài viết, không hiện số Toxic
      summaryEl.innerHTML = `
          <div style="margin-bottom:4px">📝 <b>Bài viết:</b> ${postsAnalyzed}</div>
          <div>💬 <b>Bình luận:</b> ${totalComments} (${toxicComments} Toxic)</div>
      `;
      
      barFillEl.style.width = `${toxicCmtPercent}%`;
      barTextEl.textContent = `${toxicCmtPercent}%`;
      
      const deg = (toxicComments / (totalComments || 1)) * 360;
      pieEl.style.background = `conic-gradient(#dc3545 0deg, #dc3545 ${deg}deg, #eee ${deg}deg, #eee 360deg)`;
  }

  function updateToggleUI(enabled) {
      if (enabled) {
          btnToggle.textContent = "TẮT PHÂN TÍCH"; btnToggle.className = "on";
          statusEl.innerHTML = "Trạng thái: <span style='color:#198754'>Đang chạy</span>";
      } else {
          btnToggle.textContent = "BẬT PHÂN TÍCH"; btnToggle.className = "off";
          statusEl.innerHTML = "Trạng thái: <span style='color:#dc3545'>Đang tắt</span>";
      }
  }

  function sendMessageToTabs(payload) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, payload, () => {
                  if(chrome.runtime.lastError) {/* Ignore */}
              });
          }
      });
  }

  function fetchLiveStats() {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0] && tabs[0].id) {
              chrome.tabs.sendMessage(tabs[0].id, { type: "PING_STATS" }, (response) => {
                  if (chrome.runtime.lastError) return;
                  if (response && response.stats) renderStats(response.stats);
              });
          }
      });
  }
});	