// 极简情感分类器 - 基于关键词 + 规则匹配，无需训练
// 8种情感：开心、难过、生气、焦虑、孤独、疲惫、平静、想念

const EMOTIONS = ['happy', 'sad', 'angry', 'anxious', 'lonely', 'tired', 'calm', 'miss'];
const EMOTION_LABELS = {
  happy: '开心',
  sad: '难过',
  angry: '生气',
  anxious: '焦虑',
  lonely: '孤独',
  tired: '疲惫',
  calm: '平静',
  miss: '想念',
};

// 情感关键词词典（中文）
const EMOTION_KEYWORDS = {
  happy: [
    '开心', '高兴', '快乐', '兴奋', '激动', '哈哈哈', '笑死', '太棒了', '好棒',
    '幸福', '甜蜜', '开心死了', '笑', '😄', '😀', '😂', '🤣', '😍', '🥰',
    '好耶', '太好了', '完美', '厉害', '牛', '绝了', '爱了', '舒服',
  ],
  sad: [
    '难过', '伤心', '悲伤', '哭', '想哭', '心痛', '难受', '委屈', '失落',
    '失望', '绝望', '崩溃', '抑郁', 'emo', 'emo了', '😢', '😭', '😔', '💔',
    '不开心', '闷闷不乐', '心碎', '不值得', '没意思', '好难', '太难了',
  ],
  angry: [
    '生气', '气死', '愤怒', '烦死', '讨厌', '恶心', '垃圾', '可恶', '气',
    '爆炸', '抓狂', '受不了', '忍不了', '无语', '服了', '😤', '😡', '🤬',
    '凭什么', '怎么这样', '有病吧', '神经病', '脑子有坑', '气炸了',
  ],
  anxious: [
    '焦虑', '紧张', '担心', '害怕', '恐惧', '不安', '心慌', '慌', '怕',
    '压力', '压力大', '喘不过气', '睡不着', '失眠', '担忧', '慌张',
    '怎么办', '来不及', '来不及了', '完蛋', '完了', '糟了', '😰', '😨',
  ],
  lonely: [
    '孤独', '孤单', '寂寞', '一个人', '没人', '没人理', '没人懂', '冷清',
    '空荡荡', '没人陪', '没人爱', '想有人', '好安静', '没人说话',
    '格格不入', '多余', '透明人', '没朋友', '😔', '🥺',
  ],
  tired: [
    '累', '好累', '疲惫', '疲倦', '困', '想睡', '撑不住', '虚脱',
    '精疲力尽', '没力气', '心力交瘁', '心累', '身累', '乏', '困死了',
    '加班', '熬夜', '忙死', '忙', '好忙', '疲', '😩', '😴',
  ],
  calm: [
    '平静', '还好', '一般', '无聊', '没事', '还行', '就那样', '普通',
    '日常', '平淡', '没什么', '没啥', '嗯', '哦', '好的', '知道',
    '可以的', '没问题', 'OK', 'ok',
  ],
  miss: [
    '想', '想念', '思念', '怀念', '回忆', '想念你', '想你', '好想你',
    '念', '惦记', '牵挂', '好久不见', '想念以前', '回忆起', '想起',
    '记得', '还记得', '从前', '过去', '曾经', '🥺', '💕',
  ],
};

// 否定词
const NEGATION_WORDS = ['不', '没', '别', '无', '非', '未', '莫', '勿'];

// 程度副词
const INTENSITY_WORDS = {
  '非常': 1.5, '特别': 1.5, '超级': 1.5, '极其': 1.8, '太': 1.4,
  '好': 1.2, '真': 1.3, '真的': 1.4, '真的太': 1.6, '真的超': 1.6,
  '有点': 0.7, '稍微': 0.6, '一点': 0.7, '些微': 0.5,
  '快': 1.2, '都要': 1.3, '快被': 1.3,
};

// 问候语识别
const GREETINGS = ['你好', '在吗', '在不在', '嗨', 'hello', 'hi', 'hey', '哈喽', '在么', '早上好', '晚上好', '下午好'];

class EmotionClassifier {
  constructor() {
    this.keywords = EMOTION_KEYWORDS;
    this.negations = NEGATION_WORDS;
    this.intensifiers = INTENSITY_WORDS;
  }

