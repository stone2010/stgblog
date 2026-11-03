import React, { useState, useCallback } from "react";
import { supabase } from "../supabase";
import { useAuth, ACCENT_COLORS } from "../context/AuthContext";
import { Icons } from "./Icons";

// ─── 分段选择器行 ───
function SegRow({ label, hint, value, options, onChange }) {
  return (
    <div className="settings-row">
      <div className="settings-row-label">
        <span className="settings-row-name">{label}</span>
        {hint && <span className="settings-row-hint">{hint}</span>}
      </div>
      <div className="seg-bar settings-seg">
        {options.map((opt) => (
          <button key={opt.value} className={`seg ${value === opt.value ? "on" : ""}`} onClick={() => onChange(opt.value)}>
            {opt.icon && <span className="settings-seg-icon">{opt.icon}</span>}
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SettingsPage({ onBack }) {
  const { user, colorMode, setColorMode, glassMode, setGlassMode, fontSize, setFontSize, accentColor, setAccentColor,
    logout, dmPrivacy, dmKey, updateDmPrivacy } = useAuth();

  // 修改密码（自个人主页迁入）
  const [pwModalOpen, setPwModalOpen] = useState(false);
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSuccess, setPwSuccess] = useState("");
  const [pwLoading, setPwLoading] = useState(false);

  const [dmKeyCopied, setDmKeyCopied] = useState(false);

  const handleChangePassword = useCallback(async () => {
    setPwError("");
    setPwSuccess("");
    if (!oldPw) { setPwError("请输入旧密码"); return; }
    if (!newPw || newPw.length < 6) { setPwError("新密码至少6位"); return; }
    if (newPw !== confirmPw) { setPwError("两次输入的新密码不一致"); return; }
    setPwLoading(true);
    const { data, error } = await supabase.from("users")
      .select("username")
      .eq("username", user.username)
      .eq("password", oldPw)
      .maybeSingle();
    if (error || !data) {
      setPwError("旧密码错误");
      setPwLoading(false);
      return;
    }
    const { error: updateErr } = await supabase.from("users")
      .update({ password: newPw })
      .eq("username", user.username)
      .eq("password", oldPw);
    if (updateErr) {
      setPwError("修改失败，请重试");
    } else {
      setPwSuccess("密码修改成功");
      setOldPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => { setPwModalOpen(false); setPwSuccess(""); }, 1500);
    }
    setPwLoading(false);
  }, [user, oldPw, newPw, confirmPw]);

  const handleCopyDmKey = useCallback(() => {
    if (dmKey) {
      navigator.clipboard?.writeText(dmKey);
      setDmKeyCopied(true);
      setTimeout(() => setDmKeyCopied(false), 2000);
    }
  }, [dmKey]);

  return (
    <div className="settings-page">
      <div className="detail-top">
        {onBack && <button className="detail-back" onClick={onBack}><Icons.Back /></button>}
        <span className="detail-top-title">设置</span>
      </div>

      {/* ─── 外观 ─── */}
      <div className="settings-section">
        <div className="settings-section-title">外观</div>
        <SegRow
          label="颜色模式"
          hint="深色 / 浅色配色"
          value={colorMode}
          options={[
            { value: "dark", label: "深色", icon: "🌙" },
            { value: "light", label: "浅色", icon: "☀️" },
          ]}
          onChange={setColorMode}
        />
        <SegRow
          label="玻璃效果"
          hint="液态玻璃材质 或 经典实底"
          value={glassMode}
          options={[
            { value: "glass", label: "液态玻璃", icon: "🫧" },
            { value: "classic", label: "经典普通", icon: "◆" },
          ]}
          onChange={setGlassMode}
        />
        <SegRow
          label="字号"
          hint="全局界面文字大小"
          value={fontSize}
          options={[
            { value: "sm", label: "小" },
            { value: "md", label: "标准" },
            { value: "lg", label: "大" },
          ]}
          onChange={setFontSize}
        />
        <div className="settings-row">
          <div className="settings-row-label">
            <span className="settings-row-name">主题色</span>
            <span className="settings-row-hint">按钮、链接、高亮将跟随所选强调色</span>
          </div>
          <div className="theme-color-row">
            {Object.entries(ACCENT_COLORS).map(([key, c]) => (
              <button
                key={key}
                className={`theme-color-dot ${accentColor === key ? "on" : ""}`}
                style={{ background: c.accent }}
                onClick={() => setAccentColor(key)}
                title={c.label}
                aria-label={`主题色：${c.label}`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ─── 私信 ─── */}
      {user && (
        <div className="settings-section">
          <div className="settings-section-title">私信</div>
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-name">谁能私信我</span>
            </div>
            <div className="seg-bar settings-seg">
              <button className={`seg ${dmPrivacy === "open" ? "on" : ""}`} onClick={() => updateDmPrivacy("open")}>任何人</button>
              <button className={`seg ${dmPrivacy === "key_required" ? "on" : ""}`} onClick={() => updateDmPrivacy("key_required")}>需要密钥</button>
            </div>
            {dmPrivacy === "key_required" && dmKey && (
              <div className="dm-key-display">
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>你的私信密钥：</span>
                <div className="group-invite-code" style={{ marginTop: 4 }}>
                  <code>{dmKey}</code>
                  <button className="group-copy-btn" onClick={handleCopyDmKey}>{dmKeyCopied ? "已复制" : "复制"}</button>
                </div>
                <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>分享此密钥给你信任的人，他们才能给你发私信</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── 账号 ─── */}
      <div className="settings-section">
        <div className="settings-section-title">账号</div>
        {user ? (
          <>
            <button className="settings-action" onClick={() => { setOldPw(""); setNewPw(""); setConfirmPw(""); setPwError(""); setPwSuccess(""); setPwModalOpen(true); }}>
              <span className="settings-action-icon">🔑</span> 修改密码
              <span className="settings-action-arrow">›</span>
            </button>
            <button className="settings-action settings-action-danger" onClick={logout}>
              <span className="settings-action-icon">🚪</span> 退出登录
              <span className="settings-action-arrow">›</span>
            </button>
          </>
        ) : (
          <div className="settings-empty">登录后可管理账号选项</div>
        )}
      </div>

      <p className="settings-footer">STGBLOG 设置即时生效，并在本设备记住你的偏好</p>

      {/* ─── 修改密码弹窗 ─── */}
      {pwModalOpen && (
        <div className="auth-overlay" onClick={() => { setPwModalOpen(false); setPwError(""); setPwSuccess(""); }}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 380 }}>
            <div className="auth-top">
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>修改密码</h3>
              <button className="auth-close" onClick={() => { setPwModalOpen(false); setPwError(""); setPwSuccess(""); }}>✕</button>
            </div>
            <div className="auth-body" style={{ paddingTop: 16 }}>
              <input className="auth-input" type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} placeholder="旧密码" autoFocus />
              <input className="auth-input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="新密码" />
              <input className="auth-input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="确认新密码"
                onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword(); }} />
              {pwError && <div className="auth-err">{pwError}</div>}
              {pwSuccess && <div style={{ padding: "10px 14px", background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 8, color: "var(--green)", fontSize: 12, marginBottom: 8 }}>{pwSuccess}</div>}
              <button className="auth-btn" onClick={handleChangePassword} disabled={pwLoading}>{pwLoading ? "修改中..." : "修改密码"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
