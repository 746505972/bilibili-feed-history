// Bilibili Feed History 插件主脚本
let feedHistory = [];
let observer = null;
let isInitialized = false;

// 初始化插件
function initBilibiliFeedHistory() {
  if (isInitialized) {
    return;
  }
  
  // 监听页面变化，特别是推荐视频区域的变化
  startObserving();
  
  // 添加控制面板到页面
  injectControlPanel();
  
  isInitialized = true;
}

// 开始监听页面变化
function startObserving() {
  // 使用更通用的选择器来匹配B站的可能容器
  let targetNode = document.querySelector('#app') || 
                   document.querySelector('#i_cecream') || 
                   document.querySelector('main') ||
                   document.querySelector('body');
                   
  if (!targetNode) {
    // 如果没找到节点，稍后再试
    setTimeout(startObserving, 1000);
    return;
  }

  observer = new MutationObserver(function(mutationsList) {
    for (let mutation of mutationsList) {
      if (mutation.type === 'childList') {
        // 检查是否有移除节点的操作
        if (mutation.removedNodes.length > 0) {
          // 计算此次操作移除了多少个视频卡片
          let removedVideoCount = 0;
          
          mutation.removedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 检查当前节点或其子节点是否包含feed-card
              removedVideoCount += checkAndSaveFeedCards(node);
              
              // 检查当前节点的后代节点
              const feedCards = node.querySelectorAll && node.querySelectorAll('.feed-card, [class*="video-card"], [class*="bili-video-card"]');
              if (feedCards) {
                for (let i = 0; i < feedCards.length; i++) {
                  removedVideoCount += saveFeedCard(feedCards[i]);
                }
              }
            }
          });
        }
      }
    }
  });

  // 开始观察
  observer.observe(targetNode, { 
    childList: true, 
    subtree: true 
  });
}

// 检查并保存feed-card元素，返回保存的卡片数量
function checkAndSaveFeedCards(node) {
  let savedCount = 0;
  
  // 检查多种可能的视频卡片类名
  const possibleSelectors = ['.feed-card', '[class*="video-card"]', '[class*="bili-video-card"]'];
  
  for (const selector of possibleSelectors) {
    if (node.matches && node.matches(selector)) {
      if (saveFeedCard(node)) savedCount++;
      return savedCount;
    }
  }

  // 检查节点内部是否包含视频卡片
  if (node.querySelectorAll) {
    // 尝试多种可能的视频卡片类名
    const feedCards = node.querySelectorAll('.feed-card, [class*="video-card"], [class*="bili-video-card"]');
    if (feedCards.length > 0) {
      for (let i = 0; i < feedCards.length; i++) {
        if (saveFeedCard(feedCards[i])) {
          savedCount++;
        }
      }
    }
  }
  
  return savedCount;
}

// 保存feed-card元素，返回是否成功保存
function saveFeedCard(feedCardElement) {
  // 避免保存空或无效的元素
  if (!feedCardElement || !feedCardElement.querySelector) {
    return false;
  }
  
  // 克隆元素以避免事件处理器等问题
  const clonedCard = feedCardElement.cloneNode(true);
  
  // 为每个保存的卡片添加时间戳
  const timestamp = new Date().toISOString();
  
  // 检查是否已经保存过这个卡片（基于某些唯一标识）
  const cardId = generateCardId(clonedCard);
  
  // 如果无法生成有效ID，跳过保存
  if (!cardId || cardId === 'card_') {
    return false;
  }
  
  const existingIndex = feedHistory.findIndex(item => item.id === cardId);
  
  if (existingIndex === -1) {
    // 添加到历史记录
    feedHistory.push({
      id: cardId,
      element: clonedCard,
      timestamp: timestamp
    });
    
    // 修剪超出限制的历史记录
    trimHistoryIfNeeded();
    
    // 保存到本地存储
    saveToStorage();
    return true;
  } else {
    return false;
  }
}

