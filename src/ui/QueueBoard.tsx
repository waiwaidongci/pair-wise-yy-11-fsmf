import { useState } from "react";
import {
  addDays,
  admissionBlockers,
  CLEANLINESS_LABEL,
  deriveGroupStatus,
  deriveTankStatus,
  groupMembers,
  INSPECTION_WARNING_DAYS,
  inspectionDaysLeft,
  todayStr,
} from "../domain/rules";
import type { Cleanliness, FillGroup, Tank } from "../domain/types";
import { useStore } from "../store/StoreContext";
import { Empty, Field, GroupBadge, NoticeView, TankBadge, useNotice } from "./common";

export function QueueBoard() {
  const { state } = useStore();
  const today = todayStr();
  const pendingInspection = state.tanks.filter(
    (t) => deriveTankStatus(t, today) === "pending-inspection"
  );
  const queued = state.tanks.filter((t) => deriveTankStatus(t, today) === "queued");

  return (
    <>
      <section className="panel">
        <div className="heading">
          <div>
            <p>准入拦截</p>
            <h2>待送检气瓶</h2>
          </div>
        </div>
        {pendingInspection.length === 0 ? (
          <Empty text="没有被准入拦截的气瓶" />
        ) : (
          <div className="card-list">
            {pendingInspection.map((t) => (
              <InspectionCard key={t.id} tank={t} />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>瓶组配比</p>
            <h2>瓶组看板</h2>
          </div>
        </div>
        {state.groups.length === 0 ? (
          <Empty text="暂无瓶组，登记气瓶时可新建" />
        ) : (
          <div className="card-list">
            {state.groups.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>待充填队列</p>
            <h2>充填队列（{queued.length}）</h2>
          </div>
        </div>
        {queued.length === 0 ? (
          <Empty text="队列为空" />
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>气瓶</th>
                <th>容积</th>
                <th>充填方式</th>
                <th>目标压力 / 配比</th>
                <th>检验有效期</th>
                <th>瓶组</th>
                <th>操作员</th>
              </tr>
            </thead>
            <tbody>
              {queued.map((t) => {
                const daysLeft = inspectionDaysLeft(t, today);
                const group = t.groupId ? state.groups.find((g) => g.id === t.groupId) : null;
                return (
                  <tr key={t.id}>
                    <td><strong>{t.serial}</strong></td>
                    <td>{t.volumeL} L</td>
                    <td>{t.fillMethod}</td>
                    <td>{t.targetBar} bar · O₂ {t.targetO2}% / He {t.targetHe}%</td>
                    <td>
                      {t.inspectionUntil}
                      {daysLeft <= INSPECTION_WARNING_DAYS && (
                        <span className="badge amber"> 剩余 {daysLeft} 天</span>
                      )}
                    </td>
                    <td>{group ? group.name : "未编组"}</td>
                    <td>{t.operator}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function InspectionCard({ tank }: { tank: Tank }) {
  const { actions } = useStore();
  const today = todayStr();
  const [until, setUntil] = useState(addDays(today, 365));
  const [clean, setClean] = useState<Cleanliness>("oxygen-clean");
  const [by, setBy] = useState("");
  const { notice, show } = useNotice();
  const blockers = admissionBlockers(tank, today);

  return (
    <div className="tank-row">
      <div className="row-head">
        <strong>{tank.serial}</strong>
        <TankBadge status="pending-inspection" />
      </div>
      <p className="meta">
        拦截原因：<span className="danger-text">{blockers.join("、")}</span> · 检验有效期至{" "}
        {tank.inspectionUntil} · {CLEANLINESS_LABEL[tank.cleanliness]} · 目标 {tank.targetBar}bar
      </p>
      <div className="inline-form">
        <Field label="新检验有效期">
          <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </Field>
        <Field label="清洁等级（送检清洗后）">
          <select value={clean} onChange={(e) => setClean(e.target.value as Cleanliness)}>
            <option value="oxygen-clean">氧清洁</option>
            <option value="standard">常规清洁</option>
          </select>
        </Field>
        <Field label="经办人">
          <input value={by} onChange={(e) => setBy(e.target.value)} placeholder="送检经办" />
        </Field>
        <button
          className="primary"
          onClick={() =>
            show(
              actions.sendToInspection(tank.id, until, clean, by),
              `${tank.serial} 送检完成，重新准入待充填`
            )
          }
        >
          送检归队
        </button>
      </div>
      <NoticeView notice={notice} />
    </div>
  );
}

function GroupCard({ group }: { group: FillGroup }) {
  const { state, actions } = useStore();
  const today = todayStr();
  const members = groupMembers(state, group.id);
  const status = deriveGroupStatus(members, today);
  const { notice, show } = useNotice();

  return (
    <div className={`group-card ${status === "rejected" ? "rejected" : ""}`}>
      <div className="row-head">
        <strong>{group.name}</strong>
        <GroupBadge status={status} />
      </div>
      {status === "rejected" && (
        <p className="danger-text">
          同组目标压力不一致，整组拒绝充填；请移出不匹配的气瓶，瓶组状态将自动重算。
        </p>
      )}
      {status === "delivered" && (
        <p className="meta">全组签收完成，交付冻结中；更换阀门或补录气源批次将使原签收立即失效。</p>
      )}
      <table className="grid">
        <thead>
          <tr>
            <th>气瓶</th>
            <th>目标压力</th>
            <th>配比 O₂/He</th>
            <th>状态</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {members.map((m) => {
            const ms = deriveTankStatus(m, today);
            return (
              <tr key={m.id}>
                <td>{m.serial}</td>
                <td>{m.targetBar} bar</td>
                <td>{m.targetO2}% / {m.targetHe}%</td>
                <td><TankBadge status={ms} /></td>
                <td>
                  {ms !== "delivered" && (
                    <button
                      onClick={() =>
                        show(actions.removeFromGroup(m.id), `${m.serial} 已移出瓶组，瓶组状态重算`)
                      }
                    >
                      移出瓶组
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <NoticeView notice={notice} />
    </div>
  );
}
