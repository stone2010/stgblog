import React, { useRef, useCallback, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { isAdmin } from "../utils";

export default function ComposeBar({ value, onChange, onPublish, publishing, composeRef, isAnnouncement, onAnnouncementChange }) {
  const { user } = useAuth();
  const textareaRef = useRef(null);
  const emojiTriggerRef = useRef(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [emojiDir, setEmojiDir] = useState("up"); // "up"=向上弹(默认) "down"=向下弹
  const [activeCategory, setActiveCategory] = useState("smileys");

  // 打开表情面板前测量触发按钮下方空间：够高(>460px)就向下弹，
  // 避免面板顶到页面顶部导航被遮挡（手机/电脑端均会出现）
  const toggleEmoji = useCallback(() => {
    setShowEmoji((v) => {
      const next = !v;
      if (next) {
        try {
          const rect = emojiTriggerRef.current?.getBoundingClientRect();
          const spaceBelow = window.innerHeight - (rect?.bottom ?? 0);
          setEmojiDir(spaceBelow > 460 ? "down" : "up");
        } catch { setEmojiDir("up"); }
      }
      return next;
    });
  }, []);

  const handlePublish = useCallback(() => {
    onPublish();
    textareaRef.current?.focus();
  }, [onPublish]);

  if (!user) return null;

  const charCount = value.length;
  const charClass = charCount > 1800 ? "over" : charCount > 1500 ? "warn" : "";

  const emojiCategories = {
    smileys: { name: "笑脸", icon: "😊", emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂",
      "🙂", "🙃", "😉", "😊", "😇", "🥰", "😍", "🤩",
      "😘", "😗", "😚", "😙", "😋", "😛", "😜", "🤪",
      "🤨", "🧐", "🤓", "😎", "🥸", "🥳", "😏", "😒",
      "😞", "😔", "😟", "😕", "🙁", "☹️", "😣", "😖",
      "😫", "😩", "🥺", "😢", "😭", "😤", "😠", "😡",
      "🤬", "🤯", "😳", "🥵", "🥶", "😱", "😨", "😰",
      "😥", "😓", "🤗", "🤔", "🤭", "🤫", "🤥", "😶"
    ]},
    hearts: { name: "爱心", icon: "❤️", emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍",
      "🤎", "💔", "❣️", "💕", "💞", "💓", "💗", "💖",
      "💘", "💝", "💟", "♥️", "💌", "💋", "👩‍❤️‍👨", "👨‍❤️‍👨",
      "👩‍❤️‍👩", "💑", "👫", "👭", "👬", "🏳️‍🌈"
    ]},
    animals: { name: "动物", icon: "🐶", emojis: [
      "🐶", "🐱", "🐭", "🐹", "🐰", "🦊", "🐻", "🐼",
      "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔",
      "🐧", "🐦", "🐤", "🐣", "🐥", "🦆", "🦅", "🦉",
      "🦇", "🐺", "🐗", "🐴", "🦄", "🐝", "🐛", "🦋",
      "🐌", "🐞", "🐜", "🪲", "🦟", "🦗", "🕷️", "🕸️",
      "🦂", "🐢", "🐍", "🦎", "🦖", "🦕", "🐙", "🦑",
      "🦐", "🦞", "🦀", "🐡", "🐠", "🐟", "🐬", "🦈",
      "🐳", "🐋", "🦭", "🐊", "🐅", "🐆", "🦓", "🦍"
    ]},
    food: { name: "食物", icon: "🍎", emojis: [
      "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓", "🍑",
      "🍒", "🥝", "🍅", "🥑", "🌽", "🥕", "🥦", "🥬",
      "🥒", "🌶️", "🫑", "🥜", "🍞", "🥐", "🥖", "🧀",
      "🍖", "🍗", "🥩", "🥓", "🍔", "🍟", "🍕", "🌭",
      "🌮", "🌯", "🥙", "🧆", "🥚", "🍳", "🥘", "🍲",
      "🥣", "🥗", "🍿", "🧈", "🧂", "🍱", "🍘", "🍙",
      "🍚", "🍛", "🍜", "🍝", "🍠", "🍢", "🍣", "🍤",
      "🍥", "🥮", "🥟", "🥠", "🥡", "🍦", "🍧", "🍨"
    ]},
    gestures: { name: "手势", icon: "👍", emojis: [
      "👋", "🤚", "🖐️", "🖖", "👌", "🤏", "✌️", "🤞",
      "🤟", "🤘", "🤙", "👈", "👉", "👆", "👇", "☝️",
      "✋", "👍", "👎", "✊", "👊", "🤛", "🤜", "🤝",
      "🙏", "✍️", "💅", "🤳", "💪", "🦾", "🦵", "🦿"
    ]},
    celebration: { name: "庆祝", icon: "🎉", emojis: [
      "🎉", "🎊", "🎈", "🎁", "🎀", "🎂", "🥳", "⭐",
      "🌟", "✨", "💫", "⚡", "💥", "🎆", "🎇", "🧨",
      "🔥", "🎵", "🎶", "🎤", "🎧", "🎸", "🎹", "🥁"
    ]},
    travel: { name: "旅行", icon: "✈️", emojis: [
      "✈️", "🚁", "🚀", "🚂", "🚃", "🚄", "🚅", "🚆",
      "🚇", "🚈", "🚉", "🚊", "🚝", "🚞", "🚋", "🚌",
      "🚍", "🚎", "🚐", "🚑", "🚒", "🚓", "🚔", "🚨",
      "🚗", "🚘", "🚙", "🚚", "🚛", "🚜", "🚲", "🛴",
      "🛵", "🛺", "🚡", "🚠", "🚟", "🚢", "⛵", "🚤"
    ]},
    objects: { name: "物品", icon: "📱", emojis: [
      "📱", "📲", "💻", "⌨️", "🖥️", "🖨️", "🖱️", "🖲️",
      "📡", "🔋", "🔌", "💡", "🔦", "🏮", "🕯️", "📔",
      "📢", "📣", "📯", "🔔", "🔕", "🎼", "🎵", "🎶",
      "🎤", "🎧", "📻", "🎹", "🥁", "🎸", "🎺", "🎻",
      "🎷", "🪕", "🎬", "🎮", "🎯", "🎲", "🎰", "🎳",
      "📷", "📸", "📹", "🎥", "📞", "☎️", "📟", "📠"
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
    <div className={`compose-bar ${showEmoji ? "picker-open" : ""}`}>
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
            <button className="compose-tool">📷</button>

            <div className="emoji-trigger-wrapper">
              <button
                className={`compose-tool emoji-trigger ${showEmoji ? 'active' : ''}`}
                type="button"
                ref={emojiTriggerRef}
                onClick={toggleEmoji}
              >
                😊
              </button>
              {showEmoji && (
                <div className={`emoji-picker emoji-${emojiDir}`}>
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
                        onMouseEnter={(e) => e.currentTarget.classList.add('hover')}
                        onMouseLeave={(e) => e.currentTarget.classList.remove('hover')}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {charCount > 0 && <span className={`char-counter ${charClass}`}>{charCount}/2000</span>}
            {isAdmin(user) && (
              <label className={`compose-ann-check ${isAnnouncement ? "on" : ""}`} title="选中后发布的帖子会作为公告推送给所有用户">
                <input
                  type="checkbox"
                  checked={!!isAnnouncement}
                  onChange={(e) => onAnnouncementChange?.(e.target.checked)}
                />
                <span className="compose-ann-icon">📢</span> 公告
              </label>
            )}
          </div>
          <button className="compose-submit" onClick={handlePublish} disabled={!value.trim() || publishing}>{publishing ? "发送中..." : "发帖"}</button>
        </div>
      </div>
    </div>
  );
}
