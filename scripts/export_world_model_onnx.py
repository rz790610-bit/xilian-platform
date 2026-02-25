#!/usr/bin/env python3
"""
World Model ONNX 导出脚本
=========================

将 PyTorch LSTM/Transformer 模型导出为 ONNX 格式，供 Node.js onnxruntime-node 加载。

用法：
  python scripts/export_world_model_onnx.py --arch lstm --seq-len 60 --feat-dim 32 --hidden 128
  python scripts/export_world_model_onnx.py --arch transformer --seq-len 60 --feat-dim 32 --hidden 128

输出：
  server/platform/evolution/models/world-model-lstm.onnx
  或
  server/platform/evolution/models/world-model-transformer.onnx

依赖：
  pip install torch onnx onnxruntime numpy
"""

import argparse
import os
import numpy as np

try:
    import torch
    import torch.nn as nn
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False
    print("⚠️  PyTorch 未安装，将生成占位 ONNX 模型（仅用于开发测试）")

try:
    import onnx
    from onnx import helper, TensorProto, numpy_helper
    ONNX_AVAILABLE = True
except ImportError:
    ONNX_AVAILABLE = False


# ============================================================================
# PyTorch 模型定义
# ============================================================================

if TORCH_AVAILABLE:
    class LSTMWorldModel(nn.Module):
        """LSTM 世界模型 — 时序状态预测"""
        def __init__(self, feature_dim: int, hidden_dim: int, num_layers: int = 2):
            super().__init__()
            self.lstm = nn.LSTM(feature_dim, hidden_dim, num_layers, batch_first=True, dropout=0.2)
            self.attention = nn.MultiheadAttention(hidden_dim, num_heads=4, batch_first=True)
            self.fc_output = nn.Linear(hidden_dim, feature_dim * 10)  # 预测未来 10 步
            self.fc_prob = nn.Linear(hidden_dim, 1)  # 干预概率
            self.fc_conf = nn.Linear(hidden_dim, 1)  # 置信度

        def forward(self, x):
            # x: [batch, seq_len, feature_dim]
            lstm_out, _ = self.lstm(x)
            # 自注意力
            attn_out, _ = self.attention(lstm_out, lstm_out, lstm_out)
            # 取最后一个时间步
            last_hidden = attn_out[:, -1, :]
            # 输出
            output = self.fc_output(last_hidden)  # [batch, feature_dim * 10]
            probability = torch.sigmoid(self.fc_prob(last_hidden))  # [batch, 1]
            confidence = torch.sigmoid(self.fc_conf(last_hidden))  # [batch, 1]
            return output, probability, confidence

    class TransformerWorldModel(nn.Module):
        """Transformer 世界模型 — 时序状态预测"""
        def __init__(self, feature_dim: int, hidden_dim: int, num_layers: int = 4):
            super().__init__()
            self.input_proj = nn.Linear(feature_dim, hidden_dim)
            self.pos_encoding = nn.Parameter(torch.randn(1, 512, hidden_dim) * 0.02)
            encoder_layer = nn.TransformerEncoderLayer(
                d_model=hidden_dim, nhead=4, dim_feedforward=hidden_dim * 4,
                dropout=0.1, batch_first=True
            )
            self.transformer = nn.TransformerEncoder(encoder_layer, num_layers=num_layers)
            self.fc_output = nn.Linear(hidden_dim, feature_dim * 10)
            self.fc_prob = nn.Linear(hidden_dim, 1)
            self.fc_conf = nn.Linear(hidden_dim, 1)

        def forward(self, x):
            # x: [batch, seq_len, feature_dim]
            h = self.input_proj(x)
            h = h + self.pos_encoding[:, :x.size(1), :]
            h = self.transformer(h)
            last_hidden = h[:, -1, :]
            output = self.fc_output(last_hidden)
            probability = torch.sigmoid(self.fc_prob(last_hidden))
            confidence = torch.sigmoid(self.fc_conf(last_hidden))
            return output, probability, confidence


# ============================================================================
# 占位 ONNX 模型生成（无 PyTorch 时使用）
# ============================================================================

