import { useState } from "react";
import {
  CLEANLINESS_LABEL,
  deriveTankStatus,
  inspectionDaysLeft,
  todayStr,
} from "../domain/rules";
import type { Tank } from "../domain/types";
import { useStore } from "../store/StoreContext";
import { Empty, Field, fmtTime, TankBadge } from "./common";

export function HistoryPanel() {
  const { state } = useStore();
  const [selected, setSelected] = useState("");
  const tank = state.tanks.find((t) => t.id === selected) ?? state.tanks[0];
  const events = [...state.events].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="panels">
      <section className="panel">
        <div className="heading">
          <div>
            <p>单瓶档案</p>
            <h2>气瓶历史</h2>
          </div>
        </div>
        {tank ? (
          <>
            <Field label="选择气瓶">
              <select value={tank.id} onChange={(e) => setSelected(e.target.value)}>
                {state.tanks.map((t) => (
                  <option key={t.id} value={t.id}>{t.serial}</option>
                ))}
              </select>
            </Field>
            <TankDetail tank={tank} />
          </>
        ) : (
          <Empty text="暂无气瓶" />
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>全程留痕</p>
            <h2>事件日志</h2>
          </div>
        </div>
        {events.length === 0 ? (
          <Empty text="暂无事件" />
        ) : (
          <ul className="timeline">
            {events.slice(0, 50).map((e) => (
              <li key={e.id}>
                <time>{fmtTime(e.at)}</time>
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TankDetail({ tank }: { tank: Tank }) {
  const { state } = useStore();
  const today = todayStr();
  const status = deriveTankStatus(tank, today);
  const group = tank.groupId ? state.groups.find((g) => g.id === tank.groupId) : null;
  const daysLeft = inspectionDaysLeft(tank, today);
  const tankEvents = state.events
    .filter((e) => e.tankId === tank.id)
    .sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="card-list detail">
      <div className="row-head">
        <strong>{tank.serial}</strong>
        <TankBadge status={status} />
      </div>
      <div className="detail-grid">
        <div><small>容积</small>{tank.volumeL} L</div>
        <div><small>清洁等级</small>{CLEANLINESS_LABEL[tank.cleanliness]}</div>
        <div>
          <small>检验有效期</small>
          {tank.inspectionUntil}
          {daysLeft < 0 ? "（已过期）" : daysLeft <= 30 ? `（剩余 ${daysLeft} 天）` : ""}
        </div>
        <div><small>残压</small>{tank.residualBar} bar</div>
        <div><small>目标压力</small>{tank.targetBar} bar</div>
        <div><small>目标配比</small>O₂ {tank.targetO2}% / He {tank.targetHe}%</div>
        <div><small>充填方式</small>{tank.fillMethod}</div>
        <div><small>操作员</small>{tank.operator}</div>
        <div><small>瓶组</small>{group ? group.name : "未编组"}</div>
      </div>

      {tank.fills.length > 0 && (
        <>
          <h3 className="sub">充填复测记录</h3>
          <table className="grid">
            <thead>
              <tr>
                <th>时间</th><th>操作员</th><th>O₂</th><th>He</th><th>静置压力</th><th>结论</th>
              </tr>
            </thead>
            <tbody>
              {tank.fills.map((f, i) => (
                <tr key={i}>
                  <td>{fmtTime(f.at)}</td>
                  <td>{f.by}</td>
                  <td>{f.o2}%</td>
                  <td>{f.he}%</td>
                  <td>{f.settledBar} bar</td>
                  <td>
                    {f.deviations.length === 0 ? (
                      <span className="badge green">合格</span>
                    ) : (
                      <span className="danger-text">{f.deviations.join("；")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tank.reviews.length > 0 && (
        <>
          <h3 className="sub">复核记录</h3>
          <ul className="plain-list">
            {tank.reviews.map((r, i) => (
              <li key={i}>{fmtTime(r.at)} · 复核人 {r.by} · 通过</li>
            ))}
          </ul>
        </>
      )}

      {tank.signoffs.length > 0 && (
        <>
          <h3 className="sub">签收记录</h3>
          <ul className="plain-list">
            {tank.signoffs.map((s) => (
              <li key={s.id}>
                {fmtTime(s.at)} · 客户 {s.customer} · 经办 {s.by} ·{" "}
                {s.valid ? (
                  <span className="badge green">有效</span>
                ) : (
                  <span className="badge red">
                    已失效 · {s.invalidateReason}（{s.invalidatedAt ? fmtTime(s.invalidatedAt) : ""}）
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {tank.valveChanges.length > 0 && (
        <>
          <h3 className="sub">阀门更换</h3>
          <ul className="plain-list">
            {tank.valveChanges.map((v) => (
              <li key={v.id}>{fmtTime(v.at)} · {v.note} · 经办 {v.by}</li>
            ))}
          </ul>
        </>
      )}

      {tank.gasBatches.length > 0 && (
        <>
          <h3 className="sub">气源批次</h3>
          <ul className="plain-list">
            {tank.gasBatches.map((g) => (
              <li key={g.id}>{fmtTime(g.at)} · 批次 {g.batchNo} · 经办 {g.by}</li>
            ))}
          </ul>
        </>
      )}

      {tankEvents.length > 0 && (
        <>
          <h3 className="sub">该瓶事件</h3>
          <ul className="timeline">
            {tankEvents.map((e) => (
              <li key={e.id}>
                <time>{fmtTime(e.at)}</time>
                {e.message}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
