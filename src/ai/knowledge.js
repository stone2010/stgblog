// 常识知识库 - 初中毕业生水平的世界知识
// 包含科学、历史、文化、地理、生活等领域的基础知识

const KNOWLEDGE_BASE = {
  // 科学常识
  science: {
    facts: [
      { query: ['地球', '自转', '公转'], answer: '地球自转一周约24小时，公转一周约365天', category: 'science' },
      { query: ['光速', '速度'], answer: '光速约每秒30万公里', category: 'science' },
      { query: ['水', '化学式', 'H2O'], answer: '水的化学式是H2O，由两个氢原子和一个氧原子组成', category: 'science' },
      { query: ['人体', '细胞', '器官'], answer: '人体由细胞构成，细胞组成组织，组织组成器官', category: 'science' },
      { query: ['植物', '光合作用', '阳光'], answer: '植物通过光合作用将光能转化为化学能', category: 'science' },
      { query: ['太阳系', '行星', '太阳'], answer: '太阳系有八大行星，围绕太阳公转', category: 'science' },
      { query: ['引力', '重力', '牛顿'], answer: '物体之间存在相互吸引的引力', category: 'science' },
      { query: ['电', '电流', '电压'], answer: '电流是电子的流动，电压是电势差', category: 'science' },
      { query: ['声音', '传播', '介质'], answer: '声音需要介质传播，真空中无法传播', category: 'science' },
      { query: ['热', '温度', '热量'], answer: '温度是物体冷热程度的度量', category: 'science' },
      { query: ['冰', '水', '融化', '凝固'], answer: '冰在0°C融化成水，水在0°C凝固成冰', category: 'science' },
      { query: ['空气', '成分', '氧气', '氮气'], answer: '空气主要由氮气(78%)和氧气(21%)组成', category: 'science' },
      { query: ['血液', '循环', '心脏'], answer: '心脏是血液循环的动力器官', category: 'science' },
      { query: ['大脑', '记忆', '思考'], answer: '大脑是思维和记忆的中枢', category: 'science' },
      { query: ['光', '折射', '反射'], answer: '光在不同介质中传播会发生折射', category: 'science' },
    ],
  },

  // 历史常识
  history: {
    facts: [
      { query: ['中国', '历史', '朝代'], answer: '中国历史悠久，经历了夏商周秦汉隋唐宋元明清等朝代', category: 'history' },
      { query: ['四大发明', '造纸', '印刷', '火药', '指南针'], answer: '中国古代四大发明是造纸术、印刷术、火药、指南针', category: 'history' },
      { query: ['秦始皇', '统一', '秦朝'], answer: '秦始皇统一六国，建立了中国第一个统一的封建王朝', category: 'history' },
      { query: ['唐朝', '盛世', '长安'], answer: '唐朝是中国历史上的鼎盛时期，长安是当时的国际大都市', category: 'history' },
      { query: ['长城', '建造', '防御'], answer: '长城是中国古代的军事防御工程', category: 'history' },
      { query: ['故宫', '明清', '紫禁城'], answer: '故宫是明清两代的皇家宫殿，也叫紫禁城', category: 'history' },
      { query: ['孔子', '儒家', '论语'], answer: '孔子是儒家学派创始人，《论语》记录了他的言行', category: 'history' },
      { query: ['丝绸之路', '贸易', '文化'], answer: '丝绸之路是古代东西方贸易和文化交流的通道', category: 'history' },
      { query: ['辛亥革命', '1911', '孙中山'], answer: '辛亥革命推翻了封建帝制，建立了中华民国', category: 'history' },
      { query: ['抗日战争', '八年', '1931', '1945'], answer: '抗日战争从1931年到1945年，是中国人民反抗日本侵略的战争', category: 'history' },
    ],
  },

  // 文化常识
  culture: {
    facts: [
      { query: ['春节', '农历', '新年'], answer: '春节是农历新年，是中国最重要的传统节日', category: 'culture' },
      { query: ['中秋节', '月亮', '团圆'], answer: '中秋节是团圆的节日，人们赏月吃月饼', category: 'culture' },
      { query: ['端午节', '粽子', '龙舟'], answer: '端午节吃粽子、赛龙舟，纪念屈原', category: 'culture' },
      { query: ['元宵节', '汤圆', '花灯'], answer: '元宵节吃汤圆、赏花灯、猜灯谜', category: 'culture' },
      { query: ['清明节', '扫墓', '祭祖'], answer: '清明节是扫墓祭祖、踏青郊游的节日', category: 'culture' },
      { query: ['汉字', '书法', '文化'], answer: '汉字是中华文化的瑰宝，书法是传统艺术', category: 'culture' },
      { query: ['诗词', '唐诗', '宋词'], answer: '唐诗宋词是中国文学的瑰宝', category: 'culture' },
      { query: ['京剧', '戏曲', '国粹'], answer: '京剧是中国的国粹，有生旦净丑等角色', category: 'culture' },
      { query: ['围棋', '象棋', '传统'], answer: '围棋和象棋是中国传统棋类游戏', category: 'culture' },
      { query: ['茶', '茶文化', '茶道'], answer: '中国是茶的故乡，茶文化博大精深', category: 'culture' },
    ],
  },

  // 地理常识
  geography: {
    facts: [
      { query: ['中国', '面积', '人口'], answer: '中国面积约960万平方公里，人口约14亿', category: 'geography' },
      { query: ['长江', '黄河', '最长'], answer: '长江是中国最长的河流，黄河是第二长河', category: 'geography' },
      { query: ['珠穆朗玛峰', '最高', '海拔'], answer: '珠穆朗玛峰是世界最高峰，海拔约8848米', category: 'geography' },
      { query: ['北京', '首都', '城市'], answer: '北京是中国的首都，是政治文化中心', category: 'geography' },
      { query: ['上海', '经济', '港口'], answer: '上海是中国最大的经济中心和港口城市', category: 'geography' },
      { query: ['西藏', '高原', '拉萨'], answer: '西藏位于青藏高原，拉萨是首府', category: 'geography' },
      { query: ['台湾', '岛屿', '省份'], answer: '台湾是中国不可分割的一部分', category: 'geography' },
      { query: ['海洋', '太平洋', '大西洋'], answer: '地球表面约71%是海洋', category: 'geography' },
      { query: ['世界', '七大洲', '四大洋'], answer: '世界分为七大洲四大洋', category: 'geography' },
      { query: ['气候', '季节', '春夏秋冬'], answer: '地球上大部分地区有春夏秋冬四个季节', category: 'geography' },
    ],
  },

  // 生活常识
  life: {
    facts: [
      { query: ['健康', '饮食', '运动'], answer: '健康的生活方式包括均衡饮食和适度运动', category: 'life' },
      { query: ['睡眠', '休息', '身体'], answer: '成年人每天需要7-9小时睡眠', category: 'life' },
      { query: ['早餐', '重要', '一天'], answer: '早餐是一天中最重要的一餐', category: 'life' },
      { query: ['喝水', '八杯', '健康'], answer: '每天喝足够的水对健康很重要', category: 'life' },
      { query: ['感冒', '病毒', '传染'], answer: '感冒是由病毒引起的，具有传染性', category: 'life' },
      { query: ['防晒', '紫外线', '皮肤'], answer: '夏天要注意防晒，避免紫外线伤害皮肤', category: 'life' },
      { query: ['安全', '交通', '规则'], answer: '遵守交通规则，安全第一', category: 'life' },
      { query: ['火灾', '逃生', '灭火器'], answer: '遇到火灾要保持冷静，正确逃生', category: 'life' },
      { query: ['急救', 'CPR', '心肺'], answer: '学习基本急救知识很重要', category: 'life' },
      { query: ['压力', '放松', '调节'], answer: '学会调节压力，保持心理健康', category: 'life' },
    ],
  },

  // 常识问答
  common: {
    facts: [
      { query: ['人', '为什么', '要睡觉'], answer: '睡觉可以让身体和大脑休息，恢复精力', category: 'common' },
      { query: ['为什么', '会下雨', '云'], answer: '云中的水汽凝结成水滴，落到地面就是雨', category: 'common' },
      { query: ['为什么', '天是蓝色', '天空'], answer: '太阳光经过大气层散射，蓝光波长最短，散射最明显', category: 'common' },
      { query: ['为什么', '月亮', '圆缺', '阴晴'], answer: '月亮的阴晴圆缺是由地球遮挡太阳光线造成的', category: 'common' },
      { query: ['为什么', '树叶', '秋天', '变黄'], answer: '秋天天气变冷，叶绿素分解，其他色素显现出来', category: 'common' },
      { query: ['为什么', '会', '做梦'], answer: '做梦是大脑在睡眠时的活动，可能与记忆整理有关', category: 'common' },
      { query: ['为什么', '要', '刷牙', '牙齿'], answer: '刷牙可以清除牙菌斑，预防蛀牙和牙周病', category: 'common' },
      { query: ['为什么', '会', '晕车', '晕船'], answer: '晕车晕船是因为内耳平衡感受器受到刺激', category: 'common' },
      { query: ['为什么', '要', '读书', '学习'], answer: '读书学习可以增长知识，开阔视野', category: 'common' },
      { query: ['为什么', '需要', '朋友'], answer: '朋友可以分享快乐，分担痛苦，给予支持', category: 'common' },
    ],
  },
};

