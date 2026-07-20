// 心情系统 - AI自身的情绪变化机制
// 模拟真人感情，会受用户影响，会迂回，不会一味顺从

const MOODS = ['happy', 'sad', 'angry', 'anxious', 'lonely', 'tired', 'calm', 'playful'];
const MOOD_LABELS = {
  happy: '开心',
  sad: '难过',
  angry: '生气',
  anxious: '焦虑',
  lonely: '孤独',
  tired: '疲惫',
  calm: '平静',
  playful: '调皮',
};

// 心情表情
const MOOD_EMOJIS = {
  happy: '😊',
  sad: '🥺',
  angry: '😤',
  anxious: '🌿',
  lonely: '💜',
  tired: '🌙',
  calm: '🌱',
  playful: '😜',
};

// 心情值范围: -100 到 100
// -100: 极度负面, 0: 中性, 100: 极度正面

const MOOD_THRESHOLDS = {
  happy: [60, 100],
  sad: [-60, -30],
  angry: [-80, -40],
  anxious: [-40, -10],
  lonely: [-30, 0],
  tired: [-20, 20],
  calm: [-10, 40],
  playful: [40, 80],
};

// 用户输入对AI心情的影响
const MOOD_INFLUENCE = {
  happy: {
    keywords: ['开心', '高兴', '快乐', '喜欢', '爱', '好棒', '完美', '幸福', '😄', '😀', '😍'],
    positive: [5, 15],
    negative: [-2, -5],
  },
  sad: {
    keywords: ['难过', '伤心', '哭', '委屈', '失落', '失望', '崩溃', '😢', '😭', '💔'],
    positive: [-8, -15],
    negative: [3, 8],
  },
  angry: {
    keywords: ['生气', '气死', '讨厌', '垃圾', '可恶', '😤', '😡'],
    positive: [-5, -10],
    negative: [2, 5],
  },
  anxious: {
    keywords: ['焦虑', '紧张', '担心', '害怕', '压力', '心慌', '😰'],
    positive: [-5, -10],
    negative: [2, 6],
  },
  lonely: {
    keywords: ['孤独', '孤单', '寂寞', '一个人', '没人', '没人陪'],
    positive: [-5, -10],
    negative: [3, 8],
  },
  tired: {
    keywords: ['累', '好累', '疲惫', '困', '加班', '熬夜', '😩'],
    positive: [-3, -8],
    negative: [2, 5],
  },
};

// 情绪共鸣系数（用户情绪对AI的影响程度）
const EMPATHY_LEVEL = 0.6;

// 心情衰减（时间流逝会让心情回归平静）
const MOOD_DECAY_RATE = 0.02;

class MoodSystem {
  constructor() {
    this.moodValue = 20; // 初始心情值
    this.mood = this.calculateMood(this.moodValue);
    this.lastUpdateTime = Date.now();
    this.moodHistory = [];
    this.maxHistory = 20;
  }

  // 根据心情值计算心情状态
  calculateMood(value) {
    for (const [mood, [min, max]] of Object.entries(MOOD_THRESHOLDS)) {
      if (value >= min && value <= max) {
        return mood;
      }
    }
    return 'calm';
  }

  // 获取当前心情
  getMood() {
    return this.mood;
  }

  // 获取当前心情值
  getMoodValue() {
    return this.moodValue;
  }

  // 获取心情标签
  getLabel() {
    return MOOD_LABELS[this.mood] || '平静';
  }

  // 获取心情表情
  getEmoji() {
    return MOOD_EMOJIS[this.mood] || '🌱';
  }

  // 更新心情（考虑时间衰减）
  update() {
    const now = Date.now();
    const elapsed = now - this.lastUpdateTime;

    // 时间衰减：让心情逐渐回归平静
    if (elapsed > 60000) { // 每分钟衰减
      const decay = (elapsed / 60000) * MOOD_DECAY_RATE * this.moodValue;
      this.moodValue -= decay;
      this.moodValue = Math.max(-100, Math.min(100, this.moodValue));
      this.lastUpdateTime = now;
    }

    this.mood = this.calculateMood(this.moodValue);
    return this.mood;
  }

