# CTO 能力执行适配器说明

这份文档说明 CTO 技术中台里“能力执行”的正式优先级，以及什么时候会走平台适配器、什么时候会诚实失败。

## 固定优先级

平台对能力执行固定采用下面的顺序：

1. `workspace script`
2. `registered adapter`
3. `honest failure`

含义是：

- 如果 CTO 在自己的 workspace 中提供了真实脚本，并且当前环境支持执行，就优先跑真实脚本。
- 如果真实脚本缺失，或者当前环境暂不支持执行，但平台已经为这条 `entryPath` 注册了正式适配器，就回退到平台适配器。
- 如果两者都没有，就必须失败，并把问题写回能力问题回路；不能再伪造“看起来成功”的占位结果。

## 当前已注册的平台适配器

- `scripts/build-reader-index.ts`
  - 作用：把显式资源聚合成稳定的 `AppManifest`
- `scripts/run-consistency-check.ts`
  - 作用：围绕显式真相源生成结构化规则/一致性检查报告
- `scripts/run-review-precheck.ts`
  - 作用：根据显式资源与 `AppManifest` 产出发布前检查结论

## 发布检查规则

一条能力能被发布为“可用”，执行承载至少要满足下面两种情况之一：

- 已注册平台适配器
- 最近一次成功 smoke test 来自真实 workspace script

这条规则的目标是：

- 不强制所有能力都要先写进平台内置适配器
- 但也不允许“既没有脚本、也没有适配器”的能力被误发布

## 为什么要这样设计

这样做可以同时满足两件事：

- CTO 仍然可以优先交付真实脚本，而不是被平台内置分支反向绑死
- 平台仍然能在脚本暂时缺失时，通过正式适配器承接少量稳定能力

最终平台的真相源不是“某个页面里写死了什么”，而是：

- `entryPath`
- versioned input/output contract
- adapter registry
- run ledger
- capability request / issue 回路
