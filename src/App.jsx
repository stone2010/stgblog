import React, { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { hasLiked, hasViewed, saveLiked, saveViewed, toggleBookmark, getTheme, setTheme as applyTheme } from "./utils";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { useNotifications } from "./hooks/useNotifications";
import { useDM } from "./hooks/useDM";
import { Icons } from "./components/Icons";
import AuthModal from "./components/AuthModal";
import NotificationPage from "./components/NotificationPage";
import HomeFeed from "./components/HomeFeed";
import SearchPage from "./components/SearchPage";
import PostDetail from "./components/PostDetail";
import DmListPage from "./components/DmListPage";
import DmChatPage from "./components/DmChatPage";
import ProfilePage from "./components/ProfilePage";
import ProfileViewPage from "./components/ProfileViewPage";
import FollowersPage from "./components/FollowersPage";
import NewDmModal from "./components/NewDmModal";
import RepostModal from "./components/RepostModal";
import EditPostModal from "./components/EditPostModal";

function AppInner() {
  const { user, followingSet } = useAuth();

  // Posts
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [tab, setTab] = useState("最新");
  const [searchKey, setSearchKey] = useState("");
  const [composeText, setComposeText] = useState("");

  // Navigation
  const [page, setPage] = useState("home");
  const [mobileTab, setMobileTab] = useState("home");
  const [selectedPost, setSelectedPost] = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [followersPage, setFollowersPage] = useState(null); // { username, type }

  // Modals
  const [authOpen, setAuthOpen] = useState(false);
  const [newDmOpen, setNewDmOpen] = useState(false);
  const [repostModal, setRepostModal] = useState(null); // post to repost
  const [editPostModal, setEditPostModal] = useState(null); // post to edit

  // Theme
  const [theme, setThemeState] = useState(getTheme);

  // PWA
  const [installPrompt, setInstallPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);

  // Refs
  const countedViewRef = useRef(new Set());
  const notifRef = useRef(null);
  const [notifOpen, setNotifOpen] = useState(false);

  // Hooks
  const { notifications, unreadCount, markAllRead, markOneRead } = useNotifications(user?.username);
  const { dmList, dmTarget, dmMessages, dmSending, loadDmList, sendDm, openDm, closeDm, setDmTarget } = useDM(user, null);

  // ─── Theme ───
  useEffect(() => { applyTheme(theme); }, [theme]);
  const toggleTheme = useCallback(() => {
    setThemeState((t) => { const next = t === "dark" ? "light" : "dark"; applyTheme(next); return next; });
  }, []);

  // ─── Load posts ───
  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    const { data, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
    if (!error) setPosts(data || []);
    setPostsLoading(false);
  }, []);
  useEffect(() => { loadPosts(); }, [loadPosts]);

  // ─── PWA install ───
  useEffect(() => {
    const h = (e) => { e.preventDefault(); setInstallPrompt(e); setCanInstall(true); };
    window.addEventListener("beforeinstallprompt", h);
    if (/Chrome|Edg|SamsungBrowser/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) setCanInstall(true);
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  // Close notif dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    if (notifOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [notifOpen]);

  // ─── View counting ───
  useEffect(() => {
    posts.slice(0, 8).forEach((post) => {
      if (countedViewRef.current.has(post.id)) return;
      if (hasViewed(post.id)) { countedViewRef.current.add(post.id); return; }
      countedViewRef.current.add(post.id);
      saveViewed(post.id);
      const next = (post.views || 0) + 1;
      setPosts((prev) => prev.map((i) => i.id === post.id ? { ...i, views: next } : i));
      supabase.from("posts").update({ views: next }).eq("id", post.id);
    });
  }, [posts]);

  // Deep link
  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("post");
    if (!pid || !posts.length) return;
    const found = posts.find((p) => String(p.id) === String(pid));
    if (found) setSelectedPost(found);
  }, [posts]);

  // ─── Handlers ───
  const handlePublish = useCallback(async () => {
    if (!user) { setAuthOpen(true); return; }
    const content = composeText.trim();
    if (!content || content.length > 2000) return;
    const { data, error } = await supabase.from("posts").insert([{
      title: content.slice(0, 60), content, author: user.username,
      category: "动态", likes: 0, views: 0, reposts: 0, pinned: false, edited: false,
    }]).select("*").single();
    if (!error) { setPosts((prev) => [data, ...prev]); setComposeText(""); }
  }, [user, composeText]);

  const handleDeletePost = useCallback(async (post) => {
    if (!post || !user || post.author !== user.username) return;
    if (!window.confirm("确定删除？")) return;
    await supabase.from("posts").delete().eq("id", post.id);
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    setSelectedPost(null);
  }, [user]);

  const handleEditPost = useCallback(async (postId, newContent) => {
    await supabase.from("posts").update({ content: newContent, title: newContent.slice(0, 60), edited: true }).eq("id", postId);
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, content: newContent, title: newContent.slice(0, 60), edited: true } : p));
    if (selectedPost?.id === postId) setSelectedPost((s) => s ? { ...s, content: newContent, title: newContent.slice(0, 60), edited: true } : s);
    setEditPostModal(null);
  }, [selectedPost]);

  const handleLike = useCallback(async (post) => {
    if (!post || hasLiked(post.id)) return;
    const next = (post.likes || 0) + 1;
    setPosts((prev) => prev.map((i) => i.id === post.id ? { ...i, likes: next } : i));
    if (selectedPost?.id === post.id) setSelectedPost((s) => s ? { ...s, likes: next } : s);
    saveLiked(post.id);
    await supabase.from("posts").update({ likes: next }).eq("id", post.id);
    if (user && post.author !== user.username) {
      await supabase.from("notifications").insert([{ user_to: post.author, user_from: user.username, type: "like", post_id: post.id }]);
    }
  }, [user, selectedPost]);

  const handleRepost = useCallback(async (post) => {
    if (!user) { setAuthOpen(true); return; }
    setRepostModal(post);
  }, [user]);

  const doRepost = useCallback(async (post) => {
    if (!user) return;
    // Check if already reposted
    const existing = posts.find((p) => p.author === user.username && p.repost_of === post.id);
    if (existing) return;
    const { data, error } = await supabase.from("posts").insert([{
      title: `转发: ${post.content?.slice(0, 40)}`, content: post.content,
      author: user.username, category: "动态",
      likes: 0, views: 0, reposts: 0, pinned: false,
      repost_of: post.id,
    }]).select("*").single();
    if (!error) {
      // Attach original post data for display
      data.repost_data = post;
      setPosts((prev) => [data, ...prev]);
      // Increment repost count on original
      const next = (post.reposts || 0) + 1;
      await supabase.from("posts").update({ reposts: next }).eq("id", post.id);
      setPosts((prev) => prev.map((p) => p.id === post.id ? { ...p, reposts: next } : p));
      if (user.username !== post.author) {
        await supabase.from("notifications").insert([{ user_to: post.author, user_from: user.username, type: "repost", post_id: post.id }]);
      }
    }
  }, [user, posts]);

  const doQuote = useCallback(async (post, quoteText) => {
    if (!user) return;
    const { data, error } = await supabase.from("posts").insert([{
      title: quoteText.slice(0, 60), content: quoteText,
      author: user.username, category: "动态",
      likes: 0, views: 0, reposts: 0, pinned: false,
      quote_of: post.id,
    }]).select("*").single();
    if (!error) {
      data.quote_data = post;
      setPosts((prev) => [data, ...prev]);
      if (user.username !== post.author) {
        await supabase.from("notifications").insert([{ user_to: post.author, user_from: user.username, type: "quote", post_id: post.id }]);
      }
    }
  }, [user]);

  const handleBookmark = useCallback((post) => {
    if (!post) return;
    const nowBookmarked = toggleBookmark(post.id);
    // Force re-render by touching posts state
    setPosts((prev) => [...prev]);
  }, []);

  const handleShare = useCallback(async (post) => {
    if (!post) return;
    const url = new URL(window.location.href); url.searchParams.set("post", String(post.id));
    const text = `STGBLOG｜${post.title || post.content?.slice(0, 40)}\n${url}`;
    try {
      if (navigator.share) await navigator.share({ title: "STGBLOG", text, url: url.toString() });
      else if (navigator.clipboard) { await navigator.clipboard.writeText(text); alert("已复制链接"); }
    } catch {}
  }, []);

  const handleNotifClick = useCallback(async (notif) => {
    setNotifOpen(false);
    if (!notif.read) markOneRead(notif.id);
    if (notif.post_id) {
      const found = posts.find((p) => p.id === notif.post_id);
      if (found) { setSelectedPost(found); setPage("home"); return; }
    }
    if (notif.type === "follow") {
      setViewingProfile(notif.user_from);
      setPage("profile-view");
    }
  }, [posts, markOneRead]);

  const openUserClick = useCallback((username) => {
    if (user && username === user.username) { navigate("profile"); return; }
    setViewingProfile(username);
    setPage("profile-view");
    setSelectedPost(null);
  }, [user]);

  const navigate = useCallback((p) => {
    setPage(p); setSelectedPost(null); setDmTarget(null);
    setViewingProfile(null); setFollowersPage(null);
    if (p === "dm" && user) loadDmList();
    setMobileTab(p === "home" ? "home" : p === "dm" ? "dm" : p === "profile" ? "me" : p === "notifications" ? "notif" : "home");
  }, [user, loadDmList, setDmTarget]);

  const handleHashtag = useCallback((tag) => {
    setSearchKey(tag);
    setPage("search");
    setMobileTab("search");
  }, []);

  const handleInstall = useCallback(async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") { setInstallPrompt(null); setCanInstall(false); }
      return;
    }
    if (!window.matchMedia('(display-mode: standalone)').matches) alert("请使用浏览器菜单中的「添加到主屏幕」功能安装");
  }, [installPrompt]);

  const topTitle = () => {
    if (selectedPost) return "帖子";
    if (page === "dm-chat") return dmTarget;
    if (page === "search") return "搜索";
    if (page === "dm") return "私信";
    if (page === "notifications") return "通知";
    if (page === "profile-view") return viewingProfile;
    if (page === "followers") return followersPage?.type === "followers" ? "粉丝" : "关注";
    if (page === "profile") return "个人";
    return "STGBLOG";
  };

  // ─── Page Router ───
  const renderPage = () => {
    if (followersPage) return <FollowersPage username={followersPage.username} type={followersPage.type} onBack={() => { setFollowersPage(null); setPage("home"); }} onUserClick={openUserClick} />;
    if (selectedPost) return (
      <PostDetail post={selectedPost} onClose={() => setSelectedPost(null)}
        onLike={handleLike} onShare={handleShare} onRepost={handleRepost} onBookmark={handleBookmark}
        onUserClick={openUserClick} onDeletePost={handleDeletePost} onEditPost={setEditPostModal} />
    );
    if (page === "dm-chat" && dmTarget) return null;
    if (page === "notifications") return <NotificationPage notifications={notifications} onNotifClick={handleNotifClick} onBack={() => navigate("home")} />;
    if (page === "search") return <SearchPage searchKey={searchKey} setSearchKey={setSearchKey} posts={posts} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} onRepost={handleRepost} onBookmark={handleBookmark} />;
    if (page === "dm") return <DmListPage dmList={dmList} onOpenDm={(u) => { openDm(u); setPage("dm-chat"); }} onNewDm={() => setNewDmOpen(true)} />;
    if (page === "profile-view" && viewingProfile) return <ProfileViewPage viewingProfile={viewingProfile} posts={posts} onBack={() => { setViewingProfile(null); setPage("home"); setMobileTab("home"); }} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} onRepost={handleRepost} onBookmark={handleBookmark} onOpenDm={(u) => { openDm(u); setPage("dm-chat"); }} />;
    if (page === "profile") return <ProfilePage posts={posts} onAuthOpen={() => setAuthOpen(true)} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} onRepost={handleRepost} onBookmark={handleBookmark} onFollowersPage={(type) => setFollowersPage({ username: user.username, type })} />;
    return <HomeFeed posts={posts} postsLoading={postsLoading} tab={tab} setTab={setTab} searchKey={searchKey} composeText={composeText} setComposeText={setComposeText} onPublish={handlePublish} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} onRepost={handleRepost} onBookmark={handleBookmark} onHashtag={handleHashtag} />;
  };

  return (
    <div className="app">
      {/* Top Navigation */}
      <nav className="topnav">
        <div className="topnav-inner">
          <div className="topnav-brand" onClick={() => navigate("home")} style={{ cursor: "pointer" }}>
            <div className="topnav-logo">S</div>
            <span className="topnav-title">{topTitle()}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="compose-tool" onClick={toggleTheme} title="切换主题">
              {theme === "dark" ? <Icons.ThemeLight /> : <Icons.ThemeDark />}
            </button>
            {canInstall && (
              <button className="compose-tool install-btn-nav" onClick={handleInstall} title="安装到桌面"><Icons.Install /></button>
            )}
            {user && (
              <div className="notif-wrap" ref={notifRef}>
                <button className="compose-tool" onClick={() => { setNotifOpen(!notifOpen); if (!notifOpen && unreadCount > 0) markAllRead(); }} title="通知" style={{ position: "relative" }}>
                  <Icons.Bell />
                  {unreadCount > 0 && <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
                </button>
                {notifOpen && (
                  <div className="notif-dropdown">
                    <div className="notif-header">通知</div>
                    {notifications.length === 0 ? (
                      <div className="notif-empty">暂无通知</div>
                    ) : notifications.slice(0, 20).map((n) => (
                      <div key={n.id} className={`notif-item ${n.read ? "" : "unread"}`} onClick={() => handleNotifClick(n)}>
                        <div className="notif-icon">{n.type === "like" ? "❤️" : n.type === "comment" ? "💬" : n.type === "reply" ? "↩️" : n.type === "repost" ? "🔁" : n.type === "quote" ? "💭" : "👤"}</div>
                        <div className="notif-body">
                          <span className="notif-from">{n.user_from}</span>
                          <span className="notif-text">{n.type === "like" ? "赞了你的帖子" : n.type === "comment" ? "评论了你的帖子" : n.type === "reply" ? "回复了你的评论" : n.type === "repost" ? "转发了你的帖子" : n.type === "quote" ? "引用了你的帖子" : "关注了你"}</span>
                          <span className="notif-time">{/* formatTime */}</span>
                        </div>
                        {!n.read && <div className="notif-dot" />}
                      </div>
                    ))}
                    <button className="notif-view-all" onClick={() => { setNotifOpen(false); navigate("notifications"); }}>查看全部通知</button>
                  </div>
                )}
              </div>
            )}
            {user ? (
              <button className="compose-tool" onClick={() => navigate("profile")} title="个人">
                <div className="post-avatar" style={{ width: 28, height: 28, fontSize: 12 }}>{user.username[0]}</div>
              </button>
            ) : (
              <button className="topnav-login" onClick={() => setAuthOpen(true)}>登录</button>
            )}
          </div>
        </div>
      </nav>

      {/* Desktop Layout */}
      <div className="desktop-wrap">
        <aside className="sidebar">
          <button className="sidebar-btn" onClick={() => navigate("home")}><span className="sb-icon"><Icons.Home /></span>首页</button>
          <button className="sidebar-btn" onClick={() => navigate("search")}><span className="sb-icon"><Icons.Search /></span>搜索</button>
          {user && <button className="sidebar-btn" onClick={() => navigate("notifications")}><span className="sb-icon"><Icons.Bell /></span>通知{unreadCount > 0 && <span className="sidebar-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}</button>}
          {user && <button className="sidebar-btn" onClick={() => navigate("dm")}><span className="sb-icon"><Icons.Msg /></span>私信</button>}
          {user && <button className="sidebar-btn" onClick={() => navigate("profile")}><span className="sb-icon"><Icons.User /></span>个人</button>}
          <button className="sidebar-btn" onClick={toggleTheme}><span className="sb-icon">{theme === "dark" ? <Icons.ThemeLight /> : <Icons.ThemeDark />}</span>{theme === "dark" ? "亮色模式" : "暗色模式"}</button>
          {user ? (
            <button className="sidebar-compose" onClick={() => { navigate("home"); setMobileTab("home"); }}>发帖</button>
          ) : (
            <button className="sidebar-compose" onClick={() => setAuthOpen(true)}>登录</button>
          )}
        </aside>
        <div className="layout">{renderPage()}</div>
      </div>

      {/* DM Chat Overlay */}
      {page === "dm-chat" && dmTarget && (
        <div className="dm-overlay">
          <DmChatPage dmTarget={dmTarget} dmMessages={dmMessages} dmSending={dmSending}
            onSend={sendDm} onBack={() => { closeDm(); setPage("dm"); }} onUserClick={openUserClick} />
        </div>
      )}

      {/* Bottom Navigation */}
      {page !== "dm-chat" && (
        <nav className="bnav">
          <button className={`bnav-btn ${mobileTab === "home" ? "on" : ""}`} onClick={() => navigate("home")}><span className="bnav-icon"><Icons.Home /></span></button>
          <button className={`bnav-btn ${mobileTab === "search" ? "on" : ""}`} onClick={() => navigate("search")}><span className="bnav-icon"><Icons.Search /></span></button>
          <button className="bnav-compose" onClick={() => { if (user) { navigate("home"); setMobileTab("home"); } else setAuthOpen(true); }}>✦</button>
          <button className={`bnav-btn ${mobileTab === "dm" ? "on" : ""}`} onClick={() => { if (user) navigate("dm"); else setAuthOpen(true); }}><span className="bnav-icon"><Icons.Msg /></span></button>
          <button className={`bnav-btn ${mobileTab === "me" ? "on" : ""}`} onClick={() => navigate("profile")} style={{ position: "relative" }}>
            <span className="bnav-icon"><Icons.User /></span>
            {unreadCount > 0 && <span className="bnav-dot" />}
          </button>
        </nav>
      )}

      {/* Modals */}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {newDmOpen && <NewDmModal onClose={() => setNewDmOpen(false)} onStartDm={(target) => { setNewDmOpen(false); openDm(target); setPage("dm-chat"); }} />}
      {repostModal && <RepostModal post={repostModal} onRepost={doRepost} onQuote={doQuote} onClose={() => setRepostModal(null)} />}
      {editPostModal && <EditPostModal post={editPostModal} onSave={handleEditPost} onClose={() => setEditPostModal(null)} />}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
