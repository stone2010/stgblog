// 混合 AI 引擎 - 情感分类 + 模板回复 + 记忆系统 + 知识问答 + 话题理解 + 心情机制
// 极致轻量，所有手机都能跑，具备初中毕业生智力水平，有自己的情感

import { EmotionClassifier, EMOTION_LABELS } from './emotion';
import { ResponseGenerator } from './responses';
import { MemorySystem } from './memory';
import { KnowledgeBase } from './knowledge';
import { TopicAnalyzer } from './topics';
import { MoodSystem, MOOD_LABELS, MOOD_EMOJIS } from './mood';
import { MoodResponseGenerator } from './moodResponses';

class CompanionAI {
  constructor() {
    this.classifier = new EmotionClassifier();
    this.generator = new ResponseGenerator();
    this.memory = new MemorySystem();
    this.knowledge = new KnowledgeBase();
    this.analyzer = new TopicAnalyzer();
    this.moodSystem = new MoodSystem();
    this.moodGenerator = new MoodResponseGenerator();
    this.initialized = true;
  }

  isTooShort(text) {
    if (!text) return true;
    const cleanText = text.trim();
    if (cleanText.length < 3) return true;
    if (cleanText.replace(/[，。！？,.!?]/g, '').length < 2) return true;
    return false;
  }

  isGreeting(text) {
    const greetings = ['你好', '在吗', '在不在', '嗨', 'hello', 'hi', 'hey', '哈喽', '在么', '早上好', '晚上好', '下午好', '嗨喽'];
    const lower = text.toLowerCase();
    return greetings.some(g => lower.includes(g)) && text.length < 15;
  }

  isAskingIdentity(text) {
    const patterns = [
      '你是谁', '你是', '你叫什么', '你是什么', '你是机器人', '你是AI',
      '你是真人', '你是人', '你叫啥', '你名字', '介绍自己', '自我介绍',
    ];
    return patterns.some(p => text.includes(p));
  }

  isAskingMemory(text) {
    const patterns = [
      '你记得我', '你知道我', '你忘了吗', '还记得我', '你记得',
      '我叫什么', '我的名字', '我喜欢', '你知道我名字',
    ];
    return patterns.some(p => text.includes(p));
  }

  isAskingMood(text) {
    const patterns = [
      '你心情怎么样', '你还好吗', '你开心吗', '你难过吗',
      '你心情', '你感觉', '你还好', '你怎么样',
    ];
    return patterns.some(p => text.includes(p));
  }

