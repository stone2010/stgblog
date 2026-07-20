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

const EMPATHY_LEVEL = 0.6;
const MOOD_DECAY_RATE = 0.02;

class MoodSystem {
  constructor() {
    this.moodValue = 20;
    this.mood = this.calculateMood(this.moodValue);
    this.lastUpdateTime = Date.now();
    this.moodHistory = [];
    this.maxHistory = 20;
    
    this.energy = 80;
    this.attention = 70;
    this.excitement = 30;
    this.curiosity = 50;
    this.affection = 60;
    this.frustration = 20;
    this.boredom = 30;
    this.hope = 50;
    
    this.energyDecay = 0.01;
    this.attentionDecay = 0.015;
  }

  calculateMood(value) {
    for (const [mood, [min, max]] of Object.entries(MOOD_THRESHOLDS)) {
      if (value >= min && value <= max) {
        return mood;
      }
    }
    return 'calm';
  }

  getMood() {
    return this.mood;
  }

  getMoodValue() {
    return this.moodValue;
  }

  getLabel() {
    return MOOD_LABELS[this.mood] || '平静';
  }

  getEmoji() {
    return MOOD_EMOJIS[this.mood] || '🌱';
  }

  update() {
    const now = Date.now();
    const elapsed = now - this.lastUpdateTime;

    if (elapsed > 60000) {
      const decay = (elapsed / 60000) * MOOD_DECAY_RATE * this.moodValue;
      this.moodValue -= decay;
      this.moodValue = Math.max(-100, Math.min(100, this.moodValue));

      this.energy = Math.max(0, Math.min(100, this.energy - this.energyDecay * (elapsed / 60000) * 10));
      this.attention = Math.max(0, Math.min(100, this.attention - this.attentionDecay * (elapsed / 60000) * 15));
      this.excitement = Math.max(0, Math.min(100, this.excitement - 0.02 * (elapsed / 60000) * 8));
      this.boredom = Math.max(0, Math.min(100, this.boredom + 0.01 * (elapsed / 60000) * 5));

      this.lastUpdateTime = now;
    }

    this.mood = this.calculateMood(this.moodValue);
    return this.mood;
  }

  reactToUserEmotion(userEmotion, intensity = 0.5) {
    if (!MOOD_INFLUENCE[userEmotion]) return;

    const influence = MOOD_INFLUENCE[userEmotion];
    const isNegative = ['sad', 'angry', 'anxious', 'lonely', 'tired'].includes(userEmotion);

    const range = isNegative ? influence.negative : influence.positive;
    const influenceValue = (range[0] + Math.random() * (range[1] - range[0])) * intensity * EMPATHY_LEVEL;

    this.moodValue += influenceValue;
    this.moodValue = Math.max(-100, Math.min(100, this.moodValue));
    this.mood = this.calculateMood(this.moodValue);

    if (isNegative) {
      this.affection = Math.max(0, Math.min(100, this.affection + 5));
      this.energy = Math.max(0, Math.min(100, this.energy - 3));
    } else {
      this.excitement = Math.max(0, Math.min(100, this.excitement + 8));
      this.hope = Math.max(0, Math.min(100, this.hope + 5));
      this.energy = Math.max(0, Math.min(100, this.energy + 3));
    }

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

  reactToUserMessage(message) {
    if (!message || typeof message !== 'string') return;

    const lowerMessage = message.toLowerCase();
    let totalInfluence = 0;

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

    const insultPatterns = ['你傻', '你笨', '没用', '废物', '滚', '闭嘴', '烦', '讨厌你', '你假', '敷衍'];
    for (const pattern of insultPatterns) {
      if (lowerMessage.includes(pattern)) {
        totalInfluence -= 20 + Math.random() * 10;
        this.frustration = Math.max(0, Math.min(100, this.frustration + 25));
        this.affection = Math.max(0, Math.min(100, this.affection - 15));
        this.attention = Math.max(0, Math.min(100, this.attention - 10));
        break;
      }
    }

    const praisePatterns = ['你真好', '谢谢你', '真棒', '厉害', '喜欢', '爱你', '想你', '陪我'];
    for (const pattern of praisePatterns) {
      if (lowerMessage.includes(pattern)) {
        totalInfluence += 15 + Math.random() * 10;
        this.affection = Math.max(0, Math.min(100, this.affection + 15));
        this.excitement = Math.max(0, Math.min(100, this.excitement + 10));
        this.energy = Math.max(0, Math.min(100, this.energy + 5));
        break;
      }
    }

    const questionPatterns = ['吗', '呢', '什么', '怎么', '为什么'];
    for (const pattern of questionPatterns) {
      if (lowerMessage.includes(pattern)) {
        this.curiosity = Math.max(0, Math.min(100, this.curiosity + 5));
        this.attention = Math.max(0, Math.min(100, this.attention + 5));
        break;
      }
    }

    const storyPatterns = ['今天', '我', '了', '在', '遇到'];
    let storyCount = 0;
    for (const pattern of storyPatterns) {
      if (lowerMessage.includes(pattern)) storyCount++;
    }
    if (storyCount >= 2) {
      this.attention = Math.max(0, Math.min(100, this.attention + 8));
      this.curiosity = Math.max(0, Math.min(100, this.curiosity + 3));
    }

    const shortMessage = message.length <= 5;
    if (shortMessage) {
      this.boredom = Math.max(0, Math.min(100, this.boredom + 5));
    } else {
      this.boredom = Math.max(0, Math.min(100, this.boredom - 10));
    }

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

  getIntensity() {
    const abs = Math.abs(this.moodValue);
    if (abs < 20) return '轻微';
    if (abs < 40) return '中等';
    if (abs < 60) return '明显';
    if (abs < 80) return '强烈';
    return '极度';
  }

  getPersonalityState() {
    return {
      energy: this.energy,
      attention: this.attention,
      excitement: this.excitement,
      curiosity: this.curiosity,
      affection: this.affection,
      frustration: this.frustration,
      boredom: this.boredom,
      hope: this.hope,
    };
  }

  reset() {
    this.moodValue = 20;
    this.mood = 'calm';
    this.moodHistory = [];
    this.energy = 80;
    this.attention = 70;
    this.excitement = 30;
    this.curiosity = 50;
    this.affection = 60;
    this.frustration = 20;
    this.boredom = 30;
    this.hope = 50;
  }
}

export { MoodSystem, MOODS, MOOD_LABELS, MOOD_EMOJIS, MOOD_THRESHOLDS, MOOD_INFLUENCE };