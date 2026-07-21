"""
STG-50M-Chat: 50M参数聊天小钢炮模型
基于 RomanticLM 架构升级，适配知识蒸馏训练

架构参数:
  vocab_size=16000, d_model=640, nhead=8, num_layers=8
  dim_feedforward=2560, max_seq_len=512
  总参数: ~49.9M
"""

import torch
import torch.nn as nn
import math


class STG50MChat(nn.Module):
    """
    50M参数的因果语言模型 (Causal LM)
    基于 Transformer Encoder + causal mask，与 RomanticLM v2 架构一致
    """

    def __init__(
        self,
        vocab_size: int = 16000,
        d_model: int = 640,
        nhead: int = 8,
        num_layers: int = 8,
        dim_feedforward: int = 2560,
        max_seq_len: int = 512,
        dropout: float = 0.1,
    ):
        super().__init__()
        self.d_model = d_model
        self.vocab_size = vocab_size
        self.max_seq_len = max_seq_len

        # Token & Position embeddings
        self.token_embedding = nn.Embedding(vocab_size, d_model)
        self.pos_embedding = nn.Embedding(max_seq_len, d_model)
        self.embed_dropout = nn.Dropout(dropout)

        # Transformer layers
        encoder_layer = nn.TransformerEncoderLayer(
            d_model=d_model,
            nhead=nhead,
            dim_feedforward=dim_feedforward,
            dropout=dropout,
            activation="gelu",
            batch_first=True,
            bias=False,
            norm_first=True,  # Pre-LN for better training stability
        )
        self.transformer = nn.TransformerEncoder(
            encoder_layer, num_layers=num_layers
        )

        # Final layer norm
        self.ln_f = nn.LayerNorm(d_model)

        # Output head (weight-tied with token embedding)
        self.output_layer = nn.Linear(d_model, vocab_size, bias=False)
        self.output_layer.weight = self.token_embedding.weight

        # Initialize weights
        self.apply(self._init_weights)

    def _init_weights(self, module):
        if isinstance(module, nn.Linear):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
        elif isinstance(module, nn.Embedding):
            nn.init.normal_(module.weight, mean=0.0, std=0.02)
        elif isinstance(module, nn.LayerNorm):
            nn.init.ones_(module.weight)
            if module.bias is not None:
                nn.init.zeros_(module.bias)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        """
        Args:
            x: (batch, seq_len) token ids
        Returns:
            logits: (batch, seq_len, vocab_size)
        """
        b, t = x.size()
        assert t <= self.max_seq_len, f"Sequence length {t} > max {self.max_seq_len}"

        pos = torch.arange(0, t, dtype=torch.long, device=x.device).unsqueeze(0)
        x = self.token_embedding(x) + self.pos_embedding(pos)
        x = self.embed_dropout(x)

        mask = torch.nn.Transformer.generate_square_subsequent_mask(
            t, device=x.device
        )
        x = self.transformer(x, mask=mask, is_causal=True)
        x = self.ln_f(x)
        logits = self.output_layer(x)
        return logits

    @torch.no_grad()
    def generate(
        self,
        prompt_ids: torch.Tensor,
        max_new_tokens: int = 128,
        temperature: float = 0.8,
        top_k: int = 50,
        end_token_id: int = None,
    ) -> torch.Tensor:
        """
        简单的自回归生成
        """
        self.eval()
        for _ in range(max_new_tokens):
            # Crop to max_seq_len if needed
            idx_cond = prompt_ids[:, -self.max_seq_len:]
            logits = self(idx_cond)
            logits = logits[:, -1, :] / temperature

            # Top-k filtering
            if top_k > 0:
                v, _ = torch.topk(logits, min(top_k, logits.size(-1)))
                logits[logits < v[:, [-1]]] = -float("inf")

            probs = torch.softmax(logits, dim=-1)
            next_id = torch.multinomial(probs, num_samples=1)
            prompt_ids = torch.cat([prompt_ids, next_id], dim=1)

            if end_token_id is not None and next_id.item() == end_token_id:
                break

        return prompt_ids


def compute_param_count(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


def get_model_config() -> dict:
    """返回50M模型的标准配置"""
    return dict(
        vocab_size=16000,
        d_model=640,
        nhead=8,
        num_layers=8,
        dim_feedforward=2560,
        max_seq_len=512,
        dropout=0.1,
    )


# ============================================================
# Special token ids (与 tokenizer 对齐)
# ============================================================
SPECIAL_TOKENS = {
    "[PAD]": 0,
    "[UNK]": 1,
    "[CLS]": 2,
    "[SEP]": 3,
    "[END]": 4,
    "[BOS]": 5,
    "[EOS]": 6,
}


if __name__ == "__main__":
    cfg = get_model_config()
    model = STG50MChat(**cfg)
    total = compute_param_count(model)
    print(f"STG-50M-Chat Model")
    print(f"Config: {cfg}")
    print(f"Total parameters: {total:,} ({total / 1e6:.1f}M)")

    # Quick forward test
    dummy = torch.randint(0, cfg["vocab_size"], (2, 128))
    out = model(dummy)
    print(f"Input shape:  {dummy.shape}")
    print(f"Output shape: {out.shape}")
