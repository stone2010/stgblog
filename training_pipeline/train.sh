#!/bin/bash
# ============================================================
# STG-50M-Chat 训练启动脚本
# 一键运行: 数据准备 → Tokenizer训练 → 模型训练 → 导出
# ============================================================

set -e

# 配置
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="${PROJECT_DIR}/data"
TOKENIZER_PATH="${PROJECT_DIR}/tokenizer.json"
CHECKPOINT_DIR="${PROJECT_DIR}/checkpoints"
EXPORT_DIR="${PROJECT_DIR}/export"

# 训练参数
EPOCHS=${EPOCHS:-3}
BATCH_SIZE=${BATCH_SIZE:-32}
LR=${LR:-3e-4}
MAX_SEQ_LEN=${MAX_SEQ_LEN:-512}
GRAD_ACCUM=${GRAD_ACCUM:-1}
FP16=${FP16:-""}  # 设为 --fp16 启用

# ============================================================
# 颜色输出
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
err()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ============================================================
# 检查环境
# ============================================================
check_env() {
    info "检查环境..."
    
    python3 -c "import torch" 2>/dev/null || {
        err "PyTorch 未安装，请先安装: pip install torch"
        exit 1
    }
    
    python3 -c "import tokenizers" 2>/dev/null || {
        warn "tokenizers 未安装，正在安装..."
        pip install tokenizers
    }
    
    # 检查GPU
    if python3 -c "import torch; assert torch.cuda.is_available()" 2>/dev/null; then
        GPU_NAME=$(python3 -c "import torch; print(torch.cuda.get_device_name(0))")
        GPU_MEM=$(python3 -c "import torch; print(f'{torch.cuda.get_device_properties(0).total_mem / 1e9:.1f}GB')")
        ok "GPU: ${GPU_NAME} (${GPU_MEM})"
        DEVICE="cuda"
    else
        warn "未检测到GPU，将使用CPU训练（会很慢）"
        DEVICE="cpu"
    fi
}

# ============================================================
# Step 1: 数据准备
# ============================================================
prepare_data() {
    info "Step 1: 准备训练数据..."
    
    if [ -f "${DATA_DIR}/chat_data_train.jsonl" ] && [ -f "${DATA_DIR}/chat_data_val.jsonl" ]; then
        ok "训练数据已存在，跳过数据准备"
        return
    fi
    
    # 检查是否有 datasets 库
    if python3 -c "import datasets" 2>/dev/null; then
        info "使用 HuggingFace datasets 下载公开数据..."
        python3 "${PROJECT_DIR}/prepare_data.py" \
            --output_dir "${DATA_DIR}" \
            --template_samples 5000 \
            --hf_samples 50000 \
            --max_total 80000
    else
        warn "datasets 库未安装，仅使用模板数据"
        warn "建议安装: pip install datasets"
        python3 "${PROJECT_DIR}/prepare_data.py" \
            --output_dir "${DATA_DIR}" \
            --template_samples 10000 \
            --skip_hf
    fi
    
    ok "数据准备完成"
}

# ============================================================
# Step 2: 训练 Tokenizer
# ============================================================
train_tokenizer() {
    info "Step 2: 训练 Tokenizer..."
    
    if [ -f "${TOKENIZER_PATH}" ]; then
        ok "Tokenizer 已存在，跳过"
        return
    fi
    
    python3 -c "
from distill_train import build_tokenizer_from_data
build_tokenizer_from_data(
    '${DATA_DIR}/chat_data.jsonl',
    vocab_size=16000,
    output_path='${TOKENIZER_PATH}'
)
"
    ok "Tokenizer 训练完成"
}

