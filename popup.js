// Popup页面脚本

document.addEventListener('DOMContentLoaded', function() {
  console.log('Popup页面加载完成');
  
  // 获取历史记录数量并显示
  updateHistoryCount();
  
  // 修改按钮行为 - 不再发送消息，而是提示用户使用页面按钮
  document.getElementById('show-history').addEventListener('click', function() {
    document.getElementById('status-text').textContent = '请在B站页面右下角使用圆形按钮';
  });
  
  document.getElementById('clear-history').addEventListener('click', function() {
    if (confirm('确定要清空所有历史记录吗？此操作不可撤销。')) {
      chrome.storage.local.clear(function() {
        if (chrome.runtime.lastError) {
          console.error('清空历史记录失败:', chrome.runtime.lastError.message);
          document.getElementById('status-text').textContent = '清空失败: ' + chrome.runtime.lastError.message;
        } else {
          console.log('历史记录已清空');
          document.getElementById('status-text').textContent = '历史记录已清空';
          updateHistoryCount();
        }
      });
    }
  });
});

// 更新历史记录数量显示
function updateHistoryCount() {
  console.log('更新历史记录计数');
  chrome.storage.local.get(['feedHistory'], function(result) {
    console.log('从存储获取的数据:', result);
    const count = result.feedHistory ? result.feedHistory.length : 0;
    document.getElementById('history-count').textContent = count;
    console.log('历史记录数量:', count);
  });
}