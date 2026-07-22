"""
全链路：训练字符级模型 → 导出ONNX → 生成vocab.json
直接替换网站的AI模型
"""

import torch
import torch.nn as nn
import json, os, sys, time, re
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model_v3 import STG50MChat, SPECIAL_TOKENS


# ============================================================
# Step 1: 构建字符级词表
# ============================================================

def build_char_vocab(data_paths, max_vocab=3000):
    """从训练数据构建字符级词表"""
    char_counter = Counter()

    for path in data_paths:
        if not os.path.exists(path):
            continue
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                    for ch in (item.get('input', '') + item.get('output', '')):
                        char_counter[ch] += 1
                except:
                    continue

    # 特殊token
    vocab = {
        '<PAD>': 0,
        '<START>': 1,
        '<END>': 2,
        '<UNK>': 3,
    }

    # 按频率排序加入字符
    for ch, _ in char_counter.most_common(max_vocab - len(vocab)):
        if ch not in vocab:
            vocab[ch] = len(vocab)

    print(f"Vocab size: {len(vocab)} (chars from {sum(char_counter.values())} total)")
    return vocab


# ============================================================
# Step 2: 数据集
# ============================================================

class CharDataset(torch.utils.data.Dataset):
    def __init__(self, path, vocab, max_len=128):
        self.vocab = vocab
        self.max_len = max_len
        self.data = []
        with open(path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        item = json.loads(line)
                        if item.get('input') and item.get('output'):
                            self.data.append(item)
                    except:
                        continue
        print(f"  Loaded {len(self.data)} samples")

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]
        unk = self.vocab.get('<UNK>', 3)
        start = self.vocab.get('<START>', 1)
        end = self.vocab.get('<END>', 2)
        pad = self.vocab.get('<PAD>', 0)

        def encode(text):
            return [self.vocab.get(ch, unk) for ch in text]

        inp_ids = encode(item['input'])
        out_ids = encode(item['output'])

        ids = [start] + inp_ids + [end] + out_ids + [end]

        if len(ids) > self.max_len:
            h = self.max_len // 2 - 2
            ids = [start] + inp_ids[:h] + [end] + out_ids[:h] + [end]

        padding = self.max_len - len(ids)
        ids += [pad] * padding

        labels = [-100] * self.max_len
        # loss on output part only (after second <END> which separates input/output)
        sep_pos = len([start] + inp_ids)  # position of first <END>
        for i in range(sep_pos + 1, self.max_len):
            if ids[i] != pad:
                labels[i] = ids[i]

        return torch.tensor(ids, dtype=torch.long), torch.tensor(labels, dtype=torch.long)


# ============================================================
# Step 3: 训练
# ============================================================

