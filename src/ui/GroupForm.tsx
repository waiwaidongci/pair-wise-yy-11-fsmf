import { useMemo, useState } from "react";
import { CLEANLINESS_ADMIT, FILL_METHODS, TOLERANCE } from "../domain/constants";
import { createGroup } from "../domain/flow";
import { mixHint, methodAllowed, planCreateGroup } from "../domain/rules";
import type { FillMethod } from "../domain/types";
import { MiniButton, useToast } from "./bits";
import { fmtDate } from "./format";
import { useAppData } from "./useStore";

interface Line {
  id: string;
  targetBar: string;
  residualBar: string;
}

const METHOD_DEFAULTS: Record<FillMethod, { o2: number; he: number }> = {
  空气充填: { o2: 21, he: 0 },
  高氧充填: { o2: 32, he: 0 },
  Trimix充填: { o2: 18, he: 45 },
};

export function GroupForm() {
  const { store, cylinders } = useAppData();
  const toast = useToast();
  const [method, setMethod] = useState<FillMethod>("空气充填");
  const [targetO2, setTargetO2] = useState("21");
  const [targetHe, setTargetHe] = useState("0");
  const [operator, setOperator] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { id: "", targetBar: "200", residualBar: "0" },
  ]);

  const selectable = useMemo(
    () =>
      Object.values(cylinders)
        .filter((c) => !c.busy)
        .sort((a, b) => a.id.localeCompare(b.id)),
    [cylinders]
  );

  const hint = mixHint(Number(targetO2) || 0, Number(targetHe) || 0);
  const pressureValues = lines
    .map((l) => Number(l.targetBar))
    .filter((n) => n > 0);
  const pressureMismatch = new Set(pressureValues).size > 1;

  function changeMethod(m: FillMethod) {
    setMethod(m);
    const d = METHOD_DEFAULTS[m];
    setTargetO2(String(d.o2));
    setTargetHe(String(d.he));
  }

  function updateLine(i: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  function submit() {
    const planned = planCreateGroup(
      {
        cylinderIds: lines.map((l) => l.id),
        lines: lines.map((l) => ({
          id: l.id,
          targetBar: Number(l.targetBar),
          residualBar: Number(l.residualBar),
        })),
        targetO2: Number(targetO2),
        targetHe: Number(targetHe),
        method,
        operator,
      },
      cylinders
    );
    if (planned.violations.length) return toast.violations(planned.violations);
    const r = createGroup(store, planned);
    if (!r.ok) return toast.violations(r.violations);
    toast.ok(r.message ?? "已提交");
    setLines([{ id: "", targetBar: "200", residualBar: "0" }]);
    setOperator("");
  }

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>瓶组配比闸门</p>
          <h2>新建充填瓶组</h2>
        </div>
      </div>

      <div className="mix-bar">
        <label>
          <span>充填方式</span>
          <select value={method} onChange={(e) => changeMethod(e.target.value as FillMethod)}>
            {FILL_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>目标氧含量 %</span>
          <input
            type="number"
            value={targetO2}
            min={1}
            max={100}
            step={0.1}
            onChange={(e) => setTargetO2(e.target.value)}
          />
        </label>
        <label>
          <span>目标氦含量 %</span>
          <input
            type="number"
            value={targetHe}
            min={0}
            max={99}
            step={0.1}
            disabled={method !== "Trimix充填"}
            onChange={(e) => setTargetHe(e.target.value)}
          />
        </label>
        <label>
          <span>操作员</span>
          <input
            value={operator}
            placeholder="本组操作员姓名"
            onChange={(e) => setOperator(e.target.value)}
          />
        </label>
        <div className="mix-hint">
          <strong>{hint.label}</strong>
          <span>
            MOD ≈ {hint.mod}m（PO₂ 1.4）
            {hint.endHe ? ` · END 氦占比 ${hint.endHe}%` : ""}
          </span>
          <small>合格限值：O₂ ±{TOLERANCE.o2Pct}% / He ±{TOLERANCE.hePct}% / 静置 ±{TOLERANCE.settleBar}bar</small>
        </div>
      </div>

      <div className="lines-head">
        <h3>组内气瓶（逐瓶填写目标压力，不一致将整组拒绝）</h3>
        <MiniButton
          onClick={() =>
            setLines((ls) => [...ls, { id: "", targetBar: "200", residualBar: "0" }])
          }
        >
          + 加入气瓶
        </MiniButton>
      </div>

      <div className="line-list">
        {lines.map((line, i) => {
          const c = line.id ? cylinders[line.id] : null;
          const admit = c
            ? c.admitted && methodAllowed(c.cleanliness, method)
            : null;
          return (
            <div
              key={i}
              className={`line-row ${admit === false ? "line-bad" : ""}`}
            >
              <label className="line-select">
                <span>气瓶</span>
                <select value={line.id} onChange={(e) => updateLine(i, { id: e.target.value })}>
                  <option value="">选择气瓶…</option>
                  {selectable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} · {c.material} · {CLEANLINESS_ADMIT[c.cleanliness].label}
                      {!c.admitted ? ` · ${c.phase === "expired" ? "过期" : c.phase === "contaminated" ? "油脂污染" : "送检中"}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>目标压力 bar</span>
                <input
                  type="number"
                  value={line.targetBar}
                  min={1}
                  onChange={(e) => updateLine(i, { targetBar: e.target.value })}
                />
              </label>
              <label>
                <span>残压 bar</span>
                <input
                  type="number"
                  value={line.residualBar}
                  min={0}
                  onChange={(e) => updateLine(i, { residualBar: e.target.value })}
                />
              </label>
              <div className="line-status">
                {c && (
                  <>
                    <small>检验至 {fmtDate(c.hydroValidUntil)}</small>
                    {admit ? (
                      <em className="ok-text">
                        准入通过{CLEANLINESS_ADMIT[c.cleanliness].methods.length < 3 ? `（${CLEANLINESS_ADMIT[c.cleanliness].note}）` : ""}
                      </em>
                    ) : (
                      <em className="err-text">
                        {c.admitted
                          ? `清洁等级 ${c.cleanliness} 不允许${method}，提交将整组拒绝`
                          : c.admissionReason}
                      </em>
                    )}
                  </>
                )}
              </div>
              {lines.length > 1 && (
                <MiniButton variant="ghost" onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))}>
                  移除
                </MiniButton>
              )}
            </div>
          );
        })}
      </div>

      {pressureMismatch && (
        <p className="banner-red">
          ⚠ 同组目标压力不一致（{pressureValues.join(" / ")} bar），提交后整组拒绝并记录，需修订一致后重新入队
        </p>
      )}

      <div className="form-foot">
        <MiniButton variant="primary" onClick={submit}>
          提交瓶组（执行准入与压力闸门）
        </MiniButton>
      </div>
    </section>
  );
}
