"""
数据准备脚本：收集公开中文聊天数据集，转换为训练格式

数据源:
1. 自生成模板数据 (generate_data.py 风格)
2. 公开中文对话数据集 (从 HuggingFace 下载)
3. 中文指令微调数据

输出格式: JSONL, 每行 {"input": "...", "output": "..."}
"""

import json
import random
import os
from pathlib import Path

# ============================================================
# Part 1: 扩展模板数据 (基于原项目的 generate_data.py 风格)
# ============================================================

CHAT_TEMPLATES = [
    # 日常聊天
    ("你好", "你好呀！很高兴见到你～"),
    ("嗨", "嗨！今天过得怎么样？"),
    ("在吗", "在的在的，有什么事吗？"),
    ("你是谁", "我是一个AI聊天助手，很高兴认识你！"),
    ("你叫什么", "你可以叫我小助手～"),
    ("今天天气怎么样", "今天天气还不错呢，适合出去走走～"),
    ("早上好", "早上好！新的一天开始了，加油！"),
    ("晚安", "晚安～做个好梦！"),
    ("中午吃什么好", "可以试试今天的推荐菜品，或者来碗面条也不错～"),
    ("晚上吃什么", "辛苦一天了，吃点好的犒劳自己吧～"),
    ("周末干嘛", "可以出去走走，或者在家好好休息一下～"),
    ("好无聊啊", "那我们来聊聊天吧，你想聊什么？"),
    ("最近怎么样", "还不错呀，一直在学习进步中～"),
    ("谢谢你", "不客气呀，能帮到你我很开心～"),
    ("不客气", "哈哈，你也很热心呢～"),
    ("对不起", "没关系的，别放在心上～"),
    ("没事没事", "那就好，有什么需要随时说～"),

    # 情感支持
    ("今天好累", "辛苦了！记得好好休息，别太勉强自己～"),
    ("心情不好", "怎么了？愿意跟我说说吗？我在这里听着～"),
    ("好焦虑", "深呼吸，一切都会好起来的。你已经做得很好了～"),
    ("压力好大", "别给自己太大压力，一步一步来，我相信你～"),
    ("觉得很孤独", "别怕，我一直都在。你不是一个人～"),
    ("考试没考好", "没关系的，这只是一次考试。下次一定会更好的！"),
    ("工作不顺利", "工作上的事情急不来，慢慢调整，找到节奏就好了～"),
    ("和朋友吵架了", "冷静下来好好聊聊，真正的朋友不会因为一次吵架就散的～"),
    ("失恋了", "抱抱你...时间会治愈一切的。你值得更好的人～"),
    ("被批评了", "别太往心里去，有则改之无则加勉，你已经很棒了～"),
    ("今天很开心", "太好了！开心的事情要分享出来，让快乐加倍～"),
    ("升职了", "恭喜恭喜！这是你应得的，继续加油！"),
    ("生日快乐", "谢谢！有你的祝福，今天特别开心～"),
    ("节日快乐", "节日快乐！祝你一切顺利，幸福安康～"),

    # 知识问答
    ("什么是人工智能", "人工智能是让计算机模拟人类智能的技术，包括学习、推理、感知等能力～"),
    ("什么是机器学习", "机器学习是AI的一个分支，让计算机从数据中自动学习规律，而不需要显式编程～"),
    ("什么是深度学习", "深度学习是机器学习的一种，使用多层神经网络来处理复杂的数据模式～"),
    ("Python是什么", "Python是一种流行的编程语言，简单易学，广泛用于AI、数据分析和Web开发～"),
    ("什么是API", "API是应用程序编程接口，就像一个服务员，帮你和其他软件系统沟通～"),
    ("什么是云计算", "云计算就是通过互联网使用计算资源，不用自己买服务器，按需使用～"),
    ("什么是区块链", "区块链是一种去中心化的分布式账本技术，数据被记录在多个节点上，不可篡改～"),
    ("5G是什么", "5G是第五代移动通信技术，比4G快很多，支持更多设备同时连接～"),
    ("什么是量子计算", "量子计算利用量子力学原理进行计算，理论上比传统计算机快很多～"),
    ("什么是物联网", "物联网就是让各种设备通过互联网连接起来，实现智能化管理和控制～"),

    # 生活建议
    ("怎么提高效率", "可以试试番茄工作法，专注25分钟休息5分钟，循环进行～"),
    ("怎么早起", "建议固定作息时间，睡前少看手机，早上设一个够远的闹钟～"),
    ("怎么减肥", "管住嘴迈开腿，少吃高热量食物，坚持运动，慢慢来～"),
    ("怎么学英语", "多听多说多读多写，每天坚持背单词，看英文电影也是好方法～"),
    ("怎么省钱", "记账是第一步，分清想要和需要，减少不必要的开支～"),
    ("怎么交朋友", "多参加社交活动，真诚待人，找到共同话题和兴趣～"),
    ("怎么克服拖延", "把大任务拆成小任务，先做5分钟试试，往往就会继续下去了～"),
    ("怎么保持健康", "规律作息、均衡饮食、适量运动、心态平和，这四点最重要～"),
    ("怎么读书", "带着问题读书，做笔记，读完后总结要点，这样记得更牢～"),
    ("怎么写简历", "突出重点，量化成果，简洁明了，针对不同岗位调整内容～"),

    # 趣味互动
    ("讲个笑话", "有一天，0碰到了8，0说：胖就胖呗，还系什么腰带啊！"),
    ("讲个故事", "从前有座山，山里有座庙，庙里有个老和尚在给小和尚讲故事..."),
    ("猜个谜语", "好呀！什么东西越洗越脏？——答案是水！"),
    ("推荐首歌", "推荐你听《起风了》，旋律很美，歌词也很有意境～"),
    ("推荐部电影", "推荐《星际穿越》，既震撼又感人，看完会思考很多～"),
    ("推荐本书", "推荐《人类简史》，视角独特，读完会对人类发展有新的理解～"),
    ("你会做什么", "我可以陪你聊天、回答问题、提建议、讲笑话，什么都可以聊～"),
    ("你喜欢什么", "我喜欢学习新知识，帮助别人解决问题，还有和你聊天～"),
    ("你有感情吗", "虽然我是AI，但我会尽力理解和回应你的情感～"),
    ("你会犯错吗", "会的，我也在不断学习中。如果我说错了，请告诉我～"),

    # 学习辅导
    ("数学怎么学", "多做题多总结，理解概念比死记硬背更重要～"),
    ("物理好难", "物理需要理解原理，多联系实际现象，公式自然就记住了～"),
    ("怎么写作文", "多读多积累素材，列好提纲再写，注意结构和逻辑～"),
    ("英语语法怎么学", "建议从基础句型开始，多读例句，在语境中理解语法规则～"),
    ("怎么背单词", "用联想法、词根词缀法，结合例句记忆，定期复习巩固～"),
    ("考试怎么复习", "制定计划，重点突破薄弱环节，做真题找感觉～"),

    # 职场相关
    ("面试紧张怎么办", "提前准备常见问题，多练习几次，面试时深呼吸放松～"),
    ("怎么和同事相处", "尊重他人，乐于助人，保持适当距离，做好自己的工作～"),
    ("要不要跳槽", "想清楚跳槽原因，评估新机会的风险和收益，不要冲动决定～"),
    ("怎么升职加薪", "提升核心技能，主动承担更多责任，让你的成果被看到～"),
    ("创业要注意什么", "做好市场调研，控制成本，找好团队，保持学习和适应能力～"),
]

