import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "你的SUPABASE_URL";
const supabaseKey = "你的SUPABASE_ANON_KEY";

const supabase = createClient(supabaseUrl, supabaseKey);

export default function App() {
  const [posts, setPosts] = useState([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  async function loadPosts() {
    const { data } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false });

    setPosts(data || []);
  }

  async function createPost() {
    if (!title || !content) return;

    await supabase.from("posts").insert([
      {
        title,
        content,
        author:
          "STG#" +
          Math.random().toString(16).slice(2, 8),
      },
    ]);

    setTitle("");
    setContent("");

    loadPosts();
  }

  useEffect(() => {
    loadPosts();
  }, []);

  return (
    <div
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "40px",
      }}
    >
      <h1
        style={{
          fontSize: "50px",
          marginBottom: "30px",
        }}
      >
        STGBLOG
      </h1>

      <div
        style={{
          background: "#111",
          padding: "20px",
          borderRadius: "20px",
          marginBottom: "40px",
        }}
      >
        <input
          placeholder="帖子标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            width: "100%",
            padding: "15px",
            marginBottom: "15px",
            borderRadius: "10px",
            border: "1px solid #333",
            background: "#0a0a0a",
            color: "white",
          }}
        />

        <textarea
          placeholder="帖子内容"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{
            width: "100%",
            height: "150px",
            padding: "15px",
            borderRadius: "10px",
            border: "1px solid #333",
            background: "#0a0a0a",
            color: "white",
          }}
        />

        <button
          onClick={createPost}
          style={{
            marginTop: "15px",
            width: "100%",
            padding: "15px",
            border: "none",
            borderRadius: "12px",
            background: "white",
            color: "black",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          发布帖子
        </button>
      </div>

      {posts.map((post) => (
        <div
          key={post.id}
          style={{
            background: "#111",
            padding: "20px",
            borderRadius: "20px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              opacity: 0.5,
              marginBottom: "10px",
            }}
          >
            {post.author}
          </div>

          <h2>{post.title}</h2>

          <p
            style={{
              marginTop: "10px",
              lineHeight: 1.8,
              opacity: 0.8,
            }}
          >
            {post.content}
          </p>
        </div>
      ))}
    </div>
  );
}
