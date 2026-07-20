import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import Dataset, DataLoader
import json
import math
import os
from pathlib import Path

from model import TinyRomanticLM


class RomanticDataset(Dataset):
    def __init__(self, data_path, vocab_path, max_seq_len=128):
        self.max_seq_len = max_seq_len
        
        with open(vocab_path, 'r', encoding='utf-8') as f:
            self.vocab = json.load(f)
        
        self.idx_to_char = [''] * len(self.vocab)
        for char, idx in self.vocab.items():
            self.idx_to_char[idx] = char
        
        self.pad_idx = self.vocab['<PAD>']
        self.start_idx = self.vocab['<START>']
        self.end_idx = self.vocab['<END>']
        self.unk_idx = self.vocab['<UNK>']
        
        self.data = []
        with open(data_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        item = json.loads(line)
                        self.data.append((item['user'], item['assistant']))
                    except:
                        pass
    
    def char_to_idx(self, char):
        return self.vocab.get(char, self.unk_idx)
    
    def encode(self, text):
        result = [self.start_idx]
        for char in text[:self.max_seq_len - 2]:
            result.append(self.char_to_idx(char))
        result.append(self.end_idx)
        return result
    
    def __len__(self):
        return len(self.data)
    
    def __getitem__(self, idx):
        user, assistant = self.data[idx]
        
        user_ids = self.encode(user)
        assistant_ids = self.encode(assistant)
        
        user_ids = user_ids + [self.pad_idx] * (self.max_seq_len - len(user_ids))
        assistant_ids = assistant_ids + [self.pad_idx] * (self.max_seq_len - len(assistant_ids))
        
        return torch.tensor(user_ids, dtype=torch.long), torch.tensor(assistant_ids, dtype=torch.long)


def compute_param_count(model):
    return sum(p.numel() for p in model.parameters())


def train_model(model, train_loader, epochs=50, lr=5e-4, device='cuda'):
    model.train()
    
    criterion = nn.CrossEntropyLoss(ignore_index=0)
    optimizer = optim.AdamW(model.parameters(), lr=lr, weight_decay=1e-4)
    scheduler = optim.lr_scheduler.CosineAnnealingLR(optimizer, epochs)
    
    print(f'\n=== Training Start ===')
    print(f'Parameters: {compute_param_count(model):,}')
    print(f'Epochs: {epochs}, LR: {lr}')
    print(f'Device: {device}')
    print(f'Batch size: {train_loader.batch_size}')
    print(f'Total batches: {len(train_loader)}')
    print('=' * 60)
    
    best_loss = float('inf')
    
    for epoch in range(epochs):
        total_loss = 0
        count = 0
        
        for batch_idx, (user_ids, assistant_ids) in enumerate(train_loader):
            user_ids = user_ids.to(device)
            assistant_ids = assistant_ids.to(device)
            
            optimizer.zero_grad()
            
            logits = model(user_ids)
            
            shift_logits = logits[:, :-1, :].contiguous()
            shift_labels = assistant_ids[:, 1:].contiguous()
            
            loss = criterion(shift_logits.view(-1, shift_logits.size(-1)), shift_labels.view(-1))
            
            loss.backward()
            
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            
            optimizer.step()
            
            total_loss += loss.item()
            count += 1
            
            if (batch_idx + 1) % 50 == 0:
                avg_loss = total_loss / count
                progress = (batch_idx + 1) / len(train_loader) * 100
                bar = '=' * int(progress // 5) + ' ' * int((100 - progress) // 5)
                print(f'Epoch [{epoch+1}/{epochs}] [{bar}] {progress:.1f}% - Loss: {avg_loss:.4f}', end='\r')
        
        avg_loss = total_loss / count
        scheduler.step()
        
        print(f'\nEpoch {epoch+1}/{epochs} - Average Loss: {avg_loss:.4f}')
        
        if avg_loss < best_loss:
            best_loss = avg_loss
            torch.save(model.state_dict(), 'model_best.pt')
            print(f'New best model saved!')
        
        if avg_loss < 0.8:
            print(f'Early stopping: loss reached target')
            break
    
    return model


def generate_text(model, prompt, vocab, idx_to_char, max_len=50, temperature=0.7, 
                  repetition_penalty=1.3, no_repeat_ngram_size=2, top_k=40, top_p=0.85, device='cuda'):
    model.eval()
    
    start_idx = vocab['<START>']
    end_idx = vocab['<END>']
    pad_idx = vocab['<PAD>']
    unk_idx = vocab['<UNK>']
    
    def char_to_idx(char):
        return vocab.get(char, unk_idx)
    
    input_ids = [start_idx] + [char_to_idx(c) for c in prompt][:60]
    input_ids = torch.tensor(input_ids, dtype=torch.long).unsqueeze(0).to(device)
    
    result = []
    
    with torch.no_grad():
        for _ in range(max_len):
            logits = model(input_ids)
            next_token_logits = logits[0, -1, :]
            
            if repetition_penalty != 1.0:
                for token_id in set(input_ids[0].tolist()):
                    if next_token_logits[token_id] < 0:
                        next_token_logits[token_id] *= repetition_penalty
                    else:
                        next_token_logits[token_id] /= repetition_penalty
            
            if no_repeat_ngram_size > 0:
                gen_len = len(result)
                for i in range(gen_len - no_repeat_ngram_size + 1):
                    ngram = tuple(result[i:i+no_repeat_ngram_size])
                    for j in range(no_repeat_ngram_size):
                        if gen_len >= i + j + 1:
                            banned_idx = char_to_idx(result[i + j])
                            next_token_logits[banned_idx] = -float('inf')
            
            if temperature > 0:
                next_token_logits = next_token_logits / temperature
            
            if top_k > 0:
                top_k_values, top_k_indices = torch.topk(next_token_logits, min(top_k, next_token_logits.size(-1)))
                mask = torch.full_like(next_token_logits, -float('inf'))
                mask[top_k_indices] = top_k_values
                next_token_logits = mask
            
            if top_p > 0 and top_p < 1:
                sorted_logits, sorted_indices = torch.sort(next_token_logits, descending=True)
                cumulative_probs = torch.cumsum(torch.softmax(sorted_logits, dim=-1), dim=-1)
                sorted_indices_to_remove = cumulative_probs > top_p
                sorted_indices_to_remove[..., 1:] = sorted_indices_to_remove[..., :-1].clone()
                sorted_indices_to_remove[..., 0] = 0
                indices_to_remove = sorted_indices[sorted_indices_to_remove]
                next_token_logits[indices_to_remove] = -float('inf')
            
            probs = torch.softmax(next_token_logits, dim=-1)
            next_token = torch.multinomial(probs, num_samples=1).item()
            
            if next_token == end_idx or next_token == pad_idx:
                break
            
            result.append(idx_to_char[next_token])
            input_ids = torch.cat([input_ids, torch.tensor([[next_token]], dtype=torch.long).to(device)], dim=1)
    
    return ''.join(result)


def export_onnx(model, vocab_size=3000, d_model=128, max_seq_len=128, device='cuda'):
    try:
        model.eval()
        
        dummy_input = torch.randint(0, vocab_size, (1, max_seq_len), dtype=torch.long).to(device)
        
        onnx_path = 'model.onnx'
        torch.onnx.export(
            model,
            dummy_input,
            onnx_path,
            export_params=True,
            opset_version=13,
            do_constant_folding=True,
            input_names=['input_ids'],
            output_names=['logits'],
            dynamic_axes={
                'input_ids': {0: 'batch_size', 1: 'seq_len'},
                'logits': {0: 'batch_size', 1: 'seq_len'}
            }
        )
        
        print(f'\nONNX model exported to {onnx_path}')
        
        return onnx_path
    except ImportError as e:
        print(f'\nONNX export skipped: {e}')
        return None
    except Exception as e:
        print(f'\nONNX export failed: {e}')
        return None


def quantize_onnx(onnx_path):
    try:
        import onnxruntime.quantization as quantization
        
        quantized_path = 'model_quantized.onnx'
        
        quantization.quantize_dynamic(
            onnx_path,
            quantized_path,
            weight_type=quantization.QuantType.QUInt8
        )
        
        print(f'Quantized model saved to {quantized_path}')
        
        return quantized_path
    except ImportError:
        print('onnxruntime not installed, skipping quantization')
        return None


def main():
    base_dir = Path(__file__).parent.parent
    data_dir = base_dir / 'public' / 'ai_data'
    
    data_path = data_dir / 'romantic_train.jsonl'
    vocab_path = data_dir / 'vocab.json'
    
    if not data_path.exists() or not vocab_path.exists():
        print('Data files not found! Please run generate_data.py first.')
        return
    
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'Using device: {device}')
    
    dataset = RomanticDataset(str(data_path), str(vocab_path), max_seq_len=128)
    print(f'Dataset size: {len(dataset)}')
    print(f'Vocabulary size: {len(dataset.vocab)}')
    
    train_loader = DataLoader(dataset, batch_size=64, shuffle=True, num_workers=0)
    
    model = TinyRomanticLM(
        vocab_size=len(dataset.vocab),
        d_model=128,
        nhead=4,
        num_layers=4,
        dim_feedforward=512,
        max_seq_len=128
    ).to(device)
    
    print(f'\nModel initialized:')
    print(f'  vocab_size: {len(dataset.vocab)}')
    print(f'  d_model: {model.d_model}')
    print(f'  nhead: 4')
    print(f'  num_layers: 4')
    print(f'  Total params: {compute_param_count(model):,}')
    
    model = train_model(model, train_loader, epochs=6, lr=5e-4, device=device)
    
    model.load_state_dict(torch.load('model_best.pt'))
    model = model.to(device)
    
    print('\n=== Test Generation ===')
    test_prompts = [
        '今天好累啊',
        '想你了',
        '今天心情很好',
        '没人理解我',
        '你在干嘛',
        '晚安',
        '抱抱'
    ]
    
    for prompt in test_prompts:
        response = generate_text(model, prompt, dataset.vocab, dataset.idx_to_char, max_len=50, temperature=0.7, device=device)
        print(f'User: {prompt}')
        print(f'Bot: {response}')
        print()
    
    export_onnx(model, vocab_size=len(dataset.vocab), d_model=128, max_seq_len=128, device=device)
    
    quantize_onnx('model.onnx')
    
    print('\n=== Training Pipeline Complete ===')
    print('Files generated:')
    print('  - model_best.pt (PyTorch weights)')
    print('  - model.onnx (ONNX model)')
    print('  - model_quantized.onnx (INT8 quantized)')


if __name__ == '__main__':
    main()