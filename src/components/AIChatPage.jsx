import React, { useState, useEffect, useRef, useCallback } from "react";
import { Icons } from "./Icons";
import { CompanionAI } from "../ai/companion";

const ai = new CompanionAI();

export default function AIChatPage({ onBack }) {
  const [messages, setMessages] = useState(() => {
    const isFirst = ai.memory.isFirstChat();
    const welcome = isFirst
      ? "嗨，初次见面，我是你的情感陪伴。开心、难过、无聊都可以来找我聊聊，我会一直在这里陪你。"
      : (() => {
          const mem = ai.memory.getContext();
          const name = mem.userName ? `${mem.userName}，` : "";
          return `${name}你来啦，想聊点什么？我一直都在。`;
        })();
    return [{ role: "assistant", content: welcome, emotion: "happy" }];
  });

  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
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
      setMessages([
        {
          role: "assistant",
          content: "记忆已清空，我们重新开始吧。你好呀，想聊点什么？",
          emotion: "happy",
        },
      ]);
    }
  }, []);

  const stats = ai.getStats();

  return (
    <div className="ai-chat-container">
      <div className="ai-chat-header">
        <button className="ai-chat-back" onClick={onBack}>
          <Icons.Back />
        </button>
        <div className="ai-avatar-wrapper">
          <div className="ai-avatar">
            🤖
          </div>
        </div>
        <button className="ai-clear-btn" onClick={handleClear} title="清空记忆">
          🗑
        </button>
      </div>

      <div className="ai-chat-title">
        <span className="ai-name">情感陪伴</span>
        <span className="ai-status">
          <span
            className="ai-status-dot"
            style={{ backgroundColor: isTyping ? "#f59e0b" : "#22c55e" }}
          />
          {isTyping ? "思考中" : "在线"}
        </span>
      </div>

      {stats.conversationCount > 0 && (
        <div className="ai-chat-stats">
          <span>💬 已聊 {stats.conversationCount} 句 · 🌱 端侧运行</span>
        </div>
      )}

      <div className="ai-chat-messages" ref={messagesContainerRef}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`ai-msg ${msg.role === "user" ? "sent" : "received"}`}
          >
            {msg.content || ""}
            <div className="ai-msg-meta">
              <span className="ai-msg-time">
                {new Date().toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
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
        <button
          className="ai-send-btn"
          onClick={handleSend}
          disabled={isTyping || !input.trim()}
        >
          {isTyping ? "..." : <Icons.Send />}
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
          padding: 16px;
          background: var(--bg);
          flex-shrink: 0;
        }

        .ai-chat-back {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-size: 20px;
          color: var(--text);
          background: transparent;
          border: none;
          cursor: pointer;
          flex-shrink: 0;
        }

        .ai-chat-back:hover {
          background: var(--hover);
        }

        .ai-avatar-wrapper {
          flex: 1;
          display: flex;
          justify-content: center;
        }

        .ai-avatar {
          width: 64px;
          height: 64px;
          border-radius: 50%;
          background: linear-gradient(135deg, #6366f1, #ec4899);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 32px;
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
        }

        .ai-clear-btn {
          width: 44px;
          height: 44px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          font-size: 18px;
          color: var(--text-muted);
          background: transparent;
          border: none;
          cursor: pointer;
          flex-shrink: 0;
        }

        .ai-clear-btn:hover {
          background: var(--hover);
        }

        .ai-chat-title {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 8px 16px 16px;
          background: var(--bg);
          flex-shrink: 0;
        }

        .ai-name {
          font-size: 18px;
          font-weight: 600;
          color: var(--text);
        }

        .ai-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-muted);
        }

        .ai-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          box-shadow: 0 0 6px currentColor;
        }

        .ai-chat-stats {
          padding: 8px 16px;
          background: var(--bg2);
          border-top: 1px solid var(--border);
          font-size: 11px;
          color: var(--text-muted);
          text-align: center;
          flex-shrink: 0;
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
          gap: 12px;
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
        }
      `}</style>
    </div>
  );
}