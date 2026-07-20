class NGramModel {
  constructor(n = 2) {
    this.n = n;
    this.ngrams = new Map();
    this.vocabulary = new Set();
    this.startTokens = new Map();
    this.endTokens = new Set(['。', '！', '？', '\n', '</s>']);
    this.totalTokens = 0;
  }

  tokenize(text) {
    const tokens = [];
    let current = '';
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      
      if (/[\u4e00-\u9fa5]/.test(char)) {
        if (current) {
          tokens.push(current);
          current = '';
        }
        tokens.push(char);
      } else if (/[a-zA-Z0-9]/.test(char)) {
        current += char;
      } else {
        if (current) {
          tokens.push(current);
          current = '';
        }
        if (char.trim()) {
          tokens.push(char);
        }
      }
    }
    
    if (current) {
      tokens.push(current);
    }
    
    return tokens;
  }

  train(texts) {
    for (const text of texts) {
      const tokens = ['<s>', ...this.tokenize(text), '</s>'];
      
      for (let i = 0; i < tokens.length; i++) {
        this.vocabulary.add(tokens[i]);
        
        if (i === 0) {
          this.startTokens.set(tokens[i], (this.startTokens.get(tokens[i]) || 0) + 1);
        }
        
        for (let j = 1; j <= this.n && i + j <= tokens.length; j++) {
          const gram = tokens.slice(i, i + j).join(' ');
          const nextIndex = i + j;
          
          if (nextIndex < tokens.length) {
            const nextToken = tokens[nextIndex];
            
            if (!this.ngrams.has(gram)) {
              this.ngrams.set(gram, { count: 0, next: new Map() });
            }
            
            this.ngrams.get(gram).count++;
            this.ngrams.get(gram).next.set(
              nextToken,
              (this.ngrams.get(gram).next.get(nextToken) || 0) + 1
            );
          }
        }
      }
      
      this.totalTokens += tokens.length;
    }
    
    this.buildProbabilities();
  }

  buildProbabilities() {
    for (const [gram, data] of this.ngrams) {
      const total = data.count;
      for (const [nextToken, count] of data.next) {
        data.next.set(nextToken, count / total);
      }
    }
    
    const totalStarts = Array.from(this.startTokens.values()).reduce((a, b) => a + b, 0);
    for (const [token, count] of this.startTokens) {
      this.startTokens.set(token, count / totalStarts);
    }
  }

  getNextToken(history, moodWeights = null) {
    for (let i = Math.min(history.length, this.n - 1); i >= 0; i--) {
      const gram = history.slice(-i).join(' ');
      
      if (this.ngrams.has(gram)) {
        const data = this.ngrams.get(gram);
        const candidates = Array.from(data.next.entries());
        
        if (candidates.length === 0) continue;
        
        let weights = candidates.map(([token, prob]) => ({ token, prob }));
        
        if (moodWeights) {
          weights = this.applyMoodWeights(weights, moodWeights);
        }
        
        const totalWeight = weights.reduce((sum, w) => sum + w.prob, 0);
        let r = Math.random() * totalWeight;
        
        for (const { token, prob } of weights) {
          r -= prob;
          if (r <= 0) {
            return token;
          }
        }
        
        return candidates[Math.floor(Math.random() * candidates.length)][0];
      }
    }
    
    return this.getRandomToken(moodWeights);
  }

  applyMoodWeights(weights, moodWeights) {
    return weights.map(({ token, prob }) => {
      let adjustedProb = prob;
      
      if (moodWeights.negative && moodWeights.negative.length > 0) {
        for (const word of moodWeights.negative) {
          if (token.includes(word)) {
            adjustedProb *= (1 + moodWeights.intensity);
          }
        }
      }
      
      if (moodWeights.positive && moodWeights.positive.length > 0) {
        for (const word of moodWeights.positive) {
          if (token.includes(word)) {
            adjustedProb *= (1 + moodWeights.intensity);
          }
        }
      }
      
      if (moodWeights.avoid && moodWeights.avoid.length > 0) {
        for (const word of moodWeights.avoid) {
          if (token.includes(word)) {
            adjustedProb *= 0.3;
          }
        }
      }
      
      return { token, prob: adjustedProb };
    });
  }

  getRandomToken(moodWeights = null) {
    const vocab = Array.from(this.vocabulary).filter(t => t !== '<s>' && t !== '</s>');
    
    if (moodWeights) {
      let weights = vocab.map(token => ({ token, prob: 1 }));
      weights = this.applyMoodWeights(weights, moodWeights);
      
      const totalWeight = weights.reduce((sum, w) => sum + w.prob, 0);
      let r = Math.random() * totalWeight;
      
      for (const { token, prob } of weights) {
        r -= prob;
        if (r <= 0) {
          return token;
        }
      }
    }
    
    return vocab[Math.floor(Math.random() * vocab.length)];
  }

  generate(maxLength = 50, seedTokens = [], moodWeights = null, attentionLevel = 0.7) {
    const history = [...seedTokens];
    const result = [];
    let consecutiveEnds = 0;
    
    for (let i = 0; i < maxLength; i++) {
      const nextToken = this.getNextToken(history, moodWeights);
      
      if (nextToken === '</s>') {
        consecutiveEnds++;
        if (consecutiveEnds >= 2 || result.length > 0) break;
        continue;
      }
      
      consecutiveEnds = 0;
      result.push(nextToken);
      history.push(nextToken);
      
      if (history.length > this.n) {
        history.shift();
      }
      
      if (this.endTokens.has(nextToken)) {
        if (Math.random() > attentionLevel) break;
      }
    }
    
    return result.join('');
  }
}

const EMOTION_WORDS = {
  happy: {
    positive: ['开心', '高兴', '快乐', '喜欢', '爱', '好棒', '太好了', '哈哈', '耶', '哇'],
    negative: [],
    avoid: ['难过', '伤心', '哭', '委屈'],
  },
  sad: {
    positive: [],
    negative: ['难过', '伤心', '哭', '委屈', '失落', '失望', '心疼', '抱抱'],
    avoid: ['开心', '高兴', '快乐'],
  },
  angry: {
    positive: [],
    negative: ['生气', '气死', '讨厌', '过分', '哼'],
    avoid: ['开心', '高兴', '喜欢'],
  },
  anxious: {
    positive: [],
    negative: ['担心', '害怕', '紧张', '心慌', '焦虑'],
    avoid: ['开心', '放心'],
  },
  lonely: {
    positive: [],
    negative: ['孤单', '孤独', '寂寞', '一个人', '陪着'],
    avoid: ['开心', '热闹'],
  },
  tired: {
    positive: [],
    negative: ['累', '疲惫', '困', '休息'],
    avoid: ['精力', '活力'],
  },
  calm: {
    positive: ['平静', '安心', '放松', '慢慢来'],
    negative: [],
    avoid: ['激动', '紧张'],
  },
  playful: {
    positive: ['哈哈', '嘻嘻', '调皮', '逗', '猜猜', '嘿嘿'],
    negative: [],
    avoid: ['严肃', '难过'],
  },
};

function getMoodWeights(mood, intensity = 0.5) {
  const base = EMOTION_WORDS[mood] || EMOTION_WORDS.calm;
  return {
    positive: base.positive,
    negative: base.negative,
    avoid: base.avoid,
    intensity: intensity,
  };
}

export { NGramModel, getMoodWeights, EMOTION_WORDS };