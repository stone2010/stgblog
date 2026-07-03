import React, { useRef, useCallback ,useState} from "react";
import { useAuth } from "../context/AuthContext";

export default function ComposeBar({ value, onChange, onPublish, publishing, composeRef }) {
  const { user } = useAuth();
  const textareaRef = useRef(null);
  const [showEmoji, setShowEmoji] = useState(false);

  const handlePublish = useCallback(() => {
    onPublish();
    textareaRef.current?.focus();
  }, [onPublish]);

  if (!user) return null;

  const charCount = value.length;
  const charClass = charCount > 1800 ? "over" : charCount > 1500 ? "warn" : "";

  const emojis = [
  "😂", "🤣", "😭", "😍", "🥰",
  "👍", "🔥", "❤️", "😎", "😡",
  "🎉", "🤔", "😴", "😈", "💩"];

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

  // ⭐ 等 React 更新 DOM
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
            <button className="compose-tool">📷</button>
            
            <button className="compose-tool" type="button" onClick={() => {console.log("emoji button clicked");setShowEmoji(v => !v);}}>😊</button> 
            {showEmoji && (<div className="emoji-panel">{emojis.map((e) => (<button key={e}type="button" onClick={() => insertEmoji(e)}>{e}</button>))}</div>)}
            {charCount > 0 && <span className={`char-counter ${charClass}`}>{charCount}/2000</span>}
          </div>
          <button className="compose-submit" onClick={handlePublish} disabled={!value.trim() || publishing}>{publishing ? "发送中..." : "发帖"}</button>
        </div>
      </div>
    </div>
  );
}
