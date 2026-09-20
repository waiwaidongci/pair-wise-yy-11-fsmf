import { useState } from "react";
import "./styles.css";
import { deriveTankStatus, todayStr } from "./domain/rules";
import { StoreProvider, useStore } from "./store/StoreContext";
import { DeliveryPanel } from "./ui/DeliveryPanel";
import { FillPanel } from "./ui/FillPanel";
import { HistoryPanel } from "./ui/HistoryPanel";
import { QueueBoard } from "./ui/QueueBoard";
import { RegisterForm } from "./ui/RegisterForm";

type Tab = "intake" | "fill" | "delivery" | "history";

const TABS: { id: Tab; label: string }[] = [
  { id: "intake", label: "登记与队列" },
  { id: "fill", label: "充填与返工" },
  { id: "delivery", label: "签收与交付" },
  { id: "history", label: "历史追溯" },
];

const FLOW_STEPS = ["准入检验", "瓶组配比", "充填复测", "偏差返工", "双人复核", "签收冻结", "变更失效"];

function Shell() {
  const { state, actions } = useStore();
  const [tab, setTab] = useState<Tab>("intake");
  const today = todayStr();

  const statuses = state.tanks.map((t) => deriveTankStatus(t, today));
  const queued = statuses.filter((s) => s === "queued").length;
  const inspection = statuses.filter((s) => s === "pending-inspection").length;
  const rework = statuses.filter((s) => s === "rework" || s === "pending-review").length;
  const validSignoffs = state.tanks.reduce(
    (n, t) => n + t.signoffs.filter((s) => s.valid).length,
    0
  );
  const filled = state.tanks.filter((t) => t.fills.length > 0);
  const avgO2 = filled.length
    ? `${(filled.reduce((s, t) => s + t.fills[t.fills.length - 1].o2, 0) / filled.length).toFixed(1)}%`
    : "—";

  const metrics = [
    { label: "待充填", value: queued },
    { label: "送检提醒", value: inspection },
    { label: "返工 / 复核", value: rework },
    { label: "平均实测氧含量", value: avgO2 },
    { label: "有效签收单", value: validSignoffs },
  ];

  return (
    <main className="app">
      <section className="hero">
        <div className="hero-top">
          <p>hxyfront-62010 · 源提示词5 · Port 62010</p>
          <button
            onClick={() => {
              if (window.confirm("重置为演示数据？当前全部记录将被清除。")) actions.resetDemo();
            }}
          >
            重置演示数据
          </button>
        </div>
        <h1>潜水气瓶充填 · 瓶组配比与交付冻结闭环</h1>
        <span>
          气瓶按检验有效期与清洁等级准入，过期或油脂污染只能送检；同组目标压力不一致整组拒绝；
          充填后录入实测氧氦含量与静置复测压力，偏差超限进入返工并由另一人复核；
          已签收气瓶更换阀门或补录气源批次时，原签收立即失效并重算瓶组状态，历史全程保留。
        </span>
        <div className="flow">
          {FLOW_STEPS.map((s) => (
            <span key={s} className="flow-chip">{s}</span>
          ))}
        </div>
      </section>

      <section className="metrics">
        {metrics.map((m) => (
          <article key={m.label}>
            <small>{m.label}</small>
            <strong>{m.value}</strong>
          </article>
        ))}
      </section>

      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "intake" && (
        <>
          <RegisterForm />
          <QueueBoard />
        </>
      )}
      {tab === "fill" && <FillPanel />}
      {tab === "delivery" && <DeliveryPanel />}
      {tab === "history" && <HistoryPanel />}
    </main>
  );
}

function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

export default App;
