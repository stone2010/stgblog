class Tensor {
  constructor(data, shape) {
    this.data = data;
    this.shape = shape;
  }

  static fromArray(arr) {
    const shape = [];
    let temp = arr;
    while (Array.isArray(temp)) {
      shape.push(temp.length);
      temp = temp[0];
    }
    return new Tensor(arr, shape);
  }

  static zeros(shape) {
    const data = createZeroArray(shape);
    return new Tensor(data, shape);
  }

  static randn(shape) {
    const data = createZeroArray(shape);
    fillRandom(data);
    return new Tensor(data, shape);
  }

  reshape(newShape) {
    const flat = flatten(this.data);
    const reshaped = reshapeArray(flat, newShape);
    return new Tensor(reshaped, newShape);
  }

  transpose() {
    if (this.shape.length !== 2) throw new Error("Only 2D tensors can be transposed");
    const [rows, cols] = this.shape;
    const data = Array(cols).fill(null).map((_, i) =>
      Array(rows).fill(null).map((_, j) => this.data[j][i])
    );
    return new Tensor(data, [cols, rows]);
  }

  matmul(other) {
    if (this.shape[this.shape.length - 1] !== other.shape[other.shape.length - 2]) {
      throw new Error("Matrix dimensions mismatch");
    }
    const result = matmul(this.data, other.data);
    return new Tensor(result, [...this.shape.slice(0, -1), ...other.shape.slice(-1)]);
  }

  add(other) {
    if (other instanceof Tensor) {
      return new Tensor(elementWiseOp(this.data, other.data, (a, b) => a + b), this.shape);
    }
    return new Tensor(elementWiseOp(this.data, other, (a, b) => a + b), this.shape);
  }

  mul(other) {
    if (other instanceof Tensor) {
      return new Tensor(elementWiseOp(this.data, other.data, (a, b) => a * b), this.shape);
    }
    return new Tensor(elementWiseOp(this.data, other, (a, b) => a * b), this.shape);
  }

  div(other) {
    if (other instanceof Tensor) {
      return new Tensor(elementWiseOp(this.data, other.data, (a, b) => a / b), this.shape);
    }
    return new Tensor(elementWiseOp(this.data, other, (a, b) => a / b), this.shape);
  }

  exp() {
    return new Tensor(mapRecursive(this.data, Math.exp), this.shape);
  }

  log() {
    return new Tensor(mapRecursive(this.data, Math.log), this.shape);
  }

  softmax(dim = -1) {
    const result = softmax(this.data, dim);
    return new Tensor(result, this.shape);
  }

  layerNorm(epsilon = 1e-5) {
    const result = layerNorm(this.data, epsilon);
    return new Tensor(result, this.shape);
  }

  relu() {
    return new Tensor(mapRecursive(this.data, (x) => Math.max(0, x)), this.shape);
  }

  gelu() {
    return new Tensor(mapRecursive(this.data, gelu), this.shape);
  }

  dropout(p = 0.1) {
    return new Tensor(dropout(this.data, p), this.shape);
  }

  squeeze(dim) {
    const newShape = this.shape.filter((_, i) => i !== dim);
    return new Tensor(flatten(this.data), newShape);
  }

  unsqueeze(dim) {
    const newShape = [...this.shape];
    newShape.splice(dim, 0, 1);
    return new Tensor([this.data], newShape);
  }

  mean(dim) {
    if (dim === undefined) {
      return flatten(this.data).reduce((a, b) => a + b, 0) / flatten(this.data).length;
    }
    const result = meanDim(this.data, dim);
    return new Tensor(result, result.length === 1 ? [result.length] : result[0].length);
  }

  var(dim) {
    const m = this.mean(dim);
    const diff = this.sub(m).mul(this.sub(m));
    return diff.mean(dim);
  }

  sqrt() {
    return new Tensor(mapRecursive(this.data, Math.sqrt), this.shape);
  }

  norm() {
    return Math.sqrt(flatten(this.data).reduce((a, b) => a + b * b, 0));
  }

  scale(factor) {
    return this.mul(factor);
  }

  clone() {
    return new Tensor(JSON.parse(JSON.stringify(this.data)), [...this.shape]);
  }

  get size() {
    return this.shape.reduce((a, b) => a * b, 1);
  }
}

