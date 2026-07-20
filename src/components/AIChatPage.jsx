import React, { useState, useEffect, useRef, useCallback } from "react";
import { Icons } from "./Icons";
import { CompanionAI } from "../ai/companion";

const ai = new CompanionAI();

export default function AIChatPage({ onBack }) {
  const [messages, setMessages] = useState(() => {
    // 首次进入时根据用户是否聊过显示不同欢迎语
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
  const [aiEmotion, setAiEmotion] = useState("happy"); // AI 当前情绪
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);

  // 滚动到底部
  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // 自动聚焦输入框
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 300);
  }, []);

  // 发送消息
  const handleSend = useCallback(async () => {
    if (!input.trim() || isTyping) return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsTyping(true);
    setAiEmotion("calm"); // 思考中

    // 流式回复
    await ai.replyStream(
      userMessage,
      (result) => {
        // 逐字更新
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
        // 完成
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
        setAiEmotion(result.emotion);
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

  // 清空对话
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

  // AI 表情（根据情绪）
  const getAiAvatar = useCallback(() => {
    const emotionMap = {
      happy: "😊",
      sad: "🥺",
      angry: "😤",
      anxious: "🌿",
      lonely: "💜",
      tired: "🌙",
      calm: "🌱",
      miss: "✨",
    };
    return emotionMap[aiEmotion] || "🌱";
  }, [aiEmotion]);

  // 统计信息
  const stats = ai.getStats();

  return (
    <div className="dm-chat">
      <div className="dm-chat-top">
        <button className="dm-chat-back" onClick={onBack}>
          <Icons.Back />
        </button>
        <div
          className="dm-avatar"
          style={{
            width: 32,
            height: 32,
            fontSize: 16,
            background: "linear-gradient(135deg, #6366f1, #ec4899)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {getAiAvatar()}
        </div>
        <span className="dm-chat-name">情感陪伴</span>
        <span className="dm-chat-lock" style={{ fontSize: 11, color: "var(--text-muted)" }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: isTyping ? "#f59e0b" : "#22c55e",
              marginRight: 4,
              boxShadow: `0 0 6px ${isTyping ? "#f59e0b" : "#22c55e"}`,
            }}
          />
          {isTyping ? "思考中" : "在线"}
        </span>
        <button
          onClick={handleClear}
          title="清空记忆"
          style={{
            marginLeft: "auto",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: "4px 8px",
            borderRadius: 8,
            color: "var(--text-muted)",
            fontSize: 14,
          }}
        >
          🗑
        </button>
      </div>

      {/* 统计条 */}
      {stats.conversationCount > 0 && (
        <div
          style={{
            padding: "6px 16px",
            background: "var(--bg2)",
            borderBottom: "1px solid var(--border)",
            fontSize: 11,
            color: "var(--text-muted)",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span>💬 已聊 {stats.conversationCount} 句</span>
          {stats.preferencesCount > 0 && <span>💕 记住 {stats.preferencesCount} 个喜好</span>}
          <span>🌱 端侧运行</span>
        </div>
      )}

      <div className="dm-chat-messages" ref={messagesContainerRef}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`dm-msg ${msg.role === "user" ? "sent" : "received"}`}
          >
            {msg.content || ""}
            <div className="dm-msg-meta">
              <span className="dm-msg-time">
                {new Date().toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {msg.role === "assistant" && msg.emotion && (
                <span className="dm-msg-lock" style={{ marginLeft: 4, fontSize: 10 }}>
                  {msg.emotion === "happy" && "😊"}
                  {msg.emotion === "sad" && "�"}
                  {msg.emotion === "angry" && "💪"}
                  {msg.emotion === "anxious" && "🌿"}
                  {msg.emotion === "lonely" && "💜"}
                  {msg.emotion === "tired" && "🌙"}
                  {msg.emotion === "calm" && "🌱"}
                  {msg.emotion === "miss" && "✨"}
                </span>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="dm-msg received">
            <div className="typing-indicator">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      <div className="dm-chat-input">
        <textarea
          ref={inputRef}
          className="dm-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="和我说说心里话..."
          rows={1}
          onKeyDown={handleKeyDown}
          disabled={isTyping}
        />
        <button
          className="dm-send-btn"
          onClick={handleSend}
          disabled={isTyping || !input.trim()}
        >
          {isTyping ? "..." : "↑"}
        </button>
      </div>

      <style>{`
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
      `}</style>
    </div>
  );
}
