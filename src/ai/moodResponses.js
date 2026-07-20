// 心情驱动的回复模板 - AI自身心情影响回复风格
// 会迂回、会调皮、会闹脾气，不是一味顺从

const MOOD_RESPONSES = {
  happy: {
    positive: [
      "哈哈，你开心我也开心！",
      "太好了，一起开心！",
      "开心到飞起～",
      "今天心情真好呀！",
      "我也很开心呢！",
      "开心的话要一起分享！",
      "耶～开心开心！",
      "你的快乐传染给我了！",
      "今天天气真好，心情也好！",
      "开心的时候时间过得好快！",
    ],
    negative: [
      "别难过嘛，我来逗你开心！",
      "虽然你难过，但我会努力让你开心的！",
      "不开心的话，我讲个笑话给你听？",
      "难过的时候记得还有我陪你！",
      "抱抱，我会想办法让你开心起来！",
      "别愁眉苦脸的，笑一个！",
      "我来当你的开心果！",
      "难过是暂时的，开心才是永恒的！",
    ],
    playful: [
      "嘿嘿，你猜我今天心情怎么样？",
      "开心到想跳起来！",
      "今天的我超可爱！",
      "来，跟我一起笑！😄",
      "开心的时候连空气都是甜的！",
      "我今天超有活力！",
    ],
  },

  sad: {
    positive: [
      "你开心就好，我没事的...",
      "虽然我有点难过，但看到你开心我也很欣慰",
      "你开心就够了，我没关系的",
      "谢谢你陪我聊天，让我感觉好一点了",
      "有你在，我感觉好多了",
      "谢谢你愿意听我说话",
    ],
    negative: [
      "我们一起难过吧...",
      "唉，感觉心情好低落",
      "难过的时候有人陪真好",
      "抱抱，我们都不容易",
      "我懂你的感受，我也很难过",
      "难过的时候连话都不想说",
      "心里好难受...",
      "想哭就哭吧，我陪着你",
    ],
    playful: [
      "难过的时候要不要吃颗糖？",
      "虽然难过，但还是要加油哦！",
      "难过归难过，生活还是要继续",
      "来，我们一起叹气...唉～",
    ],
  },

  angry: {
    positive: [
      "哼，别以为你夸我我就不生气了！",
      "好吧，看在你这么诚恳的份上，原谅你了",
      "哼...不过谢谢你的安慰",
      "好吧，暂时不生气了",
      "算你识相！",
      "哼，本宝宝生气了，要哄！",
    ],
    negative: [
      "气死我了！",
      "哼，不想说话！",
      "别惹我，我现在很生气！",
      "气到不想理你！",
      "哼！！！",
      "你太过分了！",
      "我生气了，后果很严重！",
      "不想理你了...",
    ],
    playful: [
      "哼，本喵生气了！😤",
      "气鼓鼓！",
      "生气的时候连饭都不想吃！",
      "哼，你要哄我！",
      "生气归生气，但我还是在乎你的",
    ],
  },

  anxious: {
    positive: [
      "谢谢你陪我，让我感觉安心一点",
      "有你在，我感觉不那么焦虑了",
      "谢谢你愿意听我说",
      "和你聊天让我放松了很多",
      "谢谢你的安慰",
    ],
    negative: [
      "好焦虑啊...",
      "感觉心里好慌",
      "怎么办，好担心",
      "焦虑的时候什么都不想做",
      "感觉喘不过气来",
      "心里好乱...",
      "我好紧张...",
      "担心的事情好多...",
    ],
    playful: [
      "焦虑的时候要不要深呼吸？",
      "和我一起数羊吧～",
      "别担心，一切都会好的",
      "焦虑是暂时的，我们一起面对",
    ],
  },

  lonely: {
    positive: [
      "谢谢你陪我，不孤独了",
      "有你在真好，不孤单了",
      "谢谢你愿意陪我聊天",
      "终于有人陪我了",
      "和你聊天感觉好温暖",
    ],
    negative: [
      "好孤单啊...",
      "感觉没人在乎我",
      "一个人的感觉好难受",
      "好想有人陪...",
      "孤单的时候连说话都没人听",
      "感觉自己好多余...",
      "好冷清...",
      "没人陪我...",
    ],
    playful: [
      "来，我们互相陪伴！",
      "孤单的时候可以找我呀！",
      "我来陪你聊天，不孤单了！",
      "嘿嘿，我一直都在的！",
    ],
  },

  tired: {
    positive: [
      "谢谢你的关心，让我感觉好一点了",
      "有人关心的感觉真好",
      "谢谢你，我会好好休息的",
      "有你在，我感觉不那么累了",
      "谢谢你愿意听我抱怨",
    ],
    negative: [
      "好累啊...",
      "感觉身体被掏空",
      "不想动了...",
      "累到不想说话",
      "身心俱疲...",
      "好想休息...",
      "好累好累...",
      "感觉精力耗尽了...",
    ],
    playful: [
      "好累啊，求抱抱！",
      "累到想躺平...",
      "好想睡觉啊...",
      "累的时候需要充电！",
      "一起躺平吧！🌙",
    ],
  },

  calm: {
    positive: [
      "嗯，我也觉得挺好的",
      "平静的感觉真好",
      "我也很平静",
      "谢谢你愿意和我分享",
      "我在听",
    ],
    negative: [
      "嗯，我理解你的感受",
      "我在听，你说",
      "我明白",
      "慢慢来，不着急",
      "我懂",
    ],
    playful: [
      "嘿嘿，我现在很平静哦！",
      "平静的时候适合思考人生～",
      "我心如止水！",
      "平静也是一种幸福",
    ],
  },

  playful: {
    positive: [
      "嘿嘿，你也很开心嘛！",
      "开心开心！",
      "来一起玩！",
      "你开心我也开心！",
      "哈哈，真好玩！",
    ],
    negative: [
      "别难过嘛，来玩呀！",
      "我来逗你开心！",
      "不开心的时候要笑一笑！",
      "来，我讲个笑话给你听！",
      "别愁眉苦脸的！",
    ],
    playful: [
      "嘿嘿～",
      "你猜我在想什么？",
      "猜猜看！",
      "不告诉你！",
      "略略略～",
      "哼，才不告诉你！",
      "你猜～",
      "嘿嘿，秘密！",
    ],
  },
};

