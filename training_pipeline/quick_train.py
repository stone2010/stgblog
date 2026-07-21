"""
CPU快速训练 - 小模型验证版 (~3M参数)
完整50M模型请在GPU上训练: train.sh
"""

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import json, os, time, sys

sys.path.insert(0, os.path.dirname(__file__))
from model_v3 import STG50MChat, SPECIAL_TOKENS


# 小模型配置 (~3M参数)
SMALL_CFG = dict(
    vocab_size=300, d_model=128, nhead=4, num_layers=4,
    dim_feedforward=512, max_seq_len=128, dropout=0.1,
)


class SimpleDataset(Dataset):
    def __init__(self, path, max_len=128):
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

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]
        cls_id, sep_id, end_id, pad_id = 2, 3, 4, 0

        def encode(text):
            return [b + 10 for b in text.encode('utf-8')]

        inp = encode(item['input'])
        out = encode(item['output'])
        ids = [cls_id] + inp + [sep_id] + out + [end_id]

        if len(ids) > self.max_len:
            h = self.max_len // 2 - 2
            ids = [cls_id] + inp[:h] + [sep_id] + out[:h] + [end_id]

        ids += [pad_id] * (self.max_len - len(ids))

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
    print("=" * 50)
    print("STG-Chat 快速训练 (CPU, ~3M参数)")
    print("=" * 50)

    base = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(base, 'data')
    out_dir = os.path.join(base, 'checkpoints')
    os.makedirs(out_dir, exist_ok=True)

    train_ds = SimpleDataset(os.path.join(data_dir, 'chat_data_train.jsonl'))
    val_ds = SimpleDataset(os.path.join(data_dir, 'chat_data_val.jsonl'))
    print(f"Train: {len(train_ds)}, Val: {len(val_ds)}")

    train_loader = DataLoader(train_ds, batch_size=16, shuffle=True, num_workers=0)
    val_loader = DataLoader(val_ds, batch_size=16, shuffle=False, num_workers=0)

    model = STG50MChat(**SMALL_CFG)
    n = sum(p.numel() for p in model.parameters())
    print(f"Model params: {n:,} ({n/1e6:.1f}M)")

    optimizer = torch.optim.AdamW(model.parameters(), lr=3e-4, weight_decay=0.01)
    criterion = nn.CrossEntropyLoss(ignore_index=-100)

    best_val = float('inf')

    for epoch in range(1, 6):
        # Train
        model.train()
        total_loss, nb = 0, 0
        t0 = time.time()

        for step, (ids, labels) in enumerate(train_loader):
            optimizer.zero_grad()
            logits = model(ids)
            loss = criterion(logits[:, :-1, :].contiguous().view(-1, SMALL_CFG['vocab_size']),
                           labels[:, 1:].contiguous().view(-1))
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            total_loss += loss.item()
            nb += 1

            if (step + 1) % 20 == 0:
                print(f"  E{epoch} S{step+1}/{len(train_loader)} loss={total_loss/nb:.4f}")

        avg = total_loss / max(nb, 1)

        # Val
        model.eval()
        vl, vb = 0, 0
        with torch.no_grad():
            for ids, labels in val_loader:
                logits = model(ids)
                loss = criterion(logits[:, :-1, :].contiguous().view(-1, SMALL_CFG['vocab_size']),
                               labels[:, 1:].contiguous().view(-1))
                vl += loss.item()
                vb += 1

        avg_v = vl / max(vb, 1)
        dt = time.time() - t0
        print(f"Epoch {epoch}/5 | Train: {avg:.4f} | Val: {avg_v:.4f} | {dt:.0f}s")

        if avg_v < best_val:
            best_val = avg_v
            torch.save({'state_dict': model.state_dict(), 'config': SMALL_CFG},
                      os.path.join(out_dir, 'model_small_best.pt'))
            print(f"  ✅ Best saved!")

    torch.save({'state_dict': model.state_dict(), 'config': SMALL_CFG},
              os.path.join(out_dir, 'model_small_final.pt'))

    # 保存完整50M模型config
    from model_v3 import get_model_config
    with open(os.path.join(out_dir, 'config_50m.json'), 'w') as f:
        json.dump(get_model_config(), f, indent=2)

    print(f"\n✅ Done! Best val: {best_val:.4f}")
    print(f"   Small model: checkpoints/model_small_best.pt")
    print(f"   50M config:  checkpoints/config_50m.json")
    print(f"   完整50M训练: ./train.sh (需要GPU)")


if __name__ == '__main__':
    train()
