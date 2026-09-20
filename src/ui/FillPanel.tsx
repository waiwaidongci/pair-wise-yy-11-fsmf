import { useState } from "react";
import {
  canRecordFill,
  checkDeviations,
  deriveTankStatus,
  groupMembers,
  lastFill,
  TOLERANCES,
  todayStr,
} from "../domain/rules";
import type { Tank } from "../domain/types";
import { useStore } from "../store/StoreContext";
import { Empty, Field, fmtTime, NoticeView, TankBadge, useNotice } from "./common";

export function FillPanel() {
  const { state } = useStore();
  const today = todayStr();
  const fillable = state.tanks.filter((t) => {
    const s = deriveTankStatus(t, today);
    return s === "queued" || s === "rework";
  });
  const reviewList = state.tanks.filter((t) => deriveTankStatus(t, today) === "pending-review");

  return (
    <>
      <section className="panel">
        <div className="heading">
          <div>
            <p>充填录入</p>
            <h2>实测氧氦与静置复测</h2>
          </div>
        </div>
        <p className="meta">
          允差：氧 ±{TOLERANCES.o2}% · 氦 ±{TOLERANCES.he}% · 静置压力 ±{TOLERANCES.bar}
          bar；任一超限自动进入返工，返工充填合格后须另一人复核。
        </p>
        {fillable.length === 0 ? (
          <Empty text="当前没有可充填的气瓶" />
        ) : (
          <div className="card-list">
            {fillable.map((t) => (
              <FillRow key={t.id} tank={t} />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>返工复核</p>
            <h2>待另一人复核（{reviewList.length}）</h2>
          </div>
        </div>
        {reviewList.length === 0 ? (
          <Empty text="没有待复核的返工充填" />
        ) : (
          <div className="card-list">
            {reviewList.map((t) => (
              <ReviewRow key={t.id} tank={t} />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function FillRow({ tank }: { tank: Tank }) {
  const { state, actions } = useStore();
  const today = todayStr();
  const status = deriveTankStatus(tank, today);
  const members = tank.groupId ? groupMembers(state, tank.groupId) : null;
  const gate = canRecordFill(tank, members, today);
  const groupName = tank.groupId
    ? state.groups.find((g) => g.id === tank.groupId)?.name
    : null;
  const last = lastFill(tank);

  const [o2, setO2] = useState(String(tank.targetO2));
  const [he, setHe] = useState(String(tank.targetHe));
  const [bar, setBar] = useState(String(tank.targetBar));
  const [by, setBy] = useState(tank.operator);
  const { notice, show } = useNotice();

  const submit = () => {
    const devs = checkDeviations(tank, Number(o2), Number(he), Number(bar));
    const r = actions.recordFill(tank.id, Number(o2), Number(he), Number(bar), by);
    show(
      r,
      devs.length > 0
        ? `偏差超限，${tank.serial} 已进入返工`
        : status === "rework"
          ? "返工充填合格，待另一人复核"
          : "复测合格，转入待签收"
    );
  };

  return (
    <div className="tank-row">
      <div className="row-head">
        <strong>{tank.serial}</strong>
        <TankBadge status={status} />
      </div>
      <p className="meta">
        目标 {tank.targetBar}bar · O₂ {tank.targetO2}% / He {tank.targetHe}% · {tank.fillMethod}
        {groupName ? ` · ${groupName}` : " · 未编组"}
        {status === "rework" && last && last.deviations.length > 0 && (
          <span className="danger-text"> · 上次偏差：{last.deviations.join("；")}</span>
        )}
      </p>
      {gate.ok ? (
        <div className="inline-form">
          <Field label="实测氧含量（%）">
            <input type="number" step="0.1" value={o2} onChange={(e) => setO2(e.target.value)} />
          </Field>
          <Field label="实测氦含量（%）">
            <input type="number" step="0.1" value={he} onChange={(e) => setHe(e.target.value)} />
          </Field>
          <Field label="静置复测压力（bar）">
            <input type="number" value={bar} onChange={(e) => setBar(e.target.value)} />
          </Field>
          <Field label="充填操作员">
            <input value={by} onChange={(e) => setBy(e.target.value)} />
          </Field>
          <button className="primary" onClick={submit}>录入复测结果</button>
        </div>
      ) : (
        <p className="danger-text">充填被拦截：{gate.reason}</p>
      )}
      <NoticeView notice={notice} />
    </div>
  );
}

function ReviewRow({ tank }: { tank: Tank }) {
  const { actions } = useStore();
  const last = lastFill(tank);
  const [reviewer, setReviewer] = useState("");
  const { notice, show } = useNotice();

  if (!last) return null;
  return (
    <div className="tank-row">
      <div className="row-head">
        <strong>{tank.serial}</strong>
        <TankBadge status="pending-review" />
      </div>
      <p className="meta">
        返工充填：氧 {last.o2}% · 氦 {last.he}% · 静置 {last.settledBar}bar · 操作员 {last.by} ·{" "}
        {fmtTime(last.at)}
      </p>
      <div className="inline-form">
        <Field label="复核人（须与充填操作员不同）">
          <input
            value={reviewer}
            onChange={(e) => setReviewer(e.target.value)}
            placeholder="另一人复核"
          />
        </Field>
        <button
          className="primary"
          onClick={() =>
            show(actions.reviewRework(tank.id, reviewer), `${tank.serial} 复核通过，转入待签收`)
          }
        >
          复核通过
        </button>
      </div>
      <NoticeView notice={notice} />
    </div>
  );
}
