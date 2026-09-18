# PAGES.md — 页面状态表（全量，按模块分组）

状态机：未登记 → 已登记 → 定位器已抓 → 动作已实现 → 断言已实现 → 已接入 Flow → 已通过 → 已回归

## Patient Control

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Patient Control | `/Cps`（webtoken 后门户落地；PO 在 `page-objects/` 根） | P0 | 已通过 | open, search, openChart, openUnit, censusRow, findCensusRow（跨页翻页） | discharge, SZ35266 | 2026-09-15 |

## Auth

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Login | `/logon?ctrl=cps` | P0 | 已通过 | open, dismissWarningIfPresent, ensureUsernamePasswordForm, fillCredentials, submit, expectLoggedIn | login | 2026-09-11 |
| Logout | — | P1 | 未开始 | | | |

## Registration

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Patient Create | rail REGISTRATION → Create New Patient 对话框（MUI，无独立路由） | P0 | 已通过 | fillSearchMrn, openCreateDialog, fillTextField, pickDob, selectOption, submit, expectPatientCreated | create_patient, claim_to_submitted | 2026-09-12 |
| Encounter | 患者级 Encounters 子 tab（MUI，无独立路由） | P0 | 已通过 | clickCreateNewEncounter, pickAutocomplete, pickFirstAutocomplete, fillExpectedDatetime, save, expectStatusSummary, clickAdmit, expectAdmitted, readSummary | create_encounter, discharge | 2026-09-12 |
| Discharge | 患者级 Encounters 子 tab → Encounter Details 面板 → Discharge | P0 | 已通过 | selectEncounterRow, startDischarge, setDischargeDisposition, saveDischarge, expectDischarged | discharge, SZ35253 | 2026-09-15 |
| Accounts (BNR) Overview | 患者级 Accounts (BNR) 子 tab（MUI，无独立路由） | P0 | 已通过 | expectFirstBnr（读首行 BNR id，轮询）, openBnrEditor（row-1 Edit）, assignCoverage（Assign 链接；30s 可见轮询，无 stale-fetch 重开——2026-09-17 实机裁定）, saveAndConfirm | create_encounter(waitForBnr), quick_charge, assign_insurance_bnr | 2026-09-17 |
| Insurance Form | 患者级 Insurance 子 tab → Add Insurance → 计划选择 → New Insurance 表单（DynamicForm）；**嵌套 tab**：Tab0 "Insurance Overview"（唯一有 Add Insurance + Reorder Priorities 的 tab），Tab1..n 每保险表单一个 | P0 | 已通过 | fillText/pickOption/fillToday/fillPhone（label-container → 后继可见 input；锁定的预填字段视为完成）, openLookupDialog/lookupAndPickFirstPlan/submitLookup, saveForm（toolbar "Save"，非 Save and Close）+ resolveUnsavedChanges, **ensureOverviewView**（回到 "Insurance Overview" 嵌套 tab——save/切换后停在表单 tab，Add/Reorder 只在 Overview）, enterReorderMode（"Reorder Priorities"→drag 模式 header + Apply）, dragRowTo（真实鼠标步进拖拽 handle→12 步 50ms→释放）, applyReorder（Apply→Reorder Priorities 对话框，每变更保险类型一个 CciDatePicker，默认 today，**max=serverToday**）, setReorderEffectiveDate, confirmReorder（"Confirm Reorder"→success toast "Succesfully reordered..."（源码 typo））, cancelReorder | claim_to_submitted, transfer_to_insurance, **coverage_change（TC33731，Reorder + Worklist 捕获）** | 2026-09-17（TC33731，fbch34） |
| Guarantors | 患者级 Guarantors 子 tab（MUI，无独立路由） | P0 | 已通过 | addSelf（Add Guarantor → Self chip（默认）→ + Create New Guarantor → Save and Close；自动带出患者人口学信息） | create_encounter | 2026-09-17 |

