class SimpleTokenizer {
  constructor() {
    this.vocab = {};
    this.idToToken = {};
    this.specialTokens = {
      bos: "<|begin_of_text|>",
      eos: "<|end_of_text|>",
      pad: "<|pad|>",
      user: "<|user|>",
      assistant: "<|assistant|>",
      system: "<|system|>",
    };
    this.bosTokenId = 0;
    this.eosTokenId = 1;
    this.padTokenId = 2;
    this.userTokenId = 3;
    this.assistantTokenId = 4;
    this.systemTokenId = 5;
    this.nextId = 6;
    this.initVocab();
  }

  initVocab() {
    const special = Object.values(this.specialTokens);
    special.forEach((token, i) => {
      this.vocab[token] = i;
      this.idToToken[i] = token;
    });

    for (let i = 32; i < 127; i++) {
      const char = String.fromCharCode(i);
      this.vocab[char] = this.nextId;
      this.idToToken[this.nextId] = char;
      this.nextId++;
    }

    const commonWords = [
      "the", "a", "is", "are", "was", "were", "be", "been", "being",
      "have", "has", "had", "do", "does", "did", "will", "would", "could",
      "should", "may", "might", "must", "shall", "can", "need", "dare", "ought",
      "used", "to", "of", "in", "for", "on", "with", "at", "by", "from",
      "up", "about", "into", "over", "after", "and", "but", "or", "as", "if",
      "when", "than", "because", "while", "although", "though", "that", "which",
      "who", "whom", "this", "these", "those", "I", "you", "he", "she", "it",
      "we", "they", "what", "how", "why", "where", "there", "here", "all",
      "each", "every", "both", "few", "more", "most", "other", "some", "such",
      "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very",
      "just", "now", "than", "then", "once", "here", "there", "when", "where",
      "why", "how", "always", "never", "ever", "still", "yet", "already", "just",
      "today", "yesterday", "tomorrow", "ago", "before", "soon", "long", "since",
      "until", "while", "during", "within", "without", "between", "among", "through",
      "under", "above", "below", "beneath", "beside", "between", "beyond", "inside",
      "outside", "onto", "toward", "towards", "against", "along", "across", "around",
      "down", "off", "out", "over", "past", "through", "under", "up", "upon", "with",
      "about", "above", "across", "after", "against", "along", "among", "around", "at",
      "before", "behind", "below", "beneath", "beside", "between", "beyond", "but",
      "by", "concerning", "considering", "despite", "down", "during", "except", "for",
      "from", "in", "inside", "into", "like", "near", "of", "off", "on", "onto",
      "out", "outside", "over", "past", "regarding", "round", "since", "through",
      "throughout", "till", "to", "toward", "towards", "under", "underneath", "until",
      "up", "upon", "with", "within", "without", "Chinese", "English", "language",
      "word", "sentence", "paragraph", "text", "message", "chat", "conversation",
      "question", "answer", "response", "reply", "ask", "tell", "say", "talk", "speak",
      "explain", "describe", "discuss", "argue", "agree", "disagree", "thank", "sorry",
      "please", "hello", "goodbye", "hi", "hey", "okay", "yes", "no", "maybe", "perhaps",
      "sure", "certainly", "definitely", "absolutely", "exactly", "right", "correct",
      "wrong", "true", "false", "real", "fake", "big", "small", "large", "little",
      "long", "short", "high", "low", "wide", "narrow", "deep", "shallow", "hot",
      "cold", "warm", "cool", "dark", "light", "bright", "dim", "soft", "hard",
      "smooth", "rough", "wet", "dry", "clean", "dirty", "new", "old", "young",
      "happy", "sad", "angry", "tired", "hungry", "thirsty", "sick", "healthy",
      "rich", "poor", "smart", "stupid", "kind", "mean", "nice", "rude", "funny",
      "serious", "calm", "excited", "bored", "interested", "confused", "surprised",
      "amazed", "impressed", "disappointed", "proud", "ashamed", "guilty", "innocent",
      "brave", "cowardly", "honest", "dishonest", "lazy", "hardworking", "helpful",
      "unhelpful", "friendly", "unfriendly", "polite", "impolite", "quiet", "noisy",
      "active", "inactive", "busy", "free", "alone", "together", "apart", "close",
      "far", "near", "away", "back", "forward", "upward", "downward", "left", "right",
      "straight", "curved", "flat", "round", "square", "triangular", "rectangular",
      "circular", "spherical", "cylindrical", "conical", "pyramidal", "cube", "sphere",
      "cylinder", "cone", "pyramid", "box", "bag", "bottle", "cup", "glass", "plate",
      "bowl", "spoon", "fork", "knife", "chopsticks", "table", "chair", "bed", "sofa",
      "book", "paper", "pen", "pencil", "computer", "phone", "watch", "clock", "lamp",
      "door", "window", "wall", "floor", "ceiling", "roof", "stairs", "elevator",
      "car", "bus", "train", "plane", "bike", "boat", "ship", "airport", "station",
      "road", "street", "avenue", "lane", "path", "bridge", "tunnel", "building",
      "house", "apartment", "office", "store", "shop", "restaurant", "cafe", "hotel",
      "school", "college", "university", "hospital", "library", "museum", "park",
      "garden", "forest", "mountain", "river", "lake", "ocean", "beach", "island",
      "city", "town", "village", "country", "world", "earth", "moon", "sun", "star",
      "sky", "cloud", "rain", "snow", "wind", "storm", "weather", "season", "time",
      "day", "night", "morning", "afternoon", "evening", "midnight", "noon", "hour",
      "minute", "second", "week", "month", "year", "today", "tomorrow", "yesterday",
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
      "January", "February", "March", "April", "May", "June", "July", "August",
      "September", "October", "November", "December", "first", "second", "third",
      "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "hundredth",
      "thousandth", "millionth", "billionth", "one", "two", "three", "four", "five",
      "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen",
      "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty",
      "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety", "hundred",
      "thousand", "million", "billion", "trillion", "zero", "half", "quarter",
      "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth",
      "and", "or", "but", "not", "also", "too", "very", "so", "such", "enough",
      "just", "only", "even", "still", "yet", "already", "always", "never", "ever",
      "often", "sometimes", "rarely", "hardly", "barely", "almost", "nearly",
      "exactly", "precisely", "approximately", "roughly", "about", "around", "over",
      "under", "above", "below", "between", "among", "through", "across", "along",
      "against", "beyond", "within", "without", "except", "despite", "inspite",
      "because", "since", "as", "while", "although", "though", "if", "unless",
      "until", "before", "after", "when", "whenever", "where", "wherever", "why",
      "how", "however", "whatever", "whoever", "whichever", "that", "which", "who",
      "whom", "this", "these", "those", "it", "its", "they", "them", "their",
      "what", "which", "who", "whom", "whose", "such", "so", "that", "too", "very",
      "enough", "just", "only", "even", "still", "yet", "already", "always", "never",
    ];

    commonWords.forEach(word => {
      if (!this.vocab[word]) {
        this.vocab[word] = this.nextId;
        this.idToToken[this.nextId] = word;
        this.nextId++;
      }
    });
  }

