import React, { useState, useCallback } from "react";
import { supabase } from "../supabase";
import { useAuth, ACCENT_COLORS } from "../context/AuthContext";
import { useHonors } from "../context/HonorsContext";
import { createKeyBackup } from "../crypto";
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

export default function SettingsPage({ onBack, onOpenHonors }) {
  const { user, colorMode, setColorMode, glassMode, setGlassMode, fontSize, setFontSize,
    styleMode, setStyleMode, paletteMode, setPaletteMode, accentColor, setAccentColor,
    logout, dmPrivacy, dmKey, updateDmPrivacy, keyPair } = useAuth();
  const honors = useHonors();

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
    try {
      // T2.3：改密码必须走服务端 RPC（校验旧 bcrypt 哈希 + cost12 重算 +
      // 用新密码重新包裹 encPriv）。旧实现读写已删除的 users.password 明文列，
      // 必然失败，且提示误导性的"旧密码错误"；即便改了哈希，不重包备份也会
      // 导致跨设备登录后无法解密历史私信。
      const newEncPriv = keyPair?.privateKey
        ? await createKeyBackup(user.username, newPw, keyPair.privateKey)
        : null;
      const { error } = await supabase.rpc("change_password", {
        p_old_password: oldPw,
        p_new_password: newPw,
        p_new_enc_priv: newEncPriv,
      });
      if (error) {
        const msg = String(error.message || "");
        if (/function|schema cache|PGRST202|does not exist|Could not find/i.test(msg)) {
          setPwError("服务端安全功能尚未启用：请在 Supabase 控制台执行 migrations/v11_security.sql 后重试");
        } else if (/old|密码|password|invalid|不匹配/i.test(msg)) {
          setPwError("旧密码不正确");
        } else {
          setPwError("修改失败：" + (msg || "请稍后重试"));
        }
        setPwLoading(false);
        return;
      }
      setPwSuccess("密码修改成功");
      setOldPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => { setPwModalOpen(false); setPwSuccess(""); }, 1500);
    } catch (e) {
      setPwError("修改失败：" + (e?.message || "网络错误"));
    }
    setPwLoading(false);
  }, [user, oldPw, newPw, confirmPw, keyPair]);

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
          label="界面风格"
          hint="经典版实用易读；编辑部版偏艺术排版，作为新版本保留，可随时切回"
          value={styleMode}
          options={[
            { value: "default", label: "经典版", icon: "🫧" },
            { value: "editorial", label: "编辑部版", icon: "📰" },
          ]}
          onChange={setStyleMode}
        />
        {/* 颜色模式全局生效：经典版与编辑部版都可在此切换深/浅，侧栏不再放重复开关 */}
        <SegRow
          label="颜色模式"
          hint={styleMode === "editorial" ? "米白纸感(浅色) / 墨色纸张(深色)，编辑部版同样生效" : "深色 / 浅色配色"}
          value={colorMode}
          options={[
            { value: "dark", label: "深色", icon: "🌙" },
            { value: "light", label: "浅色", icon: "☀️" },
          ]}
          onChange={setColorMode}
        />
        {styleMode === "editorial" ? (
          <div className="settings-row">
            <div className="settings-row-label">
              <span className="settings-row-name">外观提示</span>
              <span className="settings-row-hint">编辑部版使用独立纸感排版，配色主题 / 玻璃效果 / 主题色仅在「经典版」下生效</span>
            </div>
          </div>
        ) : (
          <>
            <SegRow
              label="配色主题"
              hint="复古暖调(纸质编辑部) / 现代蓝绿(清爽数字风),首次访问默认复古暖调"
              value={paletteMode}
              options={[
                { value: "vintage", label: "复古暖调", icon: "📜" },
                { value: "modern", label: "现代蓝绿", icon: "💧" },
              ]}
              onChange={(v) => { setPaletteMode(v); if (colorMode !== "light") setColorMode("light"); }}
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
            <div className="settings-row settings-row-stack">
              <div className="settings-row-label">
                <span className="settings-row-name">主题色</span>
                <span className="settings-row-hint">默认「跟随主题」；选一个颜色可全局替换强调色（按钮、边框、渐变、光晕）</span>
              </div>
              <div className="theme-color-row">
                <button
                  className={`theme-color-dot ${accentColor === "green" ? "on" : ""}`}
                  style={{ background: "linear-gradient(135deg,#10b981,#B64B32)" }}
                  title="跟随主题"
                  aria-label="跟随主题"
                  onClick={() => setAccentColor("green")}
                />
                {Object.entries(ACCENT_COLORS).map(([key, c]) => (
                  <button key={key}
                    className={`theme-color-dot ${accentColor === key ? "on" : ""}`}
                    style={{ background: c.accent }}
                    title={c.label}
                    aria-label={c.label}
                    onClick={() => setAccentColor(key)} />
                ))}
              </div>
            </div>
          </>
        )}
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

      {/* ─── 功能：STG 荣誉体系（opt-in，默认关闭）─── */}
      <div className="settings-section">
        <div className="settings-section-title">功能</div>
        <div className="settings-row honors-toggle-row">
          <div className="settings-row-label">
            <span className="settings-row-name">STG 荣誉体系 <span className="honors-beta">可选</span></span>
            <span className="settings-row-hint">按发帖、回复与社区认可累计等级和徽章；默认关闭，关闭时不采集任何成长数据</span>
          </div>
          <button
            className={`honors-switch ${honors.enabled ? "on" : ""}`}
            role="switch"
            aria-checked={honors.enabled}
            aria-label="STG 荣誉体系开关"
            onClick={() => honors.setEnabled(!honors.enabled)}
          >
            <span className="honors-switch-knob" />
            <span className="honors-switch-text">{honors.enabled ? "已开启" : "已关闭"}</span>
          </button>
        </div>
        <div className="honors-switch-note">
          仅公开等级与已获徽章；积分流水、行为明细、最后活跃日期不公开。私信与群聊内容永不参与计算。
        </div>
        {honors.enabled && (
          <>
            {honors.ready === null && honors.loading && (
              <div className="honors-notice">正在连接荣誉服务…</div>
            )}
            {honors.ready === false && (
              <div className="honors-notice">
                服务端尚未启用该功能：站点管理员需在 Supabase SQL Editor 执行一次
                <code> migrations/v12_honors.sql </code>。在此之前网站其余功能完全不受影响。
              </div>
            )}
            {honors.ready === true && (
              <>
                {!user && <div className="honors-notice">当前为访客浏览，登录后才会开始记录成长值。</div>}
                {onOpenHonors && (
                  <button className="settings-action" onClick={onOpenHonors}>
                    <span className="settings-action-icon">✦</span> 查看荣誉中心 / 成就图鉴
                    <span className="settings-action-arrow">›</span>
                  </button>
                )}
              </>
            )}
          </>
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
