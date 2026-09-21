# GOALS.md — 目标清单与状态

| 目标 | Flow | 依赖模块 | 参数 | 状态 |
|---|---|---|---|---|
| login | LoginFlow | Auth | username?, password?（缺省取 env） | 已通过 |
| create_patient | CreatePatientFlow | Registration | 全部可选：firstName?, lastName?, ssn?, dob?, address1?, city?, state?, zip?, sex?, citizenship?, searchMrn?（缺省由 step 生成唯一数据） | 已通过 |
| create_encounter | CreateEncounterFlow | Registration | preset inpatient_acute_admit（patientMode=new：建新患者+Inpatient Acute+admit+waitForBnr）、inpatient_acute_existing_patient（patientMode=existing：按 SSN 打开**已有患者**+Inpatient Acute+admit；必填 ssn+lastName）、outpatient（patientMode=new，Outpatient，不 admit）三者之一；可选 facility/expectedDatetime/guarantorType/guarantor/admitType/pointOfOrigin/meansOfArrival/levelOfCare/bnrTimeoutMs | 已通过（new + existing 均 2026-09-15 fbch34 实测） |
| quick_charge | QuickChargeFlow | Charge Services | mrn?（按 MRN 直接打开账户，最快最准）, patientName?（缺省复用同次编排生成的患者；与 mrn 二选一）, cpts（默认 96372,96374）, qty（默认 10） | 已通过（mrn 路径 2026-09-15 fbch34 实测） |
| coding_complete | CodingCompleteFlow | Coding | mrn?（按 MRN 直接打开账户，同 quick_charge）, patientName?, admitDiagnosis（默认 I69.941）, principalDiagnosis（默认 S94.10XD）, drg（默认 182）, severityIllness / riskMortality（默认 1 - Minor）, dischargeDisposition（默认 Home or self-care） | 已通过（drg+mrn 路径 2026-09-15 fbch34 实测） |
| discharge | DischargeFlow | CPOE2, Registration | lastName, ssn, firstName?, dischargeDisposition, providerQuery | 已通过（出院医嘱 + Registration Discharge，2026-09-15 fbch34 实测；lastName/ssn 必填，无 mrn 参数——患者按 SSN 检索打开） |
| start_billing | StartBillingFlow | Charge Services (Billing tab) | mrn?/patientName? 二选一 | 已通过（2026-09-15 fbch34 实测：Start Billing → Bill Now） |
| force_bill | ForceBillFlow | Charge Services (Billing tab) | mrn?/patientName?, forceReason | 已通过（2026-09-15 fbch34 实测：BNR Edits → Force Submit + 原因 → Force Bill） |
| submit_claim | SubmitClaimFlow | Insurance Claims | mrn?/patientName?, forceReason | 已通过（Ready to Submit 直交 / Errored → Force Submit；claim_to_submitted 与 SZ35474 链中实测） |
| lookup_account | LookupAccountFlow | Charge Services | mrn（最快最准）/ patientName 二选一 | 只读查询：返回账户行（姓名/DOB/MRN/SSN），可做存在性检查；新增 2026-09-15 fbch34 实测 |
| open_bnr_detail | OpenBnrDetailFlow | Charge Services | mrn / patientName 二选一 | 只读定位：打开患者 Hospital BNR 详情；新增 2026-09-16 fbch34 |
| claim_to_submitted | ClaimToSubmittedFlow | 全部 | planId, lastName?, cpts, drg/dx 等 | **已通过（端到端）**（fbch34 2026-09-17）：force bill → claim 生成 → Submitted 全链 PASS。已固化为 `specs/claim-to-submitted.spec.ts` |
| claim_to_errored | ClaimToErroredFlow | 全部 | 同 claim_to_submitted（无 submit 尾段） | 新增（fbch34 2026-09-17，TC35118）：链止于 Force Bill，终点态 = claim Errored + BNR "Claim Edits Needed"（红色图标 tooltip，SZ33286）。已固化为 `specs/sz/TC35118-claim-edits-needed.spec.ts` |
| void_claim_rebill | VoidClaimRebillFlow | Charge Services (Billing/Claims) | mrn?/patientName?, forceReason | 大部分通过（fbch34 2026-09-17）：void 成功（Void/Cancel 行出现）；re-bill 腿需 BNR 状态从 Billed 翻回可计费（服务器侧 updateBNRStatus），现以 8 分钟重挂载轮询等待，未翻转则诊断报错（见 TCS.md SZ35474） |
| transfer_to_insurance | TransferToInsuranceFlow | Registration, CPOE2, Billing | ssn?/lastName?, planId, transactionCode(0001), balanceType(Guarantor), amount?(默认全额), notes? | **已通过**（fbch34 2026-09-16，SZ35253 回归 PASS）：出院→计费→补保险→Assign 到 BNR→0001 转账（guarantor 归零 + claim 生成）。前置：患者须有 Person 担保人且保险已 Assign（见 TCS.md） |
| coverage_change | CoverageChangeFlow | Registration | planId(68888), planId2("Commercial - Generic"=plan 9/COMMG，按计划名搜——第二保险计划，重排需 ≥2 行；1 字符计划号搜不到), lastName?, ssn?/mrn?（resume）, encounterType, admit, waitForBnr, bnrTimeoutMs | 新增（fbch34 2026-09-17，TC33731）：新患者→Self 担保人→**双保险计划**→Inpatient Acute admit+BNR（活跃 encounter 就绪，供 Insurance Reorder Priorities 测试）；reorder 与 worklist 校验由 spec 按 TC 步驱动（`specs/sz/TC33731-coverage-change-worklist.spec.ts`） |
| create_referral | CreateReferralFlow | Registration | ssn?/lastName?/firstName?（默认 scratch 患者）, procedureKeyword("Ablation"), procedureMatch("30802"), laterality(Bilateral), dxKeyword("pain")/dxMatch("T65.6X1D"), cptKeyword("Manual therapy")/cptMatch("97140"), providerNpi/surgeonNpi("3971396437"=dstest MD，box 供应商表仅 4 行), serviceType("Procedure/Surgery"), facility("San Diego Medical Center")/clinicDept("Cove Community Hospital")/location("San Diego - Cove Community Hospital")/encounterType("Inpatient Acute"), requestedDatetime(默认明日 08:00) | 新增（fbch34 2026-09-20，TC35520）：按 SSN 重开患者→Referral 子表→New Referral 表单（SelectWithTable 供应商搜索/MUI select/关键字搜索下拉/掩码时间输入）→Create Referral，toast "Referral created successfully." 断言；供 Scheduling Worklist 显示验证（`specs/sz/TC35520-scheduling-worklist-long-names.spec.ts`） |

目标按需增加，不预设全量。参数 schema 见 `goals.yaml`。
