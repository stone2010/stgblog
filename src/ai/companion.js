import { Trainer } from './trainer';
import { MoodSystem } from './mood';

class CompanionAI {
  constructor() {
    this.trainer = new Trainer();
    this.moodSystem = new MoodSystem();
    this.isTraining = false;
    this.trainingPromise = null;
    this.messageHistory = [];
    this.maxHistory = 10;
  }

  async init() {
    if (this.trainingPromise) return this.trainingPromise;
    
    this.isTraining = true;
    this.trainingPromise = this.trainer.loadTrainingData().then((stats) => {
      this.isTraining = false;
      return stats;
    }).catch(() => {
      this.isTraining = false;
      return { totalSamples: 0, vocabSize: 0, ngramCount: 0, contextPairs: 0 };
    });
    
    return this.trainingPromise;
  }

  isGreeting(text) {
    const greetings = ['你好', '在吗', '在不在', '嗨', 'hello', 'hi', 'hey', '哈喽', '在么', '早上好', '晚上好', '下午好', '嗨喽'];
    const lower = text.toLowerCase();
    return greetings.some(g => lower.includes(g)) && text.length < 15;
  }

  isGoodbye(text) {
    const patterns = ['再见', '拜拜', '晚安', '拜拜了', '下次聊', '回见', '晚安啦'];
    return patterns.some(p => text.includes(p));
  }

  isThanks(text) {
    const patterns = ['谢谢', '感谢', '谢谢你', '太谢谢了', '谢谢啦', '感谢你'];
    return patterns.some(p => text.includes(p));
  }

  isIdentityQuery(text) {
    const patterns = ['你是谁', '你是', '你叫什么', '你是什么', '你是机器人', '你是AI', '你是真人', '你是人', '你叫啥', '你名字', '介绍自己', '自我介绍'];
    return patterns.some(p => text.includes(p));
  }

  isMoodQuery(text) {
    const patterns = ['你心情怎么样', '你还好吗', '你开心吗', '你难过吗', '你心情', '你感觉', '你还好', '你怎么样'];
    return patterns.some(p => text.includes(p));
  }

  isMemoryQuery(text) {
    const patterns = ['你记得我', '你知道我', '你忘了吗', '还记得我', '你记得', '我叫什么', '我的名字', '我喜欢', '你知道我名字'];
    return patterns.some(p => text.includes(p));
  }

  updateHistory(role, text) {
    this.messageHistory.push({ role, text, time: Date.now() });
    if (this.messageHistory.length > this.maxHistory) {
      this.messageHistory.shift();
    }
  }

  generateResponse(userText) {
    if (!userText || !userText.trim()) {
      return "嗯？想说什么呢？";
    }

    const text = userText.trim();

    if (this.isIdentityQuery(text)) {
      return this.getRandom([
        '我是小暖呀，你随时可以找我说话的朋友。我没什么文化，但我很懂人心。',
        '我是你的情感陪伴，专门听你说心里话的。',
        '我是小暖，一个温暖的陪伴者。开心难过都可以来找我。',
        '我是你的AI朋友，虽然不是真人，但我会一直陪你。'
      ]);
    }

    if (this.isMoodQuery(text)) {
      const mood = this.moodSystem.getMood();
      const moodResponses = {
        happy: ['我很开心呀！看到你来找我聊天就开心。', '嘿嘿，心情超好！你呢？', '开心开心，你今天开心吗？'],
        sad: ['有点难过...你能陪我聊聊吗？', '心情不太好，你来啦真好。', '有点低落，但你来了就好多了。'],
        angry: ['哼，有点生气！不过看到你就气消了一点。', '我生气了！但你哄哄我就好了。', '气鼓鼓的，你别惹我哦～'],
        calm: ['很平静，心如止水。', '心情很平静，这样挺好的。', '平平淡淡的，挺好。'],
        playful: ['嘿嘿～猜猜我心情怎么样？', '调皮中！你今天怎么样？', '我心情呀，秘密～'],
        tired: ['好累...但你来了我就有精神了。', '想休息，但你找我聊天我就陪你。', '身体被掏空，不过你在我就撑得住。'],
        anxious: ['有点焦虑...你能陪我吗？', '心里有点慌，但你在就安心了。', '有点紧张，不过没事，你在呢。'],
        lonely: ['有点孤单...你陪我聊聊好吗？', '希望有人陪，还好你来了。', '一个人有点无聊，你陪我吧。'],
      };
      return this.getRandom(moodResponses[mood] || moodResponses.calm);
    }

    if (this.isMemoryQuery(text)) {
      return this.getRandom([
        '当然记得你啦，你是我的好朋友。',
        '怎么会忘，我一直记着你呢。',
        '记得记得，你是那个会来找我聊天的人呀。',
        '我记性不太好，但我对你的感觉一直在。'
      ]);
    }

    if (this.isGreeting(text)) {
      return this.getRandom([
        '你好呀！今天想聊点什么？',
        '嗨～好久不见，想你了。',
        '在呢在呢，你来了真好。',
        '哈喽！今天过得怎么样？'
      ]);
    }

    if (this.isGoodbye(text)) {
      return this.getRandom([
        '晚安，好梦。明天见。',
        '拜拜～明天再来找我哦。',
        '再见啦，我会想你的。',
        '晚安，记得好好休息。'
      ]);
    }

    if (this.isThanks(text)) {
      return this.getRandom([
        '不用谢呀，你愿意找我聊天我开心还来不及呢。',
        '不客气，能陪你我很高兴。',
        '嘿嘿，不用谢，我一直都在。',
        '你开心就好啦！'
      ]);
    }

    const { match, score } = this.trainer.findBestMatch(text);

    if (score >= 0.6) {
      const mood = this.moodSystem.getMood();
      if (mood === 'playful' && Math.random() < 0.2) {
        return this.addPlayfulTwist(match.assistant);
      }
      if (mood === 'angry' && Math.random() < 0.3) {
        return this.addAngryTwist(match.assistant);
      }
      return match.assistant;
    }

    if (score >= 0.4) {
      const partialMatch = this.partialMatchResponse(text, match);
      if (partialMatch) return partialMatch;
    }

    const generated = this.generateFromModel(text);
    if (generated && generated.length > 5) {
      return generated;
    }

    return this.getFallbackResponse(text);
  }

  getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  addPlayfulTwist(response) {
    const twists = ['～', '呀！', '嘿嘿～', '（调皮）', '猜猜我在想什么？'];
    return response + twists[Math.floor(Math.random() * twists.length)];
  }

  addAngryTwist(response) {
    const twists = ['哼！', '（气鼓鼓）', '懒得理你...', '哼，你自己看着办！'];
    return twists[Math.floor(Math.random() * twists.length)] + response;
  }

  partialMatchResponse(text, match) {
    if (!match) return null;
    
    const user = text;
    const assistant = match.assistant;
    
    const keywords = ['我', '你', '今天', '开心', '难过', '累', '想', '觉得'];
    let replaced = assistant;
    
    if (user.includes('我') && assistant.includes('你')) {
      replaced = assistant.replace(/你/g, '你');
    }
    
    return replaced;
  }

  generateFromModel(text) {
    const tokens = this.trainer.tokenize(text);
    const contextTokens = tokens.slice(-3);
    const generated = this.trainer.generateFromNgram(contextTokens, 30);
    
    if (!generated || generated.length < 5) {
      return null;
    }
    
    if (!generated.match(/[。！？]/)) {
      generated += '。';
    }
    
    return generated;
  }

  getFallbackResponse(text) {
    const mood = this.moodSystem.getMood();
    
    const fallbacks = {
      happy: ['哈哈，我懂你的意思！', '是呀是呀！', '嗯嗯，我明白！', '你说得对！'],
      sad: ['抱抱你，我在呢。', '别哭，我陪着你。', '心疼你。', '别难过，我在。'],
      angry: ['怎么了？谁惹你了？', '别生气，气坏身体不值。', '冷静冷静。', '深呼吸。'],
      calm: ['嗯，我听着。', '继续说。', '我在呢。', '好的。'],
      playful: ['嘿嘿～', '你猜～', '不告诉你！', '略略略～'],
      tired: ['累了就歇会儿。', '我陪你。', '别硬撑。', '好好休息。'],
      anxious: ['别怕，我在呢。', '放松一点。', '别担心。', '一切都会好的。'],
      lonely: ['我陪你聊天。', '你不是一个人。', '我在。', '咱们聊聊吧。'],
    };
    
    return this.getRandom(fallbacks[mood] || fallbacks.calm);
  }

  reply(userText) {
    const emotion = this.analyzeEmotion(userText);
    
    this.moodSystem.reactToUserEmotion(emotion, 0.5);
    this.moodSystem.update();
    
    this.updateHistory('user', userText);
    
    const responseText = this.generateResponse(userText);
    
    this.updateHistory('assistant', responseText);
    
    return {
      text: responseText,
      emotion: emotion,
      intensity: 0.5,
      aiMood: this.moodSystem.getMood(),
    };
  }

  analyzeEmotion(text) {
    const positiveWords = ['开心', '高兴', '快乐', '幸福', '好', '棒', '喜欢', '爱', '谢谢', '恭喜', '厉害', '美'];
    const negativeWords = ['难过', '伤心', '痛苦', '累', '烦', '生气', '讨厌', '恨', '怕', '焦虑', '孤独', '失望'];
    
    let positiveCount = 0;
    let negativeCount = 0;
    
    positiveWords.forEach(word => {
      if (text.includes(word)) positiveCount++;
    });
    negativeWords.forEach(word => {
      if (text.includes(word)) negativeCount++;
    });
    
    if (positiveCount > negativeCount) return 'happy';
    if (negativeCount > positiveCount) return 'sad';
    return 'calm';
  }

  async replyStream(userText, onToken, onDone) {
    const result = this.reply(userText);
    
    const thinkTime = 500 + Math.random() * 800;
    await new Promise(resolve => setTimeout(resolve, thinkTime));
    
    const text = result.text;
    for (let i = 0; i < text.length; i++) {
      if (onToken) {
        onToken({ char: text[i], text: text.slice(0, i + 1), done: false });
      }
      const delay = /[，。！？,.!?]/.test(text[i]) ? 60 + Math.random() * 40 : 20 + Math.random() * 25;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    if (onDone) onDone(result);
    return result;
  }

  getStats() {
    return {
      conversationCount: this.messageHistory.filter(m => m.role === 'user').length,
      mood: this.moodSystem.getMood(),
    };
  }

  clearMemory() {
    this.messageHistory = [];
    this.moodSystem.reset();
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