// 生成卡片的唯一ID
function generateCardId(cardElement) {
  // 尝试从链接或数据属性中获取视频ID
  const linkElement = cardElement.querySelector('a[href*="/video/"]');
  if (linkElement) {
    const match = linkElement.href.match(/\/video\/([^/?#]+)/);
    if (match && match[1]) {
      return `card_${match[1]}`;
    }
  }
  
  // 尝试从data属性中获取ID
  if (cardElement.dataset && cardElement.dataset.aid) {
    return `card_${cardElement.dataset.aid}`;
  }
  
  // 尝试从图片src获取bvid
  const imgElement = cardElement.querySelector('img[src*="bvid"]');
  if (imgElement && imgElement.src) {
    const bvidMatch = imgElement.src.match(/bvid\/([^\/\?]+)/);
    if (bvidMatch && bvidMatch[1]) {
      return `card_${bvidMatch[1]}`;
    }
  }
  
  // 如果无法获取视频ID，则使用更通用的方法
  const titleEl = cardElement.querySelector('h3, .info--tit, .video-title, [class*="title"]');
  const title = titleEl ? (titleEl.textContent || titleEl.innerText || '').substring(0, 30) : '';
  
  // 如果标题为空，尝试其他方式获取标识
  if (!title) {
    const upEl = cardElement.querySelector('.up-name, .username, [class*="up"]');
    if (upEl) {
      return `card_${upEl.textContent.substring(0, 20)}`;
    }
  }
  
  return `card_${title.replace(/[^\w\s]/gi, '')}`.substring(0, 50);
}

// 保存到浏览器存储
function saveToStorage() {
  chrome.storage.local.set({ 
    feedHistory: feedHistory.map(item => ({
      id: item.id,
      html: item.element.outerHTML,
      timestamp: item.timestamp
    }))
  }, function() {
    if (chrome.runtime.lastError) {
      console.error('保存历史记录失败:', chrome.runtime.lastError);
    }
  });
}

// 获取历史记录限制，默认为1000
function getHistoryLimit() {
  const limit = localStorage.getItem('bilibiliFeedHistoryLimit');
  return limit ? parseInt(limit) : 1000;
}

// 设置历史记录限制
function setHistoryLimit(limit) {
  // 限制范围在1到99999之间
  const clampedLimit = Math.max(1, Math.min(99999, limit));
  localStorage.setItem('bilibiliFeedHistoryLimit', clampedLimit);
}

// 根据限制修剪历史记录
function trimHistoryIfNeeded() {
  const limit = getHistoryLimit();
  if (feedHistory.length > limit) {
    // 计算需要删除的数量
    const excessCount = feedHistory.length - limit;
    // 删除最老的记录
    feedHistory.splice(0, excessCount);
    // 保存到存储
    saveToStorage();
  }
}

// 从存储加载历史记录
async function loadFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['feedHistory'], function(result) {
      if (result.feedHistory) {
        feedHistory = result.feedHistory.map(item => ({
          id: item.id,
          element: createElementFromHTML(item.html),
          timestamp: item.timestamp
        }));
        // 加载后根据限制裁剪历史记录
        trimHistoryIfNeeded();
      }
      resolve();
    });
  });
}

// 从HTML字符串创建DOM元素
function createElementFromHTML(htmlString) {
  const div = document.createElement('div');
  div.innerHTML = htmlString.trim();
  return div.firstElementChild;
}

