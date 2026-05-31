import React, { useRef, useCallback } from "react";
import { useAuth } from "../context/AuthContext";

export default function ComposeBar({ value, onChange, onPublish }) {
  const { user } = useAuth();
  const textareaRef = useRef(null);

  const handlePublish = useCallback(() => {
    onPublish();
    textareaRef.current?.focus();
  }, [onPublish]);

  if (!user) return null;

  return (
    <div className="compose-bar">
      <div className="compose-avatar">{user.username[0]}</div>
      <div className="compose-input">
        <textarea
          ref={textareaRef}
          className="compose-textarea"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="有什么新鲜事？"
          rows={2}
        />
        <div className="compose-bottom">
          <div className="compose-tools">
            <button className="compose-tool">📷</button>
            <button className="compose-tool">😊</button>
          </div>
          <button className="compose-submit" onClick={handlePublish} disabled={!value.trim()}>发帖</button>
        </div>
      </div>
    </div>
  );
}
