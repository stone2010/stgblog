import React, { useState, useEffect, useMemo, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { useHonors } from "../context/HonorsContext";
import { useGrowth } from "../context/GrowthContext";
import { MAX_FEATURED } from "../growth";
import { Icons } from "./Icons";
import HonorCard from "./HonorCard";
import HonorEmblem from "./HonorEmblem";
import HonorPopover from "./HonorPopover";
import { LevelChip } from "./HonorBadge";
import { IdentityMarks } from "./IdentityMark";
import GrowthTasks from "./GrowthTasks";
import VerifyPanel from "./VerifyPanel";
import {
  ACHIEVEMENTS, ACHIEVEMENT_MAP, CATEGORY_LABEL, RARITY, AVAILABLE_COUNT,
  XP_EVENT_LABELS, LEVELS, levelProgress, achievementPoints, achievementProgress,
} from "../honors";

function fmtTime(s) {
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}
function fmtDate(s) {
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
  } catch { return ""; }
}
function fmtMonth(s) {
  try {
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("zh-CN", { year: "numeric", month: "long" });
  } catch { return ""; }
}

// ─── 成就行：参考稿的「徽章 + 标题 + 图鉴分 + 描述 + 进度条 + 元信息」───────
function AchievementRow({ a, got, hidden, featured, progress, date, holders, compact, onOpen }) {
  const isUpcoming = !a.available;
  const name = hidden ? "隐藏成就" : a.name;
  const desc = hidden ? "继续探索，它会在解锁时现身" : a.desc;
  const pts = achievementPoints(a);
  return (
    <li className={`honors-row rarity-${a.rarity}${got ? " on" : ""}${isUpcoming ? " upcoming" : ""}${hidden ? " secret" : ""}`}>
      <button className="honors-item" onClick={() => onOpen(a.code)} aria-label={`查看 ${name} 详情`}>
        <span className="honors-item-badge">
          <HonorPopover achievement={a} got={!!got} hidden={hidden} date={date}
            holders={holders} progress={progress} featured={featured}>
            <HonorEmblem achievement={a} size={compact ? 52 : 60} locked={!got} hidden={hidden} />
          </HonorPopover>
        </span>
        <span className="honors-item-body">
          <span className="honors-item-top">
            <b>{name}</b>
            <span className={`honors-pts${got ? " got" : ""}`}>+{pts} 图鉴分</span>
          </span>
          <span className="honors-item-desc">{desc}</span>
          {!got && !hidden && !isUpcoming && progress && (
            <span className="honors-prog">
              <span className="honors-bar"><i style={{ width: `${progress.pct}%` }} /></span>
              <em>{progress.cur} / {progress.goal}</em>
            </span>
          )}
          {!compact && (
            <span className="honors-meta">
              <span className="honors-tag"><i />{RARITY[a.rarity].label}</span>
              <span>{CATEGORY_LABEL[a.category]}</span>
              {isUpcoming && <span>二期开放</span>}
              {got && date && <span>{fmtDate(date)} 解锁</span>}
              {got && featured && <span className="honors-pf">主页展示中</span>}
              {!got && !isUpcoming && !hidden && holders > 0 && <span>全站 {holders} 人已解锁</span>}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}

export default function HonorsPage({ onBack, initialTab }) {
  const { user } = useAuth();
  const {
    enabled, ready, loading, myGrowth, profiles, refresh,
    unlocked, unlockedCodes, featuredCodes, holderCounts, xpLog, setFeatured,
  } = useHonors();
  const growth = useGrowth();
  const [tab, setTab] = useState(() => (initialTab === "verify" || initialTab === "growth" || initialTab === "log" || initialTab === "board") ? initialTab : "badges");
  const [flt, setFlt] = useState("all");
  const [sheet, setSheet] = useState(null); // null | {type:"detail",code} | {type:"picker"}
  const [featErr, setFeatErr] = useState("");
  const [hintHidden, setHintHidden] = useState(false);
  const sheetRef = useRef(null);

  // 切换页签后内容重新从顶部开始，悬浮提示也重新出现
  useEffect(() => { setHintHidden(false); }, [tab]);
  const onFrameScroll = (e) => {
    if (!hintHidden && e.currentTarget.scrollTop > 20) setHintHidden(true);
  };

  useEffect(() => { if (enabled && ready) refresh(); }, [enabled, ready, refresh]);
  useEffect(() => { if (!enabled || ready === false) setSheet(null); }, [enabled, ready]);

  useEffect(() => {
    if (!sheet) return;
    const onKey = (e) => { if (e.key === "Escape") setSheet(null); };
    document.addEventListener("keydown", onKey);
    // 把焦点移入对话框即可（Esc / 读屏可用），不聚焦首个按钮，
    // 否则鼠标打开面板时会出现一整圈 focus-visible 描边。
    const t = setTimeout(() => {
      try { sheetRef.current?.focus(); } catch {}
    }, 60);
    return () => { document.removeEventListener("keydown", onKey); clearTimeout(t); };
  }, [sheet]);

  const board = useMemo(() => Object.values(profiles)
    .filter((p) => p.honors_enabled)
    .sort((a, b) => Number(b.total_xp || 0) - Number(a.total_xp || 0))
    .slice(0, 10), [profiles]);

  const unlockedAt = useMemo(() => {
    const m = {};
    unlocked.forEach((r) => { if (r && r.code) m[r.code] = r.unlocked_at; });
    return m;
  }, [unlocked]);

  const unlockedCount = unlocked.filter((r) => ACHIEVEMENT_MAP[r.code]?.available).length;
  const totalPoints = unlocked.reduce((s, r) => {
    const a = ACHIEVEMENT_MAP[r.code];
    return a && a.available ? s + achievementPoints(a) : s;
  }, 0);
  const completionPct = Math.round((unlockedCount / AVAILABLE_COUNT) * 100);

  const featuredOrder = useMemo(
    () => Array.from(featuredCodes).filter((c) => ACHIEVEMENT_MAP[c]).slice(0, MAX_FEATURED),
    [featuredCodes]
  );
  const pickList = useMemo(
    () => ACHIEVEMENTS.filter((a) => a.available && unlockedCodes.has(a.code)),
    [unlockedCodes]
  );

  const rowState = makeRowState(unlockedCodes, featuredCodes, unlockedAt, holderCounts, myGrowth);
  const closest = useMemo(() => ACHIEVEMENTS
    .filter((a) => a.available && !a.hidden && !unlockedCodes.has(a.code))
    .map((a) => ({ a, progress: achievementProgress(a, myGrowth) }))
    .filter((x) => x.progress && x.progress.pct > 0)
    .sort((x, y) => y.progress.pct - x.progress.pct)
    .slice(0, 3), [unlockedCodes, myGrowth]);

  const filtered = useMemo(() => ACHIEVEMENTS.filter((a) => {
    const got = unlockedCodes.has(a.code);
    if (flt === "done") return got;
    if (flt === "todo") return !got;
    return true;
  }), [flt, unlockedCodes]);

  const openSheet = (v) => {
    // 移动端点开面板时把悬浮展签收起，避免它叠在面板上方。
    try { window.dispatchEvent(new Event("stgblog:hpop-close")); } catch {}
    setSheet(v);
  };
  const closeSheet = () => setSheet(null);

  const toggleFeatured = async (a) => {
    setFeatErr("");
    const on = featuredCodes.has(a.code);
    if (!on && featuredCodes.size >= MAX_FEATURED) {
      setFeatErr(`最多只能展示 ${MAX_FEATURED} 枚精选徽章，请先取消一枚`);
      return;
    }
    const err = await setFeatured(a.code, !on);
    if (err) setFeatErr(/枚|最多/.test(err) ? `最多只能展示 ${MAX_FEATURED} 枚精选徽章，请先取消一枚` : err);
  };

  const detailA = sheet?.type === "detail" ? ACHIEVEMENT_MAP[sheet.code] : null;
  const detailGot = detailA ? unlockedCodes.has(detailA.code) : false;
  const detailHidden = !!(detailA && detailA.hidden && !detailGot);
  const detailFeatured = detailA ? featuredCodes.has(detailA.code) : false;
  const detailProgress = detailA && !detailGot && detailA.available && !detailHidden
    ? achievementProgress(detailA, myGrowth) : null;

  return (
    <div className="honors-page">
      <div className="detail-top">
        <button className="detail-back" onClick={onBack}><Icons.Back /></button>
        <span className="detail-top-title">STG 荣誉体系</span>
        <span className="honors-top-tag">STG HONORS</span>
      </div>

      {!enabled ? (
        <div className="honors-empty">
          <div className="honors-empty-icon">✦</div>
          <h3>荣誉体系已暂停</h3>
          <p>成就系统正在灰度测试，默认对所有成员开启。你可以在「设置 → 功能」中重新开启。</p>
          <button className="compose-submit" onClick={onBack}>返回</button>
        </div>
      ) : ready === false ? (
        <div className="honors-empty">
          <div className="honors-empty-icon">🗄</div>
          <h3>服务端功能尚未启用</h3>
          <p>站点管理员需在 Supabase SQL Editor 依次执行 <code>migrations/v12_honors.sql</code> 与 <code>migrations/v13_growth.sql</code>。</p>
          <p className="honors-empty-sub">在此之前网站其余功能完全不受影响，也不会产生任何成长数据。</p>
          <button className="compose-submit" onClick={onBack}>返回</button>
        </div>
      ) : (
        <>
          {/* 第二级：所有内容收进一个框，框内上下滑动；页签固定在框顶部 */}
          <div className="honors-frame">
            <div className="honors-frame-head">
              {myGrowth ? (
                <HonorCard growth={myGrowth} badges={featuredOrder} isMe />
              ) : (
                <div className="honors-notice">
                  {!user
                    ? "当前为访客浏览：登录后才会开始记录成长值、解锁成就并挑选展示徽章。"
                    : loading ? "正在同步荣誉数据…" : "尚无成长档案：发布一条主题或回复后即可开始累计。"}
                </div>
              )}

              <div className="honors-tabs" role="tablist">
                <button className={`honors-tab ${tab === "badges" ? "on" : ""}`} onClick={() => setTab("badges")}>
                  成就图鉴 <span className="honors-tab-num">{unlockedCount}/{AVAILABLE_COUNT}</span>
                </button>
                <button className={`honors-tab ${tab === "growth" ? "on" : ""}`} onClick={() => setTab("growth")}>经验任务</button>
                <button className={`honors-tab ${tab === "log" ? "on" : ""}`} onClick={() => setTab("log")}>成长记录</button>
                <button className={`honors-tab ${tab === "board" ? "on" : ""}`} onClick={() => setTab("board")}>荣誉榜</button>
                <button className={`honors-tab ${tab === "verify" ? "on" : ""}`} onClick={() => setTab("verify")}>真人认证</button>
              </div>
            </div>

            <div className="honors-frame-scroll" key={tab} onScroll={onFrameScroll}>
              {tab === "growth" && <GrowthTasks />}
              {tab === "verify" && <VerifyPanel />}

          {tab === "badges" && (
            <div className="honors-body">
              {/* 图鉴总览 */}
              <div className="honors-summary">
                <strong>{unlockedCount} / {AVAILABLE_COUNT} 已解锁</strong>
                <span>{totalPoints} 图鉴分</span>
              </div>
              <div className="honors-meter"><i style={{ width: `${completionPct}%` }} /></div>
              <p className="honors-summary-hint">点击任意徽章查看详情；已解锁的可设为个人主页展示。</p>

              {/* 档案预览：5 个圆形槽位，与个人主页展示位一一对应 */}
              <section className="honors-profile" aria-label="徽章展示预览">
                <div className="honors-profile-who">
                  <span className="honors-avatar" aria-hidden="true">
                    {user?.username ? String(user.username).slice(0, 1).toUpperCase() : "?"}
                  </span>
                  <div className="honors-profile-id">
                    <b>{user?.username || "访客"}<IdentityMarks identity={growth.identityOf(user?.username)} size={13} /></b>
                    <small>
                      {myGrowth?.joined_at ? `加入于 ${fmtMonth(myGrowth.joined_at)}` : "匿名校园社区"}
                      {myGrowth ? ` · Lv.${myGrowth.level}` : ""}
                    </small>
                  </div>
                  <button className="honors-pill" onClick={() => { setFeatErr(""); openSheet({ type: "picker" }); }}>
                    选择徽章
                  </button>
                </div>
                <div className="honors-vitrine-row">
                  <div className="honors-slots">
                    {Array.from({ length: MAX_FEATURED }, (_, k) => k).map((k) => {
                      const code = featuredOrder[k];
                      if (!code) {
                        return <button key={k} className="honors-slot" aria-label="添加徽章" onClick={() => { setFeatErr(""); openSheet({ type: "picker" }); }}>+</button>;
                      }
                      const a = ACHIEVEMENT_MAP[code];
                      return (
                        <HonorPopover key={k} achievement={a} got
                          date={unlockedAt[code]} holders={holderCounts[code] || 0} featured>
                          <button className="honors-slot filled" aria-label={`查看 ${a.name}`} onClick={() => { setFeatErr(""); openSheet({ type: "detail", code }); }}>
                            <HonorEmblem achievement={a} size={72} />
                          </button>
                        </HonorPopover>
                      );
                    })}
                  </div>
                  <p className="honors-vitrine-note">悬停或聚焦徽章可查看放大展签。别人打开你的主页或看到你的帖子时会看到这些徽章，最多 {MAX_FEATURED} 枚。</p>
                </div>
              </section>

              {/* 最接近解锁 */}
              <div className="honors-section">
                <h2>最接近解锁</h2>
              </div>
              <ul className="honors-list honors-list-closest">
                {closest.length === 0 ? (
                  <li className="honors-list-empty">
                    {myGrowth ? "可计算进度的成就都已解锁，继续探索隐藏成就吧。" : "登录后即可看到你离下一枚徽章还有多远。"}
                  </li>
                ) : closest.map(({ a, progress }) => (
                  <AchievementRow key={a.code} a={a} compact
                    {...rowState(a)} progress={progress} onOpen={(code) => { setFeatErr(""); openSheet({ type: "detail", code }); }} />
                ))}
              </ul>

              {/* 全部成就 + 筛选 */}
              <div className="honors-section">
                <h2>全部成就</h2>
                <div className="honors-seg" role="group" aria-label="筛选成就">
                  {[["all", "全部"], ["done", "已解锁"], ["todo", "未解锁"]].map(([k, label]) => (
                    <button key={k} aria-pressed={flt === k} onClick={() => setFlt(k)}>{label}</button>
                  ))}
                </div>
              </div>
              {featErr && !sheet && <div className="honors-notice honors-notice-warn">{featErr}</div>}
              <ul className="honors-list">
                {filtered.length === 0 ? (
                  <li className="honors-list-empty">这里还没有成就，换个筛选条件看看。</li>
                ) : filtered.map((a) => (
                  <AchievementRow key={a.code} a={a}
                    {...rowState(a)} progress={achievementProgress(a, myGrowth)}
                    onOpen={(code) => { setFeatErr(""); openSheet({ type: "detail", code }); }} />
                ))}
              </ul>

              <div className="honors-about">
                <h2>关于荣誉体系</h2>
                <p>· 等级只代表参与度，不是管理权限；不会影响发帖、私信或公告权限。</p>
                <p>· 积分由服务端按真实行为判定：主题 +8 XP、回复 +2 XP、被认可 +3 XP / +1 声望，每日有上限。</p>
                <p>· 图鉴分只用于展示稀有度与收藏进度，<b>成就本身不奖励经验值</b>，也不计入等级。</p>
                <p>· 浏览量不参与任何计分；点赞由服务端唯一约束去重；删帖只标记不追扣等级。</p>
                <p>· 进度条只使用公开汇总数据（主题数 / 回复数 / 活跃天数）计算，其余成就不画估算进度。</p>
                <p>· 每日签到 +5 XP，连续 3 / 7 / 14 / 30 天另有奖励；主题 +8 XP、回复 +2 XP，均由服务端按真实行为结算。</p>
                <p>· 完成真人认证即可自定义头像与主页背景（图片自动压缩到 200KB 以内），精华帖作者与管理员免认证；认证同时解除每日限额。未认证者每跑满 10 分钟 hash 得 3 张发帖图片额度。</p>
                <p>· 仅公开等级、认证标识与已获徽章；积分流水、原始行为记录、最后活跃日期不对外公开。私信与群聊内容永不参与计算。</p>
              </div>
            </div>
          )}

          {tab === "log" && (
            <div className="honors-body">
              <div className="honors-summary">最近 40 条成长记录（仅本人可见）</div>
              {myGrowth && (
                <div className="honors-next">
                  {(() => {
                    const p = levelProgress(Number(myGrowth.total_xp || 0));
                    return p.isMax
                      ? `已达最高等级 ${LEVELS[LEVELS.length - 1].title}，感谢你一路同行。`
                      : `当前 ${p.cur.title} · ${p.pct}% · 再获得 ${p.toNext} XP 升级为 ${p.next.title}`;
                  })()}
                </div>
              )}
              {xpLog.length === 0 ? (
                <div className="honors-notice">暂无记录。发布主题、回复或被认可后会出现在这里。</div>
              ) : (
                <ul className="honors-log">
                  {xpLog.map((r, i) => (
                    <li key={i} className={r.reversed ? "reversed" : ""}>
                      <span className="honors-log-dot" />
                      <span className="honors-log-label">
                        {XP_EVENT_LABELS[r.event_type] || r.event_type}
                        {r.reversed && <em> · 关联内容已删除</em>}
                      </span>
                      <span className="honors-log-time">{fmtTime(r.created_at)}</span>
                      <span className={`honors-log-xp${Number(r.amount) < 0 ? " minus" : ""}`}>
                        {Number(r.amount) > 0 ? "+" : ""}{Number(r.amount || 0)} XP
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {tab === "board" && (
            <div className="honors-body">
              <div className="honors-summary">仅展示已主动开启荣誉体系的成员 · 按累计 XP 排序</div>
              {board.length === 0 ? (
                <div className="honors-notice">还没有成员加入荣誉体系。</div>
              ) : (
                <ul className="honors-board">
                  {board.map((p, i) => (
                    <li key={p.user_id} className={user?.username === p.username ? "me" : ""}>
                      <span className={`honors-rank rank-${i + 1}`}>{i + 1}</span>
                      <span className="honors-board-name">
                        {p.username}
                        <IdentityMarks identity={growth.identityOf(p.username)} size={13} />
                      </span>
                      <LevelChip level={p.level} compact />
                      <span className="honors-board-xp">{Number(p.total_xp || 0).toLocaleString()} XP</span>
                      <span className="honors-board-rep">声望 {Number(p.reputation || 0).toLocaleString()}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
            </div>
            {/* 悬浮提示：不占布局高度；一开始浮在框底，滚动后自动淡出 */}
            <div className={`honors-float-hint${hintHidden ? " hide" : ""}`} aria-hidden="true">
              <span className="honors-float-hint-icon">↕</span> 上下滑动查看更多
            </div>
          </div>
        </>
      )}

      {/* ─── 底部详情 / 徽章选择面板 ─── */}
      {sheet && (
        <>
          <div className="honors-mask on" onClick={closeSheet} />
          <div className="honors-sheet on" role="dialog" aria-modal="true" tabIndex={-1} ref={sheetRef}>
            <div className="honors-grab" />
            {sheet.type === "picker" ? (
              <>
                <h2>选择展示的徽章</h2>
                <p className="honors-hint center">最多 {MAX_FEATURED} 枚。点击已在展示的徽章可取消。</p>
                {featErr && <div className="honors-notice honors-notice-warn">{featErr}</div>}
                {pickList.length === 0 ? (
                  <p className="honors-hint center">还没有解锁任何徽章，先去发一篇主题吧。</p>
                ) : (
                  <div className="honors-pick">
                    {pickList.map((a) => {
                      const k = featuredOrder.indexOf(a.code);
                      const sel = k >= 0;
                      return (
                        <button key={a.code} className={`honors-pk${sel ? " sel" : ""} rarity-${a.rarity}`}
                          aria-pressed={sel} onClick={() => toggleFeatured(a)}>
                          {sel && <em>{k + 1}</em>}
                          <HonorPopover achievement={a} got date={unlockedAt[a.code]}
                            holders={holderCounts[a.code] || 0} featured={sel}>
                            <HonorEmblem achievement={a} size={72} />
                          </HonorPopover>
                          <span>{a.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <button className="honors-cta" onClick={closeSheet}>完成</button>
              </>
            ) : detailA && (
              <div className={`honors-detail rarity-${detailA.rarity}`}>
                <HonorEmblem achievement={detailA} size={150} locked={!detailGot} hidden={detailHidden} />
                <h3>{detailHidden ? "隐藏成就" : detailA.name}</h3>
                <p>{detailHidden ? "条件暂不公开 · 继续探索，它会在解锁时现身" : detailA.desc}</p>
                <div className="honors-facts">
                  <span>{RARITY[detailA.rarity].label}</span>
                  <span>+{achievementPoints(detailA)} 图鉴分</span>
                  <span>{CATEGORY_LABEL[detailA.category]}</span>
                  {!detailA.available ? <span>二期开放</span>
                    : detailGot && unlockedAt[detailA.code] ? <span>{fmtDate(unlockedAt[detailA.code])} 解锁</span>
                      : detailProgress ? <span>{detailProgress.cur} / {detailProgress.goal}</span>
                        : <span>{detailGot ? "已解锁" : "未解锁"}</span>}
                  {holderCounts[detailA.code] > 0 && <span>全站 {holderCounts[detailA.code]} 人已解锁</span>}
                </div>
                {featErr && <div className="honors-notice honors-notice-warn">{featErr}</div>}
                {detailGot && detailA.available ? (
                  <button className={`honors-cta${detailFeatured ? " alt" : ""}`} onClick={() => toggleFeatured(detailA)}>
                    {detailFeatured ? "从主页移除" : "展示在主页"}
                  </button>
                ) : (
                  <button className="honors-cta alt" onClick={closeSheet}>关闭</button>
                )}
                <p className="honors-hint center">
                  {detailGot ? `最多同时展示 ${MAX_FEATURED} 枚精选徽章。` : "解锁后即可把徽章展示在个人主页与帖子中。"}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// 把每行需要的状态集中计算，避免在 JSX 里重复判定。
function makeRowState(unlockedCodes, featuredCodes, unlockedAt, holderCounts, growth) {
  return (a) => {
    const got = unlockedCodes.has(a.code);
    return {
      got,
      hidden: !!(a.hidden && !got),
      featured: featuredCodes.has(a.code),
      date: unlockedAt[a.code] || "",
      holders: holderCounts[a.code] || 0,
      progress: achievementProgress(a, growth),
    };
  };
}
