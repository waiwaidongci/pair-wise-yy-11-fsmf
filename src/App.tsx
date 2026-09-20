import { useState } from "react";
import { createStore } from "./domain/store";
import { seedStoreIfEmpty } from "./domain/seed";
import { StatsBar } from "./ui/StatsBar";
import { CylinderPanel } from "./ui/CylinderPanel";
import { GroupForm } from "./ui/GroupForm";
import { GroupQueue } from "./ui/GroupQueue";
import { StoreProvider } from "./ui/useStore";
import { ToastProvider, useToast } from "./ui/bits";

const store = createStore();
seedStoreIfEmpty(store);

function ResetButton() {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <span className="reset-confirm">
      清空全部事件并恢复演示数据？
      <button
        onClick={() => {
          store.reset();
          seedStoreIfEmpty(store);
          setConfirming(false);
          toast.ok("已重置为演示数据");
        }}
      >
        确认
      </button>
      <button onClick={() => setConfirming(false)}>取消</button>
    </span>
  ) : (
    <button className="reset-btn" onClick={() => setConfirming(true)}>
      重置演示数据
    </button>
  );
}

function App() {
  return (
    <StoreProvider value={store}>
      <ToastProvider>
        <main className="app">
          <section className="hero">
            <p>hxyfront-62010 · 瓶组配比与交付冻结闭环 · Port 62010</p>
            <h1>潜水气瓶充填闭环</h1>
            <span>
              气瓶按检验有效期与清洁等级准入，过期或油脂污染只能送检；同组目标压力不同整组拒绝。
              充填后录入实测氧氦含量与静置复测压力，偏差超限进入返工且须另一人复核；
              已签收气瓶更换阀门或补录气源批次时原签收立即失效并重算瓶组状态，历史完整保留。
              规则、存储、界面三层分离，事件溯源持久化，刷新后状态一致。
            </span>
            <ResetButton />
          </section>

          <StatsBar />

          <CylinderPanel />

          <div className="gap" />
          <GroupForm />

          <div className="gap" />
          <GroupQueue />

          <footer className="footnote">
            事件溯源：所有操作以不可变事件追加写入 localStorage（version 2），
            队列、统计与刷新后的界面均由同一事件流推导。
          </footer>
        </main>
      </ToastProvider>
    </StoreProvider>
  );
}

export default App;
