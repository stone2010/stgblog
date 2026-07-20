import { Tensor, Embedding, PositionalEncoding, MultiHeadAttention, FeedForward, LayerNorm } from "./layers";

class TransformerDecoder {
  constructor(config) {
    this.config = config;
    this.vocabSize = config.vocabSize;
    this.dim = config.dim;
    this.numLayers = config.numLayers;
    this.numHeads = config.numHeads;
    this.maxLen = config.maxLen || 512;
    this.hiddenDim = config.hiddenDim || this.dim * 4;
    this.dropout = config.dropout || 0.1;
    this.temperature = config.temperature || 1.0;
    this.topK = config.topK || 0;

    this.embedding = new Embedding(this.vocabSize, this.dim);
    this.positionalEncoding = new PositionalEncoding(this.maxLen, this.dim);

    this.layers = [];
    for (let i = 0; i < this.numLayers; i++) {
      this.layers.push({
        attn: new MultiHeadAttention(this.dim, this.numHeads, this.dropout),
        norm1: new LayerNorm(this.dim),
        ff: new FeedForward(this.dim, this.hiddenDim, this.dropout),
        norm2: new LayerNorm(this.dim),
      });
    }

    this.finalNorm = new LayerNorm(this.dim);
    this.outputProj = Tensor.randn([this.dim, this.vocabSize]);
  }

  generateMask(seqLen) {
    const mask = Array(seqLen).fill(null).map(() => Array(seqLen).fill(-Infinity));
    for (let i = 0; i < seqLen; i++) {
      for (let j = 0; j <= i; j++) {
        mask[i][j] = 0;
      }
    }
    return new Tensor(mask, [seqLen, seqLen]);
  }

  forward(input) {
    let x = this.embedding.forward(input);
    x = this.positionalEncoding.forward(x);

    const mask = this.generateMask(input.length);

    for (const layer of this.layers) {
      const residual = x;
      x = layer.attn.forward(x.unsqueeze(0), mask);
      x = layer.norm1.forward(x.squeeze(0).add(residual));

      const residual2 = x;
      x = layer.ff.forward(x.unsqueeze(0));
      x = layer.norm2.forward(x.squeeze(0).add(residual2));
    }

    x = this.finalNorm.forward(x);
    const logits = x.matmul(this.outputProj);
    return logits;
  }

  sampleNextToken(logits, temperature = 1.0, topK = 0) {
    const lastLogits = logits.data[logits.data.length - 1];
    
    if (temperature !== 1.0) {
      lastLogits.forEach((_, i) => {
        lastLogits[i] /= temperature;
      });
    }

    if (topK > 0) {
      const indices = lastLogits.map((_, i) => i).sort((a, b) => lastLogits[b] - lastLogits[a]);
      const topIndices = indices.slice(0, topK);
      const topValues = topIndices.map(i => lastLogits[i]);
      const softmaxValues = softmax(topValues);
      
      const r = Math.random();
      let cumulative = 0;
      for (let i = 0; i < topIndices.length; i++) {
        cumulative += softmaxValues[i];
        if (r < cumulative) {
          return topIndices[i];
        }
      }
      return topIndices[0];
    }

    const softmaxValues = softmax(lastLogits);
    const r = Math.random();
    let cumulative = 0;
    for (let i = 0; i < softmaxValues.length; i++) {
      cumulative += softmaxValues[i];
      if (r < cumulative) {
        return i;
      }
    }
    return softmaxValues.indexOf(Math.max(...softmaxValues));
  }

  generate(input, maxLen = 100, temperature = 1.0, topK = 0, stopToken = null) {
    const output = [...input];
    
    for (let i = 0; i < maxLen; i++) {
      const logits = this.forward(output);
      const nextToken = this.sampleNextToken(logits, temperature, topK);
      
      if (nextToken === stopToken) break;
      output.push(nextToken);
      
      if (output.length >= this.maxLen) break;
    }
    
    return output;
  }

