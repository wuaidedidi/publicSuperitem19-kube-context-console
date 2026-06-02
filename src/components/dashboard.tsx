"use client";

import { useMemo, useState, useTransition } from "react";
import type { DashboardStats } from "@/lib/types";

type ContextRow = {
  id: string;
  name: string;
  namespace: string;
  environment: string;
  riskLevel: string;
  riskReasons: string;
  owner: string;
  cluster: {
    name: string;
    server: string;
    insecure: boolean;
  };
  credential: {
    name: string;
    authType: string;
  };
};

const starterConfig = `apiVersion: v1
kind: Config
clusters:
- name: prod-shanghai
  cluster:
    server: https://k8s-prod.example.com
    insecure-skip-tls-verify: true
- name: dev-kind
  cluster:
    server: https://127.0.0.1:6443
users:
- name: platform-admin
  user:
    token: redacted-token
- name: developer
  user:
    exec:
      apiVersion: client.authentication.k8s.io/v1
      command: kubelogin
contexts:
- name: prod-admin
  context:
    cluster: prod-shanghai
    user: platform-admin
    namespace: default
- name: dev-frontend
  context:
    cluster: dev-kind
    user: developer
    namespace: frontend`;

export function Dashboard({
  initialStats,
  initialContexts
}: {
  initialStats: DashboardStats;
  initialContexts: ContextRow[];
}) {
  const [stats, setStats] = useState(initialStats);
  const [contexts, setContexts] = useState(initialContexts);
  const [source, setSource] = useState("平台团队导入");
  const [content, setContent] = useState(starterConfig);
  const [query, setQuery] = useState("");
  const [risk, setRisk] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();

  const filtered = useMemo(() => contexts, [contexts]);

  async function reload(nextQuery = query, nextRisk = risk) {
    const search = new URLSearchParams();
    if (nextQuery) search.set("q", nextQuery);
    if (nextRisk) search.set("risk", nextRisk);
    const [contextRes, statsRes] = await Promise.all([
      fetch(`/api/contexts?${search.toString()}`),
      fetch("/api/stats")
    ]);
    const contextJson = await contextRes.json();
    const statsJson = await statsRes.json();
    setContexts(contextJson.contexts);
    setStats(statsJson.stats);
  }

  function submitImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, content })
      });
      const json = await res.json();
      setIsError(!res.ok);
      setMessage(res.ok ? json.summary : json.message);
      if (res.ok) {
        await reload();
      }
    });
  }

  function applyFilters(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(() => reload(query, risk));
  }

  function updateContext(id: string, data: { namespace?: string; owner?: string }) {
    startTransition(async () => {
      const res = await fetch(`/api/contexts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (res.ok) {
        await reload();
      }
    });
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <h1>Kube Context Console</h1>
            <p>把分散的 kubeconfig context 变成可检索、可复核、可追踪的治理台。</p>
          </div>
          <div className="status-pill">SQLite 本地存储 · Next.js API · 直接 SQL 管理模型</div>
        </div>
      </header>

      <div className="workspace">
        <section className="panel import-panel">
          <div className="panel-header">
            <h2>导入 kubeconfig</h2>
            <p>粘贴真实 kubeconfig，系统会解析 context、cluster、user 并生成风险判断。</p>
          </div>
          <form onSubmit={submitImport}>
            <label>
              来源名称
              <input value={source} onChange={(event) => setSource(event.target.value)} />
            </label>
            <label>
              kubeconfig 内容
              <textarea value={content} onChange={(event) => setContent(event.target.value)} />
            </label>
            <button className="primary-btn" disabled={isPending}>
              {isPending ? "处理中..." : "导入并分析"}
            </button>
            {message ? <p className={`notice ${isError ? "error" : "ok"}`}>{message}</p> : null}
          </form>
        </section>

        <section className="main">
          <div className="stats-grid">
            <Metric label="Context 总数" value={stats.total} />
            <Metric label="高风险" value={stats.highRisk} tone="red" />
            <Metric label="中风险" value={stats.mediumRisk} tone="yellow" />
            <Metric label="低风险" value={stats.lowRisk} tone="green" />
            <Metric label="生产入口" value={stats.prodLike} tone="purple" />
          </div>

          <section className="panel">
            <div className="panel-header">
              <h2>Context 台账</h2>
              <p>风险级别来自 namespace、TLS、认证方式、API Server 和命名特征的综合判断。</p>
            </div>
            <form className="control-panel toolbar" onSubmit={applyFilters}>
              <label>
                搜索
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="context / namespace / owner" />
              </label>
              <label>
                风险
                <select value={risk} onChange={(event) => setRisk(event.target.value)}>
                  <option value="">全部</option>
                  <option value="high">高风险</option>
                  <option value="medium">中风险</option>
                  <option value="low">低风险</option>
                </select>
              </label>
              <button className="secondary-btn">筛选</button>
            </form>
            <div className="table-wrap">
              {filtered.length === 0 ? (
                <div className="empty">还没有 context 记录，请先导入 kubeconfig。</div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Context</th>
                      <th>环境 / Namespace</th>
                      <th>集群</th>
                      <th>凭据</th>
                      <th>风险</th>
                      <th>负责人调整</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <ContextItem key={item.id} item={item} onUpdate={updateContext} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="stat">
      <strong style={{ color: tone ? `var(--${tone})` : "var(--ink)" }}>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ContextItem({
  item,
  onUpdate
}: {
  item: ContextRow;
  onUpdate: (id: string, data: { namespace?: string; owner?: string }) => void;
}) {
  const [namespace, setNamespace] = useState(item.namespace);
  const [owner, setOwner] = useState(item.owner);
  const riskText = item.riskLevel === "high" ? "高风险" : item.riskLevel === "medium" ? "中风险" : "低风险";
  return (
    <tr>
      <td>
        <strong>{item.name}</strong>
        <div className="muted">{item.riskReasons || "暂无风险项"}</div>
      </td>
      <td>
        <strong>{item.environment}</strong>
        <div className="muted">{item.namespace}</div>
      </td>
      <td>
        <strong>{item.cluster.name}</strong>
        <div className="muted">{item.cluster.server}</div>
      </td>
      <td>
        <strong>{item.credential.name}</strong>
        <div className="muted">{item.credential.authType}</div>
      </td>
      <td>
        <span className={`risk ${item.riskLevel}`}>{riskText}</span>
      </td>
      <td className="row-actions">
        <div className="inline">
          <input value={namespace} onChange={(event) => setNamespace(event.target.value)} />
          <button className="secondary-btn" onClick={() => onUpdate(item.id, { namespace })} type="button">
            更新
          </button>
        </div>
        <div className="inline">
          <input value={owner} onChange={(event) => setOwner(event.target.value)} />
          <button className="secondary-btn" onClick={() => onUpdate(item.id, { owner })} type="button">
            分派
          </button>
        </div>
      </td>
    </tr>
  );
}
