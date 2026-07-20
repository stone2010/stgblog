import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import os
import json
from tqdm import tqdm
from model_v2 import RomanticLM, compute_param_count

class PretrainDataset(Dataset):
    def __init__(self, file_path, tokenizer, max_seq_len=256):
        self.tokenizer = tokenizer
        self.max_seq_len = max_seq_len
        self.sentences = []
        
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    self.sentences.append(line)
    
    def __len__(self):
        return len(self.sentences)
    
    def __getitem__(self, idx):
        sentence = self.sentences[idx]
        encoding = self.tokenizer.encode(sentence)
        ids = encoding.ids[:self.max_seq_len - 2]
        ids = [self.tokenizer.token_to_id("[START]")] + ids + [self.tokenizer.token_to_id("[END]")]
        
        padding_len = self.max_seq_len - len(ids)
        ids += [self.tokenizer.token_to_id("[PAD]")] * padding_len
        
        return torch.tensor(ids, dtype=torch.long)

def pretrain(model, train_loader, epochs=3, lr=3e-4, device='cuda'):
    model.to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=lr)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=epochs * len(train_loader))
    criterion = nn.CrossEntropyLoss(ignore_index=train_loader.dataset.tokenizer.token_to_id("[PAD]"))
    
    best_loss = float('inf')
    
    for epoch in range(epochs):
        model.train()
        total_loss = 0
        progress_bar = tqdm(train_loader, desc=f'Epoch {epoch+1}/{epochs}')
        
        for batch in progress_bar:
            batch = batch.to(device)
            
            optimizer.zero_grad()
            
            logits = model(batch)
            
            shift_logits = logits[:, :-1, :].contiguous()
            shift_labels = batch[:, 1:].contiguous()
            
            loss = criterion(shift_logits.view(-1, shift_logits.size(-1)), shift_labels.view(-1))
            
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            
            total_loss += loss.item()
            progress_bar.set_postfix({'Loss': f'{total_loss / (progress_bar.n + 1):.4f}'})
        
        avg_loss = total_loss / len(train_loader)
        print(f'Epoch {epoch+1}/{epochs} - Average Loss: {avg_loss:.4f}')
        
        if avg_loss < best_loss:
            best_loss = avg_loss
            torch.save(model.state_dict(), 'model_pretrain.pt')
            print('New best pretrained model saved!')
    
    return model

if __name__ == "__main__":
    from tokenizers import Tokenizer
    
    tokenizer = Tokenizer.from_file("tokenizer.json")
    
    model = RomanticLM(vocab_size=8000, d_model=384, nhead=6, num_layers=6, 
                      dim_feedforward=1536, max_seq_len=256)
    print(f'Model parameters: {compute_param_count(model):,}')
    
    dataset = PretrainDataset('../public/ai_data/news_corpus.txt', tokenizer)
    train_loader = DataLoader(dataset, batch_size=32, shuffle=True, num_workers=4)
    
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'Using device: {device}')
    
    model = pretrain(model, train_loader, epochs=3, lr=3e-4, device=device)