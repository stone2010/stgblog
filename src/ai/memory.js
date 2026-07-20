// 记忆系统 - 记住用户信息、喜好、对话历史
// 让 AI 更有"人情味"，能够回应用户的具体情况

const STORAGE_KEY = 'ai_companion_memory';

class MemorySystem {
  constructor() {
    this.memory = this.loadMemory();
  }

  // 加载记忆
  loadMemory() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Failed to load memory:', e);
    }

    return {
      userName: '',
      userTitle: '', // 用户希望被叫的称呼
      preferences: [], // 用户喜好
      dislikes: [], // 用户讨厌的事
      recentEmotions: [], // 最近的情感状态
      conversationCount: 0, // 总对话次数
      lastChatTime: null, // 上次聊天时间
      importantEvents: [], // 重要事件（生日、纪念日等）
      topics: [], // 常聊话题
      createdAt: Date.now(),
    };
  }

  // 保存记忆
  saveMemory() {
    try {
      this.memory.lastChatTime = Date.now();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.memory));
    } catch (e) {
      console.warn('Failed to save memory:', e);
    }
  }

  // 从用户消息中提取信息
  extractInfo(text) {
    const info = {};

    // 提取名字（叫我XXX / 我叫XXX）
    const namePatterns = [
      /叫我([^\s,，。.!！?？]{1,8})/,
      /我叫([^\s,，。.!！?？]{1,8})/,
      /我是([^\s,，。.!！?？]{1,8})/,
      /你可以叫我([^\s,，。.!！?？]{1,8})/,
    ];
    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        info.userName = match[1];
        info.userTitle = match[1];
        break;
      }
    }

    // 提取喜好（喜欢XXX / 我爱XXX）
    const likePatterns = [
      /我喜欢([^\s,，。.!！?？]{1,15})/g,
      /我爱([^\s,，。.!！?？]{1,15})/g,
      /我超爱([^\s,，。.!！?？]{1,15})/g,
    ];
    for (const pattern of likePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1] && !info.preferences) info.preferences = [];
        if (match[1] && !this.memory.preferences.includes(match[1])) {
          info.preferences = info.preferences || [];
          info.preferences.push(match[1]);
        }
      }
    }

    // 提讨厌（讨厌XXX / 不喜欢XXX）
    const dislikePatterns = [
      /我讨厌([^\s,，。.!！?？]{1,15})/g,
      /我不喜欢([^\s,，。.!！?？]{1,15})/g,
      /我恨([^\s,，。.!！?？]{1,15})/g,
    ];
    for (const pattern of dislikePatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        if (match[1] && !this.memory.dislikes.includes(match[1])) {
          info.dislikes = info.dislikes || [];
          info.dislikes.push(match[1]);
        }
      }
    }

    // 提取重要事件（生日、纪念日）
    const eventPatterns = [
      /我生日是([^\s,，。.!！?？]{1,20})/,
      /我的生日([^\s,，。.!！?？]{1,20})/,
    ];
    for (const pattern of eventPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        info.importantEvents = info.importantEvents || [];
        info.importantEvents.push({ type: 'birthday', value: match[1] });
        break;
      }
    }

    return info;
  }

  // 更新记忆
  update(text, emotion = null) {
    // 增加对话计数
    this.memory.conversationCount++;

    // 提取信息
    const info = this.extractInfo(text);
    if (info.userName) {
      this.memory.userName = info.userName;
      this.memory.userTitle = info.userTitle;
    }
    if (info.preferences) {
      this.memory.preferences = [...new Set([...this.memory.preferences, ...info.preferences])].slice(-10);
    }
    if (info.dislikes) {
      this.memory.dislikes = [...new Set([...this.memory.dislikes, ...info.dislikes])].slice(-10);
    }
    if (info.importantEvents) {
      this.memory.importantEvents = [...this.memory.importantEvents, ...info.importantEvents].slice(-5);
    }

    // 记录情感状态
    if (emotion) {
      this.memory.recentEmotions.push({
        emotion,
        time: Date.now(),
      });
      // 只保留最近 20 条情感记录
      this.memory.recentEmotions = this.memory.recentEmotions.slice(-20);
    }

    this.saveMemory();
  }

  // 获取上下文（用于回复生成）
  getContext() {
    return {
      userName: this.memory.userName,
      userTitle: this.memory.userTitle,
      preferences: this.memory.preferences,
      dislikes: this.memory.dislikes,
      conversationCount: this.memory.conversationCount,
      lastChatTime: this.memory.lastChatTime,
      recentEmotions: this.memory.recentEmotions,
    };
  }

  // 获取最近情感（用于调整回复风格）
  getRecentEmotion() {
    if (this.memory.recentEmotions.length === 0) return null;
    return this.memory.recentEmotions[this.memory.recentEmotions.length - 1];
  }

  // 获取主导情感（最近 5 条）
  getDominantEmotion() {
    if (this.memory.recentEmotions.length === 0) return null;
    const recent = this.memory.recentEmotions.slice(-5);
    const counts = {};
    recent.forEach(e => {
      counts[e.emotion] = (counts[e.emotion] || 0) + 1;
    });
    let maxEmotion = null;
    let maxCount = 0;
    for (const [emotion, count] of Object.entries(counts)) {
      if (count > maxCount) {
        maxCount = count;
        maxEmotion = emotion;
      }
    }
    return maxEmotion;
  }

  // 检查是否是老朋友（聊天次数多）
  isOldFriend() {
    return this.memory.conversationCount > 10;
  }

  // 检查是否是首次聊天
  isFirstChat() {
    return this.memory.conversationCount === 0;
  }

  // 获取离开时长（毫秒）
  getAwayDuration() {
    if (!this.memory.lastChatTime) return null;
    return Date.now() - this.memory.lastChatTime;
  }

  // 清空记忆
  clear() {
    this.memory = {
      userName: '',
      userTitle: '',
      preferences: [],
      dislikes: [],
      recentEmotions: [],
      conversationCount: 0,
      lastChatTime: null,
      importantEvents: [],
      topics: [],
      createdAt: Date.now(),
    };
    this.saveMemory();
  }

  // 获取统计信息
  getStats() {
    return {
      conversationCount: this.memory.conversationCount,
      daysSinceFirst: Math.floor((Date.now() - this.memory.createdAt) / (1000 * 60 * 60 * 24)),
      preferencesCount: this.memory.preferences.length,
      lastChatTime: this.memory.lastChatTime,
    };
  }
}

export { MemorySystem };
