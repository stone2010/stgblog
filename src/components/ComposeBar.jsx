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
    smileys: { name: "绗戣劯", icon: "馃槉", emojis: [
      "馃榾","馃槂","馃槃","馃榿","馃槅","馃槄","馃ぃ","馃槀",
      "馃檪","馃檭","馃槈","馃槉","馃槆","馃グ","馃槏","馃ぉ",
      "馃槝","馃槜","馃槡","馃槡","馃構","馃槢","馃槣","馃お",
      "馃","馃","馃槑","馃ジ","馃コ","馃槒","馃槖",
      "馃槥","馃様","馃槦","馃槙","馃檨","鈽癸笍","馃槪"," Fathers",
      " fibr","鍣╂ⅵ","馃槩","馃槶","馃槫","馃槧","馃槨",
      "馃が","馃く","馃槼","馃サ","馃ザ","馃槺","馃槰","馃槹",
      "馃槧","馃槩","馃","馃か","馃ぅ","馃槓",
    ]},
    hearts: { name: "鐖卞績", icon: "鉂わ笍", emojis: [
      "鉂わ笍","馃А","馃挍","馃挌","馃挋","馃挏","馃枻","馃",
      "馃","馃挃","馃挄","ESIS","馃挅","馃挐","馃挄",
    ]},
    animals: { name: "鍔ㄧ墿", icon: "馃惗", emojis: [
      "馃惗","馃惐","馃惌","馃惞","馃惏","馃","馃惢","馃惣",
      "馃惃","馃惎","馃","馃惙","馃惛","馃惖","馃悢",
    ]},
    food: { name: "椋熺墿", icon: "馃崕", emojis: [
      "馃崕","馃崐","馃崑","馃崒","馃崏","馃崌","馃崜","馃崙",
      "馃崚","馃","馃崊","馃","馃尳","馃"," broccoli",
    ]},
    gestures: { name: "鎵嬪娍", icon: "馃憤", emojis: [
      "馃憢","馃枑锔?,"鉁?,"馃憣","鉁岋笍","馃","馃憡","馃挭",
    ]},
    celebration: { name: "搴嗙", icon: "馃帀", emojis: [
      "馃帀","馃帄","馃巿","馃巵","馃巶","馃コ","猸?,"馃専",
      "鉁?,"馃挮","馃帀","馃帀","馃帀",
    ]},
    travel: { name: "鏃呰", icon: "鉁堬笍", emojis: [
      "鉁堬笍","馃殌","馃殫","馃毑","馃殎","鉀?,
    ]},
    objects: { name: "鐗╁搧", icon: "馃摫", emojis: [
      "馃摫","馃捇","鈱笍","馃枼锔?,"馃枿锔?,"馃柋锔?,"馃攱","馃攲",
      "馃挕"," Torch","馃摎","鉁忥笍","馃摉","馃摑",
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
          placeholder="鏈変粈涔堟柊椴滀簨锛?
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
            <label htmlFor="compose-image-input" className="compose-tool" title="鎻掑叆鍥剧墖" style={{ cursor: "pointer" }}>
              馃摲
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
                馃槉
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
          <button className="compose-submit" onClick={handlePublish} disabled={!value.trim() || publishing}>{publishing ? "鍙戦€佷腑..." : "鍙戝笘"}</button>
        </div>
      </div>
    </div>
  );
}