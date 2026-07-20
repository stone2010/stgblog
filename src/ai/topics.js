// 话题理解系统 - 理解日常话题并提供适当回应

// 话题回复模板（针对不同话题的回复策略）
const TOPIC_RESPONSES = {
  weather: {
    general: [
      "天气确实会影响心情呢",
      "天气好的时候心情也会变好",
      "注意根据天气增减衣物哦",
      "天气变化多端，注意照顾好自己",
      "下雨天适合窝在家里",
      "晴天适合出去走走",
      "注意防晒/保暖哦",
    ],
    specific: {
      rain: ["下雨天记得带伞", "雨天空气很清新呢", "雨天适合听雨声"],
      sunny: ["晴天心情真好", "记得防晒哦", "适合出去散步"],
      cold: ["天冷记得多穿点", "注意保暖", "喝点热水暖暖身子"],
      hot: ["天热记得防暑", "多喝水", "注意降温"],
      snow: ["下雪了好漂亮", "注意防滑", "堆雪人吗"],
    },
  },

  food: {
    general: [
      "美食可以治愈一切",
      "吃好吃的最开心了",
      "想吃什么就去吃吧",
      "饮食要均衡哦",
      "好好吃饭很重要",
      "自己做饭也很有趣",
      "分享一下你爱吃的吧",
      "美食是生活的小确幸",
    ],
    specific: {
      breakfast: ["早餐很重要，一定要吃", "早餐吃什么呢", "早起吃早餐"],
      lunch: ["午餐要吃饱", "工作餐怎么样", "中午好好休息"],
      dinner: ["晚餐别吃太多", "晚上想吃什么", "回家吃饭吗"],
      snack: ["零食适量哦", "追剧必备零食", "吃点健康的零食"],
      fruit: ["多吃水果补充维生素", "水果很健康", "什么水果好吃"],
    },
  },

  work: {
    general: [
      "工作确实不容易",
      "辛苦了，好好休息",
      "工作压力大的时候要放松",
      "工作只是生活的一部分",
      "别太拼了，身体最重要",
      "工作顺利吗",
      "遇到问题别着急",
      "尽力就好，别太自责",
    ],
    specific: {
      overtime: ["加班辛苦了", "别熬夜", "注意身体"],
      boss: ["和老板沟通不容易", "职场沟通很重要", "做好自己的事"],
      colleague: ["同事关系很重要", "团队合作", "和同事好好相处"],
      meeting: ["开会确实累", "会议效率很重要", "开完会放松一下"],
      project: ["项目顺利吗", "遇到问题别慌", "一步一步来"],
    },
  },

  study: {
    general: [
      "学习是长期的过程",
      "努力就会有收获",
      "学习累了就休息一下",
      "劳逸结合很重要",
      "别给自己太大压力",
      "学习让我想起了学生时代",
      "有不懂的可以问问同学老师",
      "坚持就是胜利",
    ],
    specific: {
      exam: ["考试加油", "放松心态", "相信自己"],
      homework: ["作业写完了吗", "认真写作业", "别抄作业哦"],
      school: ["学校生活怎么样", "和同学相处好吗", "校园时光很美好"],
      teacher: ["老师怎么样", "有不懂的问老师", "尊重老师"],
      grade: ["成绩不重要，进步最重要", "别太在意分数", "努力就好"],
    },
  },

  entertainment: {
    general: [
      "适当娱乐很重要",
      "娱乐可以放松心情",
      "劳逸结合才是王道",
      "最近有什么好看的",
      "游戏别玩太久哦",
      "音乐可以治愈心情",
      "分享一下你喜欢的吧",
      "追剧很快乐",
    ],
    specific: {
      movie: ["最近有什么好看的电影", "电影评分怎么样", "看电影很放松"],
      game: ["游戏适度哦", "什么游戏好玩", "别沉迷游戏"],
      music: ["音乐可以调节心情", "喜欢什么类型的音乐", "唱歌好听吗"],
      star: ["追星要理智", "喜欢哪个明星", "明星也是普通人"],
      concert: ["演唱会很精彩", "抢到票了吗", "现场气氛很棒"],
    },
  },

  travel: {
    general: [
      "旅行可以开阔视野",
      "世界很大，值得去看看",
      "旅行的意义在于过程",
      "去哪里玩了",
      "旅途愉快吗",
      "拍了什么好看的照片",
      "旅行可以放松心情",
      "下次想去哪里",
    ],
    specific: {
      vacation: ["假期去哪里了", "假期过得开心吗", "假期结束了吗"],
      weekend: ["周末怎么安排", "周末出去玩吗", "周末好好休息"],
      scenery: ["风景怎么样", "拍照片了吗", "很美吧"],
      trip: ["旅途顺利吗", "路上辛苦了", "玩得开心"],
    },
  },

  relationship: {
    general: [
      "感情需要用心经营",
      "遇到对的人很重要",
      "爱自己才会爱别人",
      "感情里要互相理解",
      "别委屈自己",
      "开心最重要",
      "需要聊聊吗",
      "我在听",
    ],
    specific: {
      breakup: ["抱抱你", "会好起来的", "你值得更好的"],
      dating: ["约会开心吗", "对方怎么样", "慢慢来"],
      love: ["爱要勇敢表达", "珍惜眼前人", "祝福你们"],
      like: ["喜欢就去追", "别错过", "勇敢一点"],
      couple: ["情侣之间要互相包容", "祝福你们", "好好相处"],
    },
  },

  health: {
    general: [
      "身体是革命的本钱",
      "健康最重要",
      "注意锻炼身体",
      "定期体检很重要",
      "别熬夜",
      "多喝水",
      "身体不舒服要及时看医生",
      "健康生活方式很重要",
    ],
    specific: {
      sick: ["生病了要好好休息", "按时吃药", "早日康复"],
      hospital: ["去医院了吗", "医生怎么说", "照顾好自己"],
      exercise: ["运动有益健康", "别过度运动", "坚持锻炼"],
      diet: ["饮食要均衡", "别吃太油腻", "多吃蔬菜"],
      sleep: ["早睡早起身体好", "别熬夜", "保证充足睡眠"],
    },
  },

  family: {
    general: [
      "家人是最重要的",
      "家和万事兴",
      "常回家看看",
      "家人永远支持你",
      "家庭很温暖",
      "和家人好好相处",
      "珍惜和家人在一起的时光",
      "家人是坚强的后盾",
    ],
    specific: {
      parents: ["爸妈辛苦了", "常给家里打电话", "孝敬父母"],
      child: ["孩子很可爱", "照顾孩子不容易", "陪伴最重要"],
      reunion: ["团聚真好", "好久没见了吧", "珍惜相聚时光"],
      holiday: ["过年回家吗", "假期和家人一起", "家人团聚很幸福"],
    },
  },

  tech: {
    general: [
      "科技发展真快",
      "AI越来越厉害了",
      "科技改变生活",
      "新技术很有趣",
      "小心沉迷手机",
      "科技双刃剑",
      "你对科技感兴趣吗",
      "未来很值得期待",
    ],
    specific: {
      phone: ["什么手机好用", "手机别玩太久", "新手机吗"],
      computer: ["电脑怎么样", "工作学习需要", "注意保护眼睛"],
      ai: ["AI很有趣", "AI可以帮很多忙", "人和AI共存"],
      internet: ["网络很方便", "注意网络安全", "网络双刃剑"],
      game: ["游戏好玩吗", "适度游戏", "别沉迷"],
    },
  },
};

