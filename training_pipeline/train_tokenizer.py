import os
from tokenizers import Tokenizer, models, trainers, pre_tokenizers

def train_bpe_tokenizer(data_files, vocab_size=8000, output_dir='./'):
    os.makedirs(output_dir, exist_ok=True)
    
    tokenizer = Tokenizer(models.BPE(unk_token="[UNK]"))
    tokenizer.pre_tokenizer = pre_tokenizers.ByteLevel(add_prefix_space=False)
    
    special_tokens = [
        "[PAD]", "[UNK]", "[CLS]", "[SEP]", "[MASK]",
        "[START]", "[END]", "[KNOW]"
    ]
    
    trainer = trainers.BpeTrainer(
        vocab_size=vocab_size,
        special_tokens=special_tokens,
        min_frequency=2,
        show_progress=True
    )
    
    tokenizer.train(data_files, trainer)
    
    tokenizer_path = os.path.join(output_dir, "tokenizer.json")
    tokenizer.save(tokenizer_path)
    print(f"Tokenizer saved to {tokenizer_path}")
    
    return tokenizer

if __name__ == "__main__":
    data_files = [
        "../public/ai_data/news_corpus.txt",
        "../public/ai_data/emotion_dialogs.txt",
        "../public/ai_data/knowledge_dialogs.txt"
    ]
    
    train_bpe_tokenizer(data_files, vocab_size=8000)