// 话题分类
const TOPICS = {
  weather: {
    keywords: ['天气', '下雨', '晴天', '阴天', '雪', '刮风', '温度', '冷', '热', '凉', '暖'],
    name: '天气',
  },
  food: {
    keywords: ['吃', '饭', '早餐', '午餐', '晚餐', '零食', '水果', '菜', '味道', '好吃', '难吃'],
    name: '美食',
  },
  work: {
    keywords: ['工作', '上班', '加班', '老板', '同事', '开会', '项目', '任务', '工资', '升职'],
    name: '工作',
  },
  study: {
    keywords: ['学习', '考试', '作业', '学校', '老师', '同学', '课程', '成绩', '考研', '高考'],
    name: '学习',
  },
  entertainment: {
    keywords: ['电影', '电视剧', '游戏', '音乐', '综艺', '明星', '演唱会', '追剧', '直播'],
    name: '娱乐',
  },
  travel: {
    keywords: ['旅行', '旅游', '景点', '风景', '假期', '周末', '度假', '出差', '回家'],
    name: '旅行',
  },
  relationship: {
    keywords: ['男朋友', '女朋友', '老公', '老婆', '恋爱', '分手', '结婚', '约会', '喜欢', '爱'],
    name: '感情',
  },
  health: {
    keywords: ['身体', '健康', '生病', '吃药', '医院', '医生', '检查', '减肥', '锻炼', '运动'],
    name: '健康',
  },
  family: {
    keywords: ['爸妈', '父母', '家人', '孩子', '亲戚', '过年', '回家', '团聚'],
    name: '家庭',
  },
  tech: {
    keywords: ['手机', '电脑', '软件', '游戏', '互联网', 'AI', '科技', '智能'],
    name: '科技',
  },
};

