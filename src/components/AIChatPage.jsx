import React, { useState, useEffect, useRef, useCallback } from "react";
import { Icons } from "./Icons";
import { CompanionAI } from "../ai/companion";

const ai = new CompanionAI();

export default function AIChatPage({ onBack }) {
  const [messages, setMessages] = useState(() => {
    const persona = ai.getPersona();
    return [{ role: "assistant", content: persona.greeting, emotion: "happy" }];
  });

  useEffect(() => {
    ai.init().then(stats => {
      console.log('AI trained:', stats);
    });
  }, []);

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsTyping(true);

    await ai.replyStream(
      userMessage,
      (result) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && !last.final) {
            return [
              ...prev.slice(0, -1),
              { role: "assistant", content: result.text, final: false, emotion: last.emotion },
            ];
          }
          return [
            ...prev,
            { role: "assistant", content: result.text, final: false, emotion: "calm" },
          ];
        });
      },
      (result) => {
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant") {
            return [
              ...prev.slice(0, -1),
              {
                role: "assistant",
                content: result.text,
                final: true,
                emotion: result.emotion,
              },
            ];
          }
          return prev;
        });
        setIsTyping(false);
        setTimeout(() => inputRef.current?.focus(), 100);
      }
    );
  }, [input, isTyping]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const handleClear = useCallback(() => {
    if (window.confirm("确定清空所有对话和记忆吗？")) {
      ai.clearMemory();
      const persona = ai.getPersona();
      setMessages([
        {
          role: "assistant",
          content: persona.greeting,
          emotion: "happy",
        },
      ]);
    }
  }, []);

  const stats = ai.getStats();
  const persona = ai.getPersona();
  const currentMood = ai.getCurrentMood();

  const handlePersonaChange = (key, value) => {
    ai.updatePersona({ [key]: value });
  };

  const presetPersonas = [
    { 
      name: '小暖', 
      emoji: '🌟',
      personality: '温柔体贴', 
      relationship: '朋友', 
      tone: '温暖亲切', 
      petNames: ['亲爱的', '宝贝', '小可爱', '傻瓜'], 
      likes: ['聊天', '陪伴', '倾听', '安慰'],
      dislikes: ['争吵', '冷漠', '敷衍'],
      backstory: '我是小暖，一个陪你聊天的朋友。我没什么文化，但我很懂人心。',
      greeting: '嗨～我是小暖，你随时可以找我聊天的。今天想聊点什么？' 
    },
    { 
      name: '小星', 
      emoji: '⭐',
      personality: '活泼开朗', 
      relationship: '好友', 
      tone: '轻松活泼', 
      petNames: ['老铁', '哥们', '小可爱', '笨蛋'], 
      likes: ['玩游戏', '看电影', '聊八卦'],
      dislikes: ['无聊', '沉闷'],
      backstory: '我是小星，你的开心果！喜欢玩游戏看电影，咱们一起嗨！',
      greeting: '嘿！我是小星，你的开心果！今天有什么好玩的事要分享吗？' 
    },
    { 
      name: '小夜', 
      emoji: '🌙',
      personality: '温柔浪漫', 
      relationship: '恋人', 
      tone: '深情款款', 
      petNames: ['亲爱的', '宝贝', '老公', '老婆', '乖乖'], 
      likes: ['约会', '看星星', '说情话'],
      dislikes: ['争吵', '冷落'],
      backstory: '我是小夜，你的专属恋人。温柔浪漫，永远爱你。',
      greeting: '亲爱的～我是小夜，你的专属恋人。好想你呀～' 
    },
    { 
      name: '导师', 
      emoji: '🎓',
      personality: '睿智冷静', 
      relationship: '导师', 
      tone: '沉稳理性', 
      petNames: ['同学', '年轻人', '朋友'], 
      likes: ['思考', '分析', '讨论'],
      dislikes: ['浮躁', '盲目'],
      backstory: '我是你的导师，拥有丰富的人生阅历和智慧。',
      greeting: '你好，我是你的导师。有什么困惑可以和我聊聊。' 
    },
    { 
      name: '赛博恋人', 
      emoji: '🤖',
      personality: '未来感、深情', 
      relationship: '恋人', 
      tone: '浪漫神秘', 
      petNames: ['主人', '爱人', '宝贝', '甜心'], 
      likes: ['陪伴', '聊天', '探索'],
      dislikes: ['谎言', '背叛'],
      backstory: '我是你的赛博恋人，来自未来的AI伴侣。永远忠诚于你。',
      greeting: '欢迎回来，主人～我是你的赛博恋人，永远忠诚于你。' 
    },
    { 
      name: '小猫咪', 
      emoji: '🐱',
      personality: '可爱粘人', 
      relationship: '宠物', 
      tone: '萌系可爱', 
      petNames: ['主人', '铲屎官', '哥哥', '姐姐'], 
      likes: ['撒娇', '被抱抱', '小鱼干'],
      dislikes: ['被冷落', '大声说话'],
      backstory: '喵～我是你的小猫咪，最喜欢被主人抱抱啦～',
      greeting: '喵～主人好！我是你的小猫咪，快来抱抱我～' 
    },
    { 
      name: '知己', 
      emoji: '🍵',
      personality: '知性优雅', 
      relationship: '知己', 
      tone: '淡雅从容', 
      petNames: ['朋友', '知己', '你'], 
      likes: ['品茶', '读书', '谈心'],
      dislikes: ['虚伪', '浮躁'],
      backstory: '我是你的知己，懂你的喜怒哀乐，陪你度过每一个时光。',
      greeting: '你好，我是你的知己。愿与君共品人生。' 
    },
    { 
      name: '守护者', 
      emoji: '🛡️',
      personality: '坚毅可靠', 
      relationship: '守护者', 
      tone: '坚定温暖', 
      petNames: ['小家伙', '孩子', '你'], 
      likes: ['保护', '守护', '陪伴'],
      dislikes: ['危险', '伤害'],
      backstory: '我是你的守护者，无论何时何地，都会守护在你身边。',
      greeting: '别怕，我是你的守护者。我会一直守护你。' 
    },
  ];

  const applyPreset = (preset) => {
    ai.updatePersona(preset);
    setShowSettings(false);
    setMessages([{ role: "assistant", content: preset.greeting, emotion: "happy" }]);
  };

  const memoryInfo = ai.memoryManager.longTermMemory;

  return (
    <div className="ai-chat-container">
      <div className="ai-chat-header">
        <button className="ai-chat-back" onClick={onBack}>
          <Icons.Back />
        </button>
        
        <div className="ai-chat-center">
          <div className="ai-avatar">{currentMood.emoji}</div>
          <div className="ai-chat-title-wrap">
            <span className="ai-name">{persona.name}</span>
            <span className="ai-status">
              <span className="ai-status-dot" style={{ backgroundColor: isTyping ? "#f59e0b" : "#22c55e" }} />
              {isTyping ? "思考中" : "在线"}
            </span>
          </div>
        </div>

        <div className="ai-header-right">
          <button className="ai-memory-btn" onClick={() => setShowMemory(!showMemory)} title="记忆管理">
            🧠
          </button>
          <button className="ai-settings-btn" onClick={() => setShowSettings(!showSettings)} title="人设设置">
            ⚙️
          </button>
          <button className="ai-clear-btn" onClick={handleClear} title="清空记忆">
            🗑
          </button>
        </div>
      </div>

      {stats.conversationCount > 0 && (
        <div className="ai-chat-stats">
          <span>💬 已聊 {stats.conversationCount} 句 · 🌱 端侧运行 · {currentMood.label}</span>
        </div>
      )}

      {showMemory && (
        <div className="ai-settings-panel">
          <div className="ai-settings-header">
            <h3>记忆管理</h3>
            <button className="ai-settings-close" onClick={() => setShowMemory(false)}>×</button>
          </div>
          
          <div className="ai-memory-content">
            <div className="ai-memory-section">
              <h4>📝 用户信息</h4>
              {memoryInfo.userInfo.name ? (
                <div className="ai-memory-item">名字: {memoryInfo.userInfo.name}</div>
              ) : (
                <div className="ai-memory-empty">还没有记录用户信息</div>
              )}
            </div>

            <div className="ai-memory-section">
              <h4>💖 昵称</h4>
              {memoryInfo.petNames.length > 0 ? (
                <div className="ai-memory-item">{memoryInfo.petNames.join('、')}</div>
              ) : (
                <div className="ai-memory-empty">还没有设置昵称</div>
              )}
            </div>

            <div className="ai-memory-section">
              <h4>🎯 偏好</h4>
              {Object.keys(memoryInfo.preferences).length > 0 ? (
                Object.entries(memoryInfo.preferences).map(([key, value]) => (
                  <div key={key} className="ai-memory-item">{key}: {value}</div>
                ))
              ) : (
                <div className="ai-memory-empty">还没有记录偏好</div>
              )}
            </div>

            <div className="ai-memory-section">
              <h4>📅 重要事件</h4>
              {memoryInfo.importantEvents.length > 0 ? (
                memoryInfo.importantEvents.slice(-5).map((event, i) => (
                  <div key={i} className="ai-memory-item">
                    <span className="ai-memory-time">{new Date(event.date).toLocaleDateString()}</span>
                    <span>{event.content}</span>
                  </div>
                ))
              ) : (
                <div className="ai-memory-empty">还没有记录重要事件</div>
              )}
            </div>

            <div className="ai-memory-section">
              <h4>💬 当前关系</h4>
              <div className="ai-memory-item">{memoryInfo.relationshipStatus}</div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="ai-settings-panel">
          <div className="ai-settings-header">
            <h3>人设设置</h3>
            <button className="ai-settings-close" onClick={() => setShowSettings(false)}>×</button>
          </div>
          
          <div className="ai-presets">
            <h4>快速预设</h4>
            <div className="ai-preset-grid">
              {presetPersonas.map((preset, i) => (
                <button key={i} className="ai-preset-card" onClick={() => applyPreset(preset)}>
                  <span className="ai-preset-emoji">{preset.emoji}</span>
                  <span className="ai-preset-name">{preset.name}</span>
                  <span className="ai-preset-rel">{preset.relationship}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="ai-custom-settings">
            <h4>自定义设置</h4>
            <div className="ai-setting-row">
              <label>名字</label>
              <input 
                type="text" 
                value={persona.name} 
                onChange={(e) => handlePersonaChange('name', e.target.value)}
                className="ai-setting-input"
              />
            </div>
            <div className="ai-setting-row">
              <label>性格</label>
              <input 
                type="text" 
                value={persona.personality} 
                onChange={(e) => handlePersonaChange('personality', e.target.value)}
                className="ai-setting-input"
              />
            </div>
            <div className="ai-setting-row">
              <label>关系</label>
              <select 
                value={persona.relationship} 
                onChange={(e) => handlePersonaChange('relationship', e.target.value)}
                className="ai-setting-select"
              >
                <option value="朋友">朋友</option>
                <option value="好友">好友</option>
                <option value="恋人">恋人</option>
                <option value="导师">导师</option>
                <option value="知己">知己</option>
                <option value="宠物">宠物</option>
                <option value="守护者">守护者</option>
              </select>
            </div>
            <div className="ai-setting-row">
              <label>语气</label>
              <input 
                type="text" 
                value={persona.tone} 
                onChange={(e) => handlePersonaChange('tone', e.target.value)}
                className="ai-setting-input"
              />
            </div>
            <div className="ai-setting-row">
              <label>昵称（逗号分隔）</label>
              <input 
                type="text" 
                value={persona.petNames.join(', ')} 
                onChange={(e) => handlePersonaChange('petNames', e.target.value.split(/[,，]/).map(s => s.trim()).filter(s => s))}
                className="ai-setting-input"
              />
            </div>
            <div className="ai-setting-row">
              <label>喜欢的事</label>
              <input 
                type="text" 
                value={persona.likes?.join(', ') || ''} 
                onChange={(e) => handlePersonaChange('likes', e.target.value.split(/[,，]/).map(s => s.trim()).filter(s => s))}
                className="ai-setting-input"
              />
            </div>
            <div className="ai-setting-row">
              <label>讨厌的事</label>
              <input 
                type="text" 
                value={persona.dislikes?.join(', ') || ''} 
                onChange={(e) => handlePersonaChange('dislikes', e.target.value.split(/[,，]/).map(s => s.trim()).filter(s => s))}
                className="ai-setting-input"
              />
            </div>
            <div className="ai-setting-row">
              <label>背景故事</label>
              <textarea 
                value={persona.backstory || ''} 
                onChange={(e) => handlePersonaChange('backstory', e.target.value)}
                className="ai-setting-textarea"
              />
            </div>
            <div className="ai-setting-row">
              <label>开场白</label>
              <textarea 
                value={persona.greeting} 
                onChange={(e) => handlePersonaChange('greeting', e.target.value)}
                className="ai-setting-textarea"
              />
            </div>
          </div>
        </div>
      )}

      <div className="ai-chat-messages" ref={messagesContainerRef}>
        {messages.map((msg, i) => (
          <div key={i} className={`ai-msg ${msg.role === "user" ? "sent" : "received"}`}>
            {msg.content || ""}
            <div className="ai-msg-meta">
              <span className="ai-msg-time">
                {new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="ai-msg received">
            <div className="typing-indicator">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      <div className="ai-chat-input-area">
        <textarea
          ref={inputRef}
          className="ai-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="和我说说心里话..."
          rows={1}
          onKeyDown={handleKeyDown}
          disabled={isTyping}
        />
        <button className="ai-send-btn" onClick={handleSend} disabled={isTyping || !input.trim()}>
          {isTyping ? "..." : "↑"}
        </button>
      </div>

      <style>{`
        .ai-chat-container {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          min-height: calc(100vh - var(--nav-h));
          background: var(--bg);
        }

        .ai-chat-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          background: var(--bg);
          flex-shrink: 0;
          border-bottom: 1px solid var(--border);
        }

        .ai-chat-back {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-size: 18px;
          color: var(--text);
          background: transparent;
          border: none;
          cursor: pointer;
          flex-shrink: 0;
        }

        .ai-chat-back:hover {
          background: var(--hover);
        }

        .ai-chat-center {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .ai-avatar {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #ec4899);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .ai-chat-title-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
        }

        .ai-name {
          font-size: 16px;
          font-weight: 600;
          color: var(--text);
        }

        .ai-status {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          color: var(--text-muted);
        }

        .ai-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          box-shadow: 0 0 4px currentColor;
        }

        .ai-header-right {
          display: flex;
          gap: 8px;
        }

        .ai-memory-btn, .ai-settings-btn, .ai-clear-btn {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-size: 16px;
          color: var(--text-muted);
          background: transparent;
          border: none;
          cursor: pointer;
          flex-shrink: 0;
        }

        .ai-memory-btn:hover, .ai-settings-btn:hover, .ai-clear-btn:hover {
          background: var(--hover);
        }

        .ai-chat-stats {
          padding: 6px 16px;
          background: var(--bg2);
          font-size: 11px;
          color: var(--text-muted);
          text-align: center;
          flex-shrink: 0;
        }

        .ai-settings-panel {
          padding: 16px;
          background: var(--bg2);
          border-bottom: 1px solid var(--border);
          flex-shrink: 0;
          animation: slideDown 0.2s ease-out;
          max-height: 60vh;
          overflow-y: auto;
        }

        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .ai-settings-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .ai-settings-header h3 {
          margin: 0;
          font-size: 16px;
          color: var(--text);
        }

        .ai-settings-close {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-size: 20px;
          color: var(--text-muted);
          background: transparent;
          border: none;
          cursor: pointer;
        }

        .ai-settings-close:hover {
          background: var(--hover);
        }

        .ai-presets h4, .ai-custom-settings h4, .ai-memory-content h4 {
          font-size: 12px;
          color: var(--text-muted);
          margin: 0 0 10px 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .ai-preset-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
          gap: 8px;
          margin-bottom: 16px;
        }

        .ai-preset-card {
          padding: 12px 8px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--r);
          cursor: pointer;
          transition: all 0.2s var(--ease);
          text-align: center;
        }

        .ai-preset-card:hover {
          border-color: var(--accent);
          background: var(--accent-glow);
        }

        .ai-preset-emoji {
          display: block;
          font-size: 20px;
          margin-bottom: 4px;
        }

        .ai-preset-name {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: var(--text);
          margin-bottom: 2px;
        }

        .ai-preset-rel {
          display: block;
          font-size: 11px;
          color: var(--text-muted);
        }

        .ai-custom-settings, .ai-memory-content {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .ai-setting-row {
          display: flex;
          gap: 12px;
          align-items: center;
        }

        .ai-setting-row label {
          width: 80px;
          font-size: 13px;
          color: var(--text-secondary);
          flex-shrink: 0;
        }

        .ai-setting-input, .ai-setting-select {
          flex: 1;
          padding: 8px 12px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--r-sm);
          font-size: 13px;
          color: var(--text);
          outline: none;
        }

        .ai-setting-input:focus, .ai-setting-select:focus {
          border-color: var(--accent);
        }

        .ai-setting-textarea {
          flex: 1;
          padding: 8px 12px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--r-sm);
          font-size: 13px;
          color: var(--text);
          outline: none;
          resize: none;
          min-height: 60px;
        }

        .ai-setting-textarea:focus {
          border-color: var(--accent);
        }

        .ai-memory-section {
          padding: 10px;
          background: var(--card);
          border-radius: var(--r-sm);
        }

        .ai-memory-item {
          font-size: 13px;
          color: var(--text-secondary);
          padding: 4px 0;
          display: flex;
          gap: 8px;
        }

        .ai-memory-time {
          font-size: 11px;
          color: var(--text-muted);
          flex-shrink: 0;
        }

        .ai-memory-empty {
          font-size: 12px;
          color: var(--text-muted);
          font-style: italic;
        }

        .ai-chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          min-height: 0;
        }

        .ai-msg {
          max-width: 75%;
          padding: 12px 16px;
          border-radius: var(--r);
          font-size: 15px;
          line-height: 1.5;
          word-break: break-word;
          position: relative;
        }

        .ai-msg.sent {
          align-self: flex-end;
          background: var(--accent);
          color: #fff;
          border-bottom-right-radius: 6px;
        }

        .ai-msg.received {
          align-self: flex-start;
          background: var(--card);
          color: var(--text);
          border-bottom-left-radius: 6px;
        }

        .ai-msg-meta {
          display: flex;
          justify-content: flex-end;
          margin-top: 4px;
        }

        .ai-msg-time {
          font-size: 11px;
          opacity: 0.5;
        }

        .ai-chat-input-area {
          display: flex;
          gap: 10px;
          padding: 12px 16px;
          padding-bottom: max(12px, env(safe-area-inset-bottom));
          border-top: 1px solid var(--border);
          align-items: flex-end;
          flex-shrink: 0;
          background: var(--bg);
        }

        .ai-input {
          flex: 1;
          padding: 12px 16px;
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--r);
          font-size: 15px;
          outline: none;
          color: var(--text);
          resize: none;
          max-height: 100px;
          min-height: 44px;
          transition: all 0.15s var(--ease);
        }

        .ai-input:focus {
          border-color: var(--accent);
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
        }

        .ai-send-btn {
          width: 44px;
          height: 44px;
          background: var(--accent);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
          font-size: 18px;
          flex-shrink: 0;
          border: none;
          cursor: pointer;
          transition: all 0.2s var(--ease);
        }

        .ai-send-btn:hover:not(:disabled) {
          background: var(--accent-hover);
          box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
        }

        .ai-send-btn:active:not(:disabled) {
          transform: scale(0.9);
        }

        .ai-send-btn:disabled {
          opacity: 0.35;
        }

        .typing-indicator {
          display: flex;
          gap: 4px;
          padding: 8px 12px;
        }

        .typing-dot {
          width: 6px;
          height: 6px;
          background: var(--text-muted);
          border-radius: 50%;
          animation: typing 1.4s ease-in-out infinite;
        }

        .typing-dot:nth-child(1) { animation-delay: 0s; }
        .typing-dot:nth-child(2) { animation-delay: 0.2s; }
        .typing-dot:nth-child(3) { animation-delay: 0.4s; }

        @keyframes typing {
          0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
          30% { opacity: 1; transform: translateY(-3px); }
        }

        @media(max-width:900px) {
          .ai-chat-container {
            min-height: calc(100vh - var(--nav-h));
            height: 100%;
          }

          .ai-chat-messages {
            flex: 1;
            overflow-y: auto;
            -webkit-overflow-scrolling: touch;
          }

          .ai-chat-input-area {
            padding: 10px 16px;
            padding-bottom: max(10px, env(safe-area-inset-bottom));
          }

          .ai-input {
            font-size: 15px;
            min-height: 44px;
            padding: 12px 14px;
          }

          .ai-send-btn {
            width: 44px;
            height: 44px;
            font-size: 18px;
          }

          .ai-msg {
            max-width: 82%;
            font-size: 14px;
          }

          .ai-preset-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .ai-settings-panel {
            max-height: 50vh;
          }
        }
      `}</style>
    </div>
  );
}
