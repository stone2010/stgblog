import React, { memo } from "react";
import { formatTime } from "../utils";

const NotificationItem = memo(function NotificationItem({ notif, onClick }) {
  const icon = notif.type === "like" ? "❤️" : notif.type === "comment" ? "💬" : notif.type === "reply" ? "↩️" : "👤";
  const text = notif.type === "like" ? "赞了你的帖子"
    : notif.type === "comment" ? "评论了你的帖子"
    : notif.type === "reply" ? "回复了你的评论"
    : "关注了你";
  return (
    <div className={`notif-item ${notif.read ? "" : "unread"}`} onClick={() => onClick(notif)}>
      <div className="notif-icon">{icon}</div>
      <div className="notif-body">
        <span className="notif-from">{notif.user_from}</span>
        <span className="notif-text">{text}</span>
        <span className="notif-time">{formatTime(notif.created_at)}</span>
      </div>
      {!notif.read && <div className="notif-dot" />}
    </div>
  );
});

export default NotificationItem;
