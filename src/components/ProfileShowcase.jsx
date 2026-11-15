import React, { useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useHonors } from "../context/HonorsContext";
import { useGrowth } from "../context/GrowthContext";
import { showToast } from "../utils";
import { ACHIEVEMENT_MAP } from "../honors";
import { compressImage, MAX_FEATURED, UPLOAD_LEVEL, quotaMessage } from "../growth";
import { LevelChip } from "./HonorBadge";
import HonorEmblem from "./HonorEmblem";
import { IdentityMarks } from "./IdentityMark";

// 第一级入口：个人主页。把「等级 / 认证 / 头像背景 / 5 枚徽章」集中在一个专属区块，
// 荣誉中心内部再分级承载详细内容，避免两套体系互相堆叠。
export default function ProfileShowcase({
  username, isMe = false, bio = "", stats = null, actions = null, onPickBadges,
}) {
  const { user } = useAuth();
  const honors = useHonors();
  const growth = useGrowth();
  const [uploading, setUploading] = useState("");
  const avatarInput = useRef(null);
  const bannerInput = useRef(null);

  const identity = growth.identityOf(username) || honors.growthOf(username) || {};
  const level = Number(identity.level || 0) || 1;
  const badges = (honors.enabled ? honors.badgesOf(username) : []).slice(0, MAX_FEATURED);
  const remoteImgs = growth.imagesOf(username) || {};
  const ownImgs = isMe && growth.state ? {
    avatar_url: growth.state.avatar_url, banner_url: growth.state.banner_url,
  } : {};
  const avatar = remoteImgs.avatar_url || ownImgs.avatar_url || "";
  const banner = remoteImgs.banner_url || ownImgs.banner_url || "";

  const canUpload = !!(isMe && growth.ready === true && growth.state?.can_upload);
  const showUploadHint = isMe && growth.ready === true && growth.state && !canUpload;

  const handleFile = async (kind, file) => {
    if (!file) return;
    setUploading(kind);
    try {
      const out = await compressImage(file);
      const res = await growth.setImage(kind, out.dataUrl);
      if (res.error) showToast(quotaMessage(res.error), 3600);
      else showToast(`✅ 已上传并压缩到 ${(out.bytes / 1024).toFixed(0)}KB`, 2600);
    } catch (e) {
      showToast(String(e?.message || "图片处理失败"), 3200);
    }
    setUploading("");
  };

  const bannerStyle = banner
    ? { backgroundImage: `url("${banner}")`, backgroundSize: "cover", backgroundPosition: "center" }
    : undefined;

  return (
    <>
      <div className="profile-header">
        <div className="profile-banner" style={bannerStyle}>
          {canUpload && (
            <button className="img-edit img-edit-banner" onClick={() => bannerInput.current?.click()}
              title="上传主页背景图（自动压缩至 200KB 以内）">
              {uploading === "banner" ? "处理中…" : "更换背景"}
            </button>
          )}
        </div>
        <div className="profile-info">
          <div className="profile-avatar" style={avatar ? { backgroundImage: `url("${avatar}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
            {!avatar && String(username || "?").slice(0, 1).toUpperCase()}
            {canUpload && (
              <button className="img-edit img-edit-avatar" onClick={() => avatarInput.current?.click()}
                title="上传头像（自动压缩至 200KB 以内）" aria-label="上传头像">
                {uploading === "avatar" ? "…" : "＋"}
              </button>
            )}
          </div>
          <div className="profile-name">
            {username}
            <IdentityMarks identity={identity} size={16} />
            <LevelChip level={level} compact />
          </div>
          <div className="profile-handle">@{username}</div>
          <div className="profile-bio">{bio || "STGBLOG 用户 · 加密社交"}</div>
          {stats}
          {actions}
          {showUploadHint && (
            <div className="showcase-lock">🖼 自定义头像与主页背景将在 Lv.{UPLOAD_LEVEL} 解锁（当前 Lv.{level}）</div>
          )}
        </div>
      </div>

      <section className="showcase" aria-label="徽章展示">
        <div className="showcase-head">
          <div>
            <b>徽章展示</b>
            <span>{badges.length} / {MAX_FEATURED} 展示位</span>
          </div>
          {isMe && onPickBadges && honors.enabled && (
            <button className="showcase-manage" onClick={onPickBadges}>管理 ›</button>
          )}
        </div>
        <div className="showcase-slots">
          {Array.from({ length: MAX_FEATURED }, (_, k) => {
            const code = badges[k];
            const a = code ? ACHIEVEMENT_MAP[code] : null;
            if (!a) {
              return isMe && onPickBadges && honors.enabled
                ? <button key={k} className="showcase-slot empty" aria-label="添加徽章" onClick={onPickBadges}>＋</button>
                : <span key={k} className="showcase-slot empty static" aria-label="空展示位">＋</span>;
            }
            return (
              <button key={k} className={`showcase-slot filled rarity-${a.rarity}`}
                title={`${a.name} · ${a.desc}`} aria-label={`${a.name} 徽章`}
                onClick={isMe && onPickBadges ? onPickBadges : undefined}>
                <HonorEmblem achievement={a} size={62} />
              </button>
            );
          })}
        </div>
        <p>{isMe ? "别人打开你的主页时会看到这些徽章，最多 5 枚。在荣誉中心可随时更换。" : "这里的徽章由对方在荣誉中心挑选展示。"}</p>
      </section>

      {isMe && (
        <>
          <input ref={avatarInput} type="file" accept="image/*" hidden
            onChange={(e) => { handleFile("avatar", e.target.files?.[0]); e.target.value = ""; }} />
          <input ref={bannerInput} type="file" accept="image/*" hidden
            onChange={(e) => { handleFile("banner", e.target.files?.[0]); e.target.value = ""; }} />
        </>
      )}
    </>
  );
}
