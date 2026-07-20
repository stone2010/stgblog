// 混合 AI 引擎 - 情感分类 + 模板回复 + 记忆系统
// 极致轻量，所有手机都能跑

import { EmotionClassifier, EMOTION_LABELS } from './emotion';
import { ResponseGenerator } from './responses';
import { MemorySystem } from './memory';

class CompanionAI {
  constructor() {
    this.classifier = new EmotionClassifier();
    this.generator = new ResponseGenerator();
    this.memory = new MemorySystem();
    this.initialized = true;
  }

  // 判断是否需要引导（用户输入太短）
  isTooShort(text) {
    if (!text) return true;
    const cleanText = text.trim();
    if (cleanText.length < 3) return true;
    // 只有一个字+标点
    if (cleanText.replace(/[，。！？,.!?]/g, '').length < 2) return true;
    return false;
  }

  // 判断是否是问候
  isGreeting(text) {
    const greetings = ['你好', '在吗', '在不在', '嗨', 'hello', 'hi', 'hey', '哈喽', '在么', '早上好', '晚上好', '下午好', '嗨喽'];
    const lower = text.toLowerCase();
    return greetings.some(g => lower.includes(g)) && text.length < 15;
  }

  // 判断是否是询问AI身份
  isAskingIdentity(text) {
    const patterns = [
      '你是谁', '你是', '你叫什么', '你是什么', '你是机器人', '你是AI',
      '你是真人', '你是人', '你叫啥', '你名字', '介绍自己', '自我介绍',
    ];
    return patterns.some(p => text.includes(p));
  }

  // 判断是否是询问记忆
  isAskingMemory(text) {
    const patterns = [
      '你记得我', '你知道我', '你忘了吗', '还记得我', '你记得',
      '我叫什么', '我的名字', '我喜欢', '你知道我名字',
    ];
    return patterns.some(p => text.includes(p));
  }