function createZeroArray(shape) {
  if (shape.length === 0) return 0;
  if (shape.length === 1) return Array(shape[0]).fill(0);
  return Array(shape[0]).fill(null).map(() => createZeroArray(shape.slice(1)));
}

function fillRandom(arr) {
  if (typeof arr === 'number') return;
  if (!Array.isArray(arr)) return;
  for (let i = 0; i < arr.length; i++) {
    if (typeof arr[i] === 'number') {
      arr[i] = (Math.random() - 0.5) * 2;
    } else {
      fillRandom(arr[i]);
    }
  }
}

function flatten(arr) {
  const result = [];
  function recurse(a) {
    if (typeof a === 'number') {
      result.push(a);
    } else {
      a.forEach(recurse);
    }
  }
  recurse(arr);
  return result;
}

function reshapeArray(flat, shape) {
  if (shape.length === 1) return flat;
  const [first, ...rest] = shape;
  const size = rest.reduce((a, b) => a * b, 1);
  const result = [];
  for (let i = 0; i < first; i++) {
    result.push(reshapeArray(flat.slice(i * size, (i + 1) * size), rest));
  }
  return result;
}

function elementWiseOp(a, b, op) {
  if (typeof a === 'number' && typeof b === 'number') return op(a, b);
  if (typeof b === 'number') return a.map(x => elementWiseOp(x, b, op));
  return a.map((x, i) => elementWiseOp(x, b[i], op));
}

function mapRecursive(arr, fn) {
  if (typeof arr === 'number') return fn(arr);
  return arr.map(x => mapRecursive(x, fn));
}

function matmul(A, B) {
  const rowsA = A.length;
  const colsA = A[0].length;
  const colsB = B[0].length;
  const result = Array(rowsA).fill(null).map(() => Array(colsB).fill(0));
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += A[i][k] * B[k][j];
      }
    }
  }
  return result;
}

function softmax(arr, dim = -1) {
  if (dim === -1) dim = arr.length - 1;
  const max = Math.max(...flatten(arr));
  const expArr = mapRecursive(arr, x => Math.exp(x - max));
  const sum = flatten(expArr).reduce((a, b) => a + b, 0);
  return mapRecursive(expArr, x => x / sum);
}

function layerNorm(arr, epsilon) {
  const flat = flatten(arr);
  const mean = flat.reduce((a, b) => a + b, 0) / flat.length;
  const variance = flat.reduce((a, b) => a + (b - mean) ** 2, 0) / flat.length;
  const std = Math.sqrt(variance + epsilon);
  return mapRecursive(arr, x => (x - mean) / std);
}

function gelu(x) {
  return x * 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x)));
}

function dropout(arr, p) {
  return mapRecursive(arr, x => Math.random() < p ? 0 : x / (1 - p));
}

function meanDim(arr, dim) {
  if (dim === 0) {
    const cols = arr[0].length;
    return Array(cols).fill(0).map((_, j) =>
      arr.reduce((sum, row) => sum + row[j], 0) / arr.length
    );
  }
  return arr.map(row => row.reduce((a, b) => a + b, 0) / row.length);
}

class Embedding {
  constructor(vocabSize, dim) {
    this.vocabSize = vocabSize;
    this.dim = dim;
    this.weight = Tensor.randn([vocabSize, dim]);
    this.scale = Math.sqrt(dim);
  }

  forward(input) {
    const result = [];
    for (const token of input) {
      result.push(this.weight.data[token] || Array(this.dim).fill(0));
    }
    return new Tensor(result, [input.length, this.dim]).mul(this.scale);
  }

  loadWeights(data) {
    this.weight = new Tensor(data, [this.vocabSize, this.dim]);
  }
}

class PositionalEncoding {
  constructor(maxLen, dim) {
    this.maxLen = maxLen;
    this.dim = dim;
    this.encoding = this.initEncoding();
  }

