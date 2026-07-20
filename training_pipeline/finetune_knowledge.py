import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import os
import json
from tqdm import tqdm
from model_v2 import RomanticLM, compute_param_count

class KnowledgeDataset(Dataset):
    def __init__(self, file_path, tokenizer, max_seq_len=256):
        self.tokenizer = tokenizer
        self.max_seq_len = max_seq_len
        self.dialogs = []
        
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    self.dialogs.append(json.loads(line))
    
    def __len__(self):
        return len(self.dialogs)
    
    def __getitem__(self, idx):
        dialog = self.dialogs[idx]
        user_input = dialog['input']
        assistant_output = dialog['output']
        
        full_text = f"[KNOW] {user_input} [SEP] {assistant_output}"
        encoding = self.tokenizer.encode(full_text)
        ids = encoding.ids[:self.max_seq_len - 1]
        ids = ids + [self.tokenizer.token_to_id("[END]")]
        
        padding_len = self.max_seq_len - len(ids)
        ids += [self.tokenizer.token_to_id("[PAD]")] * padding_len
        
        return torch.tensor(ids, dtype=torch.long)

def finetune_knowledge(model, train_loader, epochs=1, lr=5e-5, device='cuda'):
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
            torch.save(model.state_dict(), 'model_knowledge.pt')
            print('New best knowledge model saved!')
    
    return model

if __name__ == "__main__":
    from tokenizers import Tokenizer
    
    tokenizer = Tokenizer.from_file("tokenizer.json")
    
    model = RomanticLM(vocab_size=8000, d_model=384, nhead=6, num_layers=6, 
                      dim_feedforward=1536, max_seq_len=256)
    
    if os.path.exists('model_emotion.pt'):
        model.load_state_dict(torch.load('model_emotion.pt', map_location='cpu', weights_only=True))
        print('Loaded emotion model')
    
    print(f'Model parameters: {compute_param_count(model):,}')
    
    dataset = KnowledgeDataset('../public/ai_data/knowledge_dialogs.jsonl', tokenizer)
    train_loader = DataLoader(dataset, batch_size=32, shuffle=True, num_workers=4)
    
    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    print(f'Using device: {device}')
    
    model = finetune_knowledge(model, train_loader, epochs=1, lr=5e-5, device=device)