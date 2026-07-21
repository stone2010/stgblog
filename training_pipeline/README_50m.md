# STG-50M-Chat：50M参数聊天小钢炮

基于 [stone2010/stgblog](https://github.com/stone2010/stgblog) 项目的 `RomanticLM` 架构升级，打造一个 **50M参数** 的中文聊天模型。

## 🏗️ 模型架构

| 参数 | 值 |
|------|-----|
| Vocab Size | 16,000 |
| d_model | 640 |
| nhead | 8 |
| num_layers | 8 |
| dim_feedforward | 2,560 |
| max_seq_len | 512 |
| **总参数** | **~49.9M** |

架构特点：
- **Pre-LN Transformer**：更稳定的训练
- **权重绑定**：token embedding 与 output head 共享权重
- **GELU 激活**：比 ReLU 更平滑
- **因果注意力**：自回归生成

## 📊 训练策略

采用三阶段训练：

```
Stage 1: 预训练 (Pretrain)
    └── 大规模中文文本 → 基础语言能力

Stage 2: 监督微调 (SFT)
    └── 聊天对话数据 → 对话能力

Stage 3: 知识蒸馏 (Distillation) [可选]
    └── 大模型 soft labels → 知识压缩
```

### 知识蒸馏

蒸馏损失函数：

```
Loss = α × KL(student ‖ teacher) + (1-α) × CE(student, labels)
```

- `temperature`：软化概率分布 (默认 2.0)
- `alpha`：蒸馏损失权重 (默认 0.5)

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 一键训练

```bash
chmod +x train.sh
./train.sh
```

### 3. 分步执行

```bash
# 仅准备数据
./train.sh data

# 仅训练 tokenizer
./train.sh tokenizer

# 仅训练模型
./train.sh train

# 仅导出
./train.sh export

# 测试推理
./train.sh test
```

### 4. 自定义参数

```bash
EPOCHS=5 BATCH_SIZE=16 LR=1e-4 FP16="--fp16" ./train.sh train
```

## 📁 项目结构

```
stg_50m_chat/
├── model_v3.py          # 50M模型定义
├── prepare_data.py      # 数据收集与处理
├── distill_train.py     # 知识蒸馏训练脚本
├── export_model.py      # ONNX/TorchScript导出
├── train.sh             # 一键训练脚本
├── requirements.txt     # 依赖
├── README.md            # 本文件
├── data/                # 训练数据 (自动生成)
│   ├── chat_data.jsonl
│   ├── chat_data_train.jsonl
│   └── chat_data_val.jsonl
├── checkpoints/         # 模型权重 (自动生成)
│   ├── model_best.pt
│   └── training_log.json
└── export/              # 导出模型 (自动生成)
    ├── stg_50m_chat.onnx
    ├── stg_50m_chat_quantized.onnx
    └── tokenizer.json
```

## 🔧 Python API 使用

### 模型推理

```python
import torch
from model_v3 import STG50MChat, get_model_config, SPECIAL_TOKENS
from tokenizers import Tokenizer

# 加载
cfg = get_model_config()
model = STG50MChat(**cfg)
model.load_state_dict(torch.load("checkpoints/model_best.pt", map_location="cpu", weights_only=True))
model.eval()

tokenizer = Tokenizer.from_file("tokenizer.json")

# 推理
def chat(user_input):
    cls_id = SPECIAL_TOKENS["[CLS]"]
    sep_id = SPECIAL_TOKENS["[SEP]"]
    end_id = SPECIAL_TOKENS["[END]"]
    
    input_ids = tokenizer.encode(user_input).ids
    prompt = torch.tensor([[cls_id] + input_ids + [sep_id]], dtype=torch.long)
    
    with torch.no_grad():
        output = model.generate(prompt, max_new_tokens=128, temperature=0.8, end_token_id=end_id)
    
    ids = output[0].tolist()
    sep_pos = ids.index(sep_id)
    response_ids = ids[sep_pos+1:]
    if end_id in response_ids:
        response_ids = response_ids[:response_ids.index(end_id)]
    
    return tokenizer.decode(response_ids)

print(chat("你好"))
print(chat("推荐个电影"))
```

### 知识蒸馏训练

```python
from distill_train import train

train(
    train_data_path="data/chat_data_train.jsonl",
    val_data_path="data/chat_data_val.jsonl",
    tokenizer_path="tokenizer.json",
    teacher_model_path="path/to/teacher_model.pt",  # 大模型
    distill_alpha=0.5,
    distill_temperature=2.0,
    epochs=3,
    batch_size=32,
    learning_rate=3e-4,
)
```

## 📈 与原项目对比

| | RomanticLM v2 | STG-50M-Chat |
|---|---|---|
| 参数量 | ~21M | ~50M |
| 词表大小 | 8,000 | 16,000 |
| 层数 | 6 | 8 |
| d_model | 384 | 640 |
| 最大序列 | 256 | 512 |
| Norm位置 | Post-LN | Pre-LN |
| 蒸馏支持 | ❌ | ✅ |
| ONNX量化 | ✅ | ✅ |

## 💡 训练建议

1. **数据质量 > 数据数量**：清洗过的1万条 > 噪音的10万条
2. **学习率**：建议 1e-4 ~ 3e-4，配合 cosine schedule
3. **批次大小**：如果GPU显存不够，用 `--grad_accum` 梯度累积
4. **混合精度**：有GPU时建议开启 `--fp16`，加速训练
5. **蒸馏**：如果有更大的教师模型，蒸馏效果会更好

## 📝 License

基于 [stone2010/stgblog](https://github.com/stone2010/stgblog) 项目。
