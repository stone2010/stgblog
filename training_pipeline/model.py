import torch
import torch.nn as nn
import math


class TinyRomanticLM(nn.Module):
    def __init__(self, vocab_size=3000, d_model=128, nhead=4, num_layers=4, dim_feedforward=512, max_seq_len=128):
        super().__init__()
        self.d_model = d_model

        self.token_embedding = nn.Embedding(vocab_size, d_model)

        self.pos_embedding = nn.Embedding(max_seq_len, d_model)

        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=0.1,
            activation='gelu',
            batch_first=True,
            bias=False
        )
        self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)

        self.ln_f = nn.LayerNorm(d_model)

        self.output_layer = nn.Linear(d_model, vocab_size, bias=False)
        self.output_layer.weight = self.token_embedding.weight

    def forward(self, x):
        b, t = x.size()
        pos = torch.arange(0, t, dtype=torch.long, device=x.device).unsqueeze(0)

        x = self.token_embedding(x) + self.pos_embedding(pos)

        mask = torch.nn.Transformer.generate_square_subsequent_mask(t, device=x.device)

        x = self.transformer(x, mask=mask, is_causal=True)
        x = self.ln_f(x)
        logits = self.output_layer(x)
        return logits