## Charge Services

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| BNR | rail Charge Services → Account Lookup → 患者 BNR Overview；MUI | P0 | 已通过 | openFromRail, search（按患者名）, openPatientAccount（双击行）, openPatientAccountByMrn（单击姓名格；双击 MRN/SSN 格无效）, openFirstBnrDetail（H 行 Open） | quick_charge | 2026-09-15 |
| Quick Charge | BNR 详情 Charges tab → Add Charges → Quick Charge 面板 | P0 | 已通过 | openCharges, addCpt（点行入队，吞点击重试）, setQuantities, submit（含 CDM/Error 弹窗防御）, queueCount/isQueueCleared, expectChargesPosted（断言最新行） | quick_charge | 2026-09-16 |
| Billing (BNR) | BNR 详情 Billing tab → Overview → Unbilled Charges 卡片 | P0 | 已通过 | open, startBilling（Start Billing → Bill Now；BNR Edits 回弹重试）, waitForSettled（Not Yet Billed 消失/Force Bill 出现）, forceBill（"Force Submit" + 必填原因 → Force Bill）, readGuarantorBalance, readBnrStatusHeader（"BNR Status: <value>" 头部文本 + 旁红色图标 MUI Tooltip——SZ33286 表面："Claim Edits Needed" 等状态文本不在头部里、只进 tooltip；无 tooltip = 服务器未报 claim edits） | start_billing, force_bill, transfer_to_insurance, claim_to_errored（TC35118） | 2026-09-17（用户实测：①进 Billing 视图后等约 10s 再点 Start Billing，首按即成功——按钮渲染早于服务器侧就绪；②force bill POST 后服务器侧处理约 10s，之后切 tab 才安全。两处 settle 均已在 step 固化；③force bill 后 BNR 状态由服务器 updateBNRStatus 翻转，有延迟——claim_to_errored 用 6 轮 × 10s 重挂载轮询） |
| Adjustments (BNR) | BNR 详情 Billing tab → Adjustments 手风琴 → Add（CciDialog） | P0 | 已通过 | openAddDialog, pickField（Transaction Code/Balance Type，MUI Autocomplete）, resolveAmount（TRANSFER 码自动锁定全额）, setNotes, save | transfer_to_insurance, SZ35253 | 2026-09-16 |

## Coding

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Coding View | BNR 详情 Coding tab（子 tab: DRG/Diagnosis/Procedure/ADT/...） | P0 | 已通过 | open（含 Begin Coding / Begin Recoding 弹窗）, fillDiagnoses（Add Diagnosis 整页表单，Code Date=box 时区当天）, saveDiagnoses, expectDiagnosesSaved, setDrg（完整码自动选中无候选列表；Severity/Risk 必选；Save DRG 按钮在 view 外）, setDischargeDisposition, complete | coding_complete | 2026-09-15 |
| Diagnosis | Coding → Diagnosis 子 tab（两个槽位 Admit/Principal） | P0 | 已通过 | 见 Coding View | coding_complete | 2026-09-12 |
| ADT (coding) | Coding → ADT 子 tab（Point of Origin / Discharge Disposition） | P0 | 已通过 | 见 Coding View | coding_complete, discharge | 2026-09-12 |

## CPOE2

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Order Reconcile | — | P0 | 未开始 | | | |
| Order Entry (CPOE2 ADT) | 患者图表 → rail ORDER ENTRY → NEW ORDERS/Browse | P0 | 已通过 | openFromRail, addAdtDischargeOrder, openOrderDetails, setProvider, applyOrderDetails, submitOrder（弹窗清扫：Validation Enter 提交 / MUI Save Order 回执）, expectOrderActive（面板文本断言） | discharge, transfer_to_insurance, SZ35253 | 2026-09-16 |

## Billing

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Start Billing / Bill Now | BNR 详情 Billing tab（动作实现在 `page-objects/charge/billing.page.ts`，页面卡见 Charge Services「Billing (BNR)」） | P0 | 已通过 | 见 Charge Services「Billing (BNR)」 | start_billing, force_bill | 2026-09-16 |

## Insurance Claims

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Insurance Claim Table | BNR 详情 Billing tab → Insurance Claims 手风琴（MUI DataGrid + pinned Totals 行） | P0 | 已通过 | submitClaim（Ready to Submit 直交 / Errored → Force Submit）, rowAction（kebab → Void/Resubmit/Replacement + CciMsgDialog 确认）, readRows, readTotalsCharges | submit_claim, void_claim_rebill, SZ35474 | 2026-09-16 |

## Worklists

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Worklist Directory + Item View | portal rail WORKLIST→directory（"Worklist Name" 表头；行 "<name>(<systemId>)"，**双击**打开 item view；单击仅选中）→item view（每 open worklist 一个 tab；"Search for Account" + Active/Deferred/Completed counters + grid MRN/Patient Name/BNR/Admit/Discharge/Encounter Type） | P1 | 已通过 | open（rail→directory，已在内则 no-op）, openWorklist（双击行）, expectItemViewVisible（以 search input 佐证——"Show Columns" 按钮 a11y name 实为 "Select columns"）, searchAccount（select-all+delete+`pressSequentially` 逐键 + `waitForSearchSettled` 等 grid 反映查询——`fill` 会漏 React onChange 致 search 未 commit、grid 停在未过滤）, readRows/findItems, expectItemPresent/Absent, completeItem（row checkbox→toolbar Complete→dialog，Reason MUI Select **自动弹开**（勿点否则收起）→`completeItem(searchKey, reason?)`：传 reason 按文本选、不传选第一个可用 option（跳过 "Select Reason" 占位；业务默认值 "No further follow-up needed from patient" 在 step 的 completeReason 默认）→Complete（`getByRole name exact`——JSX 单行 `> Complete <` 裸文本带空格，`hasText /^Complete$/` 漏）→dialog hidden→**re-open worklist** 强拉 server fetch 再断言 absence（Complete.tsx `isRefresh:false` 不自动刷新））, readCounters | coverage_change（spec 按 TC 13 步驱动，非 flow 内） | 2026-09-18（TC33731，fbch34） |
