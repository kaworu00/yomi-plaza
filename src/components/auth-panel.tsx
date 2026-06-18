"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { StatusNote } from "@/components/status-note";

export function AuthPanel() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setMessage("");

    if (!supabase) {
      const response = await fetch("/api/demo-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: account, password, displayName: name, mode })
      });
      const payload = (await response.json()) as { error?: string; message?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(payload.error ?? "登录失败。");
        return;
      }

      setStatus("success");
      setMessage(mode === "sign-up" ? "注册成功，初始积分为 0。" : "登录成功。");
      router.refresh();
      router.push(mode === "sign-up" ? "/workspace" : "/dashboard");
      return;
    }

    const result =
      mode === "sign-in"
        ? await supabase.auth.signInWithPassword({ email: account, password })
        : await supabase.auth.signUp({
            email: account,
            password,
            options: {
              data: {
                display_name: name
              },
              emailRedirectTo: `${window.location.origin}/workspace`
            }
          });

    if (result.error) {
      setStatus("error");
      setMessage(result.error.message);
      return;
    }

    setStatus("success");
    setMessage(mode === "sign-in" ? "登录成功，正在进入工作台。" : "注册成功，请按邮箱验证设置继续。");
    router.refresh();
    if (mode === "sign-in") {
      router.push("/workspace");
    }
  }

  return (
    <section className="mx-auto grid min-h-[calc(100dvh-72px)] max-w-[1200px] items-center gap-10 px-4 py-10 md:grid-cols-[0.9fr_1.1fr] md:px-8">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.28em] text-moss-700">Member Studio</p>
        <h1 className="mt-5 text-4xl font-semibold tracking-tighter text-ink-950 md:text-6xl">
          注册后进入工作台，积分由后台发放。
        </h1>
        <p className="mt-6 max-w-xl text-base leading-8 text-ink-700">
          访客只能浏览精选广场。注册用户可以保存自己的生成历史；没有积分时能看工作台，但不能提交生图任务。
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-[2rem] border border-ink-950/10 bg-white p-6 shadow-diffusion md:p-8"
      >
        <div className="flex rounded-full bg-ink-950/5 p-1">
          {(["sign-in", "sign-up"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={`flex-1 rounded-full px-4 py-2 text-sm transition duration-300 active:translate-y-px ${
                mode === item ? "bg-ink-950 text-paper" : "text-ink-700"
              }`}
            >
              {item === "sign-in" ? "登录" : "注册"}
            </button>
          ))}
        </div>

        {mode === "sign-up" && (
          <label className="mt-6 block" htmlFor="display-name">
            <span className="text-sm font-medium text-ink-950">显示名称</span>
            <input
              id="display-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3 outline-none transition focus:border-moss-700"
              placeholder="例如：沈临照"
            />
          </label>
        )}

        <label className="mt-6 block" htmlFor="account">
          <span className="text-sm font-medium text-ink-950">账号</span>
          <input
            id="account"
            type={supabase ? "email" : "text"}
            required
            value={account}
            onChange={(event) => setAccount(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3 outline-none transition focus:border-moss-700"
            placeholder={supabase ? "you@example.com" : "admin"}
          />
          {!supabase && <span className="mt-2 block text-xs text-ink-700">演示管理员账号：admin</span>}
        </label>

        <label className="mt-5 block" htmlFor="password">
          <span className="text-sm font-medium text-ink-950">密码</span>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-ink-950/10 bg-paper px-4 py-3 outline-none transition focus:border-moss-700"
            placeholder={supabase ? "至少 6 位" : "请输入管理员密码"}
          />
        </label>

        <button
          type="submit"
          disabled={status === "loading"}
          className="mt-7 w-full rounded-full bg-ink-950 px-5 py-3 text-sm font-semibold text-paper transition duration-300 hover:bg-ink-900 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "loading" ? "处理中..." : mode === "sign-in" ? "进入工作台" : "创建账号"}
        </button>

        {message && (
          <div className="mt-5">
            <StatusNote
              title={status === "success" ? "已完成" : "需要处理"}
              body={message}
              tone={status === "success" ? "success" : "warning"}
            />
          </div>
        )}
      </form>
    </section>
  );
}
