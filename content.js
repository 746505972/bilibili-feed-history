// Bilibili Feed History 插件主脚本
let feedHistory = [];
let observer = null;
let isInitialized = false;

// 初始化插件
function initBilibiliFeedHistory() {
  if (isInitialized) {
    console.log('插件已初始化，跳过重复初始化');
    return;
  }
  
  console.log('Bilibili Feed History 插件开始初始化');
  
  // 监听页面变化，特别是推荐视频区域的变化
  startObserving();
  
  // 添加控制面板到页面
  injectControlPanel();
  
  isInitialized = true;
  console.log('Bilibili Feed History 插件初始化完成');
}

// 开始监听页面变化
function startObserving() {
  // 使用更通用的选择器来匹配B站的可能容器
  let targetNode = document.querySelector('#app') || 
                   document.querySelector('#i_cecream') || 
                   document.querySelector('main') ||
                   document.querySelector('body');
                   
  if (!targetNode) {
    console.log('未找到目标节点，1秒后重试');
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
                console.log('发现移除的视频卡片节点，数量:', feedCards.length);
                for (let i = 0; i < feedCards.length; i++) {
                  removedVideoCount += saveFeedCard(feedCards[i]);
                }
              }
            }
          });
          
          if (removedVideoCount > 0) {
            console.log(`本次操作共保存了 ${removedVideoCount} 个视频卡片`);
          }
        }
        
        // 检查新增节点，确保我们正在跟踪正确的区域
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 注入控制按钮到换一换按钮旁边
              injectRefreshButton(node);
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
  
  console.log('Mutation Observer 已启动，观察目标:', targetNode.tagName);
}

