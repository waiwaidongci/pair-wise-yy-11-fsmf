import { useState, type FormEvent } from "react";
import { addDays, CLEANLINESS_LABEL, todayStr } from "../domain/rules";
import type { Cleanliness, FillMethod } from "../domain/types";
import { useStore } from "../store/StoreContext";
import { Field, NoticeView, useNotice } from "./common";

const FILL_METHODS: FillMethod[] = ["空气", "高氧", "Trimix", "纯氧"];
const CLEANLINESS_OPTIONS: Cleanliness[] = ["oxygen-clean", "standard", "oil-contaminated"];

export function RegisterForm() {
  const { state, actions } = useStore();
  const [serial, setSerial] = useState("");
  const [volumeL, setVolumeL] = useState("12");
  const [inspectionUntil, setInspectionUntil] = useState(addDays(todayStr(), 365));
  const [cleanliness, setCleanliness] = useState<Cleanliness>("oxygen-clean");
  const [residualBar, setResidualBar] = useState("30");
  const [targetBar, setTargetBar] = useState("200");
  const [targetO2, setTargetO2] = useState("21");
  const [targetHe, setTargetHe] = useState("0");
  const [fillMethod, setFillMethod] = useState<FillMethod>("空气");
  const [operator, setOperator] = useState("");
  const [groupChoice, setGroupChoice] = useState("none");
  const [newGroupName, setNewGroupName] = useState("");
  const { notice, show } = useNotice();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = actions.registerTank({
      serial,
      volumeL: Number(volumeL),
      inspectionUntil,
      cleanliness,
      residualBar: Number(residualBar),
      targetBar: Number(targetBar),
      targetO2: Number(targetO2),
      targetHe: Number(targetHe),
      fillMethod,
      operator,
      groupChoice,
      newGroupName,
    });
    show(r, `${serial.trim()} 登记完成，准入校验已通过`);
    if (r.ok) setSerial("");
  };

  return (
    <section className="panel">
      <div className="heading">
        <div>
          <p>准入登记</p>
          <h2>新增气瓶</h2>
        </div>
      </div>
      <form onSubmit={submit}>
        <div className="field-grid">
          <Field label="气瓶编号">
            <input value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="如 TANK-401" />
          </Field>
          <Field label="容积（L）">
            <input type="number" min="0" step="0.1" value={volumeL} onChange={(e) => setVolumeL(e.target.value)} />
          </Field>
          <Field label="检验有效期">
            <input type="date" value={inspectionUntil} onChange={(e) => setInspectionUntil(e.target.value)} />
          </Field>
          <Field label="清洁等级">
            <select value={cleanliness} onChange={(e) => setCleanliness(e.target.value as Cleanliness)}>
              {CLEANLINESS_OPTIONS.map((c) => (
                <option key={c} value={c}>{CLEANLINESS_LABEL[c]}</option>
              ))}
            </select>
          </Field>
          <Field label="残压（bar）">
            <input type="number" min="0" value={residualBar} onChange={(e) => setResidualBar(e.target.value)} />
          </Field>
          <Field label="目标压力（bar）">
            <input type="number" min="0" value={targetBar} onChange={(e) => setTargetBar(e.target.value)} />
          </Field>
          <Field label="目标氧含量（%）">
            <input type="number" min="0" max="100" step="0.1" value={targetO2} onChange={(e) => setTargetO2(e.target.value)} />
          </Field>
          <Field label="目标氦含量（%）">
            <input type="number" min="0" max="100" step="0.1" value={targetHe} onChange={(e) => setTargetHe(e.target.value)} />
          </Field>
          <Field label="充填方式">
            <select value={fillMethod} onChange={(e) => setFillMethod(e.target.value as FillMethod)}>
              {FILL_METHODS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </Field>
          <Field label="操作员">
            <input value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="充填操作员" />
          </Field>
          <Field label="瓶组">
            <select value={groupChoice} onChange={(e) => setGroupChoice(e.target.value)}>
              <option value="none">不加入瓶组</option>
              <option value="new">＋ 新建瓶组</option>
              {state.groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </Field>
          {groupChoice === "new" && (
            <Field label="新瓶组名称">
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="如 瓶组D · 高氧 200bar" />
            </Field>
          )}
        </div>
        <div className="form-footer">
          <button className="primary" type="submit">登记并准入校验</button>
          <span className="meta">检验过期或油脂污染的气瓶将被准入拦截，只能送检。</span>
        </div>
        <NoticeView notice={notice} />
      </form>
    </section>
  );
}