  // 分词（简化版：按字+关键词匹配）
  tokenize(text) {
    const tokens = [];
    let remaining = text.toLowerCase();
    while (remaining.length > 0) {
      let matched = false;
      // 优先匹配长词（4字→3字→2字→1字）
      for (let len = Math.min(remaining.length, 6); len >= 1; len--) {
        const substr = remaining.slice(0, len);
        // 检查是否在任意情感词典中
        for (const emotion of EMOTIONS) {
          if (this.keywords[emotion].includes(substr)) {
            tokens.push({ text: substr, type: 'emotion', emotion });
            remaining = remaining.slice(len);
            matched = true;
            break;
          }
        }
        if (matched) break;
        // 检查是否是否定词
        if (this.negations.includes(substr)) {
          tokens.push({ text: substr, type: 'negation' });
          remaining = remaining.slice(len);
          matched = true;
          break;
        }
        if (matched) break;
        // 检查是否是程度词
        if (substr in this.intensifiers) {
          tokens.push({ text: substr, type: 'intensifier', value: this.intensifiers[substr] });
          remaining = remaining.slice(len);
          matched = true;
          break;
        }
        if (matched) break;
      }
      if (!matched) {
        tokens.push({ text: remaining[0], type: 'normal' });
        remaining = remaining.slice(1);
      }
    }
    return tokens;
  }

  // 分类情感
  classify(text) {
    if (!text || typeof text !== 'string') {
      return { emotion: 'calm', intensity: 0.3, confidence: 0.5 };
    }

    // 检测问候
    const isGreeting = GREETINGS.some(g => text.toLowerCase().includes(g));
    if (isGreeting && text.length < 10) {
      return { emotion: 'happy', intensity: 0.6, confidence: 0.8, isGreeting: true };
    }

    const tokens = this.tokenize(text);
    const scores = {};
    EMOTIONS.forEach(e => scores[e] = 0);

    // 计算情感得分
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      if (token.type === 'emotion') {
        let intensity = 1.0;

        // 检查前2个token是否有程度词
        for (let j = Math.max(0, i - 2); j < i; j++) {
          if (tokens[j].type === 'intensifier') {
            intensity *= tokens[j].value;
          }
          if (tokens[j].type === 'negation') {
            // 否定词翻转情感：开心→难过 等（简化处理：减分）
            intensity *= -0.5;
          }
        }

        scores[token.emotion] += Math.abs(intensity);
      }
    }

    // 文本长度也作为特征
    const textLength = text.length;
    if (textLength > 50) {
      // 长文本可能情感更强烈
      for (const e of EMOTIONS) {
        scores[e] *= 1.1;
      }
    }

    // 标点符号分析
    if (text.includes('！') || text.includes('!')) {
      for (const e of EMOTIONS) {
        scores[e] *= 1.2;
      }
    }
    if (text.includes('？') || text.includes('?')) {
      // 问句可能表示困惑/焦虑
      scores.anxious *= 1.3;
    }
    if (text.includes('...') || text.includes('。。。')) {
      scores.sad *= 1.2;
      scores.lonely *= 1.2;
    }

    // 找出得分最高的情感
    let maxEmotion = 'calm';
    let maxScore = 0;
    for (const e of EMOTIONS) {
      if (scores[e] > maxScore) {
        maxScore = scores[e];
        maxEmotion = e;
      }
    }

    // 如果所有得分都很低，归为平静
    if (maxScore < 0.5) {
      return {
        emotion: 'calm',
        intensity: 0.3,
        confidence: 0.4,
        scores,
      };
    }

    // 计算强度和置信度
    const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
    const confidence = Math.min(0.95, maxScore / (totalScore + 0.1));
    const intensity = Math.min(1.0, maxScore / 2);

    return {
      emotion: maxEmotion,
      intensity: Math.max(0.3, intensity),
      confidence,
      scores,
    };
  }

  // 获取情感标签
  getLabel(emotion) {
    return EMOTION_LABELS[emotion] || '平静';
  }

  // 获取所有情感
  getEmotions() {
    return EMOTIONS.map(e => ({ value: e, label: EMOTION_LABELS[e] }));
  }
}

export { EmotionClassifier, EMOTIONS, EMOTION_LABELS };
