import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { supabase } from "./supabase";
import { hasLiked, hasViewed, saveLiked, saveViewed, formatTime, formatCount } from "./utils";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { useNotifications } from "./hooks/useNotifications";
import { useDM } from "./hooks/useDM";
import { Icons } from "./components/Icons";
import AuthModal from "./components/AuthModal";
import NotificationItem from "./components/NotificationItem";
import HomeFeed from "./components/HomeFeed";
import SearchPage from "./components/SearchPage";
import PostDetail from "./components/PostDetail";
import DmListPage from "./components/DmListPage";
import DmChatPage from "./components/DmChatPage";
import ProfilePage from "./components/ProfilePage";
import ProfileViewPage from "./components/ProfileViewPage";
import NewDmModal from "./components/NewDmModal";

function AppInner() {
  const { user, followingSet } = useAuth();

  // Posts state
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

  // Modals
  const [authOpen, setAuthOpen] = useState(false);
  const [newDmOpen, setNewDmOpen] = useState(false);

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
    if (/Chrome|Edg|SamsungBrowser/.test(navigator.userAgent) && !window.matchMedia('(display-mode: standalone)').matches) {
      setCanInstall(true);
    }
    return () => window.removeEventListener("beforeinstallprompt", h);
  }, []);

  // Close notif dropdown on outside click
  useEffect(() => {
    const h = (e) => { if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false); };
    if (notifOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [notifOpen]);

  // ─── View counting ───
  const displayedPosts = useMemo(() => {
    const kw = searchKey.trim().toLowerCase();
    let f = posts.filter((p) => !kw || [p.title, p.content, p.author, p.category].join(" ").toLowerCase().includes(kw));
    if (tab === "我的") { if (!user) return []; f = f.filter((p) => p.author === user.username); }
    if (tab === "关注") {
      if (!user) return [];
      f = f.filter((p) => followingSet.has(p.author) || p.author === user.username);
      return [...f].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }
    return [...f].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [posts, searchKey, tab, user, followingSet]);

  useEffect(() => {
    displayedPosts.slice(0, 8).forEach((post) => {
      if (countedViewRef.current.has(post.id)) return;
      if (hasViewed(post.id)) { countedViewRef.current.add(post.id); return; }
      countedViewRef.current.add(post.id);
      saveViewed(post.id);
      const next = (post.views || 0) + 1;
      setPosts((prev) => prev.map((i) => i.id === post.id ? { ...i, views: next } : i));
      supabase.from("posts").update({ views: next }).eq("id", post.id);
    });
  }, [displayedPosts]);

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
      category: "动态", likes: 0, views: 0, pinned: false,
    }]).select("*").single();
    if (!error) {
      setPosts((prev) => [data, ...prev]);
      setComposeText("");
    }
  }, [user, composeText]);

  const handleDeletePost = useCallback(async (post) => {
    if (!post || !user || post.author !== user.username) return;
    if (!window.confirm("确定删除？")) return;
    await supabase.from("posts").delete().eq("id", post.id);
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    setSelectedPost(null);
  }, [user]);

  const handleLike = useCallback(async (post) => {
    if (!post || hasLiked(post.id)) return;
    const next = (post.likes || 0) + 1;
    setPosts((prev) => prev.map((i) => i.id === post.id ? { ...i, likes: next } : i));
    if (selectedPost?.id === post.id) setSelectedPost((s) => s ? { ...s, likes: next } : s);
    saveLiked(post.id);
    await supabase.from("posts").update({ likes: next }).eq("id", post.id);
    if (user && post.author !== user.username) {
      await supabase.from("notifications").insert([{
        user_to: post.author, user_from: user.username, type: "like", post_id: post.id,
      }]);
    }
  }, [user, selectedPost]);

  const handleShare = useCallback(async (post) => {
    if (!post) return;
    const url = new URL(window.location.href); url.searchParams.set("post", String(post.id));
    const text = `STGBLOG｜${post.title || post.content.slice(0, 40)}\n${url}`;
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
      if (found) { setSelectedPost(found); return; }
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
    setViewingProfile(null);
    if (p === "dm" && user) loadDmList();
    setMobileTab(p === "home" ? "home" : p === "dm" ? "dm" : p === "profile" ? "me" : "home");
  }, [user, loadDmList, setDmTarget]);

  const navigateTab = useCallback((t) => {
    setTab(t); setSelectedPost(null); setDmTarget(null); setPage("home"); setMobileTab("home");
    setViewingProfile(null);
  }, [setDmTarget]);

  const handleInstall = useCallback(async () => {
    if (installPrompt) {
      installPrompt.prompt();
      const { outcome } = await installPrompt.userChoice;
      if (outcome === "accepted") { setInstallPrompt(null); setCanInstall(false); }
      return;
    }
    if (!window.matchMedia('(display-mode: standalone)').matches) {
      alert("请使用浏览器菜单中的「添加到主屏幕」功能安装");
    }
  }, [installPrompt]);

  const topTitle = () => {
    if (selectedPost) return "帖子";
    if (page === "dm-chat") return dmTarget;
    if (page === "search") return "搜索";
    if (page === "dm") return "私信";
    if (page === "profile-view") return viewingProfile;
    if (page === "profile") return "个人";
    return "STGBLOG";
  };

  // ─── Page Router ───
  const renderPage = () => {
    if (selectedPost) return (
      <PostDetail post={selectedPost} onClose={() => setSelectedPost(null)}
        onLike={handleLike} onShare={handleShare} onUserClick={openUserClick} onDeletePost={handleDeletePost} />
    );
    if (page === "dm-chat" && dmTarget) return null;
    if (page === "search") return <SearchPage searchKey={searchKey} setSearchKey={setSearchKey} posts={posts} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} />;
    if (page === "dm") return <DmListPage dmList={dmList} onOpenDm={(u) => { openDm(u); setPage("dm-chat"); }} onNewDm={() => { setNewDmOpen(true); }} />;
    if (page === "profile-view" && viewingProfile) return <ProfileViewPage viewingProfile={viewingProfile} onBack={() => { setViewingProfile(null); setPage("home"); setMobileTab("home"); }} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} onOpenDm={(u) => { openDm(u); setPage("dm-chat"); }} />;
    if (page === "profile") return <ProfilePage posts={posts} onAuthOpen={() => setAuthOpen(true)} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} />;
    return <HomeFeed posts={posts} postsLoading={postsLoading} tab={tab} setTab={setTab} searchKey={searchKey} composeText={composeText} setComposeText={setComposeText} onPublish={handlePublish} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} />;
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
            {canInstall && (
              <button className="compose-tool install-btn-nav" onClick={handleInstall} title="安装到桌面">
                <Icons.Install />
              </button>
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
                      <NotificationItem key={n.id} notif={n} onClick={handleNotifClick} />
                    ))}
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
          {user && <button className="sidebar-btn" onClick={() => navigate("dm")}><span className="sb-icon"><Icons.Msg /></span>私信</button>}
          {user && (
            <button className="sidebar-btn" onClick={() => navigate("profile")} style={{ position: "relative" }}>
              <span className="sb-icon"><Icons.Bell /></span>通知
              {unreadCount > 0 && <span className="sidebar-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}
            </button>
          )}
          {user && <button className="sidebar-btn" onClick={() => navigate("profile")}><span className="sb-icon"><Icons.User /></span>个人</button>}
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
          <button className={`bnav-btn ${mobileTab === "home" ? "on" : ""}`} onClick={() => navigate("home")}>
            <span className="bnav-icon"><Icons.Home /></span>
          </button>
          <button className={`bnav-btn ${mobileTab === "search" ? "on" : ""}`} onClick={() => navigate("search")}>
            <span className="bnav-icon"><Icons.Search /></span>
          </button>
          <button className="bnav-compose" onClick={() => { if (user) { navigate("home"); setMobileTab("home"); } else setAuthOpen(true); }}>✦</button>
          <button className={`bnav-btn ${mobileTab === "dm" ? "on" : ""}`} onClick={() => { if (user) navigate("dm"); else setAuthOpen(true); }}>
            <span className="bnav-icon"><Icons.Msg /></span>
          </button>
          <button className={`bnav-btn ${mobileTab === "me" ? "on" : ""}`} onClick={() => navigate("profile")} style={{ position: "relative" }}>
            <span className="bnav-icon"><Icons.User /></span>
            {unreadCount > 0 && <span className="bnav-dot" />}
          </button>
        </nav>
      )}

      {/* Modals */}
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      {newDmOpen && <NewDmModal onClose={() => setNewDmOpen(false)} onStartDm={(target) => { setNewDmOpen(false); openDm(target); setPage("dm-chat"); }} />}
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