def create_placeholder_onnx(output_path: str, seq_len: int, feat_dim: int):
    """
    生成一个最小化的占位 ONNX 模型，用于开发测试。
    输入: input [1, seq_len, feat_dim]
    输出: output [1, feat_dim*10], probability [1, 1], confidence [1, 1]
    """
    if not ONNX_AVAILABLE:
        print("⚠️  onnx 包未安装，跳过占位模型生成")
        print(f"   请手动安装: pip install onnx")
        print(f"   或在 Docker 中运行此脚本")
        return

    # 输入
    X = helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, seq_len, feat_dim])

    # 输出
    Y_output = helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, feat_dim * 10])
    Y_prob = helper.make_tensor_value_info('probability', TensorProto.FLOAT, [1, 1])
    Y_conf = helper.make_tensor_value_info('confidence', TensorProto.FLOAT, [1, 1])

    # 简单的恒等映射（占位）
    # Reshape input → flatten → Slice 取前 feat_dim*10 个值
    flatten_shape = numpy_helper.from_array(
        np.array([1, seq_len * feat_dim], dtype=np.int64), name='flatten_shape'
    )
    output_shape = numpy_helper.from_array(
        np.array([1, feat_dim * 10], dtype=np.int64), name='output_shape'
    )
    prob_shape = numpy_helper.from_array(
        np.array([1, 1], dtype=np.int64), name='prob_shape'
    )
    # 常量
    zero_val = numpy_helper.from_array(np.array([0.5], dtype=np.float32), name='half_val')

    # 节点
    flatten_node = helper.make_node('Reshape', ['input', 'flatten_shape'], ['flattened'])
    slice_start = numpy_helper.from_array(np.array([0, 0], dtype=np.int64), name='slice_start')
    slice_end = numpy_helper.from_array(np.array([1, feat_dim * 10], dtype=np.int64), name='slice_end')
    slice_node = helper.make_node('Slice', ['flattened', 'slice_start', 'slice_end'], ['output'])

    # probability 和 confidence 用常量
    prob_node = helper.make_node('Reshape', ['half_val', 'prob_shape'], ['probability'])
    conf_node = helper.make_node('Reshape', ['half_val', 'prob_shape'], ['confidence'])

    graph = helper.make_graph(
        [flatten_node, slice_node, prob_node, conf_node],
        'world_model_placeholder',
        [X],
        [Y_output, Y_prob, Y_conf],
        initializer=[flatten_shape, output_shape, prob_shape, slice_start, slice_end, zero_val],
    )

    model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 17)])
    model.ir_version = 8

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    onnx.save(model, output_path)
    print(f"✅ 占位 ONNX 模型已生成: {output_path}")
    print(f"   输入: input [1, {seq_len}, {feat_dim}]")
    print(f"   输出: output [1, {feat_dim * 10}], probability [1, 1], confidence [1, 1]")


# ============================================================================
# PyTorch → ONNX 导出
# ============================================================================

def export_pytorch_to_onnx(arch: str, seq_len: int, feat_dim: int, hidden_dim: int, output_path: str):
    """将 PyTorch 模型导出为 ONNX"""
    if not TORCH_AVAILABLE:
        print("PyTorch 不可用，使用占位模型")
        create_placeholder_onnx(output_path, seq_len, feat_dim)
        return

    if arch == 'lstm':
        model = LSTMWorldModel(feat_dim, hidden_dim)
    elif arch == 'transformer':
        model = TransformerWorldModel(feat_dim, hidden_dim)
    else:
        raise ValueError(f"不支持的架构: {arch}")

    model.eval()

    # 示例输入
    dummy_input = torch.randn(1, seq_len, feat_dim)

    # 导出
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    torch.onnx.export(
        model,
        dummy_input,
        output_path,
        input_names=['input'],
        output_names=['output', 'probability', 'confidence'],
        dynamic_axes={
            'input': {0: 'batch', 1: 'seq_len'},
            'output': {0: 'batch'},
            'probability': {0: 'batch'},
            'confidence': {0: 'batch'},
        },
        opset_version=17,
        do_constant_folding=True,
    )

    print(f"✅ PyTorch {arch.upper()} 模型已导出为 ONNX: {output_path}")
    print(f"   输入: input [batch, {seq_len}, {feat_dim}]")
    print(f"   输出: output [batch, {feat_dim * 10}], probability [batch, 1], confidence [batch, 1]")
    print(f"   参数量: {sum(p.numel() for p in model.parameters()):,}")


# ============================================================================
# CLI
# ============================================================================

def main():
    parser = argparse.ArgumentParser(description='World Model ONNX 导出工具')
    parser.add_argument('--arch', choices=['lstm', 'transformer'], default='lstm', help='模型架构')
    parser.add_argument('--seq-len', type=int, default=60, help='序列长度')
    parser.add_argument('--feat-dim', type=int, default=32, help='特征维度')
    parser.add_argument('--hidden', type=int, default=128, help='隐藏层维度')
    parser.add_argument('--output', type=str, default=None, help='输出路径')
    parser.add_argument('--placeholder', action='store_true', help='强制生成占位模型')
    args = parser.parse_args()

    output_path = args.output or f'server/platform/evolution/models/world-model-{args.arch}.onnx'

    if args.placeholder or not TORCH_AVAILABLE:
        create_placeholder_onnx(output_path, args.seq_len, args.feat_dim)
    else:
        export_pytorch_to_onnx(args.arch, args.seq_len, args.feat_dim, args.hidden, output_path)


if __name__ == '__main__':
    main()