// 逻辑推理规则
const REASONING_RULES = [
  {
    pattern: /如果(.*)那么(.*)/,
    response: '听起来很有道理，条件和结果的关系很清晰',
  },
  {
    pattern: /因为(.*)所以(.*)/,
    response: '因果关系很明确呢',
  },
  {
    pattern: /为什么(.*)/,
    response: '这是个好问题，让我想想...',
  },
  {
    pattern: /是不是(.*)/,
    response: '这个我不太确定，但听起来有道理',
  },
  {
    pattern: /应该(.*)/,
    response: '你的想法很合理',
  },
];

class KnowledgeBase {
  constructor() {
    this.knowledge = KNOWLEDGE_BASE;
    this.topics = TOPICS;
    this.reasoning = REASONING_RULES;
  }

  // 搜索知识
  search(query) {
    if (!query || typeof query !== 'string') return null;

    const lowerQuery = query.toLowerCase();
    let bestMatch = null;
    let bestScore = 0;

    // 遍历所有知识领域
    for (const domain of Object.values(this.knowledge)) {
      for (const fact of domain.facts) {
        let score = 0;
        // 计算匹配度
        for (const keyword of fact.query) {
          if (lowerQuery.includes(keyword.toLowerCase())) {
            score += 1;
          }
        }

        // 如果完全匹配，直接返回
        if (score === fact.query.length) {
          return fact;
        }

        // 记录最佳匹配
        if (score > bestScore) {
          bestScore = score;
          bestMatch = fact;
        }
      }
    }

    // 返回匹配度超过一半的结果
    if (bestMatch && bestScore >= Math.ceil(bestMatch.query.length / 2)) {
      return bestMatch;
    }

    return null;
  }

  // 识别话题
  identifyTopic(text) {
    if (!text || typeof text !== 'string') return null;

    const lowerText = text.toLowerCase();
    let bestTopic = null;
    let bestScore = 0;

    for (const [topic, config] of Object.entries(this.topics)) {
      let score = 0;
      for (const keyword of config.keywords) {
        if (lowerText.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestTopic = { topic, name: config.name };
      }
    }

    return bestScore >= 1 ? bestTopic : null;
  }

  // 检测是否是知识性问题
  isKnowledgeQuestion(text) {
    const knowledgePatterns = [
      /为什么(.*)/,
      /是什么(.*)/,
      /怎么样(.*)/,
      /什么是(.*)/,
      /有什么(.*)/,
      /怎么(.*)/,
      /能(.*)/,
      /可以(.*)/,
      /应该(.*)/,
      /是否(.*)/,
      /有没有(.*)/,
      /多少(.*)/,
      /几(.*)/,
    ];

    return knowledgePatterns.some(pattern => pattern.test(text));
  }

  // 检测是否是逻辑推理
  isReasoning(text) {
    return this.reasoning.some(rule => rule.pattern.test(text));
  }

  // 获取推理回复
  getReasoningResponse(text) {
    for (const rule of this.reasoning) {
      if (rule.pattern.test(text)) {
        return rule.response;
      }
    }
    return null;
  }
}

export { KnowledgeBase, KNOWLEDGE_BASE, TOPICS, REASONING_RULES };
