import { useState } from "react";
import { deriveTankStatus, lastFill, todayStr, validSignoff } from "../domain/rules";
import type { Tank } from "../domain/types";
import { useStore } from "../store/StoreContext";
import { Empty, Field, fmtTime, NoticeView, TankBadge, useNotice } from "./common";

export function DeliveryPanel() {
  const { state } = useStore();
  const today = todayStr();
  const awaiting = state.tanks.filter((t) => deriveTankStatus(t, today) === "awaiting-signoff");
  const delivered = state.tanks.filter((t) => deriveTankStatus(t, today) === "delivered");
  const allSignoffs = state.tanks
    .flatMap((t) => t.signoffs.map((s) => ({ tank: t, signoff: s })))
    .sort((a, b) => b.signoff.at.localeCompare(a.signoff.at));

  return (
    <>
      <section className="panel">
        <div className="heading">
          <div>
            <p>交付签收</p>
            <h2>待签收气瓶（{awaiting.length}）</h2>
          </div>
        </div>
        {awaiting.length === 0 ? (
          <Empty text="没有待签收的气瓶" />
        ) : (
          <div className="card-list">
            {awaiting.map((t) => (
              <SignoffRow key={t.id} tank={t} />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>交付冻结</p>
            <h2>已签收气瓶变更（{delivered.length}）</h2>
          </div>
        </div>
        <p className="meta">
          已签收气瓶处于交付冻结；更换阀门或补录气源批次将使原签收立即失效，并重算瓶组状态，历史保留。
        </p>
        {delivered.length === 0 ? (
          <Empty text="暂无已签收气瓶" />
        ) : (
          <div className="card-list">
            {delivered.map((t) => (
              <DeliveredRow key={t.id} tank={t} />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>台账</p>
            <h2>签收单记录</h2>
          </div>
        </div>
        {allSignoffs.length === 0 ? (
          <Empty text="暂无签收单" />
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>气瓶</th>
                <th>客户</th>
                <th>签收经办</th>
                <th>时间</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {allSignoffs.map(({ tank, signoff }) => (
                <tr key={signoff.id}>
                  <td>{tank.serial}</td>
                  <td>{signoff.customer}</td>
                  <td>{signoff.by}</td>
                  <td>{fmtTime(signoff.at)}</td>
                  <td>
                    {signoff.valid ? (
                      <span className="badge green">有效</span>
                    ) : (
                      <span className="badge red">
                        已失效 · {signoff.invalidateReason}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}

function SignoffRow({ tank }: { tank: Tank }) {
  const { actions } = useStore();
  const last = lastFill(tank);
  const [customer, setCustomer] = useState("");
  const [by, setBy] = useState("");
  const { notice, show } = useNotice();

  return (
    <div className="tank-row">
      <div className="row-head">
        <strong>{tank.serial}</strong>
        <TankBadge status="awaiting-signoff" />
      </div>
      {last && (
        <p className="meta">
          复测合格：氧 {last.o2}% · 氦 {last.he}% · 静置 {last.settledBar}bar · 充填 {last.by}
          {tank.reviews.length > 0 &&
            ` · 复核 ${tank.reviews[tank.reviews.length - 1].by}`}
        </p>
      )}
      <div className="inline-form">
        <Field label="签收客户">
          <input
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            placeholder="客户 / 潜店"
          />
        </Field>
        <Field label="签收经办">
          <input value={by} onChange={(e) => setBy(e.target.value)} />
        </Field>
        <button
          className="primary"
          onClick={() =>
            show(actions.signoff(tank.id, customer, by), `${tank.serial} 签收完成，交付冻结生效`)
          }
        >
          确认签收
        </button>
      </div>
      <NoticeView notice={notice} />
    </div>
  );
}

function DeliveredRow({ tank }: { tank: Tank }) {
  const { state, actions } = useStore();
  const signoff = validSignoff(tank);
  const groupName = tank.groupId
    ? state.groups.find((g) => g.id === tank.groupId)?.name
    : null;
  const [valveBy, setValveBy] = useState("");
  const [note, setNote] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [batchBy, setBatchBy] = useState("");
  const { notice, show } = useNotice();

  return (
    <div className="tank-row">
      <div className="row-head">
        <strong>{tank.serial}</strong>
        <TankBadge status="delivered" />
      </div>
      {signoff && (
        <p className="meta">
          签收单：客户 {signoff.customer} · 经办 {signoff.by} · {fmtTime(signoff.at)}
          {groupName ? ` · ${groupName}` : ""}
        </p>
      )}
      <div className="inline-form">
        <Field label="更换阀门 · 经办人">
          <input value={valveBy} onChange={(e) => setValveBy(e.target.value)} />
        </Field>
        <Field label="备注">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="如：更换K阀" />
        </Field>
        <button
          onClick={() =>
            show(actions.replaceValve(tank.id, valveBy, note), "已记录阀门更换，原签收立即失效")
          }
        >
          更换阀门
        </button>
      </div>
      <div className="inline-form">
        <Field label="气源批次号">
          <input
            value={batchNo}
            onChange={(e) => setBatchNo(e.target.value)}
            placeholder="如 AIR-2026-0920"
          />
        </Field>
        <Field label="补录经办">
          <input value={batchBy} onChange={(e) => setBatchBy(e.target.value)} />
        </Field>
        <button
          onClick={() =>
            show(actions.addGasBatch(tank.id, batchNo, batchBy), "已补录气源批次，原签收立即失效")
          }
        >
          补录气源批次
        </button>
      </div>
      <NoticeView notice={notice} />
    </div>
  );
}
