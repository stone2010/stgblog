"""
ONNX导出脚本 - 导出50M模型为ONNX格式并量化
"""

import torch
import os
import argparse
from model_v3 import STG50MChat, get_model_config


def export_onnx(
    model_path: str,
    output_path: str = "stg_50m_chat.onnx",
    max_seq_len: int = 512,
    vocab_size: int = 16000,
    quantize: bool = True,
):
    """导出模型为ONNX格式"""

    cfg = get_model_config()
    model = STG50MChat(**cfg)

    # 加载权重
    if os.path.exists(model_path):
        state_dict = torch.load(model_path, map_location="cpu", weights_only=True)
        # 处理 checkpoint 格式
        if "model_state_dict" in state_dict:
            state_dict = state_dict["model_state_dict"]
        model.load_state_dict(state_dict)
        print(f"Loaded model from {model_path}")
    else:
        print(f"Warning: {model_path} not found, using random weights")

    model.eval()

    # 导出
    dummy_input = torch.randint(0, vocab_size, (1, max_seq_len), dtype=torch.long)

    print(f"Exporting to {output_path}...")
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["input_ids"],
        output_names=["logits"],
        dynamic_axes={
            "input_ids": {0: "batch_size", 1: "seq_len"},
            "logits": {0: "batch_size", 1: "seq_len"},
        },
    )
    print(f"✅ Model exported to {output_path}")

    # 获取文件大小
    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"   Size: {size_mb:.1f} MB")

    # 量化
    if quantize:
        quantized_path = output_path.replace(".onnx", "_quantized.onnx")
        try:
            from onnxruntime.quantization import quantize_dynamic, QuantType

            print(f"Quantizing to {quantized_path}...")
            quantize_dynamic(
                output_path,
                quantized_path,
                weight_type=QuantType.QInt8,
            )
            quant_size = os.path.getsize(quantized_path) / (1024 * 1024)
            print(f"✅ Quantized model saved to {quantized_path}")
            print(f"   Size: {quant_size:.1f} MB (compression: {size_mb/quant_size:.1f}x)")
        except ImportError:
            print("⚠️ onnxruntime not installed, skipping quantization")
            print("   Install with: pip install onnxruntime")


def export_torchscript(model_path: str, output_path: str = "stg_50m_chat.pt"):
    """导出为TorchScript格式"""
    cfg = get_model_config()
    model = STG50MChat(**cfg)

    if os.path.exists(model_path):
        state_dict = torch.load(model_path, map_location="cpu", weights_only=True)
        if "model_state_dict" in state_dict:
            state_dict = state_dict["model_state_dict"]
        model.load_state_dict(state_dict)
        print(f"Loaded model from {model_path}")

    model.eval()

    # 使用 tracing
    dummy = torch.randint(0, cfg["vocab_size"], (1, 128), dtype=torch.long)
    traced = torch.jit.trace(model, dummy)
    traced.save(output_path)

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(f"✅ TorchScript model saved to {output_path} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="导出STG-50M-Chat模型")
    parser.add_argument("--model", type=str, required=True, help="模型权重路径")
    parser.add_argument("--output", type=str, default="stg_50m_chat.onnx", help="输出路径")
    parser.add_argument("--format", choices=["onnx", "torchscript", "both"], default="onnx")
    parser.add_argument("--no_quantize", action="store_true", help="不进行量化")
    parser.add_argument("--max_seq_len", type=int, default=512, help="最大序列长度")
    args = parser.parse_args()

    if args.format in ("onnx", "both"):
        export_onnx(
            args.model,
            args.output,
            args.max_seq_len,
            quantize=not args.no_quantize,
        )

    if args.format in ("torchscript", "both"):
        ts_path = args.output.replace(".onnx", ".pt")
        export_torchscript(args.model, ts_path)
