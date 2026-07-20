import React, { useState, useEffect, useRef, useCallback } from "react";
import { Icons } from "./Icons";
import { LocalModelManager } from "../ai/inference";

const modelManager = new LocalModelManager();

modelManager.registerModel("tiny-llm", {
  dim: 128,
  numLayers: 4,
  numHeads: 4,
  maxLen: 256,
  hiddenDim: 512,
  dropout: 0.1,
});

export default function AIChatPage({ onBack }) {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "你好！我是内置的 AI 助手。我使用端侧 Transformer 架构运行在你的浏览器中，所有数据都不会上传到服务器。\n\n你可以问我任何问题，或者和我聊天！",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [modelStatus, setModelStatus] = useState("loading");
  const [loadingProgress, setLoadingProgress] = useState(0);
  const messagesContainerRef = useRef(null);

  useEffect(() => {
    const initModel = async () => {
      try {
        setModelStatus("loading");
        setLoadingProgress(0);

        const interval = setInterval(() => {
          setLoadingProgress((prev) => {
            if (prev >= 90) return 90;
            return prev + Math.random() * 10;
          });
        }, 500);

        await modelManager.loadModel("tiny-llm");

        clearInterval(interval);
        setLoadingProgress(100);
        setModelStatus("ready");
      } catch (error) {
        console.error("Failed to load model:", error);
        setModelStatus("error");
      }
    };

    initModel();
  }, []);

  const scrollToBottom = useCallback(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isTyping || modelStatus !== "ready") return;

    const userMessage = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: userMessage }]);
    setIsTyping(true);

    try {
      await modelManager.chatStream(
        [...messages, { role: "user", content: userMessage }],
        {
          maxLen: 150,
          temperature: 0.7,
          topK: 5,
        },
        (result) => {
          if (!result.done) {
            setMessages((prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.role === "assistant" && !lastMsg.final) {
                return [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: result.text, final: false },
                ];
              }
              return [...prev, { role: "assistant", content: result.text, final: false }];
            });
          } else {
            setMessages((prev) => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.role === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  { role: "assistant", content: result.text, final: true },
                ];
              }
              return prev;
            });
            setIsTyping(false);
          }
        }
      );
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "抱歉，我遇到了一些问题，请稍后再试。",
          final: true,
        },
      ]);
      setIsTyping(false);
    }
  }, [input, isTyping, modelStatus, messages]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  const getStatusColor = () => {
    switch (modelStatus) {
      case "ready":
        return "#22c55e";
      case "loading":
        return "#f59e0b";
      case "error":
        return "#ef4444";
      default:
        return "#6b7280";
    }
  };

  const getStatusText = () => {
    switch (modelStatus) {
      case "ready":
        return "在线";
      case "loading":
        return `加载中 ${Math.round(loadingProgress)}%`;
      case "error":
        return "出错";
      default:
        return "未知";
    }
  };

  if (modelStatus === "loading") {
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
              fontSize: 13,
              background: "linear-gradient(135deg, #6366f1, #ec4899)",
            }}
          >
            AI
          </div>
          <span className="dm-chat-name">AI 助手</span>
          <span
            className="dm-chat-lock"
            style={{ color: getStatusColor(), fontSize: 12 }}
          >
            {getStatusText()}
          </span>
        </div>
        <div className="dm-chat-messages" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div
              style={{
                width: 64,
                height: 64,
                margin: "0 auto 16px",
                borderRadius: "50%",
                background: "linear-gradient(135deg, #6366f1, #ec4899)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 28,
                animation: "pulse 2s ease-in-out infinite",
              }}
            >
              🤖
            </div>
            <div style={{ color: "var(--text-secondary)", fontSize: 14 }}>
              正在加载模型...
            </div>
            <div
              style={{
                width: 200,
                height: 4,
                marginTop: 12,
                background: "var(--border)",
                borderRadius: 2,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${loadingProgress}%`,
                  height: "100%",
                  background: "linear-gradient(90deg, #6366f1, #ec4899)",
                  transition: "width 0.3s ease",
                }}
              />
            </div>
          </div>
        </div>
        <div className="dm-chat-input">
          <textarea
            className="dm-input"
            value=""
            placeholder="模型加载中..."
            rows={1}
            disabled
            style={{ opacity: 0.5 }}
          />
          <button className="dm-send-btn" disabled>
            ↑
          </button>
        </div>
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.05); }
          }
        `}</style>
      </div>
    );
  }

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
            fontSize: 13,
            background: "linear-gradient(135deg, #6366f1, #ec4899)",
          }}
        >
          AI
        </div>
        <span className="dm-chat-name">AI 助手</span>
        <span className="dm-chat-lock" style={{ fontSize: 12 }}>
          <span
            style={{
              display: "inline-block",
              width: 8,
              height: 8,
              borderRadius: "50%",
              backgroundColor: getStatusColor(),
              marginRight: 4,
              boxShadow: `0 0 8px ${getStatusColor()}`,
            }}
          />
          {getStatusText()}
        </span>
      </div>

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
              {msg.role === "assistant" && (
                <span className="dm-msg-lock" style={{ marginLeft: 4 }}>
                  🤖
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
          className="dm-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="和 AI 助手聊天..."
          rows={1}
          onKeyDown={handleKeyDown}
          disabled={modelStatus !== "ready"}
        />
        <button
          className="dm-send-btn"
          onClick={handleSend}
          disabled={isTyping || !input.trim() || modelStatus !== "ready"}
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
