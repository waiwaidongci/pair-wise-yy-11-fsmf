import { useMemo, useState } from "react";
import { CLEANLINESS_ADMIT } from "../domain/constants";
import {
  completeInspection,
  registerCylinder,
  sendForInspection,
} from "../domain/flow";
import { hydroStatus } from "../domain/rules";
import type {
  CylinderEvent,
  CylinderSnapshot,
  CleanlinessGrade,
} from "../domain/types";
import { fmtDate, fmtDateTime } from "./format";
import { MiniButton, PhaseBadge, useToast } from "./bits";
import { useAppData } from "./useStore";

const GRADES: CleanlinessGrade[] = ["A", "B", "C"];

function todayPlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function CylinderPanel() {
  const { store, cylinders } = useAppData();
  const toast = useToast();
  const [filter, setFilter] = useState<"all" | "admitted" | "blocked" | "warn">("all");
  const [historyId, setHistoryId] = useState<string | null>(null);

  const [form, setForm] = useState({
    id: "",
    material: "12L 钢瓶",
    volumeL: "12",
    hydroValidUntil: todayPlus(365),
    cleanliness: "A" as CleanlinessGrade,
  });

  const list = useMemo(() => {
    const all = Object.values(cylinders);
    return all
      .filter((c) => {
        const h = hydroStatus(c.hydroValidUntil);
        if (filter === "admitted") return c.admitted;
        if (filter === "blocked") return !c.admitted;
        if (filter === "warn") return c.admitted && h.warn;
        return true;
      })
      .sort((a, b) => a.id.localeCompare(b.id));
  }, [cylinders, filter]);

  function submit() {
    const r = registerCylinder(store, {
      id: form.id,
      material: form.material,
      volumeL: Number(form.volumeL),
      hydroValidUntil: form.hydroValidUntil,
      cleanliness: form.cleanliness,
    });
    if (!r.ok) return toast.violations(r.violations);
    toast.ok(r.message ?? "已建档");
    setForm((f) => ({ ...f, id: "" }));
  }

  const historyCylinder = historyId ? cylinders[historyId] : null;

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>准入闸门前置</p>
          <h2>气瓶档案</h2>
        </div>
        <div className="chips">
          {([
            ["all", "全部"],
            ["admitted", "可准入"],
            ["warn", "30天临期"],
            ["blocked", "不可准入"],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              className={filter === k ? "chip-on" : ""}
              onClick={() => setFilter(k)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="register-grid">
        <label>
          <span>气瓶编号</span>
          <input
            value={form.id}
            placeholder="如 TANK-240"
            onChange={(e) => setForm({ ...form, id: e.target.value })}
          />
        </label>
        <label>
          <span>瓶体规格</span>
          <input
            value={form.material}
            onChange={(e) => setForm({ ...form, material: e.target.value })}
          />
        </label>
        <label>
          <span>容积（升）</span>
          <input
            type="number"
            min={1}
            value={form.volumeL}
            onChange={(e) => setForm({ ...form, volumeL: e.target.value })}
          />
        </label>
        <label>
          <span>检验有效期</span>
          <input
            type="date"
            value={form.hydroValidUntil}
            onChange={(e) => setForm({ ...form, hydroValidUntil: e.target.value })}
          />
        </label>
        <label>
          <span>清洁等级</span>
          <select
            value={form.cleanliness}
            onChange={(e) =>
              setForm({ ...form, cleanliness: e.target.value as CleanlinessGrade })
            }
          >
            {GRADES.map((g) => (
              <option key={g} value={g}>
                {CLEANLINESS_ADMIT[g].label}（{CLEANLINESS_ADMIT[g].note}）
              </option>
            ))}
          </select>
        </label>
        <div className="register-action">
          <MiniButton variant="primary" onClick={submit}>
            建立气瓶档案
          </MiniButton>
        </div>
      </div>

      <div className="cyl-list">
        {list.map((c) => (
          <CylinderRow
            key={c.id}
            c={c}
            onHistory={() => setHistoryId(c.id)}
            onToast={toast}
          />
        ))}
        {list.length === 0 && <p className="empty">当前筛选下没有气瓶</p>}
      </div>

      {historyCylinder && (
        <CylinderHistoryModal
          c={historyCylinder}
          onClose={() => setHistoryId(null)}
        />
      )}
    </section>
  );
}

function CylinderRow({
  c,
  onHistory,
  onToast,
}: {
  c: CylinderSnapshot;
  onHistory: () => void;
  onToast: ReturnType<typeof useToast>;
}) {
  const { store } = useAppData();
  const h = hydroStatus(c.hydroValidUntil);
  const [operator, setOperator] = useState("");
  const [showInspect, setShowInspect] = useState(false);
  const [insp, setInsp] = useState({
    date: todayPlus(365),
    cleanliness: "A" as CleanlinessGrade,
    inspector: "",
  });

  return (
    <article className={`cyl-row ${!c.admitted ? "cyl-blocked" : ""}`}>
      <div className="cyl-main">
        <div className="cyl-title">
          <h3>{c.id}</h3>
          <PhaseBadge phase={c.phase} />
          {c.busy && <span className="badge badge-gray">在组中</span>}
        </div>
        <p className="cyl-meta">
          {c.material} · {c.volumeL}L ·{" "}
          {CLEANLINESS_ADMIT[c.cleanliness].label} · 检验至 {fmtDate(c.hydroValidUntil)}
          {c.admitted && h.warn && (
            <em className="warn-text">（临期，剩余 {h.daysLeft} 天）</em>
          )}
          {!c.admitted && <em className="err-text">（{c.admissionReason}）</em>}
        </p>
      </div>
      <div className="cyl-actions">
        <MiniButton variant="ghost" onClick={onHistory}>
          历史
        </MiniButton>
        {(c.phase === "expired" || c.phase === "contaminated") && !c.busy && (
          <>
            <input
              className="inline-input"
              placeholder="操作员"
              value={operator}
              onChange={(e) => setOperator(e.target.value)}
            />
            <MiniButton
              variant="danger"
              onClick={() => {
                const r = sendForInspection(store, c.id, operator);
                if (!r.ok) return onToast.violations(r.violations);
                onToast.ok(r.message ?? "已送检");
                setOperator("");
              }}
            >
              登记送检
            </MiniButton>
          </>
        )}
        {c.inspectionIn && (
          <MiniButton variant="primary" onClick={() => setShowInspect((s) => !s)}>
            检验回填
          </MiniButton>
        )}
      </div>
      {showInspect && (
        <div className="inspect-box">
          <label>
            <span>新检验有效期</span>
            <input
              type="date"
              value={insp.date}
              onChange={(e) => setInsp({ ...insp, date: e.target.value })}
            />
          </label>
          <label>
            <span>清洁等级复评</span>
            <select
              value={insp.cleanliness}
              onChange={(e) =>
                setInsp({ ...insp, cleanliness: e.target.value as CleanlinessGrade })
              }
            >
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  {CLEANLINESS_ADMIT[g].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>检验员</span>
            <input
              value={insp.inspector}
              placeholder="检验员姓名"
              onChange={(e) => setInsp({ ...insp, inspector: e.target.value })}
            />
          </label>
          <MiniButton
            variant="primary"
            onClick={() => {
              const r = completeInspection(store, c.id, {
                newValidUntil: insp.date,
                cleanliness: insp.cleanliness,
                inspector: insp.inspector,
              });
              if (!r.ok) return onToast.violations(r.violations);
              onToast.ok(r.message ?? "检验完成");
              setShowInspect(false);
            }}
          >
            确认检验合格
          </MiniButton>
        </div>
      )}
    </article>
  );
}

function CylinderHistoryModal({
  c,
  onClose,
}: {
  c: CylinderSnapshot;
  onClose: () => void;
}) {
  const { groups } = useAppData();
  const groupRefs = groups.filter((g) => g.cylinderIds.includes(c.id));

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="heading">
          <div>
            <p>单瓶档案</p>
            <h2>{c.id} 历史记录</h2>
          </div>
          <MiniButton onClick={onClose}>关闭</MiniButton>
        </div>
        <div className="timeline">
          {c.events.map((e, i) => (
            <div key={i} className="timeline-item">
              <time>{fmtDateTime(e.at)}</time>
              <div>{describeCylinderEvent(e)}</div>
            </div>
          ))}
        </div>
        <h3 className="sub-h">参与瓶组</h3>
        <div className="timeline">
          {groupRefs.length === 0 && <p className="empty">尚未参与任何瓶组</p>}
          {groupRefs.map((g) => (
            <div key={g.groupId} className="timeline-item">
              <time>{fmtDateTime(g.createdAt)}</time>
              <div>
                {g.groupId} · {g.method} · {g.targetBar}bar · O₂
                {g.targetO2}%/He{g.targetHe}%
                {g.signoffHistory.some((s) => s.voided) && (
                  <em className="warn-text">（含已失效签收，历史保留）</em>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function describeCylinderEvent(e: CylinderEvent): string {
  switch (e.type) {
    case "cylinder-registered":
      return `建档：${e.material} ${e.volumeL}L，检验至 ${fmtDate(e.hydroValidUntil)}，清洁等级 ${e.cleanliness}；准入说明：${CLEANLINESS_ADMIT[e.cleanliness].note}`;
    case "cylinder-sent-for-inspection":
      return `登记送检：${e.reason === "oil-contaminated" ? "油脂污染" : "检验过期"}，操作员 ${e.operator}`;
    case "cylinder-inspected":
      return `检验合格回填：新有效期至 ${fmtDate(e.newValidUntil)}，清洁等级复评 ${e.cleanliness}，检验员 ${e.inspector}`;
    case "valve-replaced":
      return `更换阀门，操作员 ${e.operator}${e.note ? `（${e.note}）` : ""} —— 关联瓶组原签收立即失效`;
  }
}
