import React, { useRef, useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function ComposeBar({ value, onChange, onPublish, publishing, composeRef }) {
  const { user } = useAuth();
  const textareaRef = useRef(null);
  const emojiWrapperRef = useRef(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [activeCategory, setActiveCategory] = useState("smileys");
  const [emojiPos, setEmojiPos] = useState(null);

  const handlePublish = useCallback(() => {
    onPublish();
    textareaRef.current?.focus();
  }, [onPublish]);

  if (!user) return null;

  const charCount = value.length;
  const charClass = charCount > 1800 ? "over" : charCount > 1500 ? "warn" : "";

  const emojiCategories = {
    smileys: { name: "笑脸", icon: "😊", emojis: [
      "😀","😃","😄","😁","😆","😅","🤣","😂",
      "🙂","🙃","😉","😊","😇","🥰","😍","🤩",
      "😘","😗","😚","😋","😛","😜","🤪","😝",
      "🤭","🤫","🤔","😐","😑","😶","🙄","😏",
      "😣","😥","😢","😭","😤","😠","😡","🤬",
      "😈","👿","👹","👺","🤡","💩","👻","👽",
      "👾","🤖","🎃","😺","😸","😹","😻","😼",
      "😽","🙀","😿","😾"
    ]},
    hearts: { name: "爱心", icon: "❤️", emojis: [
      "❤️","🧡","💛","💚","💙","💜","🖤","🤍",
      "🤎","💔","❣️","💕","💞","💓","💗","💖",
      "💘","💝","💌","💋","💌","💤","💦","💨",
    ]},
    animals: { name: "动物", icon: "🐶", emojis: [
      "🐶","🐱","🐭","🐹","🐰","🦊","🐻","🐼",
      "🐨","🐯","🦁","🐮","🐷","🐸","🐵","🐔",
    ]},
    food: { name: "食物", icon: "🍎", emojis: [
      "🍎","🍊","🍋","🍌","🍉","🍇","🍓","🍑",
      "🍒","🥝","🍅","🥑","🌽","🥕","🥦",
    ]},
    gestures: { name: "手势", icon: "👍", emojis: [
      "👋","🖐️","✋","👌","✌️","🤞","👊","💪",
    ]},
    celebration: { name: "庆祝", icon: "🎉", emojis: [
      "🎉","🎊","🎈","🎁","🎂","🥳","⭐","🌟",
      "✨","💫","🎉","🎉","🎉",
    ]},
    travel: { name: "旅行", icon: "✈️", emojis: [
      "✈️","🚀","🚗","🚲","🚁","⛵",
    ]},
    objects: { name: "物品", icon: "📱", emojis: [
      "📱","💻","⌨️","🖥️","🖨️","🖱️","🔋","🔌",
      "💡","🔦","📚","✏️","📖","📝",
    ]}
  };

  const insertEmoji = (emoji) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    const newValue =
      value.slice(0, start) +
      emoji +
      value.slice(end);

    onChange(newValue);

    setTimeout(() => {
      textarea.focus();
      const pos = start + emoji.length;
      textarea.selectionStart = pos;
      textarea.selectionEnd = pos;
    }, 0);

    setShowEmoji(false);
  };

  return (
    <div className="compose-bar">
      <div className="compose-avatar">{user.username[0]}</div>
      <div className="compose-input">
        <textarea
          ref={(el) => { textareaRef.current = el; if (composeRef) composeRef.current = el; }}
          className="compose-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="有什么新鲜事？"
          rows={2}
          maxLength={2000}
        />
        <div className="compose-bottom">
          <div className="compose-tools">
            <input
              type="file"
              accept="image/*"
              id="compose-image-input"
              style={{ display: "none" }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  const reader = new FileReader();
                  reader.onload = (ev) => {
                    const img = document.createElement("img");
                    img.src = ev.target.result;
                    img.onload = () => {
                      const canvas = document.createElement("canvas");
                      const maxW = 800;
                      let w = img.width, h = img.height;
                      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
                      canvas.width = w; canvas.height = h;
                      const ctx = canvas.getContext("2d");
                      ctx.drawImage(img, 0, 0, w, h);
                      const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
                      const placeholder = `\n![${file.name}](${dataUrl})\n`;
                      const textarea = textareaRef.current;
                      const start = textarea.selectionStart;
                      const newValue = value.slice(0, start) + placeholder + value.slice(start);
                      onChange(newValue);
                      setTimeout(() => {
                        textarea.focus();
                        textarea.selectionStart = textarea.selectionEnd = start + placeholder.length;
                      }, 0);
                    };
                  };
                  reader.readAsDataURL(file);
                  e.target.value = "";
                }
              }}
            />
            <label htmlFor="compose-image-input" className="compose-tool" title="插入图片" style={{ cursor: "pointer" }}>
              📷
            </label>

            <div className="emoji-trigger-wrapper" ref={emojiWrapperRef}>
              <button
                className={`compose-tool emoji-trigger ${showEmoji ? 'active' : ''}`}
                type="button"
                onClick={(e) => {
                  if (!showEmoji) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setEmojiPos({ x: rect.left, y: rect.top });
                  }
                  setShowEmoji(v => !v);
                }}
              >
                😊
              </button>
              {showEmoji && emojiPos && (
                <div
                  className="emoji-picker"
                  style={{ top: emojiPos.y, left: emojiPos.x }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="emoji-categories">
                    {Object.entries(emojiCategories).map(([key, category]) => (
                      <button
                        key={key}
                        className={`emoji-category-btn ${activeCategory === key ? 'active' : ''}`}
                        onClick={() => setActiveCategory(key)}
                        title={category.name}
                      >
                        {category.icon}
                      </button>
                    ))}
                  </div>
                  <div className="emoji-grid">
                    {emojiCategories[activeCategory].emojis.map((emoji, index) => (
                      <button
                        key={index}
                        className="emoji-item"
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {charCount > 0 && <span className={`char-counter ${charClass}`}>{charCount}/2000</span>}
          </div>
          <button className="compose-submit" onClick={handlePublish} disabled={!value.trim() || publishing}>{publishing ? "发送中..." : "发帖"}</button>
        </div>
      </div>
    </div>
  );
}