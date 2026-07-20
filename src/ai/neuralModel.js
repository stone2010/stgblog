class NeuralModel {
  constructor() {
    this.vocab = {};
    this.idxToChar = [];
    this.vocabSize = 0;
    this.embedDim = 16;
    this.numHeads = 1;
    this.numLayers = 1;
    this.hiddenDim = 32;
    this.maxSeqLen = 128;
    this.params = {};
    this.isTrained = false;
  }

  buildVocab(texts) {
    const charSet = new Set();
    texts.forEach(text => {
      for (const char of text) {
        charSet.add(char);
      }
    });
    
    this.idxToChar = ['<PAD>', '<START>', '<END>', '<UNK>', ...Array.from(charSet)];
    this.vocabSize = this.idxToChar.length;
    
    this.idxToChar.forEach((char, idx) => {
      this.vocab[char] = idx;
    });
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

  initParams() {
    const { vocabSize, embedDim, numHeads, hiddenDim, numLayers } = this;
    
    this.params = {
      embedding: this.randomInit(vocabSize, embedDim),
      posEmbedding: this.randomInit(this.maxSeqLen, embedDim),
      
      attnWq: this.randomInit(numLayers, embedDim, embedDim),
      attnWk: this.randomInit(numLayers, embedDim, embedDim),
      attnWv: this.randomInit(numLayers, embedDim, embedDim),
      attnWo: this.randomInit(numLayers, embedDim, embedDim),
      
      ffW1: this.randomInit(numLayers, embedDim, hiddenDim),
      ffB1: this.zeros(hiddenDim),
      ffW2: this.randomInit(numLayers, hiddenDim, embedDim),
      ffB2: this.zeros(embedDim),
      
      layerNormW1: this.ones(embedDim),
      layerNormB1: this.zeros(embedDim),
      layerNormW2: this.ones(embedDim),
      layerNormB2: this.zeros(embedDim),
      
      outputW: this.randomInit(embedDim, vocabSize),
      outputB: this.zeros(vocabSize),
    };
  }

  randomInit(...shape) {
    const result = [];
    const flatSize = shape.reduce((a, b) => a * b, 1);
    for (let i = 0; i < flatSize; i++) {
      result.push((Math.random() - 0.5) * 2 * Math.sqrt(2 / shape[shape.length - 1]));
    }
    return this.reshape(result, shape);
  }

  zeros(size) {
    return Array(size).fill(0);
  }

  ones(size) {
    return Array(size).fill(1);
  }

  reshape(arr, shape) {
    if (shape.length === 1) return arr;
    const [first, ...rest] = shape;
    const subSize = rest.reduce((a, b) => a * b, 1);
    const result = [];
    for (let i = 0; i < first; i++) {
      result.push(this.reshape(arr.slice(i * subSize, (i + 1) * subSize), rest));
    }
    return result;
  }

  flatten(arr) {
    if (!Array.isArray(arr)) return [arr];
    return arr.reduce((acc, val) => acc.concat(this.flatten(val)), []);
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

  relu(x) {
    return x.map(val => Math.max(0, val));
  }

  forward(inputIds) {
    const { embedding, posEmbedding, attnWq, attnWk, attnWv, attnWo, ffW1, ffB1, ffW2, ffB2, layerNormW1, layerNormB1, layerNormW2, layerNormB2, outputW, outputB } = this.params;
    
    const seqLen = inputIds.length;
    let hidden = [];
    
    for (let i = 0; i < seqLen; i++) {
      const emb = embedding[inputIds[i]];
      const pos = posEmbedding[i];
      hidden.push(emb.map((e, j) => e + pos[j]));
    }
    
    for (let layer = 0; layer < this.numLayers; layer++) {
      const q = this.matmul(hidden, attnWq[layer]);
      const k = this.matmul(hidden, attnWk[layer]);
      const v = this.matmul(hidden, attnWv[layer]);
      
      const scores = this.matmul(q, this.transpose(k));
      const scaled = scores.map(row => row.map(val => val / Math.sqrt(this.embedDim)));
      
      const mask = this.createMask(seqLen);
      const masked = scaled.map((row, i) => row.map((val, j) => mask[i][j] ? -1e9 : val));
      
      const attnWeights = masked.map(row => this.softmax(row));
      const attnOut = this.matmul(attnWeights, v);
      const attnProj = this.matmul(attnOut, attnWo[layer]);
      
      const residual1 = attnProj.map((row, i) => row.map((val, j) => val + hidden[i][j]));
      const norm1 = residual1.map(row => this.layerNorm(row, layerNormW1, layerNormB1));
      
      const ff1 = this.matmul(norm1, ffW1[layer]).map(row => row.map((val, i) => val + ffB1[i]));
      const reluOut = ff1.map(row => this.relu(row));
      const ff2 = this.matmul(reluOut, ffW2[layer]).map(row => row.map((val, i) => val + ffB2[i]));
      
      const residual2 = ff2.map((row, i) => row.map((val, j) => val + norm1[i][j]));
      hidden = residual2.map(row => this.layerNorm(row, layerNormW2, layerNormB2));
    }
    
    const logits = this.matmul(hidden, outputW).map(row => row.map((val, i) => val + outputB[i]));
    return logits;
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

  createMask(seqLen) {
    const mask = [];
    for (let i = 0; i < seqLen; i++) {
      mask[i] = [];
      for (let j = 0; j < seqLen; j++) {
        mask[i][j] = j > i;
      }
    }
    return mask;
  }

  computeLoss(inputIds, targetIds) {
    const logits = this.forward(inputIds);
    let loss = 0;
    let count = 0;
    
    for (let i = 0; i < targetIds.length; i++) {
      if (targetIds[i] === this.charToIdx('<PAD>')) continue;
      const probs = this.softmax(logits[i]);
      loss -= Math.log(probs[targetIds[i]] + 1e-9);
      count++;
    }
    
    return count > 0 ? loss / count : 0;
  }

  generate(inputText, maxLen = 60, temperature = 0.7) {
    if (!this.isTrained) {
      return inputText ? '我还在学习中...' : '你好呀！';
    }
    
    let inputIds = this.encode(inputText);
    let result = [];
    
    for (let i = 0; i < maxLen; i++) {
      const logits = this.forward(inputIds);
      const lastLogits = logits[logits.length - 1];
      
      const adjusted = lastLogits.map(val => val / temperature);
      const probs = this.softmax(adjusted);
      
      const nextIdx = this.sample(probs);
      
      if (nextIdx === this.charToIdx('<END>')) break;
      if (nextIdx === this.charToIdx('<PAD>')) continue;
      
      result.push(nextIdx);
      inputIds.push(nextIdx);
      
      if (inputIds.length > this.maxSeqLen) {
        inputIds = inputIds.slice(-this.maxSeqLen);
      }
    }
    
    return this.decode(result);
  }

  sample(probs) {
    const rand = Math.random();
    let cumulative = 0;
    for (let i = 0; i < probs.length; i++) {
      cumulative += probs[i];
      if (rand < cumulative) return i;
    }
    return probs.length - 1;
  }

  train(trainData, epochs = 10, batchSize = 8, lr = 0.001) {
    this.initParams();
    
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;
      let count = 0;
      
      for (let i = 0; i < trainData.length; i += batchSize) {
        const batch = trainData.slice(i, i + batchSize);
        const gradients = this.computeGradients(batch);
        
        this.applyGradients(gradients, lr);
        
        batch.forEach(item => {
          totalLoss += this.computeLoss(item.inputIds, item.targetIds);
          count++;
        });
      }
      
      const avgLoss = totalLoss / count;
      console.log(`Epoch ${epoch + 1}/${epochs}, Loss: ${avgLoss.toFixed(4)}`);
      
      if (avgLoss < 2.0) break;
    }
    
    this.isTrained = true;
  }

  computeGradients(batch) {
    const grads = {};
    const paramKeys = Object.keys(this.params);
    
    paramKeys.forEach(key => {
      grads[key] = this.zeroLike(this.params[key]);
    });
    
    const epsilon = 1e-4;
    
    paramKeys.forEach(key => {
      const param = this.params[key];
      const flatParam = this.flatten(param);
      const flatGrad = this.flatten(grads[key]);
      
      for (let i = 0; i < flatParam.length; i++) {
        const original = flatParam[i];
        
        flatParam[i] = original + epsilon;
        const lossPlus = this.computeBatchLoss(batch);
        
        flatParam[i] = original - epsilon;
        const lossMinus = this.computeBatchLoss(batch);
        
        flatGrad[i] = (lossPlus - lossMinus) / (2 * epsilon);
        
        flatParam[i] = original;
      }
      
      this.params[key] = this.reshape(flatParam, this.getShape(param));
      grads[key] = this.reshape(flatGrad, this.getShape(param));
    });
    
    return grads;
  }

  computeBatchLoss(batch) {
    let totalLoss = 0;
    batch.forEach(item => {
      totalLoss += this.computeLoss(item.inputIds, item.targetIds);
    });
    return totalLoss / batch.length;
  }

  applyGradients(gradients, lr) {
    Object.keys(this.params).forEach(key => {
      const param = this.params[key];
      const grad = gradients[key];
      this.params[key] = this.subtract(param, this.multiplyScalar(grad, lr));
    });
  }

  subtract(A, B) {
    if (!Array.isArray(A)) return A - B;
    return A.map((a, i) => this.subtract(a, B[i]));
  }

  multiplyScalar(A, scalar) {
    if (!Array.isArray(A)) return A * scalar;
    return A.map(a => this.multiplyScalar(a, scalar));
  }

  zeroLike(obj) {
    if (!Array.isArray(obj)) return 0;
    return obj.map(item => this.zeroLike(item));
  }

  getShape(obj) {
    if (!Array.isArray(obj)) return [];
    return [obj.length, ...this.getShape(obj[0])];
  }

  saveModel(path) {
    const modelData = {
      vocab: this.vocab,
      idxToChar: this.idxToChar,
      vocabSize: this.vocabSize,
      embedDim: this.embedDim,
      numHeads: this.numHeads,
      numLayers: this.numLayers,
      hiddenDim: this.hiddenDim,
      maxSeqLen: this.maxSeqLen,
      params: this.params,
      isTrained: this.isTrained,
    };
    
    try {
      localStorage.setItem('ai_neural_model', JSON.stringify(modelData));
      return true;
    } catch (e) {
      console.error('Failed to save model:', e);
      return false;
    }
  }

  loadModel() {
    try {
      const data = localStorage.getItem('ai_neural_model');
      if (!data) return false;
      
      const modelData = JSON.parse(data);
      
      this.vocab = modelData.vocab;
      this.idxToChar = modelData.idxToChar;
      this.vocabSize = modelData.vocabSize;
      this.embedDim = modelData.embedDim;
      this.numHeads = modelData.numHeads;
      this.numLayers = modelData.numLayers;
      this.hiddenDim = modelData.hiddenDim;
      this.maxSeqLen = modelData.maxSeqLen;
      this.params = modelData.params;
      this.isTrained = modelData.isTrained;
      
      return true;
    } catch (e) {
      console.error('Failed to load model:', e);
      return false;
    }
  }

  getParamCount() {
    let count = 0;
    Object.keys(this.params).forEach(key => {
      count += this.flatten(this.params[key]).length;
    });
    return count;
  }
}

export { NeuralModel };