  async generateStream(input, maxLen = 100, temperature = 1.0, topK = 0, stopToken = null, callback = null) {
    const output = [...input];
    
    for (let i = 0; i < maxLen; i++) {
      const logits = this.forward(output);
      const nextToken = this.sampleNextToken(logits, temperature, topK);
      
      if (nextToken === stopToken) {
        if (callback) callback({ done: true });
        break;
      }
      
      output.push(nextToken);
      
      if (callback) {
        callback({ token: nextToken, done: false, output: [...output] });
      }
      
      if (output.length >= this.maxLen) {
        if (callback) callback({ done: true });
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    
    return output;
  }

  loadWeights(weights) {
    if (weights.embedding) {
      this.embedding.loadWeights(weights.embedding);
    }
    if (weights.positionalEncoding) {
      this.positionalEncoding.encoding = new Tensor(weights.positionalEncoding, [this.maxLen, this.dim]);
    }
    if (weights.layers) {
      weights.layers.forEach((layerWeights, i) => {
        if (layerWeights.attn) this.layers[i].attn.loadWeights(layerWeights.attn);
        if (layerWeights.norm1) this.layers[i].norm1.loadWeights(layerWeights.norm1);
        if (layerWeights.ff) this.layers[i].ff.loadWeights(layerWeights.ff);
        if (layerWeights.norm2) this.layers[i].norm2.loadWeights(layerWeights.norm2);
      });
    }
    if (weights.finalNorm) {
      this.finalNorm.loadWeights(weights.finalNorm);
    }
    if (weights.outputProj) {
      this.outputProj = new Tensor(weights.outputProj, [this.dim, this.vocabSize]);
    }
  }

  saveWeights() {
    return {
      embedding: this.embedding.weight.data,
      positionalEncoding: this.positionalEncoding.encoding.data,
      layers: this.layers.map(layer => ({
        attn: {
          Wq: layer.attn.Wq.data,
          Wk: layer.attn.Wk.data,
          Wv: layer.attn.Wv.data,
          Wo: layer.attn.Wo.data,
        },
        norm1: {
          weight: layer.norm1.weight.data,
          bias: layer.norm1.bias.data,
        },
        ff: {
          W1: layer.ff.W1.data,
          b1: layer.ff.b1.data,
          W2: layer.ff.W2.data,
          b2: layer.ff.b2.data,
        },
        norm2: {
          weight: layer.norm2.weight.data,
          bias: layer.norm2.bias.data,
        },
      })),
      finalNorm: {
        weight: this.finalNorm.weight.data,
        bias: this.finalNorm.bias.data,
      },
      outputProj: this.outputProj.data,
    };
  }
}

function softmax(arr) {
  const max = Math.max(...arr);
  const expArr = arr.map(x => Math.exp(x - max));
  const sum = expArr.reduce((a, b) => a + b, 0);
  return expArr.map(x => x / sum);
}

class GPTModel {
  constructor(config) {
    this.decoder = new TransformerDecoder(config);
    this.tokenizer = null;
  }

  setTokenizer(tokenizer) {
    this.tokenizer = tokenizer;
  }

  async chat(messages, maxLen = 100, temperature = 1.0, topK = 0, callback = null) {
    if (!this.tokenizer) {
      throw new Error("Tokenizer not set");
    }

    const prompt = this.tokenizer.encodeChat(messages);
    const inputIds = this.tokenizer.encode(prompt);

    if (callback) {
      await this.decoder.generateStream(
        inputIds,
        maxLen,
        temperature,
        topK,
        this.tokenizer.eosTokenId,
        (result) => {
          if (!result.done) {
            const token = this.tokenizer.decode([result.token]);
            callback({ token, done: false });
          } else {
            callback({ done: true });
          }
        }
      );
    } else {
      const outputIds = this.decoder.generate(
        inputIds,
        maxLen,
        temperature,
        topK,
        this.tokenizer.eosTokenId
      );
      const response = this.tokenizer.decode(outputIds.slice(inputIds.length));
      return response;
    }
  }

  generate(text, maxLen = 100, temperature = 1.0, topK = 0) {
    if (!this.tokenizer) {
      throw new Error("Tokenizer not set");
    }

    const inputIds = this.tokenizer.encode(text);
    const outputIds = this.decoder.generate(
      inputIds,
      maxLen,
      temperature,
      topK,
      this.tokenizer.eosTokenId
    );
    return this.tokenizer.decode(outputIds.slice(inputIds.length));
  }

  loadWeights(weights) {
    this.decoder.loadWeights(weights);
  }

  saveWeights() {
    return this.decoder.saveWeights();
  }
}

export { TransformerDecoder, GPTModel };
