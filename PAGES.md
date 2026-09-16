# PAGES.md — 页面状态表（全量，按模块分组）

状态机：未登记 → 已登记 → 定位器已抓 → 动作已实现 → 断言已实现 → 已接入 Flow → 已通过 → 已回归

## Portal

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
| Discharge | 患者级 Encounters 子 tab → Encounter Details 面板 → Discharge | P0 | 切片中 | selectEncounterRow, startDischarge, setDischargeDisposition, saveDischarge, expectDischarged | discharge | 2026-09-12 |
| Accounts (BNR) Overview | 患者级 Accounts (BNR) 子 tab（MUI，无独立路由） | P0 | 已通过 | expectFirstBnr（读首行 BNR id，轮询） | create_encounter(waitForBnr), quick_charge, billing_billed | 2026-09-12 |
| Insurance Form | 患者级 Insurance 子 tab → Add Insurance → 计划选择 → New Insurance 表单（DynamicForm） | P0 | 已通过 | fillText/pickOption/fillDate/fillPhone（label-container → 后继可见 input；锁定的预填字段视为完成）, Save and Close + Unsaved Changes 处理 | add_insurance, claim_to_submitted, transfer_to_insurance | 2026-09-16 |

## Charge Services

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| BNR | rail Charge Services → Account Lookup → 患者 BNR Overview；MUI | P0 | 已通过 | openFromRail, search（按患者名）, openPatientAccount（双击行）, openPatientAccountByMrn（单击姓名格；双击 MRN/SSN 格无效）, openFirstBnrDetail（H 行 Open） | quick_charge | 2026-09-15 |
| Quick Charge | BNR 详情 Charges tab → Add Charges → Quick Charge 面板 | P0 | 已通过 | openCharges, addCpt（点行入队，吞点击重试）, setQuantities, submit（含 CDM/Error 弹窗防御）, queueCount/isQueueCleared, expectChargesPosted（断言最新行） | quick_charge | 2026-09-16 |
| Billing (BNR) | BNR 详情 Billing tab → Overview → Unbilled Charges 卡片 | P0 | 已通过 | open, startBilling（Start Billing → Bill Now；BNR Edits 回弹重试）, waitForSettled（Not Yet Billed 消失/Force Bill 出现）, forceBill（"Force Submit" + 必填原因 → Force Bill）, readGuarantorBalance | start_billing, force_bill, transfer_to_insurance | 2026-09-16 |

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
| Start Billing / Bill Now | 待调研 | P0 | 未开始 | | billing_billed | |

## Insurance Claims

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Insurance Claim Table | BNR 详情 Billing tab → Insurance Claims 手风琴（MUI DataGrid + pinned Totals 行） | P0 | 断言已实现 | submitClaim（Ready to Submit 直交 / Errored → Force Submit）, rowAction（kebab → Void/Resubmit/Replacement + CciMsgDialog 确认）, readRows, readTotalsCharges | submit_claim, void_claim_rebill, SZ35474 | 2026-09-16 |
