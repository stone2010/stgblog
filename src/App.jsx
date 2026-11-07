import React, { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "./supabase";
import { hasLiked, hasViewed, saveLiked, saveViewed, toggleBookmark, isAdmin, showToast, bumpPostCounter, avatarColor } from "./utils";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { useNotifications } from "./hooks/useNotifications";
import { useDM } from "./hooks/useDM";
import { useGroupChat } from "./hooks/useGroupChat";
import { Icons } from "./components/Icons";
import AuthModal from "./components/AuthModal";
import NotificationPage from "./components/NotificationPage";
import HomeFeed from "./components/HomeFeed";
import QuestionsPage from "./components/QuestionsPage";
import BlogPage from "./components/BlogPage";
import SectionNav from "./components/SectionNav";
import SearchPage from "./components/SearchPage";
import PostDetail from "./components/PostDetail";
import { EditorialTopStrip } from "./components/EditorialChrome";
import DmListPage from "./components/DmListPage";
import DmChatPage from "./components/DmChatPage";
import ProfilePage from "./components/ProfilePage";
import ProfileViewPage from "./components/ProfileViewPage";
import SettingsPage from "./components/SettingsPage";
import FollowersPage from "./components/FollowersPage";
import NewDmModal from "./components/NewDmModal";
import GroupListPage from "./components/GroupListPage";
import GroupChatPage from "./components/GroupChatPage";
import CreateGroupModal from "./components/CreateGroupModal";
import JoinGroupModal from "./components/JoinGroupModal";
import GroupSettingsModal from "./components/GroupSettingsModal";
import RepostModal from "./components/RepostModal";
import EditPostModal from "./components/EditPostModal";
import ErrorBoundary from "./components/ErrorBoundary";
import Onboarding from "./components/Onboarding";
import AnnouncementModal from "./components/AnnouncementModal";

function AppInner() {
  const { user, followingSet, keyPair, colorMode, setColorMode, styleMode } = useAuth();

  // Posts
  const [posts, setPosts] = useState([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [searchKey, setSearchKey] = useState("");
  const [composeText, setComposeText] = useState("");
  const [composeAnnouncement, setComposeAnnouncement] = useState(false);

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
  const [onboardingShown, setOnboardingShown] = useState(() => {
    try { return localStorage.getItem("stgblog_onboarding_shown") === "true"; } catch { return false; }
  });

  // UI Theme（由 AuthContext 统一管理颜色模式/玻璃效果/字号；这里只保留旧版 Aurora 兼容）
  useEffect(() => {
    try { if (localStorage.getItem("stgblog_theme") === "aurora") document.documentElement.classList.add("theme-aurora"); } catch {}
  }, []);

  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [joinGroupOpen, setJoinGroupOpen] = useState(false);
  const [groupSettingsOpen, setGroupSettingsOpen] = useState(false);

  // Theme（颜色模式来自 AuthContext，全局生效）
  const toggleTheme = useCallback(() => {
    setColorMode((c) => (c === "dark" ? "light" : "dark"));
  }, [setColorMode]);

  // PWA
  const [installPrompt, setInstallPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Refs
  const countedViewRef = useRef(new Set());
  const notifRef = useRef(null);
  const composeRef = useRef(null);
  const [notifOpen, setNotifOpen] = useState(false);

  // Hooks
  const { notifications, unreadCount, markAllRead, markOneRead } = useNotifications(user?.username);
  const { dmList, dmTarget, dmMessages, dmSending, dmUnreadCount, dmLive, dmLoadError, loadDmList, loadDmMessages, loadMoreDmMessages, sendDm, openDm, closeDm, markAsRead, recallDm, setDmTarget, togglePin, deleteConversation, setNickname } = useDM(user, keyPair);
  const { groups, activeGroup, groupMessages, groupMembers, groupSending, loadGroups, createGroup, joinGroup, shareGroupKey, leaveGroup, loadGroupMessages, loadMoreGroupMessages, sendGroupMessage, getGroupMembers, kickMember, deleteGroup, openGroup, closeGroup, updateGroupName, setMemberRole, transferOwnership } = useGroupChat(user, keyPair);

  // ─── Load posts ───
  // ─── 引用帖原帖补全：数据库只存 quote_of 外键，原帖内容需按 id 批量回查 ───
async function enrichQuotes(rows) {
  const qids = [...new Set((rows || []).map((p) => p.quote_of).filter(Boolean))];
  if (!qids.length) return rows;
  const { data: originals } = await supabase.from("posts").select("*").in("id", qids);
  if (!originals || !originals.length) return rows;
  const map = Object.fromEntries(originals.map((o) => [o.id, o]));
  return rows.map((p) => (p.quote_of && map[p.quote_of] ? { ...p, quote_data: map[p.quote_of] } : p));
}

const PAGE_SIZE = 30;
  const [hasMore, setHasMore] = useState(true);

  const loadPosts = useCallback(async () => {
    setPostsLoading(true);
    const { data, error } = await supabase.from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (!error && data) {
      const postIds = data.map((p) => p.id);
      if (postIds.length > 0) {
        const { data: commentCounts } = await supabase
          .from("comments")
          .select("post_id")
          .in("post_id", postIds);
        const countMap = {};
        if (commentCounts) {
          commentCounts.forEach((c) => { countMap[c.post_id] = (countMap[c.post_id] || 0) + 1; });
        }
        const enriched = await enrichQuotes(data.map((p) => ({ ...p, comment_count: countMap[p.id] || 0 })));
        setPosts(enriched);
      } else {
        setPosts([]);
      }
      setHasMore(data.length >= PAGE_SIZE);
    }
    setPostsLoading(false);
  }, []);

  const loadMorePosts = useCallback(async () => {
    if (!posts.length || !hasMore) return;
    const last = posts[posts.length - 1];
    const { data, error } = await supabase.from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .lt("created_at", last.created_at)
      .limit(PAGE_SIZE);
    if (!error && data && data.length > 0) {
      const postIds = data.map((p) => p.id);
      const { data: commentCounts } = await supabase
        .from("comments")
        .select("post_id")
        .in("post_id", postIds);
      const countMap = {};
      if (commentCounts) {
        commentCounts.forEach((c) => { countMap[c.post_id] = (countMap[c.post_id] || 0) + 1; });
      }
      const enriched = await enrichQuotes(data.map((p) => ({ ...p, comment_count: countMap[p.id] || 0 })));
      setPosts((prev) => [...prev, ...enriched]);
      setHasMore(data.length >= PAGE_SIZE);
    } else {
      setHasMore(false);
    }
  }, [posts, hasMore]);
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

  // ─── View counting (debounced, only for first page of posts) ───
  const viewCountTimerRef = useRef(null);
  const countViewsForPosts = useCallback((postList) => {
    if (!postList || postList.length === 0) return;
    const batch = [];
    postList.slice(0, 8).forEach((post) => {
      if (countedViewRef.current.has(post.id)) return;
      if (hasViewed(post.id)) { countedViewRef.current.add(post.id); return; }
      countedViewRef.current.add(post.id);
      saveViewed(post.id);
      batch.push({ id: post.id, views: (post.views || 0) + 1 });
    });
    if (batch.length === 0) return;
    setPosts((prev) => {
      const updated = [...prev];
      batch.forEach(({ id, views }) => {
        const idx = updated.findIndex((p) => p.id === id);
        if (idx >= 0) updated[idx] = { ...updated[idx], views };
      });
      return updated;
    });
    batch.forEach(({ id }) => {
      bumpPostCounter(id, "views", 1);
    });
  }, []);

  useEffect(() => {
    if (!posts.length) return;
    clearTimeout(viewCountTimerRef.current);
    viewCountTimerRef.current = setTimeout(() => {
      countViewsForPosts(posts);
    }, 2000);
    return () => clearTimeout(viewCountTimerRef.current);
  }, [posts, countViewsForPosts]);

  const navigate = useCallback((p) => {
    setPage(p);
    setSelectedPost(null);
    setViewingProfile(null);
    setFollowersPage(null);
    if (p === "dm" && user) {
      loadDmList();
      // 如果有未读消息，自动打开第一个未读对话
      const unread = dmList.find(m => !m.read && m.sender !== user.username);
      if (unread) setDmTarget(unread.sender);
      else if (dmList.length > 0) setDmTarget(dmList[0].username);
    }
    if (p === "groups" && user) loadGroups();
    closeGroup();
    setMobileTab(p === "home" ? "home" : p === "dm" ? "dm" : p === "groups" ? "groups" : (p === "profile" || p === "settings") ? "me" : p === "notifications" ? "notif" : "home");
    window.history.pushState({ page: p }, "", `#${p}`);
  }, [user, loadDmList, dmList, setDmTarget, loadGroups, closeGroup]);

  useEffect(() => {
    const handlePopState = (e) => {
      if (e.state?.page) {
        setPage(e.state.page);
        setSelectedPost(null);
        setDmTarget(null);
        setViewingProfile(null);
        setFollowersPage(null);
        closeGroup();
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [closeGroup]);

  // Deep link (run once when posts load)
  const deepLinkDone = useRef(false);
  useEffect(() => {
    if (deepLinkDone.current || !posts.length) return;
    const params = new URLSearchParams(window.location.search);
    const pid = params.get("post");
    if (pid) {
      const found = posts.find((p) => String(p.id) === String(pid));
      if (found) setSelectedPost(found);
    }
    const pageParam = params.get("page");
    if (pageParam && user) {
      if (pageParam === "dm") navigate("dm");
      else if (pageParam === "groups") navigate("groups");
      window.history.replaceState({}, "", window.location.pathname);
    }
    deepLinkDone.current = true;
  }, [posts, user, navigate]);

  // ─── 详情页滚动位置记忆：关闭详情后回到点开前的位置 ───
  // （打开时记录列表滚动位置；详情页自身挂载时会 scrollTo(0)）
  const feedScrollRef = useRef(0);
  useEffect(() => {
    if (selectedPost) {
      feedScrollRef.current = window.scrollY;
    } else {
      const y = feedScrollRef.current;
      if (y > 0) requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [selectedPost]);

  // ─── PWA Notification Permission ───
  useEffect(() => {
    if (!user) return;
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [user]);

  // ─── PWA Badge + Native Notifications ───
  const prevTotalRef = useRef(0);
  useEffect(() => {
    if (!user) {
      try { navigator.clearAppBadge?.(); } catch {}
      prevTotalRef.current = 0;
      return;
    }
    const total = (dmUnreadCount || 0) + (unreadCount || 0);

    try {
      // headless 浏览器(自动化测试环境)的 BadgeService 未实现,调用会导致渲染进程被杀
      const isHeadless = /Headless/i.test(navigator.userAgent);
      if (!isHeadless) {
        if (total > 0) navigator.setAppBadge?.(total);
        else navigator.clearAppBadge?.();
      }
    } catch {}
    try {
      navigator.serviceWorker?.controller?.postMessage({ type: "BADGE_UPDATE", count: total });
    } catch {}

    if (total > prevTotalRef.current && prevTotalRef.current > 0) {
      const newCount = total - prevTotalRef.current;
      if ("Notification" in window && Notification.permission === "granted" && document.visibilityState !== "visible") {
        const notifTitle = dmUnreadCount > 0 ? "新私信" : "新通知";
        const notifBody = dmUnreadCount > 0
          ? `你有 ${dmUnreadCount} 条未读私信`
          : `你有 ${unreadCount} 条新通知`;
        try {
          const n = new Notification(notifTitle, {
            body: notifBody,
            icon: "./icon-192.png",
            badge: "./icon-192.png",
            tag: "stgblog-unread",
            vibrate: [200, 100, 200],
          });
          n.onclick = () => {
            window.focus();
            if (dmUnreadCount > 0) navigate("dm");
            else navigate("notifications");
            n.close();
          };
        } catch {}
      }
    }
    prevTotalRef.current = total;
  }, [user, dmUnreadCount, unreadCount, navigate]);

  // ─── Handlers ───
  const handlePublish = useCallback(async () => {
    if (!user) { setAuthOpen(true); return; }
    if (publishing) return;
    const content = composeText.trim();
    if (!content) return;
    if (content.length > 5000) { alert("内容不能超过5000字"); return; }
    setPublishing(true);
    try {
      let post = null;
      const makeAnnouncement = isAdmin(user) && composeAnnouncement;
      if (makeAnnouncement) {
        // 公告走直接插入，带上 is_announcement 标记（create_post RPC 不含该字段）
        try {
          const { data, error } = await supabase.from("posts").insert([{
            title: content.slice(0, 60),
            content,
            author: user.username,
            category: "公告",
            likes: 0, views: 0, reposts: 0, pinned: false, edited: false,
            is_announcement: true,
          }]).select("*").single();
          if (error) throw error;
          post = data;
        } catch (annErr) {
          console.warn("公告插入失败（可能需要运行 migration_v10_announcement.sql），回退普通发帖:", annErr);
          const columnName = annErr?.message || "";
          if (/is_announcement/.test(columnName)) alert("公告标记失败：数据库缺少 is_announcement 字段。\n请在 Supabase SQL 编辑器运行仓库里的 migration_v10_announcement.sql 后重试。");
          // 回退为普通发帖（与普通路径一致）
          const { data, error } = await supabase.rpc("create_post", {
            p_username: user.username,
            p_content: content,
            p_category: "动态",
          });
          if (error) throw annErr;
          post = Array.isArray(data) ? data[0] : data;
        }
      } else {
        try {
          const { data, error } = await supabase.rpc("create_post", {
            p_username: user.username,
            p_content: content,
            p_category: "动态",
          });
          if (error) throw error;
          if (data) post = Array.isArray(data) ? data[0] : data;
        } catch (rpcErr) {
          console.warn("RPC create_post 失败，回退到直接插入:", rpcErr);
          const { data, error } = await supabase.from("posts").insert([{
            title: content.slice(0, 60),
            content,
            author: user.username,
            category: "动态",
            likes: 0, views: 0, reposts: 0, pinned: false, edited: false,
          }]).select("*").single();
          if (error) throw error;
          post = data;
        }
      }
      if (post) {
        setPosts((prev) => [post, ...prev]);
        setComposeText("");
        setComposeAnnouncement(false);
      }
    } catch (e) {
      console.error("发帖失败:", e);
      alert("发帖失败: " + (e.message || "网络错误"));
    } finally {
      setPublishing(false);
    }
  }, [user, composeText, publishing, composeAnnouncement]);

  // ─── 提问站:发布问题 ───
  const handleAsk = useCallback(async (question) => {
    const q = String(question || "").trim();
    if (!q) return;
    if (!user) { setAuthOpen(true); return; }
    const { data, error } = await supabase.from("posts").insert([{
      title: q.slice(0, 100), content: q, author: user.username, category: "提问",
      likes: 0, views: 0, reposts: 0, pinned: false,
    }]).select("*").single();
    if (!error && data) {
      setPosts((prev) => [data, ...prev]);
      showToast("✅ 提问成功，等待大家回答");
    } else {
      showToast("提问失败：" + (error?.message || "未知错误"), 3000);
    }
  }, [user]);

  // ─── 长文站:发布长文(Markdown 或普通文本)───
  const handlePublishLongForm = useCallback(async ({ title, content, isMd }) => {
    if (!user) { setAuthOpen(true); return; }
    const t = String(title || "").trim(), c = String(content || "").trim();
    if (!t || !c) { showToast("标题和正文都不能为空", 3000); return; }
    const { data, error } = await supabase.from("posts").insert([{
      title: t.slice(0, 120), content: c, author: user.username, category: isMd ? "长文MD" : "长文",
      likes: 0, views: 0, reposts: 0, pinned: false,
    }]).select("*").single();
    if (!error && data) {
      setPosts((prev) => [data, ...prev]);
      showToast("✅ 长文已发布");
    } else {
      showToast("发布失败：" + (error?.message || "未知错误"), 3000);
    }
  }, [user]);

  // ─── 键盘快捷键（Ctrl+Enter 发布 · Ctrl+K 搜索 · Esc 关闭弹层）───
  // 注意：必须定义在 handlePublish 之后，否则依赖数组会在渲染期触发 TDZ 错误
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+Enter 发送帖子
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        const textarea = composeRef.current;
        if (textarea && composeText.trim()) {
          textarea.focus();
          handlePublish();
        }
      }
      // Ctrl+K 打开搜索
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setPage("search");
      }
      // Esc 关闭模态框
      if (e.key === "Escape") {
        setAuthOpen(false);
        setNewDmOpen(false);
        setRepostModal(null);
        setEditPostModal(null);
        setCreateGroupOpen(false);
        setJoinGroupOpen(false);
        setGroupSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [composeText, handlePublish]);

  const handleDeletePost = useCallback(async (post) => {
    if (!post || !user || post.author !== user.username) return;
    if (!window.confirm("确定删除？")) return;
    const { error } = await supabase.from("posts").delete().eq("id", post.id).eq("author", user.username);
    if (error) { showToast("删除失败：" + error.message, 3000); return; }
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    setSelectedPost(null);
  }, [user]);

  const handleEditPost = useCallback(async (postId, newContent) => {
    if (!user) return;
    const { error } = await supabase.from("posts").update({ content: newContent, title: newContent.slice(0, 60), edited: true }).eq("id", postId).eq("author", user.username);
    if (error) { showToast("编辑失败：" + error.message, 3000); return; }
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, content: newContent, title: newContent.slice(0, 60), edited: true } : p));
    if (selectedPost?.id === postId) setSelectedPost((s) => s ? { ...s, content: newContent, title: newContent.slice(0, 60), edited: true } : s);
    setEditPostModal(null);
  }, [user, selectedPost]);

  const handleLike = useCallback(async (post) => {
    if (!post || hasLiked(post.id)) return;
    const next = (post.likes || 0) + 1;
    setPosts((prev) => prev.map((i) => i.id === post.id ? { ...i, likes: next } : i));
    if (selectedPost?.id === post.id) setSelectedPost((s) => s ? { ...s, likes: next } : s);
    saveLiked(post.id);
    const serverNext = await bumpPostCounter(post.id, "likes", 1);
    if (serverNext != null && serverNext !== next) {
      setPosts((prev) => prev.map((i) => i.id === post.id ? { ...i, likes: serverNext } : i));
      if (selectedPost?.id === post.id) setSelectedPost((s) => s ? { ...s, likes: serverNext } : s);
    }
    if (user && post.author !== user.username) {
      await supabase.from("notifications").insert([{
        user_to: post.author, user_from: user.username, type: "like", post_id: post.id,
      }]);
    }
  }, [user, selectedPost]);

  const handleRepost = useCallback(async (post) => {
    if (!user) { setAuthOpen(true); return; }
    setRepostModal(post);
  }, [user]);

  const doRepost = useCallback(async (post) => {
    if (!user) return;
    const existing = posts.find((p) => p.author === user.username && p.repost_of === post.id);
    if (existing) return;
    const { data, error } = await supabase.from("posts").insert([{
      title: `转发: ${post.content?.slice(0, 40)}`, content: post.content,
      author: user.username, category: "动态",
      likes: 0, views: 0, reposts: 0, pinned: false,
      repost_of: post.id,
    }]).select("*").single();
    if (!error) {
      data.repost_data = post;
      setPosts((prev) => [data, ...prev]);
      bumpPostCounter(post.id, "reposts", 1);
      const next = (post.reposts || 0) + 1;
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
    setPosts((prev) => [...prev]);
  }, []);

  const handleShare = useCallback(async (post) => {
    if (!post) return;
    const url = new URL(window.location.href); url.searchParams.set("post", String(post.id));
    const link = url.toString();
    try {
      await navigator.clipboard.writeText(link);
      showToast("🔗 链接已复制");
    } catch {
      // 剪贴板 API 不可用时的降级方案
      try {
        const ta = document.createElement("textarea");
        ta.value = link;
        ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        showToast("🔗 链接已复制");
      } catch {
        showToast("复制失败，请手动复制链接");
      }
    }
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
    // 详情页顶部保持品牌名，页头"← 帖子"由详情卡片自身呈现，避免两级标题重复
    if (page === "dm-chat") return dmTarget;
    if (page === "group-chat" && activeGroup) return activeGroup.name;
    if (page === "search") return "搜索";
    if (page === "questions") return "提问";
    if (page === "blog") return "博客";
    if (page === "dm") return "私信";
    if (page === "groups") return "群组";
    if (page === "notifications") return "通知";
    if (page === "profile-view") return viewingProfile;
    if (page === "followers") return followersPage?.type === "followers" ? "粉丝" : "关注";
    if (page === "settings") return "设置";
    if (page === "profile") return "个人";
    return "STGBLOG";
  };

  // ─── Page Router ───
  const renderPage = () => {
    if (followersPage) return <FollowersPage username={followersPage.username} type={followersPage.type} onBack={() => { setFollowersPage(null); setPage("home"); }} onUserClick={openUserClick} />;
    if (selectedPost) return (
      <PostDetail post={selectedPost} onClose={() => setSelectedPost(null)}
        onLike={handleLike} onShare={handleShare} onRepost={handleRepost} onBookmark={handleBookmark}
        onUserClick={openUserClick} onDeletePost={handleDeletePost} onEditPost={setEditPostModal}
        onHashtag={handleHashtag} />
    );
    if (page === "dm-chat" && dmTarget) return (
      <DmChatPage dmTarget={dmTarget} dmMessages={dmMessages} dmSending={dmSending}
        onSend={sendDm} onBack={() => { closeDm(); setPage("dm"); }} onUserClick={openUserClick} onMarkAsRead={markAsRead}
        onLoadMore={loadMoreDmMessages} dmLive={dmLive} onRecall={recallDm}
        dmLoadError={dmLoadError} onReloadDm={() => loadDmMessages(dmTarget)} />
    );
    if (page === "notifications") return <NotificationPage notifications={notifications} onNotifClick={handleNotifClick} onBack={() => navigate("home")} />;
    if (page === "search") return <SearchPage searchKey={searchKey} setSearchKey={setSearchKey} posts={posts} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} onRepost={handleRepost} onBookmark={handleBookmark} onBack={() => navigate("home")} />;
    if (page === "dm") return <DmListPage dmList={dmList} onOpenDm={(u) => { openDm(u); setPage("dm-chat"); }} onNewDm={() => setNewDmOpen(true)} onTogglePin={togglePin} onDeleteConversation={deleteConversation} onSetNickname={setNickname} onOpenGroups={() => { setPage("groups"); setMobileTab("groups"); }} />;
    if (page === "groups") return <GroupListPage groups={groups} onOpenGroup={(g) => { openGroup(g); setPage("group-chat"); }} onCreateGroup={() => setCreateGroupOpen(true)} onJoinGroup={() => setJoinGroupOpen(true)} />;
    if (page === "group-chat" && activeGroup) return (
      <GroupChatPage group={activeGroup} messages={groupMessages} members={groupMembers} sending={groupSending}
        onSend={sendGroupMessage} onBack={() => { closeGroup(); setPage("groups"); }}
        onUserClick={openUserClick} onKickMember={kickMember} onDeleteGroup={(id) => { deleteGroup(id); setPage("groups"); }}
        onLeaveGroup={(id) => { leaveGroup(id); setPage("groups"); }} onGetMembers={getGroupMembers}
        onOpenSettings={() => setGroupSettingsOpen(true)} onShareKey={shareGroupKey}
        onLoadMore={loadMoreGroupMessages} />
    );
    if (page === "profile-view" && viewingProfile) return <ProfileViewPage viewingProfile={viewingProfile} posts={posts} onBack={() => { setViewingProfile(null); setPage("home"); setMobileTab("home"); }} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} onRepost={handleRepost} onBookmark={handleBookmark} onOpenDm={(u) => { openDm(u); setPage("dm-chat"); }} />;
    if (page === "settings") return <SettingsPage onBack={() => { if (user) { navigate("profile"); } else { navigate("home"); } }} />;
    if (page === "profile") return <ProfilePage posts={posts} onAuthOpen={() => setAuthOpen(true)} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} onRepost={handleRepost} onBookmark={handleBookmark} onFollowersPage={(type) => setFollowersPage({ username: user?.username, type })} onOpenUser={openUserClick} onOpenSettings={() => navigate("settings")} />;
    if (page === "questions") return <QuestionsPage posts={posts} postsLoading={postsLoading} onAsk={handleAsk} onSelectPost={(p) => setSelectedPost(p)} onAuthOpen={() => setAuthOpen(true)} onUserClick={openUserClick} />;
    if (page === "blog") return <BlogPage posts={posts} postsLoading={postsLoading} publishing={publishing} onPublishLongForm={handlePublishLongForm} onSelectPost={(p) => setSelectedPost(p)} onAuthOpen={() => setAuthOpen(true)} onUserClick={openUserClick} />;
    return <HomeFeed posts={posts} postsLoading={postsLoading} hasMore={hasMore} loadMorePosts={loadMorePosts} searchKey={searchKey} composeText={composeText} setComposeText={setComposeText} onPublish={handlePublish} publishing={publishing} composeRef={composeRef} isAnnouncement={composeAnnouncement} onAnnouncementChange={setComposeAnnouncement} onSelectPost={(p) => setSelectedPost(p)} onLike={handleLike} onShare={handleShare} onRepost={handleRepost} onBookmark={handleBookmark} onHashtag={handleHashtag} onAuthOpen={() => setAuthOpen(true)} />;
  };

  return (
    <div className="app">
      {styleMode === "editorial" && <EditorialTopStrip />}
      <nav className="topnav">
        <div className="topnav-inner">
          <div className="topnav-brand" onClick={() => navigate("home")} style={{ cursor: "pointer" }}>
            <div className="topnav-logo">S</div>
            <span className="topnav-title">{topTitle()}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button className="compose-tool" onClick={toggleTheme} title="切换颜色模式">
              {colorMode === "dark" ? <Icons.ThemeLight /> : <Icons.ThemeDark />}
            </button>
            <button className="compose-tool" onClick={() => navigate("settings")} title="设置"><Icons.Settings /></button>
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
                        <div className="notif-icon">{n.type === "like" ? "❤️" : n.type === "comment" ? "💬" : n.type === "reply" ? "↩️" : n.type === "repost" ? "🔁" : n.type === "quote" ? "💬" : "🔔"}</div>
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
                <div className="post-avatar" style={{ width: 28, height: 28, fontSize: 12, background: avatarColor(user.username) }}>{user.username[0]}</div>
              </button>
            ) : (
              <button className="topnav-login" onClick={() => setAuthOpen(true)}>登录</button>
            )}
          </div>
        </div>
      </nav>

      <SectionNav page={page} onNavigate={navigate} />

      <div className="desktop-wrap">
        <aside className="sidebar">
          <button className="sidebar-btn" onClick={() => navigate("home")}><span className="sb-icon"><Icons.Home /></span>主页</button>
          <button className={`sidebar-btn ${page === "questions" ? "sb-on" : ""}`} onClick={() => navigate("questions")}><span className="sb-icon">❓</span>提问</button>
          <button className={`sidebar-btn ${page === "blog" ? "sb-on" : ""}`} onClick={() => navigate("blog")}><span className="sb-icon">📄</span>博客</button>
          <button className="sidebar-btn" onClick={() => navigate("search")}><span className="sb-icon"><Icons.Search /></span>搜索</button>
          {user && <button className="sidebar-btn" onClick={() => navigate("notifications")}><span className="sb-icon"><Icons.Bell /></span>通知{unreadCount > 0 && <span className="sidebar-badge">{unreadCount > 9 ? "9+" : unreadCount}</span>}</button>}
          {user && <button className="sidebar-btn" onClick={() => navigate("dm")}><span className="sb-icon"><Icons.Msg /></span>私信{dmUnreadCount > 0 && <span className="sidebar-badge">{dmUnreadCount > 9 ? "9+" : dmUnreadCount}</span>}</button>}
          {user && <button className="sidebar-btn" onClick={() => navigate("groups")}><span className="sb-icon"><Icons.Group /></span>群组</button>}
          {user && <button className="sidebar-btn" onClick={() => navigate("profile")}><span className="sb-icon"><Icons.User /></span>个人</button>}
          <button className="sidebar-btn" onClick={toggleTheme}><span className="sb-icon">{colorMode === "dark" ? <Icons.ThemeLight /> : <Icons.ThemeDark />}</span>{colorMode === "dark" ? "亮色模式" : "暗色模式"}</button>
          <button className="sidebar-btn" onClick={() => navigate("settings")}><span className="sb-icon"><Icons.Settings /></span>设置</button>
          {user ? (
            <button className="sidebar-compose" onClick={() => { navigate("home"); setMobileTab("home"); setTimeout(() => composeRef.current?.focus(), 100); }}>发帖</button>
          ) : (
            <button className="sidebar-compose" onClick={() => setAuthOpen(true)}>登录</button>
          )}
        </aside>
        <div className="layout"><ErrorBoundary>{renderPage()}</ErrorBoundary></div>
      </div>

      {page === "dm-chat" && dmTarget && (
        <div className="dm-overlay">
          <DmChatPage dmTarget={dmTarget} dmMessages={dmMessages} dmSending={dmSending}
            onSend={sendDm} onBack={() => { closeDm(); setPage("dm"); }} onUserClick={openUserClick} onMarkAsRead={markAsRead}
            onLoadMore={loadMoreDmMessages} dmLive={dmLive} onRecall={recallDm}
            dmLoadError={dmLoadError} onReloadDm={() => loadDmMessages(dmTarget)} />
        </div>
      )}

      {page === "group-chat" && activeGroup && (
        <div className="dm-overlay">
          <GroupChatPage group={activeGroup} messages={groupMessages} members={groupMembers} sending={groupSending}
            onSend={sendGroupMessage} onBack={() => { closeGroup(); setPage("groups"); }}
            onUserClick={openUserClick} onKickMember={kickMember} onDeleteGroup={(id) => { deleteGroup(id); setPage("groups"); }}
            onLeaveGroup={(id) => { leaveGroup(id); setPage("groups"); }} onGetMembers={getGroupMembers}
            onOpenSettings={() => setGroupSettingsOpen(true)} onShareKey={shareGroupKey}
            onLoadMore={loadMoreGroupMessages} />
        </div>
      )}

      {page !== "dm-chat" && page !== "group-chat" && (
        <nav className="bnav">
          <button className={`bnav-btn ${mobileTab === "home" ? "on" : ""}`} onClick={() => navigate("home")}><span className="bnav-icon"><Icons.Home /></span><span className="bnav-label">主页</span></button>
          <button className={`bnav-btn ${mobileTab === "search" ? "on" : ""}`} onClick={() => navigate("search")}><span className="bnav-icon"><Icons.Search /></span><span className="bnav-label">搜索</span></button>
          <button className={`bnav-btn ${mobileTab === "dm" ? "on" : ""}`} onClick={() => { if (user) navigate("dm"); else setAuthOpen(true); }} style={{ position: "relative" }}>
            <span className="bnav-icon"><Icons.Msg /></span><span className="bnav-label">私信</span>
            {dmUnreadCount > 0 && <span className="bnav-dot" />}
          </button>
          <button className={`bnav-btn ${mobileTab === "me" ? "on" : ""}`} onClick={() => navigate("profile")} style={{ position: "relative" }}>
            <span className="bnav-icon"><Icons.User /></span><span className="bnav-label">我的</span>
            {unreadCount > 0 && <span className="bnav-dot" />}
          </button>
          <button className="bnav-compose" onClick={() => { if (user) { navigate("home"); setMobileTab("home"); setTimeout(() => composeRef.current?.focus(), 100); } else setAuthOpen(true); }}>✎</button>
        </nav>
      )}

      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}
      <AnnouncementModal user={user} />
      {newDmOpen && <NewDmModal onClose={() => setNewDmOpen(false)} onStartDm={(target) => { setNewDmOpen(false); openDm(target); setPage("dm-chat"); }} />}
      {repostModal && <RepostModal post={repostModal} onRepost={doRepost} onQuote={doQuote} onClose={() => setRepostModal(null)} />}
      {editPostModal && <EditPostModal post={editPostModal} onSave={handleEditPost} onClose={() => setEditPostModal(null)} />}
      {createGroupOpen && <CreateGroupModal onClose={() => setCreateGroupOpen(false)} onCreateGroup={createGroup} />}
      {joinGroupOpen && <JoinGroupModal onClose={() => setJoinGroupOpen(false)} onJoinGroup={joinGroup} />}
      {groupSettingsOpen && activeGroup && (
        <GroupSettingsModal group={activeGroup} members={groupMembers}
          onClose={() => setGroupSettingsOpen(false)}
          onUpdateName={updateGroupName} onSetRole={setMemberRole}
          onKickMember={kickMember} onTransferOwnership={transferOwnership}
          onDeleteGroup={(id) => { deleteGroup(id); setGroupSettingsOpen(false); setPage("groups"); }}
          onLeaveGroup={(id) => { leaveGroup(id); setGroupSettingsOpen(false); setPage("groups"); }}
          onGetMembers={getGroupMembers} />
      )}
      {(!onboardingShown && !user) && (
        <Onboarding onComplete={() => setOnboardingShown(true)} />
      )}
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