// 逻辑推理模块
const REASONING_PATTERNS = [
  {
    pattern: /如果(.*)那么(.*)/,
    responses: [
      "逻辑很清晰，条件和结果的关系很明确",
      "这是一个典型的条件推理呢",
      "你的思考很有条理",
      "从前提到结论，推理得很顺畅",
    ],
  },
  {
    pattern: /因为(.*)所以(.*)/,
    responses: [
      "因果关系很明确",
      "原因和结果的联系很紧密",
      "你的分析很有道理",
      "这个因果链条很完整",
    ],
  },
  {
    pattern: /为什么(.*)/,
    responses: [
      "这是一个很好的问题",
      "探究原因很重要",
      "让我们一起思考",
      "好奇心是进步的动力",
    ],
  },
  {
    pattern: /是不是(.*)/,
    responses: [
      "这确实值得思考",
      "你的推测很合理",
      "有可能是这样",
      "需要进一步验证",
    ],
  },
  {
    pattern: /应该(.*)/,
    responses: [
      "你的建议很合理",
      "这个做法很明智",
      "考虑得很周全",
      "确实应该这样做",
    ],
  },
  {
    pattern: /如果不(.*)会怎么样/,
    responses: [
      "反向思考也很重要",
      "后果确实值得考虑",
      "未雨绸缪是个好习惯",
      "考虑风险很必要",
    ],
  },
  {
    pattern: /只有(.*)才(.*)/,
    responses: [
      "必要条件的推理很严谨",
      "这个逻辑很严密",
      "条件和结果的关系很清楚",
      "你的分析很透彻",
    ],
  },
  {
    pattern: /只要(.*)就(.*)/,
    responses: [
      "充分条件的推理",
      "这个逻辑很顺畅",
      "条件满足结果就会出现",
      "你的思考很有条理",
    ],
  },
];