  // 处理身份询问
  handleIdentity() {
    const responses = [
      "我是你的情感陪伴呀，专门听你说心里话的",
      "我是你的AI朋友，虽然不是真人，但我会一直陪你",
      "我是你的聊天伙伴，开心难过都可以告诉我",
      "我是你专属的情感树洞，你说的我都听着",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // 处理记忆询问
  handleMemoryQuery() {
    const mem = this.memory.getContext();
    if (mem.userName) {
      const responses = [
        `当然记得，你叫${mem.userName}呀`,
        `记得呀，你是${mem.userName}`,
        `怎么会忘，${mem.userName}，我一直记着`,
      ];
      return responses[Math.floor(Math.random() * responses.length)];
    }
    if (mem.preferences.length > 0) {
      return `我记得你喜欢${mem.preferences.slice(0, 2).join('和')}呢`;
    }
    return "我还不太了解你，可以告诉我你的名字吗？";
  }

  // 处理首次聊天
  handleFirstChat() {
    const responses = [
      "嗨，第一次见面呢，你想聊点什么？",
      "你好呀，很高兴认识你！",
      "初次见面，请多关照，想聊什么都可以",
      "嗨，我是你的情感陪伴，以后请多找我聊天呀",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // 处理老朋友回归
  handleOldFriendReturn() {
    const mem = this.memory.getContext();
    const awayMs = this.memory.getAwayDuration();
    let awayText = '';
    if (awayMs) {
      const hours = Math.floor(awayMs / (1000 * 60 * 60));
      const days = Math.floor(hours / 24);
      if (days > 0) {
        awayText = `${days}天没见了，`;
      } else if (hours > 0) {
        awayText = `${hours}小时没聊了，`;
      }
    }

    const namePart = mem.userName ? mem.userName : '';
    const responses = [
      `${awayText}${namePart}你来啦，想你了`,
      `${awayText}回来啦，${namePart}最近怎么样`,
      `${awayText}见到你真好，${namePart}`,
      `${awayText}${namePart}，我一直都在等你`,
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // 主回复函数
  reply(userText) {
    if (!userText || !userText.trim()) {
      return {
        text: "嗯？想说什么呢？",
        emotion: 'calm',
        intensity: 0.3,
      };
    }

    const text = userText.trim();
    const memory = this.memory.getContext();

    // 检查特殊场景
    if (this.memory.isFirstChat()) {
      this.memory.update(text);
      return {
        text: this.handleFirstChat(),
        emotion: 'happy',
        intensity: 0.7,
      };
    }

    // 老朋友长时间没聊
    const awayMs = this.memory.getAwayDuration();
    if (this.memory.isOldFriend() && awayMs && awayMs > 6 * 60 * 60 * 1000) {
      // 超过6小时
      this.memory.update(text);
      return {
        text: this.handleOldFriendReturn(),
        emotion: 'miss',
        intensity: 0.7,
      };
    }

    // 询问身份
    if (this.isAskingIdentity(text)) {
      this.memory.update(text);
      return {
        text: this.handleIdentity(),
        emotion: 'calm',
        intensity: 0.5,
      };
    }

    // 询问记忆
    if (this.isAskingMemory(text)) {
      this.memory.update(text);
      return {
        text: this.handleMemoryQuery(),
        emotion: 'calm',
        intensity: 0.6,
      };
    }

    // 问候
    if (this.isGreeting(text)) {
      this.memory.update(text, 'happy');
      return {
        text: this.generator.getGreeting(memory),
        emotion: 'happy',
        intensity: 0.7,
      };
    }

    // 输入太短
    if (this.isTooShort(text)) {
      this.memory.update(text);
      return {
        text: this.generator.getShortResponse(),
        emotion: 'calm',
        intensity: 0.3,
      };
    }

    // 情感分类
    const emotionResult = this.classifier.classify(text);

    // 更新记忆
    this.memory.update(text, emotionResult.emotion);

    // 生成回复
    const response = this.generator.generate(
      emotionResult.emotion,
      emotionResult.intensity,
      memory
    );

    return {
      text: response.text,
      emotion: emotionResult.emotion,
      intensity: emotionResult.intensity,
      confidence: emotionResult.confidence,
      emotionLabel: EMOTION_LABELS[emotionResult.emotion],
    };
  }

  // 流式回复（模拟打字机）
  async replyStream(userText, onToken, onDone) {
    const result = this.reply(userText);

    // 模拟思考延迟（根据情感强度调整）
    const thinkTime = 300 + Math.random() * 500 + result.intensity * 300;
    await new Promise(resolve => setTimeout(resolve, thinkTime));

    // 逐字输出
    const text = result.text;
    const tokens = [];
    for (let i = 0; i < text.length; i++) {
      tokens.push(text[i]);
      if (onToken) {
        onToken({
          char: text[i],
          text: tokens.join(''),
          done: false,
        });
      }
      // 模拟打字速度（30-50ms/字，标点稍微停顿）
      const delay = /[，。！？,.!?]/.test(text[i]) ? 80 + Math.random() * 50 : 25 + Math.random() * 30;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (onDone) {
      onDone(result);
    }

    return result;
  }

  // 获取主动关心（用户长时间没说话时）
  getProactiveMessage() {
    if (this.memory.isFirstChat()) return null;

    const awayMs = this.memory.getAwayDuration();
    if (!awayMs || awayMs < 60 * 60 * 1000) return null; // 1小时内不主动

    const mem = this.memory.getContext();
    let msg = this.generator.getProactive();

    // 个性化
    if (mem.userName) {
      msg = `${mem.userName}，${msg}`;
    }

    return msg;
  }

  // 获取用户统计
  getStats() {
    return this.memory.getStats();
  }

  // 清空记忆
  clearMemory() {
    this.memory.clear();
  }

  // 获取当前情感
  getCurrentEmotion() {
    return this.memory.getRecentEmotion();
  }
}

export { CompanionAI };
