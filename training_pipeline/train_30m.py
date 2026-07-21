"""
30M+ 参数模型训练脚本
CPU优化版 - 使用BPE tokenizer，完整训练流程
"""

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import json, os, time, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from model_v3 import STG50MChat, SPECIAL_TOKENS


class ChatDataset(Dataset):
    def __init__(self, path, tokenizer, max_len=256):
        self.max_len = max_len
        self.tokenizer = tokenizer
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
        cls_id = SPECIAL_TOKENS['[CLS]']
        sep_id = SPECIAL_TOKENS['[SEP]']
        end_id = SPECIAL_TOKENS['[END]']
        pad_id = SPECIAL_TOKENS['[PAD]']

        inp_ids = self.tokenizer.encode(item['input']).ids
        out_ids = self.tokenizer.encode(item['output']).ids

        ids = [cls_id] + inp_ids + [sep_id] + out_ids + [end_id]

        if len(ids) > self.max_len:
            h = self.max_len // 2 - 2
            ids = [cls_id] + inp_ids[:h] + [sep_id] + out_ids[:h] + [end_id]

        padding_len = self.max_len - len(ids)
        ids += [pad_id] * padding_len

        labels = [-100] * self.max_len
        try:
            sp = ids.index(sep_id)
            for i in range(sp + 1, self.max_len):
                if ids[i] != pad_id:
                    labels[i] = ids[i]
        except ValueError:
            pass

        return torch.tensor(ids, dtype=torch.long), torch.tensor(labels, dtype=torch.long)


def train():
    print("=" * 60)
    print("STG-30M-Chat 训练 (CPU)")
    print("=" * 60)

    base = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base, 'data')
    out_dir = os.path.join(base, 'checkpoints')
    os.makedirs(out_dir, exist_ok=True)

    # 加载tokenizer
    from tokenizers import Tokenizer
    tokenizer = Tokenizer.from_file(os.path.join(base, 'tokenizer.json'))
    vocab_size = tokenizer.get_vocab_size()
    print(f"Tokenizer vocab: {vocab_size}")

    # 模型配置: ~31M参数 (CPU优化)
    cfg = dict(
        vocab_size=vocab_size,
        d_model=544,
        nhead=8,
        num_layers=8,
        dim_feedforward=2176,
        max_seq_len=128,
        dropout=0.1,
    )

    # 数据
    print("Loading data...")
    train_ds = ChatDataset(os.path.join(data_dir, 'chat_data_train.jsonl'), tokenizer, cfg['max_seq_len'])
    val_ds = ChatDataset(os.path.join(data_dir, 'chat_data_val.jsonl'), tokenizer, cfg['max_seq_len'])

    train_loader = DataLoader(train_ds, batch_size=8, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=8, shuffle=False, num_workers=0)

    # 模型
    print("Creating model...")
    model = STG50MChat(**cfg)
    n = sum(p.numel() for p in model.parameters())
    print(f"Parameters: {n:,} ({n/1e6:.1f}M)")

    optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=0.01)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=5 * len(train_loader))
    criterion = nn.CrossEntropyLoss(ignore_index=-100)

    best_val = float('inf')
    log = []

    print(f"\nTraining: 5 epochs, bs=8, lr=3e-4, device=cpu, seq=128")
    print("-" * 60)

    for epoch in range(1, 6):
        # Train
        model.train()
        total_loss, nb = 0, 0
        t0 = time.time()

        for step, (ids, labels) in enumerate(train_loader):
            optimizer.zero_grad()
            logits = model(ids)
            loss = criterion(logits[:, :-1, :].contiguous().reshape(-1, cfg['vocab_size']),
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

        # Val
        model.eval()
        vl, vb = 0, 0
        with torch.no_grad():
            for ids, labels in val_loader:
                logits = model(ids)
                loss = criterion(logits[:, :-1, :].contiguous().reshape(-1, cfg['vocab_size']),
                               labels[:, 1:].contiguous().reshape(-1))
                vl += loss.item()
                vb += 1

        avg_v = vl / max(vb, 1)
        dt = time.time() - t0
        lr = optimizer.param_groups[0]['lr']
        print(f"Epoch {epoch}/5 | Train: {avg:.4f} | Val: {avg_v:.4f} | LR: {lr:.2e} | {dt:.0f}s")

        log.append({'epoch': epoch, 'train_loss': avg, 'val_loss': avg_v, 'lr': lr, 'time': dt})

        if avg_v < best_val:
            best_val = avg_v
            torch.save({'state_dict': model.state_dict(), 'config': cfg}, os.path.join(out_dir, 'model_30m_best.pt'))
            print(f"  ✅ Best saved! Val: {avg_v:.4f}")

    # 保存最终
    torch.save({'state_dict': model.state_dict(), 'config': cfg}, os.path.join(out_dir, 'model_30m_final.pt'))

    with open(os.path.join(out_dir, 'training_log.json'), 'w') as f:
        json.dump(log, f, indent=2)

    # 保存config
    with open(os.path.join(out_dir, 'config_30m.json'), 'w') as f:
        json.dump(cfg, f, indent=2)

    total_time = sum(l['time'] for l in log)
    print(f"\n{'='*60}")
    print(f"✅ 训练完成!")
    print(f"   最佳Val Loss: {best_val:.4f}")
    print(f"   总耗时: {total_time/60:.1f}分钟")
    print(f"   模型: checkpoints/model_30m_best.pt")
    print(f"{'='*60}")

    return model


if __name__ == '__main__':
    train()