// 知识问答回复
const KNOWLEDGE_RESPONSES = [
  "这个我知道一些，让我来告诉你",
  "关于这个问题，我了解一点",
  "让我想想，这个应该是...",
  "我记得这个知识点",
  "根据我了解的知识...",
];

class TopicAnalyzer {
  constructor() {
    this.topicResponses = TOPIC_RESPONSES;
    this.reasoningPatterns = REASONING_PATTERNS;
    this.knowledgeResponses = KNOWLEDGE_RESPONSES;
  }

  // 分析话题并生成回复
  analyze(text) {
    if (!text || typeof text !== 'string') return null;

    const lowerText = text.toLowerCase();
    let result = null;

    // 1. 检查逻辑推理模式
    for (const pattern of this.reasoningPatterns) {
      if (pattern.pattern.test(text)) {
        result = {
          type: 'reasoning',
          response: pattern.responses[Math.floor(Math.random() * pattern.responses.length)],
        };
        break;
      }
    }

    if (result) return result;

    // 2. 检查话题关键词
    for (const [topic, config] of Object.entries(this.topicResponses)) {
      const keywords = Object.keys(config.specific || {});
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          const specificResponses = config.specific[keyword];
          result = {
            type: 'topic',
            topic,
            subtopic: keyword,
            response: specificResponses[Math.floor(Math.random() * specificResponses.length)],
          };
          break;
        }
      }
      if (result) break;
    }

    if (result) return result;

    // 3. 检查通用话题关键词
    for (const [topic, config] of Object.entries(this.topicResponses)) {
      if (config.general) {
        // 简单的关键词匹配
        const topicKeywords = [
          { topic: 'weather', words: ['天气', '雨', '晴', '冷', '热', '温度'] },
          { topic: 'food', words: ['吃', '饭', '早餐', '午餐', '晚餐', '零食', '水果'] },
          { topic: 'work', words: ['工作', '上班', '加班', '老板', '同事', '开会'] },
          { topic: 'study', words: ['学习', '考试', '作业', '学校', '老师', '同学'] },
          { topic: 'entertainment', words: ['电影', '游戏', '音乐', '综艺', '明星'] },
          { topic: 'travel', words: ['旅行', '旅游', '景点', '假期', '周末'] },
          { topic: 'relationship', words: ['男朋友', '女朋友', '恋爱', '分手', '喜欢'] },
          { topic: 'health', words: ['身体', '健康', '生病', '医院', '锻炼'] },
          { topic: 'family', words: ['爸妈', '父母', '家人', '孩子', '过年'] },
          { topic: 'tech', words: ['手机', '电脑', '软件', 'AI', '科技'] },
        ];

        const topicInfo = topicKeywords.find(t => t.topic === topic);
        if (topicInfo) {
          const hasKeyword = topicInfo.words.some(word => lowerText.includes(word));
          if (hasKeyword) {
            result = {
              type: 'topic',
              topic,
              response: config.general[Math.floor(Math.random() * config.general.length)],
            };
            break;
          }
        }
      }
    }

    return result;
  }

  // 获取知识问答开场
  getKnowledgeIntro() {
    return this.knowledgeResponses[Math.floor(Math.random() * this.knowledgeResponses.length)];
  }
}

export { TopicAnalyzer, TOPIC_RESPONSES, REASONING_PATTERNS };
