import torch
import os
from model_v2 import RomanticLM

def export_onnx(model, output_path='model.onnx', max_seq_len=256):
    model.eval()
    
    dummy_input = torch.randint(0, 8000, (1, max_seq_len), dtype=torch.long)
    
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=['input_ids'],
        output_names=['logits'],
        dynamic_axes={
            'input_ids': {0: 'batch_size', 1: 'seq_len'},
            'logits': {0: 'batch_size', 1: 'seq_len'}
        }
    )
    
    print(f'Model exported to {output_path}')

def quantize_model(input_path='model.onnx', output_path='model_quantized.onnx'):
    try:
        from onnxruntime.quantization import quantize_dynamic, QuantType
        
        quantize_dynamic(
            input_path,
            output_path,
            weight_type=QuantType.QUInt8
        )
        
        print(f'Quantized model saved to {output_path}')
    except ImportError:
        print('onnxruntime not installed, skipping quantization')

if __name__ == "__main__":
    model = RomanticLM(vocab_size=8000, d_model=384, nhead=6, num_layers=6, 
                      dim_feedforward=1536, max_seq_len=256)
    
    if os.path.exists('model_knowledge.pt'):
        model.load_state_dict(torch.load('model_knowledge.pt', map_location='cpu', weights_only=True))
        print('Loaded knowledge model')
    elif os.path.exists('model_emotion.pt'):
        model.load_state_dict(torch.load('model_emotion.pt', map_location='cpu', weights_only=True))
        print('Loaded emotion model')
    elif os.path.exists('model_pretrain.pt'):
        model.load_state_dict(torch.load('model_pretrain.pt', map_location='cpu', weights_only=True))
        print('Loaded pretrained model')
    
    export_onnx(model, 'model.onnx')
    quantize_model('model.onnx', 'model_quantized.onnx')