# BTC Grid Backtester

本地 BTCUSDT 网格回测小工具。

## 启动

```powershell
cd C:\Users\xu\Documents\Codex\2026-06-20\c-users-xu-desktop-k-btc\outputs\btc-grid-backtester
npm start
```

然后打开：

```text
http://127.0.0.1:4177
```

## 现在有什么

- 从 `data-api.binance.vision` 拉 Binance 格式的 BTCUSDT K 线。
- 支持 1m、3m、5m、15m、1h 等周期。
- 支持设置网格上下限、格数、本金、杠杆、每格金额、手续费。
- 在 K 线上显示网格线、买入点 B、卖出点 S。
- 显示资金曲线、成交记录和统计结果。

## 回测逻辑

这个版本参考了你 `新建文本文档.txt` 里的 Pine 网格看板，但做成了更适合回测的账本逻辑：

- 价格下穿某个网格价，买入一格。
- 价格反弹到上一格，卖出对应仓位。
- 每个仓位单独记录入场、出场、数量、手续费、利润。
- 使用 K 线的 high/low 判断一根 K 线内是否触碰网格。

注意：只用 K 线回测密集网格时，无法知道一根 K 线内部先涨还是先跌，所以结果是近似值。要测试“一天 1000 单”的高频剥头皮，后面最好接逐笔成交或 tick 数据。

## TradingView 官方图表库状态

`C:\Users\xu\Desktop\今天软件\charting-library-tutorial-master` 的 npm 依赖已经安装过。

但这个项目没有自带 `charting_library.js` / `charting_library.esm.js`，需要 TradingView 官方 Charting Library 或 Trading Platform 仓库权限。当前尝试安装官方包没有完成，所以这个可运行版本先使用开源的 Lightweight Charts。