def train_model(vocab, data_dir, out_dir, epochs=5, bs=8, lr=3e-4):
    vocab_size = len(vocab)

    # ~30M config, 适配 vocab_size
    cfg = dict(
        vocab_size=vocab_size,
        d_model=544,
        nhead=8,
        num_layers=8,
        dim_feedforward=2176,
        max_seq_len=128,
        dropout=0.1,
    )

    train_ds = CharDataset(os.path.join(data_dir, 'chat_data_train.jsonl'), vocab)
    val_ds = CharDataset(os.path.join(data_dir, 'chat_data_val.jsonl'), vocab)
    train_loader = torch.utils.data.DataLoader(train_ds, batch_size=bs, shuffle=True, num_workers=0)
    val_loader = torch.utils.data.DataLoader(val_ds, batch_size=bs, shuffle=False, num_workers=0)

    model = STG50MChat(**cfg)
    n = sum(p.numel() for p in model.parameters())
    print(f"Model: {n:,} params ({n/1e6:.1f}M), vocab={vocab_size}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=lr, weight_decay=0.01)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs * len(train_loader))
    criterion = nn.CrossEntropyLoss(ignore_index=-100)

    best_val = float('inf')
    os.makedirs(out_dir, exist_ok=True)

    for epoch in range(1, epochs + 1):
        model.train()
        total_loss, nb = 0, 0
        t0 = time.time()

        for step, (ids, labels) in enumerate(train_loader):
            optimizer.zero_grad()
            logits = model(ids)
            loss = criterion(logits[:, :-1, :].contiguous().reshape(-1, vocab_size),
                           labels[:, 1:].contiguous().reshape(-1))
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            total_loss += loss.item()
            nb += 1

            if (step + 1) % 100 == 0:
                print(f"  E{epoch} S{step+1}/{len(train_loader)} loss={total_loss/nb:.4f}")

        avg = total_loss / max(nb, 1)

        model.eval()
        vl, vb = 0, 0
        with torch.no_grad():
            for ids, labels in val_loader:
                logits = model(ids)
                loss = criterion(logits[:, :-1, :].contiguous().reshape(-1, vocab_size),
                               labels[:, 1:].contiguous().reshape(-1))
                vl += loss.item()
                vb += 1

        avg_v = vl / max(vb, 1)
        dt = time.time() - t0
        print(f"Epoch {epoch}/{epochs} | Train: {avg:.4f} | Val: {avg_v:.4f} | {dt:.0f}s")

        if avg_v < best_val:
            best_val = avg_v
            torch.save({'state_dict': model.state_dict(), 'config': cfg},
                      os.path.join(out_dir, 'model_best.pt'))
            print(f"  ✅ Best!")

    return model, cfg


# ============================================================
# Step 4: 导出ONNX
# ============================================================

def export_onnx(model, cfg, vocab, out_path):
    """导出ONNX模型，兼容网站的ort.InferenceSession"""
    model.eval()

    # dummy input: [1, 128] int64
    dummy = torch.randint(0, cfg['vocab_size'], (1, cfg['max_seq_len']), dtype=torch.long)

    torch.onnx.export(
        model,
        dummy,
        out_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=['input_ids'],
        output_names=['logits'],
        dynamic_axes={
            'input_ids': {0: 'batch_size', 1: 'seq_len'},
            'logits': {0: 'batch_size', 1: 'seq_len'},
        },
    )

    size_mb = os.path.getsize(out_path) / (1024 * 1024)
    print(f"ONNX exported: {out_path} ({size_mb:.1f}MB)")
    return size_mb


def quantize_onnx(input_path, output_path):
    """INT8动态量化"""
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        quantize_dynamic(input_path, output_path, weight_type=QuantType.QInt8)
        size_mb = os.path.getsize(output_path) / (1024 * 1024)
        print(f"Quantized: {output_path} ({size_mb:.1f}MB)")
        return size_mb
    except ImportError:
        print("onnxruntime not installed, skipping quantization")
        return 0


# ============================================================
# Step 5: 保存vocab.json (网站格式)
# ============================================================

def save_vocab_json(vocab, out_path):
    """保存为网站兼容的vocab.json格式"""
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(vocab, f, ensure_ascii=False, indent=2)
    print(f"Vocab saved: {out_path} ({len(vocab)} tokens)")


# ============================================================
# Step 6: 测试推理
# ============================================================

def test_inference(model, vocab, cfg):
    """测试模型推理"""
    model.eval()
    inv_vocab = {v: k for k, v in vocab.items()}
    start_id = vocab.get('<START>', 1)
    end_id = vocab.get('<END>', 2)
    pad_id = vocab.get('<PAD>', 0)
    unk_id = vocab.get('<UNK>', 3)

    def chat(user_input, max_new=60, temperature=0.7):
        inp_ids = [vocab.get(ch, unk_id) for ch in user_input]
        prompt = torch.tensor([[start_id] + inp_ids], dtype=torch.long)

        with torch.no_grad():
            for _ in range(max_new):
                # pad to max_seq_len
                padded = torch.zeros(1, cfg['max_seq_len'], dtype=torch.long)
                padded[0, :prompt.size(1)] = prompt

                logits = model(padded)
                last_logits = logits[0, prompt.size(1) - 1, :] / temperature

                probs = torch.softmax(last_logits, dim=-1)
                next_id = torch.multinomial(probs, 1).item()

                if next_id in (end_id, pad_id):
                    break

                prompt = torch.cat([prompt, torch.tensor([[next_id]])], dim=1)
                if prompt.size(1) >= cfg['max_seq_len']:
                    break

        out_ids = prompt[0].tolist()[len(inp_ids) + 1:]  # skip start + input
        return ''.join(inv_vocab.get(i, '') for i in out_ids if i not in (end_id, pad_id, start_id))

    tests = ['你好', '今天天气怎么样', '好难过', '怎么学编程', '谢谢', '讲个笑话', '你是谁']
    print("\n--- Inference Test ---")
    for q in tests:
        a = chat(q)
        print(f"Q: {q}\nA: {a}\n")


# ============================================================
# Main
# ============================================================

if __name__ == '__main__':
    base = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base, 'data')
    out_dir = os.path.join(base, 'checkpoints')
    ai_data_dir = os.path.join(base, '..', 'public', 'ai_data')

    # Step 1: 构建词表
    print("=" * 50)
    print("Step 1: Building character vocab...")
    vocab = build_char_vocab([
        os.path.join(data_dir, 'chat_data.jsonl'),
    ], max_vocab=3000)

    # Step 2 & 3: 训练
    print("=" * 50)
    print("Step 2: Training model...")
    model, cfg = train_model(vocab, data_dir, out_dir, epochs=5, bs=8)

    # Step 4: 导出ONNX
    print("=" * 50)
    print("Step 3: Exporting ONNX...")
    onnx_path = os.path.join(out_dir, 'model.onnx')
    q_onnx_path = os.path.join(out_dir, 'model_quantized.onnx')
    export_onnx(model, cfg, vocab, onnx_path)
    quantize_onnx(onnx_path, q_onnx_path)

    # Step 5: 保存vocab
    print("=" * 50)
    print("Step 4: Saving vocab.json...")
    os.makedirs(ai_data_dir, exist_ok=True)
    save_vocab_json(vocab, os.path.join(ai_data_dir, 'vocab.json'))

    # 复制ONNX到public目录
    import shutil
    final_onnx = os.path.join(ai_data_dir, 'model_quantized.onnx')
    if os.path.exists(q_onnx_path):
        shutil.copy2(q_onnx_path, final_onnx)
    else:
        shutil.copy2(onnx_path, final_onnx)
    print(f"Model deployed to: {final_onnx}")

    # Step 6: 测试
    print("=" * 50)
    print("Step 5: Testing...")
    test_inference(model, vocab, cfg)

    print("\n" + "=" * 50)
    print("✅ 全部完成！")
    print(f"   Vocab: {ai_data_dir}/vocab.json")
    print(f"   Model: {ai_data_dir}/model_quantized.onnx")
    print("=" * 50)
