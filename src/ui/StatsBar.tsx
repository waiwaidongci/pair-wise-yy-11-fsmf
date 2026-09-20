import { useAppData } from "./useStore";

export function StatsBar() {
  const { stats } = useAppData();
  const items = [
    { label: "待充填瓶组", value: stats.queueCount, tone: "blue" },
    { label: "作业中（充填/返工）", value: stats.fillingCount, tone: "amber" },
    { label: "不可准入气瓶", value: stats.blockedCount, tone: "red" },
    { label: "30天临期", value: stats.warnCount, tone: "amber" },
    {
      label: "平均实测氧含量",
      value: stats.avgO2 === null ? "—" : `${stats.avgO2.toFixed(1)}%`,
      tone: "teal",
    },
    { label: "当前有效签收单", value: stats.activeSignoffCount, tone: "green" },
    { label: "累计签收（含失效）", value: stats.signedCount, tone: "blue" },
    { label: "返工 / 拒绝", value: `${stats.reworkCount} / ${stats.rejectedCount}`, tone: "red" },
  ];

  return (
    <section className="metrics metrics-8">
      {items.map((it) => (
        <article key={it.label} className={`tone-${it.tone}`}>
          <small>{it.label}</small>
          <strong>{it.value}</strong>
        </article>
      ))}
    </section>
  );
}