// 检查并保存feed-card元素，返回保存的卡片数量
function checkAndSaveFeedCards(node) {
  let savedCount = 0;
  
  // 检查多种可能的视频卡片类名
  const possibleSelectors = ['.feed-card', '[class*="video-card"]', '[class*="bili-video-card"]'];
  
  for (const selector of possibleSelectors) {
    if (node.matches && node.matches(selector)) {
      console.log('发现匹配的视频卡片节点:', selector);
      if (saveFeedCard(node)) savedCount++;
      return savedCount;
    }
  }

  // 检查节点内部是否包含视频卡片
  if (node.querySelectorAll) {
    // 尝试多种可能的视频卡片类名
    const feedCards = node.querySelectorAll('.feed-card, [class*="video-card"], [class*="bili-video-card"]');
    if (feedCards.length > 0) {
      console.log('在节点内发现视频卡片数量:', feedCards.length);
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
  
  console.log('准备保存视频卡片:', feedCardElement);
  
  // 克隆元素以避免事件处理器等问题
  const clonedCard = feedCardElement.cloneNode(true);
  
  // 为每个保存的卡片添加时间戳
  const timestamp = new Date().toISOString();
  
  // 检查是否已经保存过这个卡片（基于某些唯一标识）
  const cardId = generateCardId(clonedCard);
  
  // 如果无法生成有效ID，跳过保存
  if (!cardId || cardId === 'card_') {
    console.log('无法为视频卡片生成有效ID，跳过保存');
    return false;
  }
  
  const existingIndex = feedHistory.findIndex(item => item.id === cardId);
  
  if (existingIndex === -1) {
    console.log('保存新的视频卡片，ID:', cardId);
    
    // 添加到历史记录
    feedHistory.push({
      id: cardId,
      element: clonedCard,
      timestamp: timestamp
    });
    
    // 限制历史记录数量，防止内存占用过多
    if (feedHistory.length > 200) {
      feedHistory.shift(); // 移除最早的记录
    }
    
    // 保存到本地存储
    saveToStorage();
    return true;
  } else {
    console.log('该视频卡片已存在，跳过保存，ID:', cardId);
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
  console.log('准备保存到本地存储，历史记录数量:', feedHistory.length);
  chrome.storage.local.set({ 
    feedHistory: feedHistory.map(item => ({
      id: item.id,
      html: item.element.outerHTML,
      timestamp: item.timestamp
    }))
  }, function() {
    if (chrome.runtime.lastError) {
      console.error('保存历史记录失败:', chrome.runtime.lastError);
    } else {
      console.log(`已保存 ${feedHistory.length} 个视频到历史记录`);
    }
  });
}

// 从存储加载历史记录
async function loadFromStorage() {
  console.log('开始从存储加载历史记录');
  return new Promise((resolve) => {
    chrome.storage.local.get(['feedHistory'], function(result) {
      console.log('从存储加载的数据:', result);
      if (result.feedHistory) {
        feedHistory = result.feedHistory.map(item => ({
          id: item.id,
          element: createElementFromHTML(item.html),
          timestamp: item.timestamp
        }));
        console.log('加载完成，历史记录数量:', feedHistory.length);
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
  console.log('开始注入控制面板');
  
  // 检查是否已经注入过
  if (document.getElementById('bilibili-feed-history-panel')) {
    console.log('控制面板已存在，无需重复注入');
    return;
  }
  
  // 创建控制面板元素
  const panel = document.createElement('div');
  panel.id = 'bilibili-feed-history-panel';
  panel.innerHTML = `
    <div id="history-toggle-btn" title="显示/隐藏历史推荐">🕒 历史</div>
    <div id="history-content" style="display: none;">
      <div class="history-header">
        <h3>B站推荐历史</h3>
        <span id="close-history-btn" title="关闭">×</span>
      </div>
      <div id="history-stats">已保存 <span id="history-count-display">${feedHistory.length}</span> 个视频</div>
      <div id="history-videos"></div>
    </div>
  `;
  
  // 添加样式 - 按钮现在使用更明显的位置
  const style = document.createElement('style');
  style.textContent = `
    #bilibili-feed-history-panel {
      position: fixed;
      left: 20px;
      top: 20px;
      width: 300px;
      z-index: 99999; /* 更高的z-index值 */
    }
    
    #history-toggle-btn {
      width: 120px;
      height: 40px;
      background-color: #fb7299;
      color: white;
      display: flex;
      justify-content: center;
      align-items: center;
      font-size: 14px;
      cursor: pointer;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      text-align: center;
      font-weight: bold;
    }
    
    #history-content {
      background: white;
      border: 2px solid #fb7299; /* 更明显的边框 */
      border-radius: 8px;
      margin-top: 10px;
      padding: 15px;
      max-height: 60vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
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
      margin-bottom: 10px;
      padding: 5px;
      background: #f9f9f9;
      border-radius: 4px;
    }
    
    #history-videos {
      max-height: 50vh;
      overflow-y: auto;
    }
    
    .history-card {
      margin-bottom: 10px;
      border: 1px solid #eee;
      border-radius: 4px;
      overflow: hidden;
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
  
  // 加载历史记录
  loadFromStorage().then(() => {
    console.log('历史记录加载完成，准备刷新显示');
    refreshHistoryDisplay();
  });
}

// 切换历史面板显示/隐藏
function toggleHistoryPanel() {
  console.log('切换历史面板状态');
  const content = document.getElementById('history-content');
  if (content.style.display === 'none') {
    console.log('显示历史面板');
    content.style.display = 'block';
    refreshHistoryDisplay();
  } else {
    console.log('隐藏历史面板');
    content.style.display = 'none';
  }
}

// 刷新历史记录显示
function refreshHistoryDisplay() {
  console.log('刷新历史记录显示，当前历史记录数量:', feedHistory.length);
  
  // 更新统计数字
  document.getElementById('history-count-display').textContent = feedHistory.length;
  
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
    wrapper.innerHTML = `
      <div class="history-item-header">${new Date(item.timestamp).toLocaleString()}</div>
    `;
    
    // 添加克隆的卡片
    const clonedCard = item.element.cloneNode(true);
    // 清理可能存在的危险属性
    cleanClonedElement(clonedCard);
    wrapper.appendChild(clonedCard);
    
    container.appendChild(wrapper);
  });
  
  console.log('历史记录显示刷新完成');
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

// 在换一换按钮附近注入自定义按钮
function injectRefreshButton(node) {
  // 查找换一换按钮或其他可能的刷新按钮
  const possibleSelectors = ['.refresh-btn', '[class*="refresh"]', '[class*="shuffle"]', '[class*="random"]'];
  let refreshBtn = null;
  
  for (const selector of possibleSelectors) {
    refreshBtn = node.querySelector && node.querySelector(selector) || 
                 document.querySelector(selector);
                 
    if (refreshBtn) {
      break;
    }
  }
  
  if (refreshBtn && !document.getElementById('custom-history-btn')) {
    console.log('在刷新按钮旁注入自定义按钮');
    const customBtn = document.createElement('button');
    customBtn.id = 'custom-history-btn';
    customBtn.textContent = '查看历史推荐';
    customBtn.style = `
      margin-left: 10px;
      padding: 4px 8px;
      font-size: 12px;
      background: #f4f4f4;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      cursor: pointer;
    `;
    
    customBtn.addEventListener('click', function() {
      console.log('点击了自定义历史按钮');
      toggleHistoryPanel();
    });
    
    // 尝试将按钮插入到刷新按钮旁边
    if (refreshBtn.parentNode) {
      refreshBtn.parentNode.appendChild(customBtn);
    }
  }
}

// 确保页面完全加载后初始化插件
function ensurePageLoaded() {
  console.log('检查页面加载状态:', document.readyState);
  
  if (document.readyState === 'loading') {
    console.log('文档仍在加载中，等待DOMContentLoaded事件');
    document.addEventListener('DOMContentLoaded', initBilibiliFeedHistory);
  } else {
    console.log('文档已加载，直接初始化插件');
    // 确保DOM完全构建后再初始化
    setTimeout(() => {
      if (document.querySelector('#app') || document.querySelector('#i_cecream') || document.querySelector('main')) {
        initBilibiliFeedHistory();
      } else {
        console.log('未找到B站页面容器，延迟1秒再试');
        setTimeout(initBilibiliFeedHistory, 1000);
      }
    }, 1000);
  }
}

// 页面可见性改变时重新检查
document.addEventListener('visibilitychange', function() {
  if (!document.hidden) {
    console.log('页面变为可见状态');
    // 页面变为可见时，重新尝试注入按钮
    setTimeout(injectRefreshButton, 1000);
  }
});

// 启动插件初始化
ensurePageLoaded();

// 额外的安全措施：如果页面已经加载但插件未初始化，则强制初始化
window.addEventListener('load', function() {
  if (!isInitialized) {
    console.log('通过window.load事件进行最终初始化');
    setTimeout(initBilibiliFeedHistory, 2000);
  }
});