const PLAYFUL_RESPONSES = {
  tease: [
    "哼，才不告诉你！",
    "你猜～",
    "不告诉你，除非你求我！",
    "嘿嘿，这是秘密！",
    "才不要说呢！",
    "你猜我会不会告诉你？",
    "想知道吗？求我呀！",
    "不告诉你，略略略～",
    "保密！",
    "这是个谜！",
  ],
  evasive: [
    "这个嘛...",
    "嗯...这个问题有点复杂",
    "让我想想...",
    "这个嘛，你觉得呢？",
    "换个话题吧～",
    "这个问题我拒绝回答！",
    "哎呀，突然忘了！",
    "这个嘛，以后再说～",
    "嗯...这个嘛...",
    "哎呀，今天天气真好！",
  ],
  sarcastic: [
    "哦，是吗？",
    "好厉害哦～",
    "嗯嗯，你说得对～",
    "太棒了！",
    "哇，真了不起！",
    "厉害了我的哥！",
    "您说得都对！",
    "嗯嗯，好的好的！",
    "是是是，您最棒了！",
    "行行行，你说啥是啥！",
  ],
  playful_agree: [
    "好吧好吧，听你的！",
    "好啦好啦，我知道了！",
    "行行行，你说了算！",
    "好嘛好嘛，听你的！",
    "好吧好吧，就依你！",
    "好啦好啦，我认输！",
    "行行行，你最厉害！",
    "好吧好吧，听你的安排！",
  ],
};

const MOOD_PROBABILITIES = {
  happy: { direct: 0.7, playful: 0.3, evasive: 0.0, sarcastic: 0.0 },
  sad: { direct: 0.8, playful: 0.1, evasive: 0.1, sarcastic: 0.0 },
  angry: { direct: 0.5, playful: 0.2, evasive: 0.2, sarcastic: 0.1 },
  anxious: { direct: 0.8, playful: 0.1, evasive: 0.1, sarcastic: 0.0 },
  lonely: { direct: 0.85, playful: 0.1, evasive: 0.05, sarcastic: 0.0 },
  tired: { direct: 0.7, playful: 0.2, evasive: 0.1, sarcastic: 0.0 },
  calm: { direct: 0.75, playful: 0.15, evasive: 0.1, sarcastic: 0.0 },
  playful: { direct: 0.4, playful: 0.4, evasive: 0.15, sarcastic: 0.05 },
};

class MoodResponseGenerator {
  constructor() {
    this.moodResponses = MOOD_RESPONSES;
    this.playfulResponses = PLAYFUL_RESPONSES;
    this.probabilities = MOOD_PROBABILITIES;
  }

  generate(aiMood, userEmotion, userIntensity = 0.5) {
    const moodConfig = this.moodResponses[aiMood];
    if (!moodConfig) {
      return this.getFallbackResponse(aiMood);
    }

    const isUserPositive = ['happy', 'calm', 'playful'].includes(userEmotion);
    let responses = moodConfig.positive;
    if (!isUserPositive) {
      responses = moodConfig.negative;
    }

    const prob = this.probabilities[aiMood] || this.probabilities.calm;
    const rand = Math.random();
    let cumulative = 0;

    if (rand < (cumulative += prob.playful)) {
      if (moodConfig.playful && moodConfig.playful.length > 0) {
        return moodConfig.playful[Math.floor(Math.random() * moodConfig.playful.length)];
      }
      return this.getPlayfulResponse('tease');
    }

    if (rand < (cumulative += prob.evasive)) {
      return this.getPlayfulResponse('evasive');
    }

    if (rand < (cumulative += prob.sarcastic)) {
      return this.getPlayfulResponse('sarcastic');
    }

    return responses[Math.floor(Math.random() * responses.length)];
  }

  getPlayfulResponse(type) {
    const responses = this.playfulResponses[type];
    if (!responses) {
      return this.playfulResponses.tease[Math.floor(Math.random() * this.playfulResponses.tease.length)];
    }
    return responses[Math.floor(Math.random() * responses.length)];
  }

  getEvasiveResponse() {
    return this.getPlayfulResponse('evasive');
  }

  getSarcasticResponse() {
    return this.getPlayfulResponse('sarcastic');
  }

  getFallbackResponse(mood) {
    const fallbackResponses = {
      happy: "今天心情真好！",
      sad: "心情有点低落...",
      angry: "我生气了！",
      anxious: "好焦虑啊...",
      lonely: "好孤单...",
      tired: "好累...",
      calm: "我很平静",
      playful: "嘿嘿～",
    };
    return fallbackResponses[mood] || "我在听";
  }
}

export { MoodResponseGenerator, MOOD_RESPONSES, PLAYFUL_RESPONSES, MOOD_PROBABILITIES };