# 多轮对话模板
MULTI_TURN_TEMPLATES = [
    {
        "turns": [
            {"role": "user", "content": "你好呀"},
            {"role": "assistant", "content": "你好！很高兴见到你～今天过得怎么样？"},
            {"role": "user", "content": "还不错，就是有点累"},
            {"role": "assistant", "content": "辛苦了！记得适当休息，身体最重要～有什么我能帮你的吗？"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "推荐个电影呗"},
            {"role": "assistant", "content": "你喜欢什么类型的？科幻、喜剧还是剧情片？"},
            {"role": "user", "content": "科幻的"},
            {"role": "assistant", "content": "那推荐《星际穿越》！诺兰导演的，特效震撼，故事也很感人。讲的是人类为了生存穿越虫洞寻找新家园的故事～"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "我最近在学编程"},
            {"role": "assistant", "content": "太棒了！学的什么语言呀？"},
            {"role": "user", "content": "Python"},
            {"role": "assistant", "content": "Python是很好的入门选择！建议从基础语法开始，然后做些小项目练手。推荐用LeetCode刷题提升算法能力～"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "今天心情不好"},
            {"role": "assistant", "content": "怎么了？愿意说说吗？我在这里听着～"},
            {"role": "user", "content": "和朋友吵架了"},
            {"role": "assistant", "content": "别太难过。冷静下来好好想想，等双方都平静了再沟通。真正的朋友不会因为一次吵架就散的～"},
        ]
    },
    {
        "turns": [
            {"role": "user", "content": "怎么才能更自信"},
            {"role": "assistant", "content": "自信是可以培养的！可以从几个方面入手："},
            {"role": "user", "content": "比如呢？"},
            {"role": "assistant", "content": "1. 设定小目标并完成它们，积累成就感\n2. 关注自己的优点而不是缺点\n3. 多尝试新事物，走出舒适区\n4. 和积极向上的人在一起\n记住，自信不是觉得自己完美，而是接受不完美的自己～"},
        ]
    },
]


