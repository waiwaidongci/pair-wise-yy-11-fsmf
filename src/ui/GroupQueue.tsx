import { useMemo, useState } from "react";
import {
  backfillSourceBatch,
  recordFill,
  replaceValve,
  reviewRework,
  reviseGroup,
  signDelivery,
  startFill,
} from "../domain/flow";
import { checkStartFill } from "../domain/rules";
import type {
  FillMethod,
  GroupEvent,
  GroupSnapshot,
} from "../domain/types";
import { MiniButton, PhaseBadge, useToast } from "./bits";
import { fmtDateTime } from "./format";
import { useAppData } from "./useStore";

type Tab = "active" | "signed" | "rejected" | "all";

const TABS: { key: Tab; label: string }[] = [
  { key: "active", label: "待充填/作业中" },
  { key: "signed", label: "已冻结/待重签" },
  { key: "rejected", label: "整组拒绝" },
  { key: "all", label: "全部" },
];

export function GroupQueue() {
  const { groups } = useAppData();
  const [tab, setTab] = useState<Tab>("active");

  const counts = useMemo(() => {
    return {
      active: groups.filter((g) =>
        ["draft", "filling", "rework", "awaiting-signoff", "voided-awaiting-signoff"].includes(g.phase)
      ).length,
      signed: groups.filter((g) => g.phase === "signed").length,
      rejected: groups.filter((g) => g.phase === "rejected").length,
      all: groups.length,
    } as Record<Tab, number>;
  }, [groups]);

  const list = useMemo(() => {
    switch (tab) {
      case "active":
        return groups.filter((g) =>
          ["draft", "filling", "rework", "awaiting-signoff", "voided-awaiting-signoff"].includes(g.phase)
        );
      case "signed":
        return groups.filter((g) => g.phase === "signed");
      case "rejected":
        return groups.filter((g) => g.phase === "rejected");
      case "all":
        return groups;
    }
  }, [groups, tab]);

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>队列 · 状态机</p>
          <h2>充填瓶组队列</h2>
        </div>
        <div className="chips">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={tab === t.key ? "chip-on" : ""}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <b className="chip-count">{counts[t.key]}</b>
            </button>
          ))}
        </div>
      </div>
      <div className="group-list">
        {list.map((g) => (
          <GroupCard key={g.groupId + g.events.length} g={g} />
        ))}
        {list.length === 0 && <p className="empty">该队列暂无瓶组</p>}
      </div>
    </section>
  );
}

function GroupCard({ g }: { g: GroupSnapshot }) {
  const { store, cylinders } = useAppData();
  const toast = useToast();
  const [showHistory, setShowHistory] = useState(false);
  const [operator, setOperator] = useState(g.operator);

  const gate = checkStartFill(g, cylinders);

  return (
    <article className={`group-card phase-${g.phase}`}>
      <header className="group-head">
        <div>
          <h3>
            {g.groupId}
            <span className="group-method">{g.method}</span>
          </h3>
          <small>建组 {fmtDateTime(g.createdAt)} · 操作员 {g.operator}</small>
        </div>
        <PhaseBadge phase={g.phase} />
      </header>

      <div className="group-spec">
        <div>
          <span>目标配比</span>
          <strong>
            O₂ {g.targetO2}% / He {g.targetHe}%
          </strong>
        </div>
        <div>
          <span>目标压力</span>
          <strong>{g.targetBar} bar（全组一致）</strong>
        </div>
        <div>
          <span>组内气瓶</span>
          <strong>{g.cylinderIds.join("、")}</strong>
        </div>
      </div>

      {g.phase === "rejected" && (
        <RejectBody g={g} />
      )}

      {(g.phase === "draft" || g.phase === "voided-awaiting-signoff") && (
        <div className="action-box">
          {g.phase === "voided-awaiting-signoff" && (
            <p className="banner-purple">
              {(() => {
                const ve = g.voidEvents[g.voidEvents.length - 1];
                return (
                  <>
                    原签收已失效（{ve.reason === "source-batch-backfilled"
                      ? `补录气源批次 ${ve.sourceBatch}`
                      : "更换阀门"}
                    ），配比参数仍然有效，重新签收即可冻结；如需要也可重新充填
                  </>
                );
              })()}
            </p>
          )}
          {!gate.ok && <p className="banner-red">二次准入闸门未通过：{gate.detail}</p>}
          <div className="action-row">
            <input
              className="inline-input"
              placeholder="充填操作员"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            />
            <MiniButton
              variant="primary"
              disabled={!gate.ok}
              onClick={() => {
                const r = startFill(store, g, operator, gate);
                if (!r.ok) return toast.violations(r.violations);
                toast.ok(r.message ?? "已开始");
              }}
            >
              开始充填
            </MiniButton>
          </div>
        </div>
      )}

      {g.phase === "filling" && (
        <FillBody g={g} onDone={(r) => (r.ok ? toast.ok(r.message ?? "已录入") : toast.violations(r.violations))} />
      )}

      {g.phase === "rework" && (
        <ReworkBody g={g} />
      )}

      {(g.phase === "awaiting-signoff" || g.phase === "voided-awaiting-signoff") && (
        <SignoffBody g={g} />
      )}

      {g.phase === "signed" && (
        <FrozenBody g={g} />
      )}

      <footer className="group-foot">
        <MiniButton variant="ghost" onClick={() => setShowHistory((s) => !s)}>
          {showHistory ? "收起事件流水" : "查看事件流水/历史"}
        </MiniButton>
      </footer>

      {showHistory && <EventTimeline g={g} />}
    </article>
  );
}