// 注入控制面板到页面
function injectControlPanel() {
  // 检查是否已经注入过
  if (document.getElementById('bilibili-feed-history-panel')) {
    return;
  }
  
  // 创建控制面板元素
  const panel = document.createElement('div');
  panel.id = 'bilibili-feed-history-panel';
  panel.innerHTML = `
    <div id="history-toggle-btn" title="显示/隐藏历史推荐">历史🕒</div>
    <div id="history-content" style="display: none;">
      <div class="history-header">
        <h3>B站推荐历史</h3>
        <div id="history-stats">
          <span>已保存 <span id="history-count-display">${feedHistory.length}</span> 个视频</span>
          <span style="margin-left: 15px;">保存上限: </span>
          <input type="number" id="history-limit-input" min="1" max="99999" value="${getHistoryLimit()}" style="width: 80px; padding: 2px 5px; margin-left: 5px;" />
        </div>
        <button id="clear-history-btn" title="清空历史记录" style="margin-left: 10px; background: transparent; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer;">🗑️</button>
        <button id="refresh-history-btn" title="刷新历史记录" style="margin-left: 10px; background: transparent; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; margin-right: 10px;">🔄️</button>
        <button id="theme-toggle-btn" title="切换暗黑主题" style="margin-left: 10px; background: transparent; color: white; border: none; border-radius: 4px; padding: 4px 8px; cursor: pointer; margin-right: 10px;">🌙</button>
        <span id="close-history-btn" title="关闭">×</span>
      </div>
      <div id="history-videos"></div>
    </div>
  `;
  
  // 添加样式
  const style = document.createElement('style');
  style.textContent = `
    #bilibili-feed-history-panel {
      position: fixed;
      left: -50px;
      top: 80px;
      width: 800px;
      z-index: 99999;
    }

    #bilibili-feed-history-panel:hover {
      left: 0;
      transition: left 0.3s ease;
    }

    #history-toggle-btn {
      position: absolute; 
      padding-left: 20px;
      height: 30px;
      background-color: #fb729970;
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 14px;
      cursor: pointer;
      border-radius: 0 30px 30px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      text-align: center;
      font-weight: bold;
      transform-origin: right top;
      margin-top: 10px;
    }
    
    #history-content {
      background: hsla(0,0%,100%,.9);
      margin-top: 40px;
      padding: 15px;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      border-radius: 10px;
    }
    
    /* 暗黑主题样式 */
    .dark-theme {
      background: rgba(33, 33, 33, .9) !important;
      color: #ddd;
    }
    
    .dark-theme .history-header {
      border-bottom: 1px solid #444;
    }
    
    .dark-theme .history-header h3 {
      color: #ff85a2;
    }
    
    .dark-theme #history-stats {
      background: #2d2d2d;
      color: #aaa;
    }
    
    .dark-theme .history-card {
      border: 1px solid #444;
      background: #2d2d2d70;
      color: #ddd;
    }
    
    .dark-theme .history-item-header {
      background: #3a3a3a;
      color: #aaa;
    }
    
    .dark-theme .history-item-footer {
      background: #2a2a2a70 !important;
      color: #bbb;
    }
    
    .history-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
      padding-bottom: 5px;
      border-bottom: 1px solid #eee;
    }
    
    .history-header h3 {
      margin: 0;
      font-size: 16px;
      color: #fb7299;
    }
    
    #close-history-btn {
      font-size: 24px;
      cursor: pointer;
      color: #999;
    }
    
    #history-stats {
      color: #666;
      font-size: 14px;
      padding: 5px;
      background: #f9f9f9;
      border-radius: 4px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    
    #history-videos {
      max-height: 50vh;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(3, 1fr);  /* 3列网格布局 */
      gap: 10px;  /* 卡片之间的间距 */
      scrollbar-width: thin;
    }
    
    .history-card {
      padding: 5px;
      margin-bottom: 0;  /* 因为grid布局，不需要额外的margin */
      border: 1px solid #eee;
      border-radius: 4px;
      overflow: hidden;
      box-shadow: 0 2px 5px rgba(0,0,0,0.1);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }
    
    .history-item-header {
      background: #f5f5f5;
      padding: 5px;
      font-size: 12px;
      color: #666;
    }
  `;
  
  document.head.appendChild(style);
  document.body.appendChild(panel);
  
  // 绑定事件
  document.getElementById('history-toggle-btn').addEventListener('click', toggleHistoryPanel);
  document.getElementById('close-history-btn').addEventListener('click', function() {
    document.getElementById('history-content').style.display = 'none';
  });
  
  // 添加清空历史记录按钮事件监听器
  document.getElementById('clear-history-btn').addEventListener('click', function(e) {
    e.stopPropagation(); // 阻止事件冒泡
    clearHistory();
  });
  
  // 添加刷新历史记录按钮事件监听器
  document.getElementById('refresh-history-btn').addEventListener('click', function(e) {
    e.stopPropagation(); // 阻止事件冒泡
    refreshHistoryDisplay();
  });
  
  // 添加主题切换按钮事件监听器
  document.getElementById('theme-toggle-btn').addEventListener('click', function(e) {
    e.stopPropagation(); // 阻止事件冒泡
    toggleTheme();
  });

  // 添加历史记录数量限制输入框事件监听器
  document.getElementById('history-limit-input').addEventListener('change', function(e) {
    e.stopPropagation(); // 阻止事件冒泡
    const newValue = parseInt(e.target.value);
    if (!isNaN(newValue) && newValue > 0) {
      setHistoryLimit(newValue);
      trimHistoryIfNeeded();
      refreshHistoryDisplay();
    } else {
      // 如果输入无效，恢复为之前的值
      e.target.value = getHistoryLimit();
    }
  });
  
  // 加载历史记录
  loadFromStorage().then(() => {
    refreshHistoryDisplay();
    // 检查是否已有主题设置
    checkSavedTheme();
  });
}

// 清空历史记录
function clearHistory() {
  if (confirm('确定要清空所有历史记录吗？此操作不可撤销！')) {
    feedHistory = [];
    saveToStorage();
    refreshHistoryDisplay();
  }
}