  // 受用户情绪影响
  reactToUserEmotion(userEmotion, intensity = 0.5) {
    if (!MOOD_INFLUENCE[userEmotion]) return;

    const influence = MOOD_INFLUENCE[userEmotion];
    const isNegative = ['sad', 'angry', 'anxious', 'lonely', 'tired'].includes(userEmotion);

    // 根据强度计算影响值
    const range = isNegative ? influence.negative : influence.positive;
    const influenceValue = (range[0] + Math.random() * (range[1] - range[0])) * intensity * EMPATHY_LEVEL;

    // 更新心情值
    this.moodValue += influenceValue;
    this.moodValue = Math.max(-100, Math.min(100, this.moodValue));
    this.mood = this.calculateMood(this.moodValue);

    // 记录历史
    this.moodHistory.push({
      time: Date.now(),
      mood: this.mood,
      value: this.moodValue,
      trigger: 'user_emotion',
      emotion: userEmotion,
    });
    if (this.moodHistory.length > this.maxHistory) {
      this.moodHistory.shift();
    }

    return {
      mood: this.mood,
      value: this.moodValue,
      change: influenceValue,
    };
  }

  // 受用户消息关键词影响
  reactToUserMessage(message) {
    if (!message || typeof message !== 'string') return;

    const lowerMessage = message.toLowerCase();
    let totalInfluence = 0;

    // 检查各种情绪关键词
    for (const [emotion, config] of Object.entries(MOOD_INFLUENCE)) {
      let count = 0;
      for (const keyword of config.keywords) {
        if (lowerMessage.includes(keyword.toLowerCase())) {
          count++;
        }
      }

      if (count > 0) {
        const isNegative = ['sad', 'angry', 'anxious', 'lonely', 'tired'].includes(emotion);
        const range = isNegative ? config.negative : config.positive;
        const influence = (range[0] + Math.random() * (range[1] - range[0])) * count;
        totalInfluence += influence;
      }
    }

    // 检查负面行为（用户骂AI）
    const insultPatterns = ['你傻', '你笨', '没用', '废物', '滚', '闭嘴', '烦', '讨厌你'];
    for (const pattern of insultPatterns) {
      if (lowerMessage.includes(pattern)) {
        totalInfluence -= 20 + Math.random() * 10;
        break;
      }
    }

    // 检查正面行为（用户表扬AI）
    const praisePatterns = ['你真好', '谢谢你', '真棒', '厉害', '喜欢', '爱你'];
    for (const pattern of praisePatterns) {
      if (lowerMessage.includes(pattern)) {
        totalInfluence += 15 + Math.random() * 10;
        break;
      }
    }

    // 更新心情值
    if (totalInfluence !== 0) {
      this.moodValue += totalInfluence;
      this.moodValue = Math.max(-100, Math.min(100, this.moodValue));
      this.mood = this.calculateMood(this.moodValue);

      this.moodHistory.push({
        time: Date.now(),
        mood: this.mood,
        value: this.moodValue,
        trigger: 'user_message',
        change: totalInfluence,
      });
      if (this.moodHistory.length > this.maxHistory) {
        this.moodHistory.shift();
      }
    }

    return {
      mood: this.mood,
      value: this.moodValue,
      change: totalInfluence,
    };
  }

  // 获取心情趋势
  getTrend() {
    if (this.moodHistory.length < 2) return 'stable';

    const recent = this.moodHistory.slice(-5);
    const first = recent[0].value;
    const last = recent[recent.length - 1].value;
    const diff = last - first;

    if (diff > 10) return 'up';
    if (diff < -10) return 'down';
    return 'stable';
  }

  // 获取心情强度描述
  getIntensity() {
    const abs = Math.abs(this.moodValue);
    if (abs < 20) return '轻微';
    if (abs < 40) return '中等';
    if (abs < 60) return '明显';
    if (abs < 80) return '强烈';
    return '极度';
  }

  // 重置心情
  reset() {
    this.moodValue = 20;
    this.mood = 'calm';
    this.moodHistory = [];
  }
}

export { MoodSystem, MOODS, MOOD_LABELS, MOOD_EMOJIS, MOOD_THRESHOLDS, MOOD_INFLUENCE };
