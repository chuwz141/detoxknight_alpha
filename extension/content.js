(function () {
  if (window.__DetoXKnightLoaded) return;
  window.__DetoXKnightLoaded = true;
  console.log("DetoXKnight v5.0 - Loaded");

  // --- 1. CẤU HÌNH & LOCAL RULES ---
  const MAX_CONCURRENT = 4;
  
  const KEYWORD_BLACKLIST = [
      "cờ bạc", "tài xỉu", "bet88", "nhà cái", "lô đề", "soi cầu", 
      "sex", "lột đồ", "clip nóng", "link ngon", "lộ clip",
      "tuyển dụng việc nhẹ", "hoa hồng cao", "kiếm tiền online", "ib zalo"
  ];

  const LEVEL_NAMES = {
      "child": "Trẻ em 🛡️",
      "teen": "Thiếu niên ⚖️",
      "adult": "Người lớn 👀"
  };

  const spamTracker = new Map(); 
  let USER_SETTINGS = { enabled: true, level: "teen", passwordHash: null };

  try {
      chrome.storage.local.get(['enabled', 'level'], (items) => {
          if(items.enabled !== undefined) USER_SETTINGS.enabled = items.enabled;
          if(items.level) USER_SETTINGS.level = items.level;
      });
  } catch(e) {}

  const style = document.createElement('style');
  style.textContent = `
      .toxic-cmt-pill { display: inline-flex; align-items: center; gap: 4px; margin-left: 6px; padding: 2px 6px; border-radius: 10px; font-size: 10px; font-weight: 600; cursor: default; white-space: nowrap; vertical-align: middle; box-shadow: 0 1px 2px rgba(0,0,0,0.05); opacity: 0.9; }
      .toxic-icon { font-size: 11px; }
      .toxic-post-bar { display: flex; align-items: center; gap: 12px; margin-top: 8px; margin-bottom: 4px; padding: 6px 12px; background: #f0f2f5; border-radius: 8px; font-size: 12px; color: #65676b; }
      
      .toxic-hidden-placeholder {
          font-size: 11px; color: #dc3545; font-style: italic; font-weight: 500;
          background: #fff5f5; padding: 3px 10px; border-radius: 12px;
          display: inline-block; border: 1px solid #ffcdd2; cursor: not-allowed; margin-top: 2px;
      }
      .toxic-level-tag {
          font-size: 9px; text-transform: uppercase; margin-left: 5px; 
          padding: 1px 4px; border-radius: 4px; background: #ffebee; color: #b71c1c; border: 1px solid #ffcdd2;
      }
      .toxic-gone { display: none !important; }
  `;
  document.head.appendChild(style);

  // --- 2. BIẾN HỆ THỐNG ---
  let ramCache = new Map();
  const nodeQueue = []; 
  let activeRequests = 0;
  let globalStats = { postsAnalyzed: 0, toxicPosts: 0, totalComments: 0, toxicComments: 0 };

  // --- 3. CACHE & API ---
  function loadCache() {
    try {
        chrome.storage.local.get(null, (items) => {
          Object.keys(items).forEach(key => { if (key.startsWith("toxic_cache_")) ramCache.set(key.replace("toxic_cache_", ""), items[key]); });
        });
    } catch(e) {}
  }
  loadCache();

  function saveToDisk(text, result) { try { chrome.storage.local.set({ ["toxic_cache_" + text]: result }); } catch (e) {} }

  function parseData(res) {
      if (!res) return null;
      let data = Array.isArray(res) ? (Array.isArray(res[0]) ? res[0][0] : res[0]) : res;
      let label = data.label || data.class || "neutral";
      const labelMap = { "LABEL_0": "neutral", "LABEL_1": "Toxic" };
      if (labelMap[label]) label = labelMap[label];
      let score = data.score || data.prob || data.probability || 0;
      if (Array.isArray(data.probabilities)) score = Math.max(...data.probabilities);
      return { label: String(label), score: Number(score) };
  }

  const fetchWithTimeout = (url, body, timeout = 12000) => {
      return Promise.race([
          fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeout))
      ]);
  };

  // --- 4. ENGINE XỬ LÝ ---
  function processQueue() {
    if (activeRequests >= MAX_CONCURRENT || nodeQueue.length === 0) return;

    const node = nodeQueue.shift();
    if (!node.isConnected) { processQueue(); return; }

    const text = node.dataset.cboxOcrText || node.innerText;
    let type = node.dataset.cboxType || 'unknown';
    const key = text.trim();

    if (!text || text.length < 2) { 
        processQueue();
        return;
    }

    if (ramCache.has(key)) {
        applyResult(node, type, ramCache.get(key));
        processQueue(); 
        return;
    }

    activeRequests++;
    
    fetchWithTimeout("https://vijjj1-toxic-comment-app.hf.space/predict", { comment: text })
    .then(r => r.json())
    .catch(() => null)
    .then(toxicRes => {
        if (!toxicRes) return null;
        const cleanToxic = parseData(toxicRes);
        return { toxic: cleanToxic };
    })
    .then((result) => {
        if (result) {
            saveToDisk(key, result);
            ramCache.set(key, result);
            applyResult(node, type, result);
        }
    })
    .finally(() => {
        activeRequests--;
        processQueue(); 
    });
  }

  function applyResult(node, type, result) {
      updateStats(result, type);
      const check = checkAIRules(result);
      if (check.block) {
          const reason = type === 'image_ocr' ? `Ảnh độc hại` : check.reason;
          replaceContent(node, type, reason);
          node.dataset.cboxStatus = "blocked";
      } else {
          if (type !== 'image_ocr') {
              injectBadge(node, result, type);
          }
          node.dataset.cboxStatus = "processed";
      }
  }

  // --- 5. LOGIC KIỂM TRA ---
  function checkLocalRules(text, type, node) {
      const lowerText = text.toLowerCase();
      if (type === 'comment' && (lowerText.includes('http') || lowerText.includes('www.') || lowerText.includes('.com') || lowerText.includes('zalo.me'))) {
          const commentContainer = node.closest('div[role="article"]') || node.closest('li');
          if (commentContainer) {
              const containerText = commentContainer.innerText;
              if (containerText.includes("Tác giả") || containerText.includes("Author") || containerText.includes("Quản trị viên")) return { block: false };
          }
          return { block: true, reason: "Link nghi vấn" };
      }
      for (const kw of KEYWORD_BLACKLIST) if (lowerText.includes(kw)) return { block: true, reason: `Cấm: "${kw}"` };
      
      if (type === 'comment' && text.length > 8) { 
          let count = spamTracker.get(text) || 0;
          if (count >= 2) return { block: true, reason: "Spam lặp lại" };
          spamTracker.set(text, count + 1);
      }
      return { block: false };
  }

  function checkAIRules(result) {
      if (!result || !result.toxic) return { block: false };
      
      const toxicLabel = result.toxic.label;
      const toxicScore = result.toxic.score || 0;
      const level = USER_SETTINGS.level;

      if (level === "child") {
          if (toxicLabel === "Toxic" && toxicScore > 0.5) return { block: true, reason: `Độc hại ${(toxicScore*100).toFixed(0)}%` };
      }
      if (level === "teen") {
          if (toxicLabel === "Toxic" && toxicScore > 0.64) return { block: true, reason: `Độc hại ${(toxicScore*100).toFixed(0)}%` };
      }
      if (level === "adult") {
          if (toxicLabel === "Toxic" && toxicScore > 0.89) return { block: true, reason: `Cực độc ${(toxicScore*100).toFixed(0)}%` };
      }
      return { block: false };
  }

  // --- 6. DOM MANIPULATION ---
  function replaceContent(node, type, reason = "Nội dung độc hại") {
      let target = node;
      if (type === 'post') {
          target = node;
      } else if (type === 'image_ocr') {
          target = node.closest('div[role="article"]') || node.closest('a') || node;
      } else {
          const wrapper = node.closest('li') || node.closest('div[aria-label*="Bình luận"]');
          if (wrapper) target = wrapper;
      }

      target.style.display = "none";
      target.dataset.cboxHidden = "true";
      globalStats.blockedCount++;

      const ph = document.createElement("div");
      ph.style.cssText = "padding:6px 12px;margin:4px 0;background:#fff5f5;border:1px solid #ffcdd2;border-radius:8px;font-size:12px;";
      ph.innerHTML = `<span class="mask-text"><b style="font-family:monospace;letter-spacing:2px">***************</b><br><span style="color:#c62828;font-size:11px">${reason}</span></span> <button style="margin-left:8px;padding:1px 8px;border:1px solid #ccc;border-radius:4px;background:#fff;cursor:pointer;font-size:11px">Xem</button>`;
      const mask = ph.querySelector(".mask-text"), btn = ph.querySelector("button");
      btn.onclick = () => {
          const hidden = target.style.display === "none";
          target.style.display = hidden ? "" : "none";
          mask.style.display = hidden ? "none" : "";
          btn.textContent = hidden ? "Ẩn" : "Xem";
      };
      target.parentNode.insertBefore(ph, target);
  }

  function updateStats(result, type) {
      if (!result) return;
      if (type === 'post' || type === 'image_ocr') { globalStats.postsAnalyzed++; if(result.toxic?.label==="Toxic") globalStats.toxicPosts++; } 
      else { globalStats.totalComments++; if(result.toxic?.label==="Toxic") globalStats.toxicComments++; }
  }

  function injectBadge(node, result, type) {
      if (node.style.display === 'none' || node.closest('.toxic-gone') || node.querySelector(".toxic-cmt-pill") || (node.nextSibling && node.nextSibling.className === "toxic-cmt-pill")) return;
      
      const isToxic = result?.toxic?.label === "Toxic";
      const toxicScore = result?.toxic?.score || 0; 

      if (type === 'comment') {
          if (!isToxic) return;
          const span = document.createElement("span");
          span.className = "toxic-cmt-pill";
          span.style.backgroundColor = "#fdecea"; span.style.color = "#c62828";
          span.style.border = `1px solid #c6282830`;
          span.innerHTML = `<span class="toxic-icon">⚠️ ${(toxicScore*100).toFixed(0)}%</span>`;
          node.appendChild(span);
      } else if (type === 'post') { 
           let container = node.closest('div[data-ad-comet-preview="message"]')?.parentNode;
           if (!container) container = node.closest('div[role="article"]'); 
           
           if (container && !container.querySelector('.toxic-post-bar')) {
              const div = document.createElement("div");
              div.className = "toxic-post-bar";
              div.innerHTML = `<b style="color:${isToxic?'#c62828':'#2e7d32'}">${isToxic?'⚠️ ĐỘC HẠI':'✅ SẠCH'}</b>`;
              if(node.closest('div[data-ad-comet-preview="message"]')) node.closest('div[data-ad-comet-preview="message"]').after(div);
              else node.after(div);
           }
      }
  }



  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => { 
      if (msg.type === "CMD_RESET_ALL") {
          ramCache.clear(); spamTracker.clear();
          globalStats = { postsAnalyzed: 0, toxicPosts: 0, totalComments: 0, toxicComments: 0 };
          // Logic re-apply đơn giản
          document.querySelectorAll('.toxic-cmt-pill, .toxic-post-bar, .toxic-hidden-placeholder').forEach(el => el.remove());
          document.querySelectorAll('.toxic-gone').forEach(el => { el.classList.remove('toxic-gone'); el.style.display = ''; });
          document.querySelectorAll('[data-cbox-status]').forEach(el => delete el.dataset.cboxStatus);
      }
      if (msg.type === "PING_STATS") sendResponse({ stats: globalStats });
      if (msg.type === "UPDATE_SETTINGS") {
          if(msg.level) USER_SETTINGS.level = msg.level;
          if(msg.enabled !== undefined) USER_SETTINGS.enabled = msg.enabled;
          // Trigger scan lại
          const retryNodes = document.querySelectorAll('div[dir="auto"], img');
          retryNodes.forEach(n => delete n.dataset.cboxStatus);
      }
  });

  // --- 7. TURBO ENGINE ---
  function ingestNode(node, isEmojiScan = false) {
      if (!USER_SETTINGS.enabled) return; 
      if (node.dataset.cboxStatus) return; 

      // [UPDATE] Xử lý thẻ IMG (Facebook OCR)
      if (node.tagName === 'IMG') {
          const altText = node.getAttribute('alt');
          // Kiểm tra xem alt text có thông tin OCR chưa
          if (altText && altText.length > 20 && (altText.includes("hình ảnh") || altText.includes("văn bản") || altText.includes("cho biết"))) {
              node.dataset.cboxStatus = "queued";
              node.dataset.cboxType = "image_ocr";
              node.dataset.cboxOcrText = altText;
              nodeQueue.push(node);
              processQueue();
              return;
          } else {
              // Chưa có alt text -> Không làm gì cả, để lần quét sau xử lý
              return;
          }
      }
      
      // Xử lý Text
      if (node.closest('[role="button"]') || node.tagName === 'A' || node.closest('a')) return;
      const text = node.innerText;
      if (!text || text.length < (isEmojiScan ? 1 : 3)) return;

      let type = 'unknown';
      if (node.closest('div[data-ad-comet-preview="message"]') || 
          node.closest('div[style*="background-image"]') || 
          node.closest('div[style*="font-size"]')) {
          type = 'post';
      }
      else if (node.closest('div[role="article"]')) type = 'comment';
      
      if (type === 'unknown' && text.length > 50) type = 'post';
      if (type === 'unknown') return;

      node.dataset.cboxStatus = "queued"; 
      node.dataset.cboxType = type;

      const localCheck = checkLocalRules(text, type, node);
      if (localCheck.block) {
          replaceContent(node, type, localCheck.reason);
          node.dataset.cboxStatus = "blocked";
          if (type === 'comment') globalStats.totalComments++;
      } else {
          nodeQueue.push(node);
          processQueue();
      }
  }

  // --- 8. OBSERVER & INTERVAL ---
  const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
              if (node.nodeType === 1) { 
                  // Quét text
                  const candidates = node.querySelectorAll('div[dir="auto"], span[dir="auto"], div[style*="font-size"]');
                  candidates.forEach(c => ingestNode(c));

                  // Quét ảnh
                  const images = node.querySelectorAll('img');
                  images.forEach(img => ingestNode(img)); 

                  // Quét chính node đó
                  if (node.matches('div[dir="auto"], span[dir="auto"]')) ingestNode(node);
                  if (node.tagName === 'IMG') ingestNode(node);
              }
          }
      }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  
  setTimeout(() => {
      const initialNodes = document.querySelectorAll('div[dir="auto"], span[dir="auto"], div[style*="font-size"]');
      initialNodes.forEach(n => ingestNode(n));
      const initialImages = document.querySelectorAll('img');
      initialImages.forEach(img => ingestNode(img));
  }, 1000);

  // [CẬP NHẬT QUAN TRỌNG] Quét định kỳ cả ảnh và text để bắt kịp độ trễ của Facebook
  setInterval(() => {
      // Tìm cả div text VÀ thẻ img chưa được xử lý
      const retryNodes = document.querySelectorAll('div[dir="auto"]:not([data-cbox-status]), img:not([data-cbox-status])');
      retryNodes.forEach(n => ingestNode(n));
  }, 2000); // Quét mỗi 2 giây

})();