  encode(text) {
    const tokens = [];
    let remaining = text;

    while (remaining.length > 0) {
      let found = false;
      for (let len = Math.min(remaining.length, 4); len >= 1; len--) {
        const substr = remaining.slice(0, len);
        if (this.vocab[substr]) {
          tokens.push(this.vocab[substr]);
          remaining = remaining.slice(len);
          found = true;
          break;
        }
      }
      if (!found) {
        tokens.push(this.vocab[remaining[0]] || this.vocab["<|unk|>"]);
        remaining = remaining.slice(1);
      }
    }

    return tokens;
  }

  decode(tokens) {
    return tokens.map(id => this.idToToken[id] || "<|unk|>").join("");
  }

  encodeChat(messages) {
    let prompt = "";
    messages.forEach(msg => {
      if (msg.role === "system") {
        prompt += `${this.specialTokens.system} ${msg.content}`;
      } else if (msg.role === "user") {
        prompt += `${this.specialTokens.user} ${msg.content}`;
      } else if (msg.role === "assistant") {
        prompt += `${this.specialTokens.assistant} ${msg.content}`;
      }
    });
    prompt += this.specialTokens.assistant;
    return prompt;
  }

  get vocabSize() {
    return this.nextId;
  }
}

class InferenceEngine {
  constructor() {
    this.model = null;
    this.tokenizer = null;
    this.isLoading = false;
    this.isReady = false;
    this.loadingProgress = 0;
    this.useWebGPU = false;
    this.device = null;
  }