function RejectBody({ g }: { g: GroupSnapshot }) {
  const { store, cylinders } = useAppData();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    targetBar: String(g.targetBar),
    targetO2: String(g.targetO2),
    targetHe: String(g.targetHe),
    method: g.method as FillMethod,
    operator: "",
  });

  return (
    <div className="action-box">
      <p className="banner-red">
        整组拒绝原因：
        {g.rejectReason === "target-pressure-mismatch"
          ? "同组目标压力不同"
          : "存在不可准入气瓶"}
        ：{g.rejectDetail}
      </p>
      {!editing ? (
        <MiniButton variant="primary" onClick={() => setEditing(true)}>
          修订瓶组（拒绝记录保留，修订后重新入队）
        </MiniButton>
      ) : (
        <div className="revise-grid">
          <label>
            <span>统一目标压力 bar</span>
            <input type="number" value={form.targetBar} onChange={(e) => setForm({ ...form, targetBar: e.target.value })} />
          </label>
          <label>
            <span>氧含量 %</span>
            <input type="number" value={form.targetO2} onChange={(e) => setForm({ ...form, targetO2: e.target.value })} />
          </label>
          <label>
            <span>氦含量 %</span>
            <input type="number" value={form.targetHe} onChange={(e) => setForm({ ...form, targetHe: e.target.value })} />
          </label>
          <label>
            <span>充填方式</span>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value as FillMethod })}>
              {(["空气充填", "高氧充填", "Trimix充填"] as FillMethod[]).map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label>
            <span>修订操作员</span>
            <input value={form.operator} onChange={(e) => setForm({ ...form, operator: e.target.value })} />
          </label>
          <MiniButton
            variant="primary"
            onClick={() => {
              const r = reviseGroup(store, g, {
                targetBar: Number(form.targetBar),
                targetO2: Number(form.targetO2),
                targetHe: Number(form.targetHe),
                method: form.method,
                operator: form.operator,
              });
              if (!r.ok) return toast.violations(r.violations);
              toast.ok(r.message ?? "已修订");
            }}
          >
            确认修订并入队
          </MiniButton>
          <p className="hint-text">
            提示：若因气瓶过期/油脂污染被拒，该气瓶只能送检，检验合格回填后重新建组；
            {Object.values(cylinders).filter((c) => g.cylinderIds.includes(c.id) && !c.admitted).length > 0 &&
              " 当前组内不可准入气瓶：" +
                g.cylinderIds
                  .filter((id) => !cylinders[id]?.admitted)
                  .map((id) => `${id}（${cylinders[id]?.admissionReason}）`)
                  .join("、")}
          </p>
        </div>
      )}
    </div>
  );
}

function FillBody({
  g,
  onDone,
}: {
  g: GroupSnapshot;
  onDone: (r: ReturnType<typeof recordFill>) => void;
}) {
  const { store } = useAppData();
  const [f, setF] = useState({
    measuredO2: String(g.targetO2),
    measuredHe: String(g.targetHe),
    settleBar: String(g.targetBar),
    operator: g.latestFill?.operator ?? "",
  });

  return (
    <div className="action-box">
      <p className="hint-text">
        充填完成后录入实测数据并静置复测；任一偏差超限（O₂ ±1%、He ±1%、压力 ±10bar）即进入返工，须另一人复核。
      </p>
      <div className="measure-grid">
        <label>
          <span>实测氧含量 %</span>
          <input type="number" step="0.1" value={f.measuredO2} onChange={(e) => setF({ ...f, measuredO2: e.target.value })} />
        </label>
        <label>
          <span>实测氦含量 %</span>
          <input type="number" step="0.1" value={f.measuredHe} onChange={(e) => setF({ ...f, measuredHe: e.target.value })} />
        </label>
        <label>
          <span>静置复测压力 bar</span>
          <input type="number" value={f.settleBar} onChange={(e) => setF({ ...f, settleBar: e.target.value })} />
        </label>
        <label>
          <span>操作员</span>
          <input value={f.operator} onChange={(e) => setF({ ...f, operator: e.target.value })} />
        </label>
      </div>
      <MiniButton
        variant="primary"
        onClick={() =>
          onDone(
            recordFill(store, g, {
              measuredO2: Number(f.measuredO2),
              measuredHe: Number(f.measuredHe),
              settleBar: Number(f.settleBar),
              operator: f.operator,
            })
          )
        }
      >
        录入实测与静置复测
      </MiniButton>
    </div>
  );
}

