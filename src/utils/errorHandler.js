/**
 * 统一错误处理工具
 * 提供统一的错误捕获、显示和恢复机制
 */

import { useState, useCallback } from "react";

/**
 * 创建带错误处理的异步函数
 * @param fn 异步函数
 * @param onError 错误回调
 * @returns {execute, error, loading, reset}
 */
export function useAsyncErrorHandler(fn, onError = null) {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const execute = useCallback(async (...args) => {
    setError(null);
    setLoading(true);
    try {
      const result = await fn(...args);
      return result;
    } catch (err) {
      const msg = err?.message || "操作失败，请重试";
      setError(msg);
      if (onError) {
        onError(err, msg);
      }
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fn, onError]);

  const reset = useCallback(() => setError(null), []);

  return { execute, error, loading, reset };
}

export { useAsyncErrorHandler as useAsync };

/**
 * 格式化错误消息，使其更用户友好
 * @param error 错误对象
 * @returns 用户友好的错误信息
 */
export function formatErrorMessage(error) {
  if (!error) return "未知错误";
  
  const msg = error.message || error || "未知错误";
  
  // 常见错误映射
  const errorMap = {
    "Failed to fetch": "网络连接失败，请检查网络后重试",
    "Failed to load resource": "资源加载失败，请检查网络",
    "JWT expired": "登录已过期，请重新登录",
    "Invalid credentials": "用户名或密码错误",
    "User already exists": "用户名已存在",
    "Not authorized": "权限不足，无法执行此操作",
    "Not found": "资源不存在",
    "Too many requests": "请求过于频繁，请稍后再试",
  };

  for (const [key, value] of Object.entries(errorMap)) {
    if (msg.includes(key)) {
      return value;
    }
  }

  return msg;
}

/**
 * 带错误提示的异步函数包装器
 * 自动显示错误提示
 * @param fn 异步函数
 * @param showError 是否显示错误提示（通过回调）
 * @returns 执行函数
 */
export function withErrorHandler(fn, onError = null) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      const msg = formatErrorMessage(err);
      if (onError) {
        onError(err, msg);
      } else {
        console.error("操作失败:", msg);
      }
      throw err;
    }
  };
}
