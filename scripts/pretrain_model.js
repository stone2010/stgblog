import { readFileSync, writeFileSync } from 'fs';
import { NeuralModel } from '../src/ai/neuralModel.js';

async function loadTrainingData() {
  const sources = [
    'public/ai_data/training_data.jsonl',
    'public/ai_data/distill_large.jsonl',
    'public/ai_data/distill_emotional_companion.jsonl',
    'public/ai_data/corpus_emotional_companion.jsonl',
  ];

  const allPairs = [];

  for (const source of sources) {
    try {
      const text = readFileSync(source, 'utf8');
      const lines = text.trim().split('\n');
      lines.forEach(line => {
        try {
          const pair = JSON.parse(line);
          if (pair.user && pair.assistant) {
            allPairs.push(pair);
          }
        } catch {
          // skip invalid lines
        }
      });
    } catch (e) {
      console.log(`Failed to load ${source}:`, e.message);
    }
  }

  console.log(`Loaded ${allPairs.length} QA pairs`);
  return allPairs;
}

function encodeData(qaPairs, model) {
  const trainData = [];

  qaPairs.forEach((pair, idx) => {
    try {
      const inputIds = model.encode(pair.user);
      const targetIds = model.encode(pair.assistant);
      
      if (inputIds.length > 1 && targetIds.length > 1) {
        trainData.push({ inputIds, targetIds });
      }
    } catch (e) {
      if (idx < 10) {
        console.log(`Failed to encode pair ${idx}:`, e.message);
      }
    }
  });

  console.log(`Encoded ${trainData.length} training samples`);
  return trainData;
}

async function trainModel() {
  console.log('Starting model pre-training...');
  console.log('='.repeat(60));

  const model = new NeuralModel();

  const qaPairs = await loadTrainingData();

  if (qaPairs.length === 0) {
    console.error('No training data found!');
    process.exit(1);
  }

  const texts = [];
  qaPairs.forEach(pair => {
    texts.push(pair.user);
    texts.push(pair.assistant);
  });

  console.log('Building vocabulary...');
  model.buildVocab(texts);
  console.log(`Vocabulary size: ${model.vocabSize}`);

  console.log('Initializing model parameters...');
  model.initParams();
  const paramCount = model.getParamCount();
  console.log(`Model parameters: ${(paramCount / 1000000).toFixed(2)}M (${paramCount.toLocaleString()})`);

  const trainData = encodeData(qaPairs, model);

  if (trainData.length === 0) {
    console.error('No valid training data!');
    process.exit(1);
  }

  const sampleSize = Math.min(trainData.length, 20000);
  const sampledData = trainData.sort(() => Math.random() - 0.5).slice(0, sampleSize);
  console.log(`Using ${sampledData.length} training samples`);

  console.log('\nStarting training...');
  console.log('='.repeat(60));

  const epochs = 30;
  const batchSize = 4;
  const lr = 0.005;
  const epsilon = 1e-4;

  const { params } = model;
  const paramKeys = Object.keys(params);

  for (let epoch = 0; epoch < epochs; epoch++) {
    let totalLoss = 0;
    let count = 0;

    sampledData.sort(() => Math.random() - 0.5);

    for (let i = 0; i < sampledData.length; i += batchSize) {
      const batch = sampledData.slice(i, i + batchSize);

      paramKeys.forEach(key => {
        const param = params[key];
        const flatParam = model.flatten(param);

        for (let j = 0; j < flatParam.length; j++) {
          const original = flatParam[j];

          flatParam[j] = original + epsilon;
          const lossPlus = computeBatchLoss(batch, model);

          flatParam[j] = original - epsilon;
          const lossMinus = computeBatchLoss(batch, model);

          const grad = (lossPlus - lossMinus) / (2 * epsilon);
          flatParam[j] = original - grad * lr;
        }

        params[key] = model.reshape(flatParam, model.getShape(param));
      });

      batch.forEach(item => {
        totalLoss += model.computeLoss(item.inputIds, item.targetIds);
        count++;
      });

      if (i % (batchSize * 20) === 0 && i > 0) {
        const progress = ((i / sampledData.length) * 100).toFixed(1);
        console.log(`  Progress: ${progress}%`);
      }
    }

    const avgLoss = totalLoss / count;
    console.log(`Epoch ${epoch + 1}/${epochs} | Loss: ${avgLoss.toFixed(4)}`);

    if (avgLoss < 1.5) {
      console.log(`Early stopping at epoch ${epoch + 1} with loss ${avgLoss.toFixed(4)}`);
      break;
    }

    if ((epoch + 1) % 10 === 0) {
      saveModelSnapshot(model, epoch + 1);
    }
  }

  model.isTrained = true;
  saveModel(model);

  console.log('\nTraining complete!');
  console.log('='.repeat(60));
  console.log(`Final parameter count: ${model.getParamCount().toLocaleString()}`);
  console.log('Model saved to public/ai_data/pretrained_model.json');

  testGeneration(model);
}

function computeBatchLoss(batch, model) {
  let totalLoss = 0;
  batch.forEach(item => {
    totalLoss += model.computeLoss(item.inputIds, item.targetIds);
  });
  return totalLoss / batch.length;
}

function saveModel(model) {
  const modelData = {
    vocab: model.vocab,
    idxToChar: model.idxToChar,
    vocabSize: model.vocabSize,
    embedDim: model.embedDim,
    numHeads: model.numHeads,
    numLayers: model.numLayers,
    hiddenDim: model.hiddenDim,
    maxSeqLen: model.maxSeqLen,
    params: model.params,
    isTrained: true,
  };

  const jsonStr = JSON.stringify(modelData);
  writeFileSync('public/ai_data/pretrained_model.json', jsonStr, 'utf8');
  console.log(`Model size: ${(jsonStr.length / 1024 / 1024).toFixed(2)} MB`);
}

function saveModelSnapshot(model, epoch) {
  const modelData = {
    vocab: model.vocab,
    idxToChar: model.idxToChar,
    vocabSize: model.vocabSize,
    embedDim: model.embedDim,
    numHeads: model.numHeads,
    numLayers: model.numLayers,
    hiddenDim: model.hiddenDim,
    maxSeqLen: model.maxSeqLen,
    params: model.params,
    isTrained: true,
    epoch: epoch,
  };

  const jsonStr = JSON.stringify(modelData);
  writeFileSync(`public/ai_data/pretrained_model_epoch_${epoch}.json`, jsonStr, 'utf8');
  console.log(`Saved snapshot at epoch ${epoch}`);
}

function testGeneration(model) {
  console.log('\nTesting generation...');
  const testInputs = ['你好', '今天心情怎么样', '我想你了', '晚安'];
  
  testInputs.forEach(input => {
    const output = model.generate(input, 50, 0.7);
    console.log(`Q: ${input}`);
    console.log(`A: ${output}`);
    console.log('---');
  });
}

trainModel().catch(err => {
  console.error('Training failed:', err);
  process.exit(1);
});