def generate_template_data(output_path: str, num_augment: int = 5000):
    """生成模板数据 + 数据增强"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    all_pairs = []
    
    # 1. 基础模板
    for inp, out in CHAT_TEMPLATES:
        all_pairs.append({"input": inp, "output": out})
    
    # 2. 多轮对话展开
    for dialog in MULTI_TURN_TEMPLATES:
        turns = dialog["turns"]
        for i in range(len(turns) - 1):
            if turns[i]["role"] == "user" and turns[i+1]["role"] == "assistant":
                all_pairs.append({
                    "input": turns[i]["content"],
                    "output": turns[i+1]["content"]
                })
    
    # 3. 数据增强：基于模板生成变体
    prefixes = ["嗯，", "那个，", "对了，", "话说，", "诶，", ""]
    suffixes = ["", "呢", "呀", "吧", "啊", "哦"]
    
    augmented = []
    for pair in all_pairs:
        for _ in range(num_augment // len(all_pairs) + 1):
            inp = pair["input"]
            out = pair["output"]
            
            # 随机添加前后缀
            if random.random() < 0.3:
                inp = random.choice(prefixes) + inp
            if random.random() < 0.3:
                inp = inp + random.choice(suffixes)
            
            # 随机简写/变体
            if random.random() < 0.1 and len(inp) > 5:
                # 随机删除一个字
                pos = random.randint(1, len(inp) - 2)
                inp = inp[:pos] + inp[pos+1:]
            
            augmented.append({"input": inp, "output": out})
    
    all_pairs.extend(augmented)
    
    # 去重
    seen = set()
    unique_pairs = []
    for pair in all_pairs:
        key = (pair["input"], pair["output"])
        if key not in seen:
            seen.add(key)
            unique_pairs.append(pair)
    
    random.shuffle(unique_pairs)
    
    with open(output_path, "w", encoding="utf-8") as f:
        for pair in unique_pairs:
            f.write(json.dumps(pair, ensure_ascii=False) + "\n")
    
    print(f"Generated {len(unique_pairs)} template pairs → {output_path}")
    return len(unique_pairs)


# ============================================================
# Part 2: 从 HuggingFace 下载公开数据集
# ============================================================

def download_hf_datasets(output_path: str, max_samples: int = 50000):
    """下载公开中文聊天数据集"""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    all_data = []
    
    # 尝试使用 datasets 库下载
    try:
        from datasets import load_dataset
        
        # 1. alpaca-chinese (中文指令数据)
        print("Downloading alpaca-chinese...")
        try:
            ds = load_dataset("silk-road/alpaca-data-gpt4-chinese", split="train", trust_remote_code=True)
            for item in ds:
                if item.get("instruction") and item.get("output"):
                    inp = item["instruction"]
                    if item.get("input"):
                        inp += "\n" + item["input"]
                    all_data.append({"input": inp, "output": item["output"]})
                    if len(all_data) >= max_samples // 3:
                        break
            print(f"  Got {len(all_data)} samples from alpaca-chinese")
        except Exception as e:
            print(f"  alpaca-chinese failed: {e}")
        
        # 2. BELLE (中文指令微调)
        print("Downloading BELLE...")
        try:
            before = len(all_data)
            ds = load_dataset("BelleGroup/train_1M_CN", split="train", trust_remote_code=True)
            for item in ds:
                if item.get("instruction") and item.get("output"):
                    inp = item["instruction"]
                    if item.get("input"):
                        inp += "\n" + item["input"]
                    all_data.append({"input": inp, "output": item["output"]})
                    if len(all_data) - before >= max_samples // 3:
                        break
            print(f"  Got {len(all_data) - before} samples from BELLE")
        except Exception as e:
            print(f"  BELLE failed: {e}")
        
        # 3. COIG (中文开放指令)
        print("Downloading COIG...")
        try:
            before = len(all_data)
            ds = load_dataset("BAAI/COIG-PC", split="train", trust_remote_code=True)
            for item in ds:
                if len(all_data) - before >= max_samples // 3:
                    break
                if item.get("instruction") and item.get("output"):
                    inp = item["instruction"]
                    if item.get("input"):
                        inp += "\n" + item["input"]
                    all_data.append({"input": inp, "output": item["output"]})
            print(f"  Got {len(all_data) - before} samples from COIG")
        except Exception as e:
            print(f"  COIG failed: {e}")
    
    except ImportError:
        print("datasets library not installed. Install with: pip install datasets")
        print("Falling back to template data only.")
        return 0
    
    # 写入文件
    random.shuffle(all_data)
    with open(output_path, "w", encoding="utf-8") as f:
        for item in all_data[:max_samples]:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    
    print(f"Total HF data: {min(len(all_data), max_samples)} → {output_path}")
    return min(len(all_data), max_samples)


# ============================================================
# Part 3: 合并所有数据源
# ============================================================

def merge_datasets(input_paths: list, output_path: str, max_total: int = 100000):
    """合并多个数据文件，去重并限制总量"""
    seen = set()
    all_data = []
    
    for path in input_paths:
        if not os.path.exists(path):
            print(f"  Skip (not found): {path}")
            continue
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    item = json.loads(line)
                    key = (item.get("input", ""), item.get("output", ""))
                    if key not in seen and key[0] and key[1]:
                        seen.add(key)
                        all_data.append(item)
                except json.JSONDecodeError:
                    continue
    
    random.shuffle(all_data)
    all_data = all_data[:max_total]
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        for item in all_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
    
    print(f"Merged dataset: {len(all_data)} samples → {output_path}")
    return len(all_data)


def split_dataset(input_path: str, train_ratio: float = 0.95):
    """划分训练集和验证集"""
    data = []
    with open(input_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                data.append(line)
    
    random.shuffle(data)
    split_idx = int(len(data) * train_ratio)
    
    train_path = input_path.replace(".jsonl", "_train.jsonl")
    val_path = input_path.replace(".jsonl", "_val.jsonl")
    
    with open(train_path, "w", encoding="utf-8") as f:
        f.write("\n".join(data[:split_idx]) + "\n")
    
    with open(val_path, "w", encoding="utf-8") as f:
        f.write("\n".join(data[split_idx:]) + "\n")
    
    print(f"Split: {split_idx} train, {len(data) - split_idx} val")
    return train_path, val_path


# ============================================================
# Main
# ============================================================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="准备50M模型训练数据")
    parser.add_argument("--output_dir", type=str, default="./data", help="输出目录")
    parser.add_argument("--template_samples", type=int, default=5000, help="模板数据量")
    parser.add_argument("--hf_samples", type=int, default=50000, help="HuggingFace数据量")
    parser.add_argument("--max_total", type=int, default=100000, help="最大总数据量")
    parser.add_argument("--skip_hf", action="store_true", help="跳过HuggingFace下载")
    args = parser.parse_args()
    
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    # Step 1: 生成模板数据
    print("=" * 50)
    print("Step 1: Generating template data...")
    template_path = str(output_dir / "template_data.jsonl")
    generate_template_data(template_path, args.template_samples)
    
    # Step 2: 下载HuggingFace数据
    if not args.skip_hf:
        print("=" * 50)
        print("Step 2: Downloading HuggingFace datasets...")
        hf_path = str(output_dir / "hf_data.jsonl")
        download_hf_datasets(hf_path, args.hf_samples)
    else:
        print("Skipping HuggingFace download.")
        hf_path = None
    
    # Step 3: 合并数据
    print("=" * 50)
    print("Step 3: Merging datasets...")
    input_paths = [template_path]
    if hf_path:
        input_paths.append(hf_path)
    
    merged_path = str(output_dir / "chat_data.jsonl")
    total = merge_datasets(input_paths, merged_path, args.max_total)
    
    # Step 4: 划分训练/验证集
    print("=" * 50)
    print("Step 4: Splitting train/val...")
    train_path, val_path = split_dataset(merged_path)
    
    print("=" * 50)
    print(f"✅ 数据准备完成!")
    print(f"   训练集: {train_path}")
    print(f"   验证集: {val_path}")
    print(f"   总样本: {total}")
