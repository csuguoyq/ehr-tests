# GOALS.md — 目标清单与状态

| 目标 | Flow | 依赖模块 | 参数 | 状态 |
|---|---|---|---|---|
| login | LoginFlow | Auth | username?, password?（缺省取 env） | 已通过 |
| create_patient | CreatePatientFlow | Registration | 全部可选：firstName?, lastName?, ssn?, dob?, address1?, city?, state?, zip?, sex?, citizenship?, searchMrn?（缺省由 step 生成唯一数据） | 已通过 |
| create_encounter | CreateEncounterFlow | Registration | preset inpatient_acute_admit（patientMode=new：建新患者+Inpatient Acute+admit+waitForBnr）或 inpatient_acute_existing_patient（patientMode=existing：按 SSN 打开**已有患者**+Inpatient Acute+admit；必填 ssn+lastName）；可选 facility/expectedDatetime/guarantorType/guarantor/admitType/pointOfOrigin/meansOfArrival/levelOfCare/bnrTimeoutMs | 已通过（new + existing 均 2026-09-15 fbch34 实测） |
| quick_charge | QuickChargeFlow | Charge Services | mrn?（按 MRN 直接打开账户，最快最准）, patientName?（缺省复用同次编排生成的患者；与 mrn 二选一）, cpts（默认 96372,96374）, qty（默认 10） | 已通过（mrn 路径 2026-09-15 fbch34 实测） |
| coding_complete | CodingCompleteFlow | Coding | mrn?（按 MRN 直接打开账户，同 quick_charge）, patientName?, admitDiagnosis（默认 I69.941）, principalDiagnosis（默认 S94.10XD）, drg（默认 182）, severityIllness / riskMortality（默认 1 - Minor）, dischargeDisposition（默认 Home or self-care） | 已通过（drg+mrn 路径 2026-09-15 fbch34 实测） |
| discharge | DischargeFlow | CPOE2, Registration | lastName, ssn, dischargeDisposition, providerQuery | 已通过（出院医嘱 + Registration Discharge 2026-09-15 fbch34 实测；待 goal 注册 mrn 参数后开放） |
| start_billing | StartBillingFlow | Charge Services (Billing tab) | mrn?/patientName?, forceReason（force_bill 用） | 已通过（2026-09-15 fbch34 实测：Start Billing → Bill Now） |
| force_bill | ForceBillFlow | Charge Services (Billing tab) | mrn?/patientName?, forceReason | 已通过（2026-09-15 fbch34 实测：BNR Edits → Force Submit + 原因 → Force Bill） |
| claim_submitted | ClaimSubmitFlow | Insurance Claims | encounterId | 未开始（被 submit_claim 取代，待清理） |
| lookup_account | LookupAccountFlow | Charge Services | mrn（最快最准）/ patientName 二选一 | 只读查询：返回账户行（姓名/DOB/MRN/SSN），可做存在性检查 | 新增 2026-09-15 fbch34 实测 |
| open_bnr_detail | OpenBnrDetailFlow | Charge Services | mrn / patientName 二选一 | 只读定位：打开患者 Hospital BNR 详情 | 新增 2026-09-16 fbch34 |
| claim_to_submitted | ClaimToSubmittedFlow | 全部 | planId, lastName?, cpts, qty, drg/dx 等 | 大部分通过（fbch34 2026-09-16：到 Billed 稳定）；末段 submit-claim 依赖服务器侧 claim 生成，见 TCS.md SZ35474 备注 |


| void_claim_rebill | VoidClaimRebillFlow | Charge Services (Billing/Claims) | mrn?/patientName?, forceReason | 已实现（fbch34 2026-09-16）：kebab → Void Claim → 重 billing → 重 Submit；端到端依赖 claim 存在，见 TCS.md SZ35474 |
| transfer_to_insurance | TransferToInsuranceFlow | Registration, CPOE2, Billing | ssn?/lastName?, planId, transactionCode(0001), balanceType(Guarantor), amount?(默认全额), notes? | **已通过**（fbch34 2026-09-16，SZ35253 回归 PASS）：出院→计费→补保险→Assign 到 BNR→0001 转账（guarantor 归零 + claim 生成）。前置：患者须有 Person 担保人且保险已 Assign（见 TCS.md） |
目标按需增加，不预设全量。参数 schema 见 `goals.yaml`。
