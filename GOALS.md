# GOALS.md — 目标清单与状态

| 目标 | Flow | 依赖模块 | 参数 | 状态 |
|---|---|---|---|---|
| login | LoginFlow | Auth | username?, password?（缺省取 env） | 已通过 |
| create_patient | CreatePatientFlow | Registration | 全部可选：firstName?, lastName?, ssn?, dob?, address1?, city?, state?, zip?, sex?, citizenship?, searchMrn?（缺省由 step 生成唯一数据） | 已通过 |
| create_encounter | CreateEncounterFlow | Registration | preset inpatient_acute_admit（patientMode=new：建新患者+Inpatient Acute+admit+waitForBnr）或 inpatient_acute_existing_patient（patientMode=existing：按 SSN 打开**已有患者**+Inpatient Acute+admit；必填 ssn+lastName）；可选 facility/expectedDatetime/guarantorType/guarantor/admitType/pointOfOrigin/meansOfArrival/levelOfCare/bnrTimeoutMs | 已通过（new + existing 均 2026-09-15 fbch34 实测） |
| quick_charge | QuickChargeFlow | Charge Services | mrn?（按 MRN 直接打开账户，最快最准）, patientName?（缺省复用同次编排生成的患者；与 mrn 二选一）, cpts（默认 96372,96374）, qty（默认 10） | 已通过（mrn 路径 2026-09-15 fbch34 实测） |
| coding_complete | CodingCompleteFlow | Coding | patientName?, admitDiagnosis（默认 I69.941）, principalDiagnosis（默认 S94.10XD）, dischargeDisposition（默认 Home or self-care） | 已通过 |
| discharge | DischargeFlow | CPOE2, Registration | lastName, ssn, dischargeDisposition, providerQuery | 切片中（阻塞：CPOE2 前置 Provider 查询空候选） |
| billing_billed | BillingFlow | Billing | encounterId | 未开始 |
| claim_submitted | ClaimSubmitFlow | Insurance Claims | encounterId | 未开始 |
| claim_to_submitted | ClaimToSubmittedFlow | 全部 | planId, cpts, qty | 未开始 |

目标按需增加，不预设全量。参数 schema 见 `goals.yaml`。
