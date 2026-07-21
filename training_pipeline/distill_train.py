"""
知识蒸馏训练脚本

训练策略:
1. Stage 1: 预训练 - 在大规模文本上训练语言建模能力
2. Stage 2: 监督微调 (SFT) - 在聊天数据上微调
3. Stage 3: 知识蒸馏 - 从大模型蒸馏知识到小模型

支持:
- 标准交叉熵训练
- 知识蒸馏 (KL散度 + 交叉熵混合损失)
- 梯度累积
- 学习率调度
- 混合精度训练
- 模型checkpoint保存
"""

import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader
import os
import json
import math
import time
from pathlib import Path
from typing import Optional

from model_v3 import STG50MChat, get_model_config, SPECIAL_TOKENS


# ============================================================
# Dataset
# ============================================================

class ChatDataset(Dataset):
    """
    聊天数据集
    格式: [BOS] user_input [SEP] assistant_output [EOS]
    """

    def __init__(self, file_path: str, max_seq_len: int = 512, tokenizer=None):
        self.max_seq_len = max_seq_len
        self.tokenizer = tokenizer
        self.data = []

        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        item = json.loads(line)
                        if item.get("input") and item.get("output"):
                            self.data.append(item)
                    except json.JSONDecodeError:
                        continue

        print(f"Loaded {len(self.data)} samples from {file_path}")

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]
        user_input = item["input"]
        assistant_output = item["output"]

        # 构建输入序列: [CLS] input [SEP] output [END]
        cls_id = SPECIAL_TOKENS["[CLS]"]
        sep_id = SPECIAL_TOKENS["[SEP]"]
        end_id = SPECIAL_TOKENS["[END]"]
        pad_id = SPECIAL_TOKENS["[PAD]"]

        # Tokenize
        input_ids = self.tokenizer.encode(user_input).ids
        output_ids = self.tokenizer.encode(assistant_output).ids

        # 组装: [CLS] + input + [SEP] + output + [END]
        full_ids = [cls_id] + input_ids + [sep_id] + output_ids + [end_id]

        # 截断
        if len(full_ids) > self.max_seq_len:
            # 保留 [CLS] + input部分 + [SEP] + output的最后部分
            input_part = [cls_id] + input_ids[: self.max_seq_len // 2] + [sep_id]
            remaining = self.max_seq_len - len(input_part) - 1  # -1 for [END]
            output_part = output_ids[-remaining:] if remaining > 0 else []
            full_ids = input_part + output_part + [end_id]

        # Padding
        padding_len = self.max_seq_len - len(full_ids)
        full_ids += [pad_id] * padding_len

        # 构建 labels: 只计算 output 部分的 loss
        # 找到 [SEP] 的位置
        sep_pos = -1
        for i, tid in enumerate(full_ids):
            if tid == sep_id:
                sep_pos = i
                break

        labels = [-100] * self.max_seq_len  # -100 = ignore in CrossEntropyLoss
        if sep_pos >= 0:
            # 从 [SEP] 之后开始计算 loss
            for i in range(sep_pos + 1, self.max_seq_len):
                if full_ids[i] != pad_id:
                    labels[i] = full_ids[i]

        return {
            "input_ids": torch.tensor(full_ids, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
        }


class DistillationDataset(Dataset):
    """
    知识蒸馏数据集
    除了 input/output，还包含 teacher_logits
    """

    def __init__(self, file_path: str, max_seq_len: int = 512, tokenizer=None):
        self.max_seq_len = max_seq_len
        self.tokenizer = tokenizer
        self.data = []

        with open(file_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        item = json.loads(line)
                        if item.get("input") and item.get("output"):
                            self.data.append(item)
                    except json.JSONDecodeError:
                        continue

        print(f"Loaded {len(self.data)} distillation samples from {file_path}")

    def __len__(self):
        return len(self.data)

    def __getitem__(self, idx):
        item = self.data[idx]
        user_input = item["input"]
        assistant_output = item["output"]

        cls_id = SPECIAL_TOKENS["[CLS]"]
        sep_id = SPECIAL_TOKENS["[SEP]"]
        end_id = SPECIAL_TOKENS["[END]"]
        pad_id = SPECIAL_TOKENS["[PAD]"]

        input_ids = self.tokenizer.encode(user_input).ids
        output_ids = self.tokenizer.encode(assistant_output).ids

        full_ids = [cls_id] + input_ids + [sep_id] + output_ids + [end_id]

        if len(full_ids) > self.max_seq_len:
            input_part = [cls_id] + input_ids[: self.max_seq_len // 2] + [sep_id]
            remaining = self.max_seq_len - len(input_part) - 1
            output_part = output_ids[-remaining:] if remaining > 0 else []
            full_ids = input_part + output_part + [end_id]

        padding_len = self.max_seq_len - len(full_ids)
        full_ids += [pad_id] * padding_len

        sep_pos = -1
        for i, tid in enumerate(full_ids):
            if tid == sep_id:
                sep_pos = i
                break

        labels = [-100] * self.max_seq_len
        if sep_pos >= 0:
            for i in range(sep_pos + 1, self.max_seq_len):
                if full_ids[i] != pad_id:
                    labels[i] = full_ids[i]

        return {
            "input_ids": torch.tensor(full_ids, dtype=torch.long),
            "labels": torch.tensor(labels, dtype=torch.long),
        }


# ============================================================
# Tokenizer wrapper
# ============================================================

def load_tokenizer(tokenizer_path: str):
    """加载 tokenizer"""
    from tokenizers import Tokenizer

    tokenizer = Tokenizer.from_file(tokenizer_path)
    return tokenizer


def build_tokenizer_from_data(data_path: str, vocab_size: int = 16000, output_path: str = "tokenizer.json"):
    """从数据构建 tokenizer"""
    from tokenizers import Tokenizer, models, trainers, pre_tokenizers

    tokenizer = Tokenizer(models.BPE(unk_token="[UNK]"))
    tokenizer.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)

    trainer = trainers.BpeTrainer(
        vocab_size=vocab_size,
        special_tokens=["[PAD]", "[UNK]", "[CLS]", "[SEP]", "[END]", "[BOS]", "[EOS]"],
        min_frequency=2,
    )

    # 从 JSONL 文件中读取文本
    def read_texts():
        with open(data_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        item = json.loads(line)
                        if item.get("input"):
                            yield item["input"]
                        if item.get("output"):
                            yield item["output"]
                    except json.JSONDecodeError:
                        continue

    tokenizer.train_from_iterator(read_texts(), trainer=trainer)
    tokenizer.save(output_path)
    print(f"Tokenizer saved to {output_path}, vocab_size={tokenizer.get_vocab_size()}")
    return tokenizer


# ============================================================
# Training functions
# ============================================================

class DistillationLoss(nn.Module):
    """
    知识蒸馏损失函数
    Loss = α * KL(student || teacher) + (1-α) * CE(student, labels)
    """

    def __init__(self, temperature: float = 2.0, alpha: float = 0.5):
        super().__init__()
        self.temperature = temperature
        self.alpha = alpha
        self.ce_loss = nn.CrossEntropyLoss(ignore_index=-100)

    def forward(self, student_logits, teacher_logits, labels):
        """
        Args:
            student_logits: (batch, seq, vocab) 学生模型输出
            teacher_logits: (batch, seq, vocab) 教师模型输出
            labels: (batch, seq) 标签 (-100 表示忽略)
        """
        # 标准交叉熵损失
        shift_student = student_logits[:, :-1, :].contiguous()
        shift_labels = labels[:, 1:].contiguous()
        ce_loss = self.ce_loss(
            shift_student.view(-1, shift_student.size(-1)),
            shift_labels.view(-1),
        )

        if teacher_logits is not None:
            # KL散度蒸馏损失
            shift_teacher = teacher_logits[:, :-1, :].contiguous()

            # 只在有效位置计算蒸馏损失
            mask = shift_labels != -100
            if mask.any():
                student_flat = shift_student[mask].view(-1, shift_student.size(-1))
                teacher_flat = shift_teacher[mask].view(-1, shift_teacher.size(-1))

                student_log_probs = F.log_softmax(
                    student_flat / self.temperature, dim=-1
                )
                teacher_probs = F.softmax(
                    teacher_flat / self.temperature, dim=-1
                )

                kl_loss = F.kl_div(
                    student_log_probs, teacher_probs, reduction="batchmean"
                ) * (self.temperature ** 2)
            else:
                kl_loss = torch.tensor(0.0, device=student_logits.device)

            total_loss = self.alpha * kl_loss + (1 - self.alpha) * ce_loss
            return total_loss, ce_loss, kl_loss
        else:
            return ce_loss, ce_loss, torch.tensor(0.0, device=student_logits.device)


def train_epoch(
    model: nn.Module,
    dataloader: DataLoader,
    optimizer: torch.optim.Optimizer,
    scheduler,
    criterion: DistillationLoss,
    device: str,
    epoch: int,
    gradient_accumulation_steps: int = 1,
    max_grad_norm: float = 1.0,
    teacher_model: Optional[nn.Module] = None,
    log_interval: int = 50,
):
    """训练一个epoch"""
    model.train()
    if teacher_model:
        teacher_model.eval()

    total_loss = 0
    total_ce = 0
    total_kl = 0
    num_batches = 0
    start_time = time.time()

    optimizer.zero_grad()

    for step, batch in enumerate(dataloader):
        input_ids = batch["input_ids"].to(device)
        labels = batch["labels"].to(device)

        # Student forward
        student_logits = model(input_ids)

        # Teacher forward (if distillation)
        teacher_logits = None
        if teacher_model is not None:
            with torch.no_grad():
                teacher_logits = teacher_model(input_ids)

        # Loss
        loss, ce_loss, kl_loss = criterion(student_logits, teacher_logits, labels)
        loss = loss / gradient_accumulation_steps

        loss.backward()

        if (step + 1) % gradient_accumulation_steps == 0:
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad_norm)
            optimizer.step()
            if scheduler:
                scheduler.step()
            optimizer.zero_grad()

        total_loss += loss.item() * gradient_accumulation_steps
        total_ce += ce_loss.item()
        total_kl += kl_loss.item()
        num_batches += 1

        if (step + 1) % log_interval == 0:
            elapsed = time.time() - start_time
            avg_loss = total_loss / num_batches
            avg_ce = total_ce / num_batches
            avg_kl = total_kl / num_batches
            lr = optimizer.param_groups[0]["lr"]
            print(
                f"  Epoch {epoch} | Step {step+1}/{len(dataloader)} | "
                f"Loss: {avg_loss:.4f} | CE: {avg_ce:.4f} | KL: {avg_kl:.4f} | "
                f"LR: {lr:.2e} | Time: {elapsed:.1f}s"
            )

    avg_loss = total_loss / max(num_batches, 1)
    avg_ce = total_ce / max(num_batches, 1)
    avg_kl = total_kl / max(num_batches, 1)
    return avg_loss, avg_ce, avg_kl


@torch.no_grad()
def evaluate(
    model: nn.Module,
    dataloader: DataLoader,
    criterion: DistillationLoss,
    device: str,
    teacher_model: Optional[nn.Module] = None,
):
    """评估"""
    model.eval()
    if teacher_model:
        teacher_model.eval()

    total_loss = 0
    num_batches = 0

    for batch in dataloader:
        input_ids = batch["input_ids"].to(device)
        labels = batch["labels"].to(device)

        student_logits = model(input_ids)
        teacher_logits = None
        if teacher_model:
            teacher_logits = teacher_model(input_ids)

        loss, _, _ = criterion(student_logits, teacher_logits, labels)
        total_loss += loss.item()
        num_batches += 1

    return total_loss / max(num_batches, 1)


# ============================================================
# Main training loop
# ============================================================

def train(
    # 数据
    train_data_path: str,
    val_data_path: str,
    tokenizer_path: str,
    # 模型
    model_config: dict = None,
    pretrained_path: str = None,
    # 训练参数
    epochs: int = 3,
    batch_size: int = 32,
    learning_rate: float = 3e-4,
    weight_decay: float = 0.01,
    warmup_steps: int = 500,
    gradient_accumulation_steps: int = 1,
    max_grad_norm: float = 1.0,
    # 蒸馏参数
    teacher_model_path: str = None,
    distill_alpha: float = 0.5,
    distill_temperature: float = 2.0,
    # 其他
    output_dir: str = "./checkpoints",
    max_seq_len: int = 512,
    device: str = None,
    fp16: bool = False,
    log_interval: int = 50,
):
    """完整训练流程"""

    # Device
    if device is None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Using device: {device}")

    # 输出目录
    os.makedirs(output_dir, exist_ok=True)

    # 加载 tokenizer
    print("Loading tokenizer...")
    tokenizer = load_tokenizer(tokenizer_path)

    # 创建数据集
    print("Creating datasets...")
    train_dataset = ChatDataset(train_data_path, max_seq_len, tokenizer)
    val_dataset = ChatDataset(val_data_path, max_seq_len, tokenizer)

    train_loader = DataLoader(
        train_dataset,
        batch_size=batch_size,
        shuffle=True,
        num_workers=4,
        pin_memory=True,
        drop_last=True,
    )
    val_loader = DataLoader(
        val_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=2,
        pin_memory=True,
    )

    # 创建模型
    print("Creating model...")
    if model_config is None:
        model_config = get_model_config()
    model = STG50MChat(**model_config)

    if pretrained_path and os.path.exists(pretrained_path):
        model.load_state_dict(torch.load(pretrained_path, map_location="cpu", weights_only=True))
        print(f"Loaded pretrained model from {pretrained_path}")

    model.to(device)
    from model_v3 import compute_param_count
    print(f"Model parameters: {compute_param_count(model):,}")

    # 教师模型 (可选)
    teacher_model = None
    if teacher_model_path and os.path.exists(teacher_model_path):
        print(f"Loading teacher model from {teacher_model_path}...")
        teacher_cfg = model_config.copy()
        teacher_cfg["num_layers"] = 12
        teacher_cfg["d_model"] = 768
        teacher_cfg["nhead"] = 12
        teacher_cfg["dim_feedforward"] = 3072
        teacher_model = STG50MChat(**teacher_cfg)
        teacher_model.load_state_dict(
            torch.load(teacher_model_path, map_location="cpu", weights_only=True)
        )
        teacher_model.to(device)
        teacher_model.eval()
        print(f"Teacher model loaded: {compute_param_count(teacher_model):,} params")

    # 损失函数
    criterion = DistillationLoss(
        temperature=distill_temperature,
        alpha=distill_alpha if teacher_model else 0.0,
    )

    # 优化器
    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=learning_rate,
        weight_decay=weight_decay,
        betas=(0.9, 0.95),
    )

    # 学习率调度 (cosine with warmup)
    total_steps = len(train_loader) * epochs // gradient_accumulation_steps

    def lr_lambda(current_step):
        if current_step < warmup_steps:
            return current_step / max(1, warmup_steps)
        progress = (current_step - warmup_steps) / max(1, total_steps - warmup_steps)
        return max(0.0, 0.5 * (1.0 + math.cos(math.pi * progress)))

    scheduler = torch.optim.lr_scheduler.LambdaLR(optimizer, lr_lambda)

    # Mixed precision
    scaler = torch.amp.GradScaler("cuda") if fp16 and device == "cuda" else None

    # 训练循环
    best_val_loss = float("inf")
    training_log = []

    print("=" * 60)
    print(f"Starting training for {epochs} epochs")
    print(f"  Train samples: {len(train_dataset)}")
    print(f"  Val samples: {len(val_dataset)}")
    print(f"  Batch size: {batch_size}")
    print(f"  Gradient accumulation: {gradient_accumulation_steps}")
    print(f"  Effective batch size: {batch_size * gradient_accumulation_steps}")
    print(f"  Total steps: {total_steps}")
    print(f"  Learning rate: {learning_rate}")
    print(f"  Distillation: {'Yes' if teacher_model else 'No'}")
    print("=" * 60)

    for epoch in range(1, epochs + 1):
        print(f"\n{'='*60}")
        print(f"Epoch {epoch}/{epochs}")
        print(f"{'='*60}")

        # Train
        train_loss, train_ce, train_kl = train_epoch(
            model=model,
            dataloader=train_loader,
            optimizer=optimizer,
            scheduler=scheduler,
            criterion=criterion,
            device=device,
            epoch=epoch,
            gradient_accumulation_steps=gradient_accumulation_steps,
            max_grad_norm=max_grad_norm,
            teacher_model=teacher_model,
            log_interval=log_interval,
        )

        # Validate
        val_loss = evaluate(model, val_loader, criterion, device, teacher_model)

        print(f"\nEpoch {epoch} Summary:")
        print(f"  Train Loss: {train_loss:.4f} (CE: {train_ce:.4f}, KL: {train_kl:.4f})")
        print(f"  Val Loss:   {val_loss:.4f}")

        # Save checkpoint
        checkpoint = {
            "epoch": epoch,
            "model_state_dict": model.state_dict(),
            "optimizer_state_dict": optimizer.state_dict(),
            "scheduler_state_dict": scheduler.state_dict(),
            "train_loss": train_loss,
            "val_loss": val_loss,
            "config": model_config,
        }

        # Save latest
        torch.save(checkpoint, os.path.join(output_dir, "checkpoint_latest.pt"))

        # Save best
        if val_loss < best_val_loss:
            best_val_loss = val_loss
            torch.save(model.state_dict(), os.path.join(output_dir, "model_best.pt"))
            print(f"  ✅ New best model saved! Val loss: {val_loss:.4f}")

        # Save epoch checkpoint
        torch.save(model.state_dict(), os.path.join(output_dir, f"model_epoch{epoch}.pt"))

        training_log.append({
            "epoch": epoch,
            "train_loss": train_loss,
            "train_ce": train_ce,
            "train_kl": train_kl,
            "val_loss": val_loss,
            "lr": optimizer.param_groups[0]["lr"],
        })

        # Save training log
        with open(os.path.join(output_dir, "training_log.json"), "w") as f:
            json.dump(training_log, f, indent=2)

    print(f"\n{'='*60}")
    print(f"Training complete!")
    print(f"  Best val loss: {best_val_loss:.4f}")
    print(f"  Best model: {os.path.join(output_dir, 'model_best.pt')}")
    print(f"{'='*60}")

    return model, training_log


# ============================================================
# CLI
# ============================================================

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="STG-50M-Chat 训练脚本")
    parser.add_argument("--train_data", type=str, required=True, help="训练数据路径")
    parser.add_argument("--val_data", type=str, required=True, help="验证数据路径")
    parser.add_argument("--tokenizer", type=str, required=True, help="Tokenizer路径")
    parser.add_argument("--pretrained", type=str, default=None, help="预训练模型路径")
    parser.add_argument("--teacher", type=str, default=None, help="教师模型路径")
    parser.add_argument("--output_dir", type=str, default="./checkpoints", help="输出目录")
    parser.add_argument("--epochs", type=int, default=3, help="训练轮数")
    parser.add_argument("--batch_size", type=int, default=32, help="批次大小")
    parser.add_argument("--lr", type=float, default=3e-4, help="学习率")
    parser.add_argument("--warmup_steps", type=int, default=500, help="预热步数")
    parser.add_argument("--max_seq_len", type=int, default=512, help="最大序列长度")
    parser.add_argument("--grad_accum", type=int, default=1, help="梯度累积步数")
    parser.add_argument("--distill_alpha", type=float, default=0.5, help="蒸馏权重")
    parser.add_argument("--distill_temp", type=float, default=2.0, help="蒸馏温度")
    parser.add_argument("--fp16", action="store_true", help="使用混合精度")
    parser.add_argument("--device", type=str, default=None, help="设备")
    args = parser.parse_args()

    train(
        train_data_path=args.train_data,
        val_data_path=args.val_data,
        tokenizer_path=args.tokenizer,
        pretrained_path=args.pretrained,
        teacher_model_path=args.teacher,
        output_dir=args.output_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
        warmup_steps=args.warmup_steps,
        max_seq_len=args.max_seq_len,
        gradient_accumulation_steps=args.grad_accum,
        distill_alpha=args.distill_alpha,
        distill_temperature=args.distill_temp,
        fp16=args.fp16,
        device=args.device,
    )
