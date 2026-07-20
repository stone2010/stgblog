class NeuralModel {
  constructor() {
    this.vocab = {};
    this.idxToChar = [];
    this.vocabSize = 0;
    this.embedDim = 128;
    this.numHeads = 4;
    this.numLayers = 4;
    this.hiddenDim = 512;
    this.maxSeqLen = 128;
    this.params = {};
    this.isLoaded = false;
  }

  async loadVocab(vocabPath = '/ai_data/vocab.json') {
    try {
      const response = await fetch(vocabPath);
      if (!response.ok) return false;
      this.vocab = await response.json();
      this.idxToChar = Object.keys(this.vocab).sort((a, b) => this.vocab[a] - this.vocab[b]);
      this.vocabSize = Object.keys(this.vocab).length;
      return true;
    } catch {
      return false;
    }
  }

  charToIdx(char) {
    return this.vocab[char] || this.vocab['<UNK>'];
  }

  idxToChar(idx) {
    return this.idxToChar[idx] || '<UNK>';
  }

  encode(text) {
    const result = [this.charToIdx('<START>')];
    for (const char of text.slice(0, this.maxSeqLen - 2)) {
      result.push(this.charToIdx(char));
    }
    result.push(this.charToIdx('<END>'));
    return result;
  }

  decode(indices) {
    return indices.map(idx => this.idxToChar(idx)).join('').replace(/<PAD>|<START>|<END>|<UNK>/g, '');
  }

  async loadParams(paramsPath = '/ai_data/model_params.json') {
    try {
      const response = await fetch(paramsPath);
      if (!response.ok) return false;
      this.params = await response.json();
      this.isLoaded = true;
      return true;
    } catch {
      return false;
    }
  }

  matmul(A, B) {
    const rowsA = A.length;
    const colsA = A[0].length;
    const colsB = B[0].length;
    const result = [];
    for (let i = 0; i < rowsA; i++) {
      result[i] = [];
      for (let j = 0; j < colsB; j++) {
        result[i][j] = 0;
        for (let k = 0; k < colsA; k++) {
          result[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return result;
  }

  transpose(matrix) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const result = [];
    for (let j = 0; j < cols; j++) {
      result[j] = [];
      for (let i = 0; i < rows; i++) {
        result[j][i] = matrix[i][j];
      }
    }
    return result;
  }

  softmax(arr) {
    const max = Math.max(...arr);
    const exp = arr.map(x => Math.exp(x - max));
    const sum = exp.reduce((a, b) => a + b, 0);
    return exp.map(x => x / sum);
  }

  layerNorm(x, w, b, eps = 1e-5) {
    const mean = x.reduce((a, b) => a + b, 0) / x.length;
    const variance = x.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / x.length;
    return x.map((val, idx) => (w[idx] * (val - mean) / Math.sqrt(variance + eps)) + b[idx]);
  }

  gelu(x) {
    return x.map(val => val * 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (val + 0.044715 * Math.pow(val, 3)))));
  }

  splitHeads(x, numHeads) {
    const batchSize = x.length;
    const seqLen = x[0].length;
    const dModel = x[0][0].length;
    const dHead = dModel / numHeads;
    
    const result = [];
    for (let b = 0; b < batchSize; b++) {
      result[b] = [];
      for (let t = 0; t < seqLen; t++) {
        result[b][t] = [];
        for (let h = 0; h < numHeads; h++) {
          result[b][t][h] = [];
          for (let i = 0; i < dHead; i++) {
            result[b][t][h][i] = x[b][t][h * dHead + i];
          }
        }
      }
    }
    return result;
  }

  mergeHeads(x) {
    const batchSize = x.length;
    const seqLen = x[0].length;
    const numHeads = x[0][0].length;
    const dHead = x[0][0][0].length;
    const dModel = numHeads * dHead;
    
    const result = [];
    for (let b = 0; b < batchSize; b++) {
      result[b] = [];
      for (let t = 0; t < seqLen; t++) {
        result[b][t] = [];
        for (let h = 0; h < numHeads; h++) {
          for (let i = 0; i < dHead; i++) {
            result[b][t][h * dHead + i] = x[b][t][h][i];
          }
        }
      }
    }
    return result;
  }

  scaledDotProductAttention(q, k, v, mask) {
    const dHead = q[0][0].length;
    const scores = this.matmul(q, this.transpose(k));
    const scaled = scores.map(row => row.map(val => val / Math.sqrt(dHead)));
    
    if (mask) {
      for (let i = 0; i < scaled.length; i++) {
        for (let j = 0; j < scaled[i].length; j++) {
          if (j > i) scaled[i][j] = -Infinity;
        }
      }
    }
    
    const attnWeights = scaled.map(row => this.softmax(row));
    const output = this.matmul(attnWeights, v);
    
    return output;
  }

  forward(inputIds) {
    if (!this.isLoaded || !this.params.embedding) {
      return null;
    }

    const { embedding, posEmbedding, attnLayers, ffLayers, lnF, outputLayer } = this.params;
    
    const seqLen = inputIds.length;
    let hidden = [];
    
    for (let i = 0; i < seqLen; i++) {
      const emb = embedding[inputIds[i]] || Array(this.embedDim).fill(0);
      const pos = posEmbedding[i] || Array(this.embedDim).fill(0);
      hidden.push(emb.map((e, j) => e + pos[j]));
    }
    
    hidden = [hidden];
    
    for (let layer = 0; layer < this.numLayers; layer++) {
      const attnLayer = attnLayers[layer];
      const ffLayer = ffLayers[layer];
      
      const residual = hidden;
      
      const q = this.matmul(hidden[0], attnLayer.Wq);
      const k = this.matmul(hidden[0], attnLayer.Wk);
      const v = this.matmul(hidden[0], attnLayer.Wv);
      
      const qSplit = this.splitHeads([q], this.numHeads);
      const kSplit = this.splitHeads([k], this.numHeads);
      const vSplit = this.splitHeads([v], this.numHeads);
      
      const attnOutputSplit = [];
      for (let h = 0; h < this.numHeads; h++) {
        const qh = qSplit[0].map(row => row[h]);
        const kh = kSplit[0].map(row => row[h]);
        const vh = vSplit[0].map(row => row[h]);
        attnOutputSplit.push(this.scaledDotProductAttention(qh, kh, vh, true));
      }
      
      const attnOutput = [];
      for (let t = 0; t < seqLen; t++) {
        attnOutput[t] = [];
        for (let h = 0; h < this.numHeads; h++) {
          attnOutput[t].push(...attnOutputSplit[h][t]);
        }
      }
      
      const attnOut = this.matmul(attnOutput, attnLayer.Wo);
      
      const norm1 = attnOut.map(row => this.layerNorm(row, attnLayer.lnW, attnLayer.lnB));
      const hidden1 = norm1.map((row, i) => row.map((val, j) => val + residual[0][i][j]));
      
      const ff1 = this.matmul(hidden1, ffLayer.W1);
      const gelu1 = this.gelu(ff1);
      const ff2 = this.matmul(gelu1, ffLayer.W2);
      
      const norm2 = ff2.map(row => this.layerNorm(row, ffLayer.lnW, ffLayer.lnB));
      hidden = [norm2.map((row, i) => row.map((val, j) => val + hidden1[i][j]))];
    }
    
    const finalNorm = hidden[0].map(row => this.layerNorm(row, lnF.W, lnF.B));
    const logits = this.matmul(finalNorm, outputLayer.W);
    
    return logits;
  }

  generate(text, maxLen = 50, temperature = 0.7) {
    if (!this.isLoaded) return '';
    
    const inputIds = this.encode(text);
    const endIdx = this.charToIdx('<END>');
    const padIdx = this.charToIdx('<PAD>');
    
    let currentIds = [...inputIds];
    const result = [];
    
    for (let i = 0; i < maxLen; i++) {
      const logits = this.forward(currentIds.slice(-this.maxSeqLen));
      if (!logits) break;
      
      const lastLogits = logits[logits.length - 1];
      
      if (temperature > 0) {
        const adjusted = lastLogits.map(x => x / temperature);
        const probs = this.softmax(adjusted);
        
        const rand = Math.random();
        let sum = 0;
        let nextIdx = padIdx;
        for (let j = 0; j < probs.length; j++) {
          sum += probs[j];
          if (sum >= rand) {
            nextIdx = j;
            break;
          }
        }
        
        if (nextIdx === endIdx || nextIdx === padIdx) break;
        
        result.push(this.idxToChar(nextIdx));
        currentIds.push(nextIdx);
      } else {
        let maxVal = -Infinity;
        let nextIdx = padIdx;
        for (let j = 0; j < lastLogits.length; j++) {
          if (lastLogits[j] > maxVal && j !== endIdx && j !== padIdx) {
            maxVal = lastLogits[j];
            nextIdx = j;
          }
        }
        
        if (nextIdx === padIdx) break;
        
        result.push(this.idxToChar(nextIdx));
        currentIds.push(nextIdx);
      }
    }
    
    return result.join('');
  }

  getParamCount() {
    if (!this.params) return 0;
    let count = 0;
    
    const countParams = (obj) => {
      if (Array.isArray(obj)) {
        if (obj.length > 0 && typeof obj[0] === 'number') {
          count += obj.length;
        } else {
          obj.forEach(countParams);
        }
      } else if (typeof obj === 'object' && obj !== null) {
        Object.values(obj).forEach(countParams);
      }
    };
    
    countParams(this.params);
    return count;
  }
}

export { NeuralModel };