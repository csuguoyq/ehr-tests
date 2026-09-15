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

## Charge Services

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| BNR | rail Charge Services → Account Lookup → 患者 BNR Overview；MUI | P0 | 已通过 | openFromRail, search（按患者名）, openPatientAccount（双击行）, openPatientAccountByMrn（单击姓名格；双击 MRN/SSN 格无效）, openFirstBnrDetail（H 行 Open） | quick_charge | 2026-09-15 |
| Quick Charge | BNR 详情 Charges tab → Add Charges → Quick Charge 面板 | P0 | 已通过 | openCharges, addCpt（点行入队）, setQuantities, submit（含 CDM/Error 弹窗防御）, expectChargesPosted（断言最新行） | quick_charge | 2026-09-15 |

## Coding

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Coding View | BNR 详情 Coding tab（子 tab: DRG/Diagnosis/Procedure/ADT/...） | P0 | 已通过 | open（含 Begin Coding 弹窗）, fillDiagnoses, saveDiagnoses, expectDiagnosesSaved, setDischargeDisposition, complete | coding_complete | 2026-09-12 |
| Diagnosis | Coding → Diagnosis 子 tab（两个槽位 Admit/Principal） | P0 | 已通过 | 见 Coding View | coding_complete | 2026-09-12 |
| ADT (coding) | Coding → ADT 子 tab（Point of Origin / Discharge Disposition） | P0 | 已通过 | 见 Coding View | coding_complete, discharge | 2026-09-12 |

## CPOE2

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Order Reconcile | — | P0 | 未开始 | | | |
| Order Entry (CPOE2 ADT) | 患者图表 → rail ORDER ENTRY → NEW ORDERS/Browse | P0 | 切片中 | openFromRail, addAdtDischargeOrder, openOrderDetails, setProvider, applyOrderDetails, save, handleSaveDialogs, expectOrderActive（Pre-Add Authorizing Provider 查询在本环境对新建患者返回空候选，阻塞） | discharge | 2026-09-12 |

## Billing

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Start Billing / Bill Now | 待调研 | P0 | 未开始 | | billing_billed | |

## Insurance Claims

| 页面 | 路由 | 优先级 | 状态 | 已实现动作 | 用于 Flow | 最后验证 |
|---|---|---|---|---|---|---|
| Submit Claim | 待调研 | P0 | 未开始 | | claim_submitted | |
