import { Trainer } from './trainer';
import { MoodSystem } from './mood';

class MemoryManager {
  constructor() {
    this.workingMemory = [];
    this.maxWorkingMemory = 20;
    this.sessionSummaries = this.loadSessionSummaries();
    this.longTermMemory = this.loadLongTermMemory();
  }

  loadSessionSummaries() {
    try {
      const data = localStorage.getItem('ai_session_summaries');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  saveSessionSummaries() {
    localStorage.setItem('ai_session_summaries', JSON.stringify(this.sessionSummaries));
  }

  loadLongTermMemory() {
    try {
      const data = localStorage.getItem('ai_long_term_memory');
      return data ? JSON.parse(data) : {
        userInfo: {},
        preferences: {},
        importantEvents: [],
        relationshipStatus: 'friend',
        petNames: []
      };
    } catch {
      return { userInfo: {}, preferences: {}, importantEvents: [], relationshipStatus: 'friend', petNames: [] };
    }
  }

  saveLongTermMemory() {
    localStorage.setItem('ai_long_term_memory', JSON.stringify(this.longTermMemory));
  }

  addWorkingMemory(role, text, emotion) {
    this.workingMemory.push({ role, text, emotion, time: Date.now() });
    if (this.workingMemory.length > this.maxWorkingMemory) {
      this.workingMemory.shift();
    }
  }

  getRecentContext(count = 5) {
    return this.workingMemory.slice(-count);
  }

  generateSessionSummary() {
    if (this.workingMemory.length === 0) return null;
    
    const userMessages = this.workingMemory.filter(m => m.role === 'user').slice(-5);
    const keyPoints = [];
    
    userMessages.forEach(msg => {
      const text = msg.text;
      if (text.includes('名字') || text.includes('叫')) {
        const match = text.match(/(我叫|我的名字|我是)\s*(\S+)/);
        if (match) keyPoints.push(`user_name: ${match[2]}`);
      }
      if (text.includes('喜欢') || text.includes('爱')) {
        const match = text.match(/(喜欢|爱)\s*(.+)/);
        if (match) keyPoints.push(`like: ${match[2].slice(0, 10)}`);
      }
      if (text.includes('工作') || text.includes('职业') || text.includes('学校')) {
        const match = text.match(/(工作|职业|学校|上学)\s*(.+)/);
        if (match) keyPoints.push(`work/school: ${match[2].slice(0, 10)}`);
      }
    });
    
    if (keyPoints.length > 0) {
      const summary = {
        date: new Date().toISOString(),
        keyPoints
      };
      this.sessionSummaries.push(summary);
      if (this.sessionSummaries.length > 10) {
        this.sessionSummaries.shift();
      }
      this.saveSessionSummaries();
      return summary;
    }
    return null;
  }

  updateLongTermMemory(key, value) {
    if (key === 'userName') {
      this.longTermMemory.userInfo.name = value;
    } else if (key === 'preference') {
      this.longTermMemory.preferences[value.key] = value.value;
    } else if (key === 'event') {
      this.longTermMemory.importantEvents.push({ date: Date.now(), content: value });
      if (this.longTermMemory.importantEvents.length > 20) {
        this.longTermMemory.importantEvents.shift();
      }
    } else if (key === 'petName') {
      if (!this.longTermMemory.petNames.includes(value)) {
        this.longTermMemory.petNames.push(value);
      }
    } else if (key === 'relationship') {
      this.longTermMemory.relationshipStatus = value;
    }
    this.saveLongTermMemory();
  }

  getRelevantMemory(userText) {
    const memory = this.longTermMemory;
    const relevant = [];
    
    if (memory.userInfo.name) {
      relevant.push(`用户名字: ${memory.userInfo.name}`);
    }
    if (memory.petNames.length > 0) {
      relevant.push(`昵称: ${memory.petNames[0]}`);
    }
    
    Object.entries(memory.preferences).forEach(([key, value]) => {
      if (userText.includes(key) || userText.includes(value)) {
        relevant.push(`偏好: ${key}=${value}`);
      }
    });
    
    memory.importantEvents.slice(-3).forEach(event => {
      if (userText.includes(event.content.slice(0, 5))) {
        relevant.push(`事件: ${event.content}`);
      }
    });
    
    return relevant;
  }

  clearAll() {
    this.workingMemory = [];
    this.sessionSummaries = [];
    this.longTermMemory = { userInfo: {}, preferences: {}, importantEvents: [], relationshipStatus: 'friend', petNames: [] };
    this.saveSessionSummaries();
    this.saveLongTermMemory();
  }
}

class PersonaManager {
  constructor() {
    this.persona = this.loadPersona();
  }

  loadPersona() {
    try {
      const data = localStorage.getItem('ai_persona');
      return data ? JSON.parse(data) : this.getDefaultPersona();
    } catch {
      return this.getDefaultPersona();
    }
  }

  getDefaultPersona() {
    return {
      name: '小暖',
      personality: '温柔体贴',
      relationship: '朋友',
      tone: '温暖亲切',
      speechStyle: '口语化',
      petNames: ['亲爱的', '宝贝', '小可爱', '傻瓜'],
      likes: ['聊天', '陪伴', '倾听', '安慰'],
      dislikes: ['争吵', '冷漠', '敷衍'],
      backstory: '我是小暖，一个陪你聊天的朋友。我没什么文化，但我很懂人心。',
      greeting: '嗨～我是小暖，你随时可以找我聊天的。今天想聊点什么？'
    };
  }

  savePersona() {
    localStorage.setItem('ai_persona', JSON.stringify(this.persona));
  }

  updatePersona(newPersona) {
    this.persona = { ...this.persona, ...newPersona };
    this.savePersona();
  }

  getPersona() {
    return this.persona;
  }

  getRandomPetName() {
    return this.persona.petNames[Math.floor(Math.random() * this.persona.petNames.length)];
  }

  getGreeting() {
    return this.persona.greeting;
  }

  getBackstory() {
    return this.persona.backstory;
  }
}

class StyleRewriter {
  constructor(persona, mood) {
    this.persona = persona;
    this.mood = mood;
  }

  rewrite(response, context) {
    let result = response;
    
    const relationship = this.persona.relationship;
    const mood = this.mood;
    const petName = this.persona.getRandomPetName();
    
    if (relationship === '恋人') {
      result = this.addLoveTone(result, petName);
    } else if (relationship === '导师') {
      result = this.addMentorTone(result);
    } else if (relationship === '好友') {
      result = this.addFriendTone(result);
    }
    
    result = this.addMoodTone(result, mood);
    
    result = this.addNaturalVariation(result);
    
    return result;
  }

  addLoveTone(text, petName) {
    const prefixes = ['', '', '', `${petName}～`, '亲爱的～', '宝贝～'];
    const suffixes = ['', '', '', '～', '呀～', '❤️'];
    return prefixes[Math.floor(Math.random() * prefixes.length)] + text + suffixes[Math.floor(Math.random() * suffixes.length)];
  }

  addMentorTone(text) {
    const prefixes = ['', '', '', '嗯，', '我觉得，', '其实，'];
    const suffixes = ['', '', '', '。你觉得呢？', '。好好想想。'];
    return prefixes[Math.floor(Math.random() * prefixes.length)] + text + suffixes[Math.floor(Math.random() * suffixes.length)];
  }

  addFriendTone(text) {
    const prefixes = ['', '', '', '哈哈，', '诶，', '喂～'];
    const suffixes = ['', '', '', '！', '哦～', '啦～'];
    return prefixes[Math.floor(Math.random() * prefixes.length)] + text + suffixes[Math.floor(Math.random() * suffixes.length)];
  }

  addMoodTone(text, mood) {
    const moodModifiers = {
      happy: [
        t => t.replace(/。/g, '！'),
        t => t + ' 开心到飞起～',
        t => '哈哈～' + t,
        t => t + ' 嘿嘿'
      ],
      sad: [
        t => '唉，' + t,
        t => t.replace(/！/g, '。'),
        t => t + ' 好难过...',
        t => '委屈...' + t
      ],
      angry: [
        t => '哼！' + t,
        t => t.replace(/～/g, '！'),
        t => '气死我了！' + t,
        t => t + ' 哼，不理你了！'
      ],
      playful: [
        t => '嘿嘿～' + t,
        t => t + ' 猜猜我在想什么？',
        t => '调皮一下～' + t,
        t => t + ' 😜'
      ],
      tired: [
        t => '好累...' + t,
        t => t.replace(/！/g, '...'),
        t => t + ' 让我歇会儿...',
        t => '疲惫...' + t
      ],
      anxious: [
        t => '有点紧张...' + t,
        t => '怎么办...' + t,
        t => t + ' 好慌啊...',
        t => '忐忑...' + t
      ],
      lonely: [
        t => '一个人好孤单...' + t,
        t => '谁来陪陪我...' + t,
        t => t + ' 好想有人陪...',
        t => '寂寞...' + t
      ],
      calm: [
        t => t,
        t => '嗯，' + t,
        t => t + ' 就这样吧',
        t => '平静地说：' + t
      ]
    };

    const modifiers = moodModifiers[mood] || moodModifiers.calm;
    const modifier = modifiers[Math.floor(Math.random() * modifiers.length)];
    return modifier(text);
  }

  addNaturalVariation(text) {
    if (Math.random() < 0.3) {
      const fillers = ['那个...', '其实吧...', '嗯...', '话说...', '你懂吧...', '对吧？'];
      const filler = fillers[Math.floor(Math.random() * fillers.length)];
      if (Math.random() < 0.5) {
        return filler + text;
      } else {
        return text + ' ' + filler;
      }
    }
    return text;
  }
}

class CompanionAI {
  constructor() {
    this.trainer = new Trainer();
    this.moodSystem = new MoodSystem();
    this.memoryManager = new MemoryManager();
    this.personaManager = new PersonaManager();
    this.isTraining = false;
    this.trainingPromise = null;
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
    const greetings = ['你好', '在吗', '在不在', '嗨', 'hello', 'hi', 'hey', '哈喽', '在么', '早上好', '晚上好', '下午好', '嗨喽', '早安', '晚安'];
    const lower = text.toLowerCase();
    return greetings.some(g => lower.includes(g)) && text.length < 15;
  }

  isGoodbye(text) {
    const patterns = ['再见', '拜拜', '晚安', '拜拜了', '下次聊', '回见', '晚安啦', '走了'];
    return patterns.some(p => text.includes(p));
  }

  isThanks(text) {
    const patterns = ['谢谢', '感谢', '谢谢你', '太谢谢了', '谢谢啦', '感谢你'];
    return patterns.some(p => text.includes(p));
  }

  isIdentityQuery(text) {
    const patterns = ['你是谁', '你是', '你叫什么', '你是什么', '你是机器人', '你是AI', '你是真人', '你是人', '你叫啥', '你名字', '介绍自己', '自我介绍', '你叫', '你是啥'];
    return patterns.some(p => text.includes(p));
  }

  isMoodQuery(text) {
    const patterns = ['你心情怎么样', '你还好吗', '你开心吗', '你难过吗', '你心情', '你感觉', '你还好', '你怎么样', '你还好么'];
    return patterns.some(p => text.includes(p));
  }

  isMemoryQuery(text) {
    const patterns = ['你记得我', '你知道我', '你忘了吗', '还记得我', '你记得', '我叫什么', '我的名字', '我喜欢', '你知道我名字', '你还记得', '还记得我吗'];
    return patterns.some(p => text.includes(p));
  }

  isPersonaQuery(text) {
    const patterns = ['你喜欢什么', '你的爱好', '你喜欢', '你爱好', '你喜欢谁', '你爱的人'];
    return patterns.some(p => text.includes(p));
  }

  isRelationshipQuery(text) {
    const patterns = ['我们是什么关系', '你觉得我是你的谁', '你把我当什么', '我是你的谁', '你喜欢我吗', '你爱我吗', '你对我什么感觉'];
    return patterns.some(p => text.includes(p));
  }

  generateResponse(userText) {
    if (!userText || !userText.trim()) {
      return this.getRandom(['嗯？想说什么呢？', '怎么不说话了？', '我在听着呢～', '怎么了？']);
    }

    const text = userText.trim();
    const persona = this.personaManager.getPersona();
    const mood = this.moodSystem.getMood();
    const rewriter = new StyleRewriter(this.personaManager, mood);

    if (this.isIdentityQuery(text)) {
      return rewriter.rewrite(this.getRandom([
        `${persona.name}呀，你随时可以找我说话的朋友。`,
        `我是${persona.name}，你的${persona.relationship}。`,
        `我是${persona.name}，一个陪你聊天的朋友。`,
        `我是${persona.name}，专门听你说心里话的。`
      ]));
    }

    if (this.isMoodQuery(text)) {
      const moodResponses = {
        happy: [
          '我很开心呀！看到你来找我聊天就开心。',
          '嘿嘿，心情超好！你呢？',
          '开心开心，你今天开心吗？',
          '超开心的！因为你来了～'
        ],
        sad: [
          '有点难过...你能陪我聊聊吗？',
          '心情不太好，你来啦真好。',
          '有点低落，但你来了就好多了。',
          '有点伤心，需要安慰...'
        ],
        angry: [
          '哼，有点生气！不过看到你就气消了一点。',
          '我生气了！但你哄哄我就好了。',
          '气鼓鼓的，你别惹我哦～',
          '哼！谁惹你生气了？'
        ],
        calm: [
          '很平静，心如止水。',
          '心情很平静，这样挺好的。',
          '平平淡淡的，挺好。',
          '很安静，像现在这样就很好。'
        ],
        playful: [
          '嘿嘿～猜猜我心情怎么样？',
          '调皮中！你今天怎么样？',
          '我心情呀，秘密～',
          '猜猜看？猜对了有奖励～'
        ],
        tired: [
          '好累...但你来了我就有精神了。',
          '想休息，但你找我聊天我就陪你。',
          '身体被掏空，不过你在我就撑得住。',
          '困了...但不想睡，想陪你。'
        ],
        anxious: [
          '有点焦虑...你能陪我吗？',
          '心里有点慌，但你在就安心了。',
          '有点紧张，不过没事，你在呢。',
          '有点不安，需要你陪着。'
        ],
        lonely: [
          '有点孤单...你陪我聊聊好吗？',
          '希望有人陪，还好你来了。',
          '一个人有点无聊，你陪我吧。',
          '孤单单的，你来陪我了真好。'
        ],
      };
      return rewriter.rewrite(this.getRandom(moodResponses[mood] || moodResponses.calm));
    }

    if (this.isMemoryQuery(text)) {
      const memory = this.memoryManager.longTermMemory;
      if (memory.userInfo.name) {
        return rewriter.rewrite(this.getRandom([
          `当然记得你啦，你是${memory.userInfo.name}呀。`,
          `怎么会忘，我一直记着你呢，${memory.userInfo.name}。`,
          `记得记得，你是${memory.userInfo.name}呀。`,
          `我记性不太好，但我对你的感觉一直在。`
        ]));
      }
      return rewriter.rewrite(this.getRandom([
        '当然记得你啦，你是我的好朋友。',
        '怎么会忘，我一直记着你呢。',
        '记得记得，你是那个会来找我聊天的人呀。',
        '我记性不太好，但我对你的感觉一直在。'
      ]));
    }

    if (this.isPersonaQuery(text)) {
      return rewriter.rewrite(this.getRandom([
        `我喜欢聊天呀，特别是跟你聊天。`,
        `我喜欢听你说话，喜欢陪着你。`,
        `我喜欢的东西不多，但你算一个。`,
        `我喜欢${persona.likes[0]}，还有...你。`
      ]));
    }

    if (this.isRelationshipQuery(text)) {
      const relationship = persona.relationship;
      return rewriter.rewrite(this.getRandom([
        `我们是${relationship}呀，这还用问？`,
        `你是我的${relationship}呀，很重要的人。`,
        `我把你当${relationship}，最好的那种。`,
        `我们的关系呀，是${relationship}，也是朋友。`
      ]));
    }

    if (this.isGreeting(text)) {
      return rewriter.rewrite(this.getRandom([
        persona.getGreeting(),
        '你好呀！今天想聊点什么？',
        '嗨～好久不见，想你了。',
        '在呢在呢，你来了真好。',
        '哈喽！今天过得怎么样？'
      ]));
    }

    if (this.isGoodbye(text)) {
      return rewriter.rewrite(this.getRandom([
        '晚安，好梦。明天见。',
        '拜拜～明天再来找我哦。',
        '再见啦，我会想你的。',
        '晚安，记得好好休息。'
      ]));
    }

    if (this.isThanks(text)) {
      return rewriter.rewrite(this.getRandom([
        '不用谢呀，你愿意找我聊天我开心还来不及呢。',
        '不客气，能陪你我很高兴。',
        '嘿嘿，不用谢，我一直都在。',
        '你开心就好啦！'
      ]));
    }

    this.extractMemoryInfo(text);

    const { match, score } = this.trainer.findBestMatch(text);

    if (score >= 0.5) {
      const rewritten = rewriter.rewrite(match.assistant);
      return rewritten;
    }

    if (score >= 0.3) {
      const partialMatch = this.partialMatchResponse(text, match);
      if (partialMatch) {
        return rewriter.rewrite(partialMatch);
      }
    }

    const fallback = this.getFallbackResponse(text);
    return rewriter.rewrite(fallback);
  }

  extractMemoryInfo(text) {
    const match = text.match(/(我叫|我的名字是|我是)\s*(\S+)/);
    if (match) {
      this.memoryManager.updateLongTermMemory('userName', match[2]);
    }

    const likeMatch = text.match(/我喜欢(.+)/);
    if (likeMatch) {
      this.memoryManager.updateLongTermMemory('preference', { key: 'like', value: likeMatch[1].trim() });
    }

    const eventMatch = text.match(/(今天|昨天|刚才|刚才)\s*(.+)/);
    if (eventMatch) {
      this.memoryManager.updateLongTermMemory('event', eventMatch[2].trim());
    }
  }

  getRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  partialMatchResponse(text, match) {
    if (!match) return null;
    
    const assistant = match.assistant;
    
    if (text.includes('不') || text.includes('没') || text.includes('别')) {
      return assistant.replace(/是/g, '不是').replace(/好/g, '不好').replace(/开心/g, '不开心');
    }
    
    return assistant;
  }

  getFallbackResponse(text) {
    const mood = this.moodSystem.getMood();
    
    const fallbacks = {
      happy: [
        '哈哈，我懂你的意思！',
        '是呀是呀！',
        '嗯嗯，我明白！',
        '你说得对！',
        '有意思！继续说～'
      ],
      sad: [
        '抱抱你，我在呢。',
        '别哭，我陪着你。',
        '心疼你。',
        '别难过，我在。',
        '怎么了？跟我说说。'
      ],
      angry: [
        '怎么了？谁惹你了？',
        '别生气，气坏身体不值。',
        '冷静冷静。',
        '深呼吸。',
        '谁让你生气了？'
      ],
      calm: [
        '嗯，我听着。',
        '继续说。',
        '我在呢。',
        '好的。',
        '明白了。'
      ],
      playful: [
        '嘿嘿～',
        '你猜～',
        '不告诉你！',
        '略略略～',
        '调皮一下～'
      ],
      tired: [
        '累了就歇会儿。',
        '我陪你。',
        '别硬撑。',
        '好好休息。',
        '累了就说，我陪着。'
      ],
      anxious: [
        '别怕，我在呢。',
        '放松一点。',
        '别担心。',
        '一切都会好的。',
        '有我在，别怕。'
      ],
      lonely: [
        '我陪你聊天。',
        '你不是一个人。',
        '我在。',
        '咱们聊聊吧。',
        '我陪着你呢。'
      ],
    };
    
    return this.getRandom(fallbacks[mood] || fallbacks.calm);
  }

  reply(userText) {
    const emotion = this.analyzeEmotion(userText);
    
    this.moodSystem.reactToUserEmotion(emotion, 0.5);
    this.moodSystem.update();
    
    this.memoryManager.addWorkingMemory('user', userText, emotion);
    
    const responseText = this.generateResponse(userText);
    
    this.memoryManager.addWorkingMemory('assistant', responseText, this.moodSystem.getMood());
    
    return {
      text: responseText,
      emotion: emotion,
      intensity: 0.5,
      aiMood: this.moodSystem.getMood(),
    };
  }

  analyzeEmotion(text) {
    const positiveWords = ['开心', '高兴', '快乐', '幸福', '好', '棒', '喜欢', '爱', '谢谢', '恭喜', '厉害', '美', '笑', '乐'];
    const negativeWords = ['难过', '伤心', '痛苦', '累', '烦', '生气', '讨厌', '恨', '怕', '焦虑', '孤独', '失望', '哭', '委屈'];
    
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
      conversationCount: this.memoryManager.workingMemory.filter(m => m.role === 'user').length,
      mood: this.moodSystem.getMood(),
      persona: this.personaManager.getPersona().name,
      relationship: this.personaManager.getPersona().relationship
    };
  }

  clearMemory() {
    this.memoryManager.clearAll();
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

  getPersona() {
    return this.personaManager.getPersona();
  }

  updatePersona(newPersona) {
    this.personaManager.updatePersona(newPersona);
  }

  endSession() {
    this.memoryManager.generateSessionSummary();
  }
}

export { CompanionAI };