# ============================================================
# Step 3: 模型训练
# ============================================================
train_model() {
    info "Step 3: 开始模型训练..."
    
    FP16_FLAG=""
    if [ "${FP16}" = "--fp16" ]; then
        FP16_FLAG="--fp16"
    fi
    
    python3 "${PROJECT_DIR}/distill_train.py" \
        --train_data "${DATA_DIR}/chat_data_train.jsonl" \
        --val_data "${DATA_DIR}/chat_data_val.jsonl" \
        --tokenizer "${TOKENIZER_PATH}" \
        --output_dir "${CHECKPOINT_DIR}" \
        --epochs "${EPOCHS}" \
        --batch_size "${BATCH_SIZE}" \
        --lr "${LR}" \
        --max_seq_len "${MAX_SEQ_LEN}" \
        --grad_accum "${GRAD_ACCUM}" \
        --warmup_steps 500 \
        --device "${DEVICE}" \
        ${FP16_FLAG}
    
    ok "模型训练完成"
}

# ============================================================
# Step 4: 导出模型
# ============================================================
export_model() {
    info "Step 4: 导出模型..."
    
    mkdir -p "${EXPORT_DIR}"
    
    python3 "${PROJECT_DIR}/export_model.py" \
        --model "${CHECKPOINT_DIR}/model_best.pt" \
        --output "${EXPORT_DIR}/stg_50m_chat.onnx" \
        --format both
    
    # 复制 tokenizer
    cp "${TOKENIZER_PATH}" "${EXPORT_DIR}/"
    
    ok "模型导出完成"
    info "导出文件:"
    ls -lh "${EXPORT_DIR}/"
}

# ============================================================
# 运行测试推理
# ============================================================
test_inference() {
    info "运行测试推理..."
    
    python3 -c "
import torch
from model_v3 import STG50MChat, get_model_config, SPECIAL_TOKENS
from tokenizers import Tokenizer

# 加载模型和tokenizer
cfg = get_model_config()
model = STG50MChat(**cfg)
model.load_state_dict(torch.load('${CHECKPOINT_DIR}/model_best.pt', map_location='cpu', weights_only=True))
model.eval()

tokenizer = Tokenizer.from_file('${TOKENIZER_PATH}')

# 测试对话
test_inputs = ['你好', '今天天气怎么样', '讲个笑话', '怎么学编程']

for inp in test_inputs:
    cls_id = SPECIAL_TOKENS['[CLS]']
    sep_id = SPECIAL_TOKENS['[SEP]']
    end_id = SPECIAL_TOKENS['[END]']
    
    input_ids = tokenizer.encode(inp).ids
    prompt = [cls_id] + input_ids + [sep_id]
    prompt_tensor = torch.tensor([prompt], dtype=torch.long)
    
    with torch.no_grad():
        output_ids = model.generate(prompt_tensor, max_new_tokens=64, temperature=0.8, end_token_id=end_id)
    
    # 解码 output 部分
    output_ids = output_ids[0].tolist()
    # 找到 [SEP] 后面的内容
    try:
        sep_pos = output_ids.index(sep_id)
        response_ids = output_ids[sep_pos+1:]
        # 去掉 [END] 及之后
        if end_id in response_ids:
            response_ids = response_ids[:response_ids.index(end_id)]
        response = tokenizer.decode(response_ids)
    except:
        response = '(decode error)'
    
    print(f'  Q: {inp}')
    print(f'  A: {response}')
    print()
"
}

# ============================================================
# 主流程
# ============================================================
main() {
    echo ""
    echo "============================================================"
    echo "  STG-50M-Chat 训练流水线"
    echo "  50M参数聊天小钢炮模型"
    echo "============================================================"
    echo ""
    
    check_env
    
    echo ""
    prepare_data
    
    echo ""
    train_tokenizer
    
    echo ""
    train_model
    
    echo ""
    export_model
    
    echo ""
    test_inference
    
    echo ""
    echo "============================================================"
    echo "  ✅ 全部完成!"
    echo "  模型: ${EXPORT_DIR}/stg_50m_chat.onnx"
    echo "  Tokenizer: ${EXPORT_DIR}/tokenizer.json"
    echo "============================================================"
}

# ============================================================
# 支持单独运行某个步骤
# ============================================================
case "${1:-all}" in
    data)     check_env; prepare_data ;;
    tokenizer) check_env; train_tokenizer ;;
    train)    check_env; train_model ;;
    export)   export_model ;;
    test)     test_inference ;;
    all)      main ;;
    *)        echo "Usage: $0 {all|data|tokenizer|train|export|test}" ;;
esac