  initEncoding() {
    const encoding = Array(this.maxLen).fill(null).map(() => Array(this.dim).fill(0));
    for (let pos = 0; pos < this.maxLen; pos++) {
      for (let i = 0; i < this.dim; i += 2) {
        encoding[pos][i] = Math.sin(pos / Math.pow(10000, i / this.dim));
        encoding[pos][i + 1] = Math.cos(pos / Math.pow(10000, i / this.dim));
      }
    }
    return new Tensor(encoding, [this.maxLen, this.dim]);
  }

  forward(input) {
    const seqLen = input.shape[0];
    const posEnc = this.encoding.data.slice(0, seqLen);
    return input.add(new Tensor(posEnc, [seqLen, this.dim]));
  }
}

class MultiHeadAttention {
  constructor(dim, numHeads, dropout = 0.1) {
    this.dim = dim;
    this.numHeads = numHeads;
    this.headDim = dim / numHeads;
    this.dropout = dropout;

    this.Wq = Tensor.randn([dim, dim]);
    this.Wk = Tensor.randn([dim, dim]);
    this.Wv = Tensor.randn([dim, dim]);
    this.Wo = Tensor.randn([dim, dim]);
  }

  forward(x, mask = null) {
    const [batchSize, seqLen, _] = x.shape;
    
    const Q = x.matmul(this.Wq).reshape([batchSize, seqLen, this.numHeads, this.headDim]).transpose().reshape([batchSize * this.numHeads, seqLen, this.headDim]);
    const K = x.matmul(this.Wk).reshape([batchSize, seqLen, this.numHeads, this.headDim]).transpose().reshape([batchSize * this.numHeads, seqLen, this.headDim]);
    const V = x.matmul(this.Wv).reshape([batchSize, seqLen, this.numHeads, this.headDim]).transpose().reshape([batchSize * this.numHeads, seqLen, this.headDim]);

    const scores = Q.matmul(K.transpose()).div(Math.sqrt(this.headDim));
    
    if (mask) {
      scores = scores.add(mask);
    }

    const attn = scores.softmax(-1).dropout(this.dropout);
    const output = attn.matmul(V);

    const reshaped = output.reshape([this.numHeads, batchSize, seqLen, this.headDim]).transpose().reshape([batchSize, seqLen, this.dim]);
    return reshaped.matmul(this.Wo);
  }

  loadWeights(data) {
    this.Wq = new Tensor(data.Wq, [this.dim, this.dim]);
    this.Wk = new Tensor(data.Wk, [this.dim, this.dim]);
    this.Wv = new Tensor(data.Wv, [this.dim, this.dim]);
    this.Wo = new Tensor(data.Wo, [this.dim, this.dim]);
  }
}

class FeedForward {
  constructor(dim, hiddenDim, dropout = 0.1) {
    this.dim = dim;
    this.hiddenDim = hiddenDim;
    this.dropout = dropout;

    this.W1 = Tensor.randn([dim, hiddenDim]);
    this.b1 = Tensor.zeros([hiddenDim]);
    this.W2 = Tensor.randn([hiddenDim, dim]);
    this.b2 = Tensor.zeros([dim]);
  }

  forward(x) {
    return x.matmul(this.W1).add(this.b1).gelu().dropout(this.dropout).matmul(this.W2).add(this.b2);
  }

  loadWeights(data) {
    this.W1 = new Tensor(data.W1, [this.dim, this.hiddenDim]);
    this.b1 = new Tensor(data.b1, [this.hiddenDim]);
    this.W2 = new Tensor(data.W2, [this.hiddenDim, this.dim]);
    this.b2 = new Tensor(data.b2, [this.dim]);
  }
}

class LayerNorm {
  constructor(dim, epsilon = 1e-5) {
    this.dim = dim;
    this.epsilon = epsilon;
    this.weight = Tensor.randn([dim]);
    this.bias = Tensor.zeros([dim]);
  }

  forward(x) {
    const normalized = x.layerNorm(this.epsilon);
    return normalized.mul(this.weight).add(this.bias);
  }

  loadWeights(data) {
    this.weight = new Tensor(data.weight, [this.dim]);
    this.bias = new Tensor(data.bias, [this.dim]);
  }
}

export { Tensor, Embedding, PositionalEncoding, MultiHeadAttention, FeedForward, LayerNorm };