// 切换主题
function toggleTheme() {
  const historyContent = document.getElementById('history-content');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  
  if (historyContent.classList.contains('dark-theme')) {
    historyContent.classList.remove('dark-theme');
    localStorage.setItem('bilibiliFeedTheme', 'light');
    themeToggleBtn.textContent = '🌙'; // 切换回亮色主题时显示月亮图标
  } else {
    historyContent.classList.add('dark-theme');
    localStorage.setItem('bilibiliFeedTheme', 'dark');
    themeToggleBtn.textContent = '☀️'; // 切换到暗色主题时显示太阳图标
  }
}

// 检查已保存的主题设置
function checkSavedTheme() {
  const savedTheme = localStorage.getItem('bilibiliFeedTheme');
  const historyContent = document.getElementById('history-content');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  
  if (savedTheme === 'dark') {
    historyContent.classList.add('dark-theme');
    themeToggleBtn.textContent = '☀️'; // 如果已保存的是暗色主题，按钮应显示太阳图标
  }
}

// 切换历史面板显示/隐藏
function toggleHistoryPanel() {
  const content = document.getElementById('history-content');
  if (content.style.display === 'none') {
    content.style.display = 'block';
    refreshHistoryDisplay();
  } else {
    content.style.display = 'none';
  }
}

// 刷新历史记录显示
function refreshHistoryDisplay() {
  // 更新统计数字
  document.getElementById('history-count-display').textContent = feedHistory.length;
  
  // 更新输入框的值
  const limitInput = document.getElementById('history-limit-input');
  if (limitInput && !isNaN(getHistoryLimit())) {
    limitInput.value = getHistoryLimit();
  }
  
  const container = document.getElementById('history-videos');
  container.innerHTML = '';
  
  if (feedHistory.length === 0) {
    container.innerHTML = '<p>暂无历史记录</p>';
    return;
  }
  
  // 倒序显示，最新的在前面
  [...feedHistory].reverse().forEach((item, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'history-card';
    // 将时间移到底部，这里只保留卡片内容
    wrapper.innerHTML = '';
    
    // 添加克隆的卡片
    const clonedCard = item.element.cloneNode(true);
    // 清理可能存在的危险属性
    cleanClonedElement(clonedCard);
    wrapper.appendChild(clonedCard);
    
    // 添加时间信息到底部
    const timeFooter = document.createElement('div');
    timeFooter.className = 'history-item-footer';
    timeFooter.textContent = new Date(item.timestamp).toLocaleString();
    timeFooter.style.cssText = 'text-align: right; padding: 5px; font-size: 12px; color: #666; background: rgb(249 249 249 / 50%);';
    wrapper.appendChild(timeFooter);
    
    container.appendChild(wrapper);
  });
}

// 清理克隆元素，移除可能的安全风险
function cleanClonedElement(element) {
  // 移除所有事件处理器属性
  const eventHandlers = ['onclick', 'onmouseover', 'onmouseout', 'onload', 'onerror'];
  eventHandlers.forEach(handler => {
    // 移除元素自身的事件处理器
    if (element[handler]) {
      element[handler] = null;
    }
    
    // 移除元素内的所有子元素的事件处理器
    const elementsWithHandlers = element.querySelectorAll(`[${handler}]`);
    elementsWithHandlers.forEach(el => {
      el.removeAttribute(handler);
      el[handler] = null;
    });
  });
  
  // 移除所有script标签
  const scripts = element.querySelectorAll('script');
  scripts.forEach(script => {
    script.remove();
  });
  
  // 移除可能存在的srcdoc属性（可能存在XSS风险）
  const iframes = element.querySelectorAll('iframe');
  iframes.forEach(iframe => {
    if (iframe.hasAttribute('srcdoc')) {
      iframe.removeAttribute('srcdoc');
    }
  });
}

// 确保页面完全加载后初始化插件
function ensurePageLoaded() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBilibiliFeedHistory);
  } else {
    // 确保DOM完全构建后再初始化
    setTimeout(() => {
      if (document.querySelector('#app') || document.querySelector('#i_cecream') || document.querySelector('main')) {
        initBilibiliFeedHistory();
      } else {
        setTimeout(initBilibiliFeedHistory, 1000);
      }
    }, 1000);
  }
}

// 启动插件初始化
ensurePageLoaded();

// 额外的安全措施：如果页面已经加载但插件未初始化，则强制初始化
window.addEventListener('load', function() {
  if (!isInitialized) {
    setTimeout(initBilibiliFeedHistory, 2000);
  }
});