  async initialize(config = {}) {
    this.tokenizer = new SimpleTokenizer();

    const modelConfig = {
      vocabSize: this.tokenizer.vocabSize,
      dim: config.dim || 128,
      numLayers: config.numLayers || 4,
      numHeads: config.numHeads || 4,
      maxLen: config.maxLen || 256,
      hiddenDim: config.hiddenDim || 512,
      dropout: config.dropout || 0.1,
    };

    this.model = new GPTModel(modelConfig);

    await this.loadModel(config.weights);

    this.isReady = true;
    return this.isReady;
  }

  async loadModel(weights) {
    this.isLoading = true;
    this.loadingProgress = 0;

    try {
      if (weights) {
        this.model.loadWeights(weights);
      }

      this.loadingProgress = 100;
      this.isLoading = false;
    } catch (error) {
      console.error("Failed to load model:", error);
      this.isLoading = false;
      throw error;
    }
  }

  async generate(text, options = {}) {
    if (!this.isReady || this.isLoading) {
      throw new Error("Model not ready");
    }

    const { maxLen = 100, temperature = 1.0, topK = 0 } = options;
    return this.model.generate(text, maxLen, temperature, topK);
  }

  async chat(messages, options = {}, callback = null) {
    if (!this.isReady || this.isLoading) {
      throw new Error("Model not ready");
    }

    const { maxLen = 100, temperature = 1.0, topK = 0 } = options;
    return this.model.chat(messages, maxLen, temperature, topK, callback);
  }

  async generateStream(text, options = {}, callback = null) {
    if (!this.isReady || this.isLoading) {
      throw new Error("Model not ready");
    }

    const { maxLen = 100, temperature = 1.0, topK = 0 } = options;
    const tokens = [];

    await this.model.decoder.generateStream(
      this.tokenizer.encode(text),
      maxLen,
      temperature,
      topK,
      this.tokenizer.eosTokenId,
      (result) => {
        if (!result.done) {
          const token = this.tokenizer.decode([result.token]);
          tokens.push(token);
          if (callback) {
            callback({
              token,
              text: tokens.join(""),
              done: false,
            });
          }
        } else {
          if (callback) {
            callback({
              text: tokens.join(""),
              done: true,
            });
          }
        }
      }
    );

    return tokens.join("");
  }

  async chatStream(messages, options = {}, callback = null) {
    if (!this.isReady || this.isLoading) {
      throw new Error("Model not ready");
    }

    const { maxLen = 100, temperature = 1.0, topK = 0 } = options;
    const prompt = this.tokenizer.encodeChat(messages);
    const inputIds = this.tokenizer.encode(prompt);
    const responseTokens = [];

    await this.model.decoder.generateStream(
      inputIds,
      maxLen,
      temperature,
      topK,
      this.tokenizer.eosTokenId,
      (result) => {
        if (!result.done) {
          const token = this.tokenizer.decode([result.token]);
          responseTokens.push(token);
          if (callback) {
            callback({
              token,
              text: responseTokens.join(""),
              done: false,
            });
          }
        } else {
          if (callback) {
            callback({
              text: responseTokens.join(""),
              done: true,
            });
          }
        }
      }
    );

    return responseTokens.join("");
  }

  destroy() {
    this.model = null;
    this.tokenizer = null;
    this.isReady = false;
  }
}

class LocalModelManager {
  constructor() {
    this.engine = new InferenceEngine();
    this.models = {};
    this.currentModel = null;
  }

  registerModel(name, config) {
    this.models[name] = config;
  }

  async loadModel(name) {
    const config = this.models[name];
    if (!config) {
      throw new Error(`Model ${name} not found`);
    }

    await this.engine.initialize(config);
    this.currentModel = name;
    return this.engine;
  }

  async chat(messages, options = {}, callback = null) {
    return this.engine.chat(messages, options, callback);
  }

  async chatStream(messages, options = {}, callback = null) {
    return this.engine.chatStream(messages, options, callback);
  }

  get isReady() {
    return this.engine.isReady;
  }

  get isLoading() {
    return this.engine.isLoading;
  }

  get loadingProgress() {
    return this.engine.loadingProgress;
  }
}

export { SimpleTokenizer, InferenceEngine, LocalModelManager };