function ReworkBody({ g }: { g: GroupSnapshot }) {
  const { store } = useAppData();
  const toast = useToast();
  const fillOperator = g.latestFill?.operator ?? g.operator;
  const [f, setF] = useState({
    measuredO2: String(g.targetO2),
    measuredHe: String(g.targetHe),
    settleBar: String(g.targetBar),
    reviewer: "",
    note: "",
  });

  return (
    <div className="action-box rework-box">
      <p className="banner-red">
        偏差超限进入返工：{g.reworkReasons?.join("；")}。充填操作员为 {fillOperator}，返工复核必须由另一人完成。
      </p>
      <div className="measure-grid">
        <label>
          <span>返工复测氧含量 %</span>
          <input type="number" step="0.1" value={f.measuredO2} onChange={(e) => setF({ ...f, measuredO2: e.target.value })} />
        </label>
        <label>
          <span>返工复测氦含量 %</span>
          <input type="number" step="0.1" value={f.measuredHe} onChange={(e) => setF({ ...f, measuredHe: e.target.value })} />
        </label>
        <label>
          <span>返工复测静置压力 bar</span>
          <input type="number" value={f.settleBar} onChange={(e) => setF({ ...f, settleBar: e.target.value })} />
        </label>
        <label className={f.reviewer === fillOperator ? "field-err" : ""}>
          <span>复核人（不可与 {fillOperator} 相同）</span>
          <input value={f.reviewer} onChange={(e) => setF({ ...f, reviewer: e.target.value })} />
        </label>
      </div>
      <MiniButton
        variant="primary"
        onClick={() => {
          const r = reviewRework(store, g, {
            measuredO2: Number(f.measuredO2),
            measuredHe: Number(f.measuredHe),
            settleBar: Number(f.settleBar),
            reviewer: f.reviewer,
            note: f.note,
          });
          if (!r.ok) return toast.violations(r.violations);
          toast.ok(r.message ?? "已复核");
        }}
      >
        另一人复核提交
      </MiniButton>
      {g.reworkReviews.length > 0 && (
        <ul className="review-list">
          {g.reworkReviews.map((rv, i) => (
            <li key={i} className={rv.passed ? "ok-text" : "err-text"}>
              {fmtDateTime(rv.at)} · 复核人 {rv.reviewer} · O₂{rv.measuredO2}% / He{rv.measuredHe}% / {rv.settleBar}bar ·{" "}
              {rv.passed ? "合格" : "仍超限，继续返工"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SignoffBody({ g }: { g: GroupSnapshot }) {
  const { store } = useAppData();
  const toast = useToast();
  const [receiver, setReceiver] = useState("");
  const [operator, setOperator] = useState("");

  return (
    <div className="action-box">
      {g.latestFill && (
        <div className={`result-chip ${g.latestFill.passed ? "" : "chip-warn"}`}>
          最近实测：O₂ {g.latestFill.measuredO2}% / He {g.latestFill.measuredHe}% / 静置 {g.latestFill.settleBar}bar
          {g.latestFill.passed ? " · 全部在限值内" : " · 含返工"}
        </div>
      )}
      <div className="action-row">
        <input className="inline-input" placeholder="签收人（客户/潜水长）" value={receiver} onChange={(e) => setReceiver(e.target.value)} />
        <input className="inline-input" placeholder="交付操作员" value={operator} onChange={(e) => setOperator(e.target.value)} />
        <MiniButton
          variant="primary"
          onClick={() => {
            const r = signDelivery(store, g, receiver, operator);
            if (!r.ok) return toast.violations(r.violations);
            toast.ok(r.message ?? "已签收");
            setReceiver("");
          }}
        >
          签收并冻结交付
        </MiniButton>
      </div>
    </div>
  );
}

function FrozenBody({ g }: { g: GroupSnapshot }) {
  const { store } = useAppData();
  const toast = useToast();
  const [operator, setOperator] = useState("");
  const [batch, setBatch] = useState("");
  const [open, setOpen] = useState<null | "valve" | "batch">(null);
  const signoff = g.currentSignoff;

  return (
    <div className="action-box frozen-box">
      <p className="frozen-line">
        🔒 已冻结签收：{signoff?.receiver} 于 {signoff ? fmtDateTime(signoff.at) : ""} 签收
        （交付操作员 {signoff?.operator}）
      </p>
      <p className="hint-text">
        签收后仅允许两类受控变更，均会使原签收立即失效并重算瓶组状态，事件历史完整保留：
      </p>
      <div className="void-actions">
        <MiniButton variant="danger" onClick={() => setOpen(open === "valve" ? null : "valve")}>
          更换阀门
        </MiniButton>
        <MiniButton onClick={() => setOpen(open === "batch" ? null : "batch")}>
          补录气源批次
        </MiniButton>
      </div>
      <div className="action-row">
        <input className="inline-input" placeholder="操作员" value={operator} onChange={(e) => setOperator(e.target.value)} />
      </div>
      {open === "valve" && (
        <div className="action-row">
          <MiniButton
            variant="danger"
            onClick={() => {
              const r = replaceValve(store, g, operator);
              if (!r.ok) return toast.violations(r.violations);
              toast.ok(r.message ?? "已处理");
              setOperator("");
              setOpen(null);
            }}
          >
            确认：换阀并使原签收失效（整组回待充填）
          </MiniButton>
        </div>
      )}
      {open === "batch" && (
        <div className="action-row">
          <input className="inline-input wide" placeholder="气源批次号，如 AIR-B20260920-01" value={batch} onChange={(e) => setBatch(e.target.value)} />
          <MiniButton
            variant="primary"
            onClick={() => {
              const r = backfillSourceBatch(store, g, batch, operator);
              if (!r.ok) return toast.violations(r.violations);
              toast.ok(r.message ?? "已补录");
              setOperator("");
              setBatch("");
              setOpen(null);
            }}
          >
            确认：补录批次并使原签收失效（待重新签收）
          </MiniButton>
        </div>
      )}
    </div>
  );
}

function EventTimeline({ g }: { g: GroupSnapshot }) {
  return (
    <div className="timeline event-timeline">
      {g.events.map((e, i) => (
        <div key={i} className="timeline-item">
          <time>{fmtDateTime(e.at)}</time>
          <div>{describeGroupEvent(e)}</div>
        </div>
      ))}
      {g.signoffHistory.filter((s) => s.voided).length > 0 && (
        <p className="hint-text">
          历史签收 {g.signoffHistory.length} 次，其中 {g.signoffHistory.filter((s) => s.voided).length} 次已失效（失效不删除，审计可追溯）。
        </p>
      )}
    </div>
  );
}

function describeGroupEvent(e: GroupEvent): string {
  switch (e.type) {
    case "group-created":
      return `建组：[${e.cylinderIds.join("、")}]，目标 ${e.targetBar}bar，O₂${e.targetO2}%/He${e.targetHe}%，${e.method}，操作员 ${e.operator}`;
    case "group-rejected":
      return `整组拒绝（${e.reason === "target-pressure-mismatch" ? "目标压力不一致" : "气瓶不可准入"}）：${e.detail}`;
    case "group-revised":
      return `修订：统一目标 ${e.targetBar}bar，O₂${e.targetO2}%/He${e.targetHe}%，${e.method}，操作员 ${e.operator}；拒绝记录保留`;
    case "fill-started":
      return `开始充填，操作员 ${e.operator}`;
    case "fill-recorded":
      return `录入实测：O₂${e.measuredO2}% / He${e.measuredHe}% / 静置 ${e.settleBar}bar，操作员 ${e.operator}`;
    case "rework-opened":
      return `偏差超限进入返工：${e.reasons.join("；")}（充填操作员 ${e.fromFillOperator}）`;
    case "rework-reviewed":
      return `返工复核：复核人 ${e.reviewer}，O₂${e.measuredO2}% / He${e.measuredHe}% / ${e.settleBar}bar，${e.passed ? "合格，转待签收" : "仍超限，保持返工"}${e.note ? `（${e.note}）` : ""}`;
    case "delivered-signed":
      return `签收冻结：签收人 ${e.receiver}，交付操作员 ${e.operator}`;
    case "delivery-voided":
      return e.reason === "valve-replaced"
        ? `更换阀门 → 原签收立即失效，瓶组重算为待充填，操作员 ${e.operator}`
        : `补录气源批次 ${e.sourceBatch} → 原签收立即失效，瓶组重算为待重新签收，操作员 ${e.operator}`;
  }
}