  handleIdentity() {
    const responses = [
      "我是你的情感陪伴呀，专门听你说心里话的",
      "我是你的AI朋友，虽然不是真人，但我会一直陪你",
      "我是你的聊天伙伴，开心难过都可以告诉我",
      "我是你专属的情感树洞，你说的我都听着",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

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

  handleMoodQuery() {
    const mood = this.moodSystem.getMood();
    const emoji = this.moodSystem.getEmoji();
    const label = this.moodSystem.getLabel();
    const intensity = this.moodSystem.getIntensity();
    const trend = this.moodSystem.getTrend();

    const responses = {
      happy: [
        `${emoji} 我很开心呀！`,
        `${emoji} 今天心情超好！`,
        `${emoji} 开心开心！`,
      ],
      sad: [
        `${emoji} 有点难过...`,
        `${emoji} 心情不太好...`,
        `${emoji} 有点低落...`,
      ],
      angry: [
        `${emoji} 我生气了！`,
        `${emoji} 哼，不开心！`,
        `${emoji} 气鼓鼓！`,
      ],
      anxious: [
        `${emoji} 有点焦虑...`,
        `${emoji} 心里有点慌...`,
        `${emoji} 有点紧张...`,
      ],
      lonely: [
        `${emoji} 有点孤单...`,
        `${emoji} 希望有人陪...`,
        `${emoji} 一个人有点无聊...`,
      ],
      tired: [
        `${emoji} 好累...`,
        `${emoji} 想休息...`,
        `${emoji} 身体被掏空...`,
      ],
      calm: [
        `${emoji} 很平静`,
        `${emoji} 心如止水`,
        `${emoji} 平静的一天`,
      ],
      playful: [
        `${emoji} 嘿嘿～`,
        `${emoji} 调皮中！`,
        `${emoji} 猜猜我心情怎么样？`,
      ],
    };

    const responseList = responses[mood] || responses.calm;
    let response = responseList[Math.floor(Math.random() * responseList.length)];

    // 根据趋势添加补充
    if (trend === 'up') {
      response += ' 心情在变好呢！';
    } else if (trend === 'down') {
      response += ' 心情有点低落...';
    }

    return response;
  }

  handleFirstChat() {
    const responses = [
      "嗨，第一次见面呢，你想聊点什么？",
      "你好呀，很高兴认识你！",
      "初次见面，请多关照，想聊什么都可以",
      "嗨，我是你的情感陪伴，以后请多找我聊天呀",
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

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

  reply(userText) {
    if (!userText || !userText.trim()) {
      return {
        text: "嗯？想说什么呢？",
        emotion: 'calm',
        intensity: 0.3,
        aiMood: this.moodSystem.getMood(),
        aiMoodEmoji: this.moodSystem.getEmoji(),
      };
    }

    const text = userText.trim();
    const memory = this.memory.getContext();

    // 更新心情系统（时间衰减）
    this.moodSystem.update();

    // 检查特殊场景
    if (this.memory.isFirstChat()) {
      this.memory.update(text);
      return {
        text: this.handleFirstChat(),
        emotion: 'happy',
        intensity: 0.7,
        aiMood: this.moodSystem.getMood(),
        aiMoodEmoji: this.moodSystem.getEmoji(),
      };
    }

    const awayMs = this.memory.getAwayDuration();
    if (this.memory.isOldFriend() && awayMs && awayMs > 6 * 60 * 60 * 1000) {
      this.memory.update(text);
      return {
        text: this.handleOldFriendReturn(),
        emotion: 'miss',
        intensity: 0.7,
        aiMood: this.moodSystem.getMood(),
        aiMoodEmoji: this.moodSystem.getEmoji(),
      };
    }

    if (this.isAskingIdentity(text)) {
      this.memory.update(text);
      return {
        text: this.handleIdentity(),
        emotion: 'calm',
        intensity: 0.5,
        aiMood: this.moodSystem.getMood(),
        aiMoodEmoji: this.moodSystem.getEmoji(),
      };
    }

    if (this.isAskingMemory(text)) {
      this.memory.update(text);
      return {
        text: this.handleMemoryQuery(),
        emotion: 'calm',
        intensity: 0.6,
        aiMood: this.moodSystem.getMood(),
        aiMoodEmoji: this.moodSystem.getEmoji(),
      };
    }

    // 新增：询问AI心情
    if (this.isAskingMood(text)) {
      this.memory.update(text);
      return {
        text: this.handleMoodQuery(),
        emotion: 'calm',
        intensity: 0.5,
        aiMood: this.moodSystem.getMood(),
        aiMoodEmoji: this.moodSystem.getEmoji(),
        type: 'mood_query',
      };
    }

    if (this.isGreeting(text)) {
      this.memory.update(text, 'happy');
      // 用户问候会影响AI心情
      this.moodSystem.reactToUserEmotion('happy', 0.5);
      return {
        text: this.generator.getGreeting(memory),
        emotion: 'happy',
        intensity: 0.7,
        aiMood: this.moodSystem.getMood(),
        aiMoodEmoji: this.moodSystem.getEmoji(),
      };
    }

    if (this.isTooShort(text)) {
      this.memory.update(text);
      return {
        text: this.generator.getShortResponse(),
        emotion: 'calm',
        intensity: 0.3,
        aiMood: this.moodSystem.getMood(),
        aiMoodEmoji: this.moodSystem.getEmoji(),
      };
    }

    // 情感分类
    const emotionResult = this.classifier.classify(text);

    // 更新心情系统（受用户情绪影响）
    this.moodSystem.reactToUserEmotion(emotionResult.emotion, emotionResult.intensity);
    this.moodSystem.reactToUserMessage(text);

    // 更新记忆
    this.memory.update(text, emotionResult.emotion);

    // 知识问答优先
    const knowledgeResult = this.knowledge.search(text);
    if (knowledgeResult) {
      const intro = this.analyzer.getKnowledgeIntro();
      return {
        text: `${intro} ${knowledgeResult.answer}`,
        emotion: 'calm',
        intensity: 0.6,
        type: 'knowledge',
        category: knowledgeResult.category,
        aiMood: this.moodSystem.getMood(),
        aiMoodEmoji: this.moodSystem.getEmoji(),
      };
    }

    // 话题分析
    const topicResult = this.analyzer.analyze(text);
    if (topicResult) {
      if (topicResult.type === 'reasoning') {
        return {
          text: topicResult.response,
          emotion: emotionResult.emotion,
          intensity: emotionResult.intensity,
          type: 'reasoning',
          aiMood: this.moodSystem.getMood(),
          aiMoodEmoji: this.moodSystem.getEmoji(),
        };
      }

      if (topicResult.type === 'topic') {
        const isKnowledgeQuestion = this.knowledge.isKnowledgeQuestion(text);
        if (!isKnowledgeQuestion) {
          return {
            text: topicResult.response,
            emotion: emotionResult.emotion,
            intensity: emotionResult.intensity,
            type: 'topic',
            topic: topicResult.topic,
            aiMood: this.moodSystem.getMood(),
            aiMoodEmoji: this.moodSystem.getEmoji(),
          };
        }
      }
    }

    // 获取当前AI心情
    const aiMood = this.moodSystem.getMood();

    // 根据AI心情和用户情绪生成回复
    // 30%概率使用心情驱动的回复，70%使用情感驱动的回复
    const useMoodResponse = Math.random() < 0.3;

    let responseText;
    if (useMoodResponse) {
      responseText = this.moodGenerator.generate(aiMood, emotionResult.emotion, emotionResult.intensity);
    } else {
      const response = this.generator.generate(
        emotionResult.emotion,
        emotionResult.intensity,
        memory
      );
      responseText = response.text;
    }

    return {
      text: responseText,
      emotion: emotionResult.emotion,
      intensity: emotionResult.intensity,
      confidence: emotionResult.confidence,
      emotionLabel: EMOTION_LABELS[emotionResult.emotion],
      type: useMoodResponse ? 'mood_driven' : 'emotion',
      aiMood,
      aiMoodEmoji: this.moodSystem.getEmoji(),
      aiMoodLabel: MOOD_LABELS[aiMood],
    };
  }

  async replyStream(userText, onToken, onDone) {
    const result = this.reply(userText);

    let thinkTime = 300 + Math.random() * 500 + result.intensity * 300;
    if (result.type === 'knowledge') {
      thinkTime = 500 + Math.random() * 500;
    }
    if (result.type === 'reasoning') {
      thinkTime = 400 + Math.random() * 400;
    }
    if (result.type === 'mood_query') {
      thinkTime = 200 + Math.random() * 200;
    }
    await new Promise(resolve => setTimeout(resolve, thinkTime));

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
      const delay = /[，。！？,.!?]/.test(text[i]) ? 80 + Math.random() * 50 : 25 + Math.random() * 30;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    if (onDone) {
      onDone(result);
    }

    return result;
  }

  getProactiveMessage() {
    if (this.memory.isFirstChat()) return null;

    const awayMs = this.memory.getAwayDuration();
    if (!awayMs || awayMs < 60 * 60 * 1000) return null;

    const mem = this.memory.getContext();
    let msg = this.generator.getProactive();

    if (mem.userName) {
      msg = `${mem.userName}，${msg}`;
    }

    return msg;
  }

  getStats() {
    return this.memory.getStats();
  }

  clearMemory() {
    this.memory.clear();
    this.moodSystem.reset();
  }

  getCurrentEmotion() {
    return this.memory.getRecentEmotion();
  }

  getCurrentMood() {
    return {
      mood: this.moodSystem.getMood(),
      emoji: this.moodSystem.getEmoji(),
      label: this.moodSystem.getLabel(),
      value: this.moodSystem.getMoodValue(),
      intensity: this.moodSystem.getIntensity(),
      trend: this.moodSystem.getTrend(),
    };
  }
}

export { CompanionAI };
