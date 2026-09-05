// Lawchart 행위 사전 v1 — 법률 용어에서 자체 도출 (클린룸: 원본 코드 무참조)
// 엔트리 규약:
//   re      : 어간 정규식 (소비 구간 = 매칭 span)
//   label   : 통제 어휘 라벨 (라벨링 기준 §6)
//   kind    : contract | money | security | dispute | status | other
//   from    : 정규 방향의 주체가 문장 '주어'면 'subj', 상대방이면 'obj'
//   group   : true면 주어 나열(갑, 을, 병은)의 모든 쌍에 관계 생성
//   delivery: true면 의도 표현(-려고/-기로/예정) 시 미실현으로 제외
//   when    : 조건 함수(정규식 매칭 전 클로즈 텍스트 검사) — 함의 추론용
//   noRel   : true면 관계가 아니라 이벤트로만 기록
// 매칭 규칙: (시작위치 오름차순, 길이 내림차순) 그리디 비중첩 → 최장일치 우선.

export const ACTION_PATTERNS = [
  // ── 매매·양도 ──────────────────────────────────────────────
  { re: /전매|재매도|다시 ?매도/, label: '전매', kind: 'contract', from: 'subj' },
  { re: /매도(?!할 ?수)|팔았|팔아|매각(?!대)/, label: '매도', kind: 'contract', from: 'subj' },
  { re: /매수|사들였|사들여|구입|매입|샀/, label: '매도', kind: 'contract', from: 'obj' },
  { re: /채권양도/, label: '채권양도', kind: 'contract', from: 'subj' },
  { re: /양도받|넘겨 ?받/, label: '양도', kind: 'contract', from: 'obj' },
  { re: /양도|넘겨 ?주/, label: '양도', kind: 'contract', from: 'subj' },
  { re: /소유권 ?이전 ?등기/, label: '소유권이전등기', kind: 'contract', from: 'subj' },
  { re: /명의 ?신탁/, label: '명의신탁', kind: 'contract', from: 'subj' },
  { re: /증여|무상으로 ?(주|양도)/, label: '증여', kind: 'contract', from: 'subj' },
  // ── 임대차 ────────────────────────────────────────────────
  { re: /임대차 ?계약|임대하|임치 ?아니하고|세를 ?주|세 ?놓/, label: '임대', kind: 'contract', from: 'subj' },
  { re: /임차(?!보증금)|세를 ?얻|빌려 ?살|전세(?!권)/, label: '임대', kind: 'contract', from: 'obj' },
  { re: /전대/, label: '전대', kind: 'contract', from: 'subj' },
  // ── 금전 ──────────────────────────────────────────────────
  { re: /빌려 ?주|대여하|대출하|금전을 ?대여|돈을 ?빌려 ?주/, label: '금전대여', kind: 'money', from: 'subj' },
  { re: /차용(?!금)|빌렸|빌리|빌린|대여받|대출받|빌려 ?받|돈을 ?빌/, label: '금전대여', kind: 'money', from: 'obj' },
  { re: /공탁(하|했)/, label: '공탁', kind: 'money', from: 'subj' },
  { re: /변제(?!하 ?않)(?!(을|를|이)? ?(청구|구하))(?!에 ?(사용|충당))/, label: '변제', kind: 'money', from: 'subj', delivery: true },
  { re: /지급(?!하 ?않)(?!(을|를|이)? ?(청구|구하|예정|거절|거부))(?!하(는|여) ?방법)/, label: '지급', kind: 'money', from: 'subj', delivery: true },
  { re: /입금|송금/, label: '입금', kind: 'money', from: 'subj', delivery: true },
  // ── 담보 ──────────────────────────────────────────────────
  { re: /근저당(권)?(을|가|이)? ?설정받/, label: '근저당권 설정', kind: 'security', from: 'obj' },
  { re: /근저당(?!권 ?등기)/, label: '근저당권 설정', kind: 'security', from: 'subj' },
  { re: /(저당|전세권|질권)(권)?(을|가|이)? ?설정받/, label: '저당권 설정', kind: 'security', from: 'obj', byWord: { '전세권': '전세권 설정', '질권': '질권 설정', '저당': '저당권 설정' } },
  { re: /저당(권)?(을|가|이)? ?설정/, label: '저당권 설정', kind: 'security', from: 'subj' },
  { re: /전세권(을|가|이)? ?설정/, label: '전세권 설정', kind: 'security', from: 'subj' },
  { re: /질권(을|가|이)? ?설정/, label: '질권 설정', kind: 'security', from: 'subj' },
  { re: /연대보증|보증(하|했|인이|을|서)/, label: '보증', kind: 'security', from: 'subj' },
  { re: /양도담보로 ?제공|(담보|담보물)로 ?제공/, label: '담보 제공', kind: 'security', from: 'subj' },
  { re: /유치(하|하고|중)/, label: '유치권', kind: 'security', from: 'subj' },
  { re: /가등기(을|를|가)? ?설정/, label: '가등기 설정', kind: 'security', from: 'subj' },
  // ── 위임·도급·고용·조합 ──────────────────────────────────
  { re: /보관(을)? ?위탁하/, label: '보관위탁', kind: 'contract', from: 'subj' },
  { re: /보관(을)? ?(위탁받|맡)|보관하(는|고|여)/, label: '보관위탁', kind: 'contract', from: 'obj' },
  { re: /(위임|위탁)받|맡았|맡은/, label: '위임', kind: 'contract', from: 'obj' },
  { re: /(위임|위탁)하|맡겼/, label: '위임', kind: 'contract', from: 'subj' },
  { re: /도급받/, label: '도급', kind: 'contract', from: 'obj' },
  { re: /도급/, label: '도급', kind: 'contract', from: 'subj' },
  { re: /점유(하|하여|하고)/, label: '점유', kind: 'other', from: 'subj' },
  { re: /고용|채용|근로계약/, label: '고용', kind: 'contract', from: 'subj', person: true },
  { re: /조합(을|를)? ?(결성|구성)/, label: '조합', kind: 'contract', from: 'subj', group: true },
  { re: /대리권(을|를)? ?수여/, label: '대리', kind: 'contract', from: 'subj' },
  // ── 신분 ──────────────────────────────────────────────────
  { re: /혼인(하|했)|결혼(하|했)/, label: '혼인', kind: 'status', from: 'subj', group: true },
  { re: /이혼/, label: '이혼', kind: 'status', from: 'subj', group: true },
  { re: /입양/, label: '입양', kind: 'status', from: 'subj', person: true },
  { re: /상속(받|하)/, label: '상속', kind: 'status', from: 'obj' },
  { re: /유증/, label: '유증', kind: 'status', from: 'subj' },
  { re: /사망(하|했)/, label: '사망', kind: 'status', from: 'subj', noRel: true },
  // ── 계약 체결 ────────────────────────────────────────────
  { re: /(매매|보험|임대차|매도)?계약(을|이)? ?(체결|하(?!소)|하기로|을 ?맺)/, label: '계약', kind: 'contract', from: 'subj' },
  // ── 청구·소 ──────────────────────────────────────────────
  { re: /유류분(반환)?(을|의)? ?청구/, label: '유류분반환청구', kind: 'dispute', from: 'subj' },
  { re: /손해배상(을|금)? ?청구|배상(을)? ?청구/, label: '손해배상 청구', kind: 'dispute', from: 'subj' },
  { re: /말소(를|등기)? ?청구/, label: '말소청구', kind: 'dispute', from: 'subj' },
  { re: /반환(을|의)? ?청구/, label: '반환청구', kind: 'dispute', from: 'subj' },
  { re: /(?<![가-힣])소(를)? ?제기|(?<![가-힣])소송(을)? ?제기|제소|(?<!항소[를을]? ?)(?<!상고[를을]? ?)제기(하|한)|청구(하|했)/, label: '청구·제소', kind: 'dispute', from: 'subj' },
  // ── 보전·집행 ────────────────────────────────────────────
  { re: /가압류/, label: '가압류', kind: 'dispute', from: 'subj' },
  { re: /가처분/, label: '가처분', kind: 'dispute', from: 'subj' },
  { re: /(강제)?경매(를)? ?(신청|개시)|압류( 및)? ?(추심|집행)|강제집행/, label: '압류·집행', kind: 'dispute', from: 'subj' },
  // ── 인도 ─────────────────────────────────────────────────
  { re: /인도(?!하 ?않)(?!(을|를)? ?(청구|구하))(?!\s?및)/, label: '인도', kind: 'contract', from: 'subj', delivery: true },
  // ── 상법 ─────────────────────────────────────────────────
  { re: /(발행|교부)하(였|여|서|아)|발행한/, label: '약속어음 발행', kind: 'money', from: 'subj', when: t => /어음/.test(t) },
  { re: /배서(?!인)(?: ?양도|하여(?: ?양도|서)?|를 ?통해|하)/, label: '배서양도', kind: 'contract', from: 'subj' },
  { re: /인수(하|했)/, label: '신주 인수', kind: 'contract', from: 'subj', when: t => /신주/.test(t) },
  { re: /출자(하|하여)/, label: '출자', kind: 'contract', from: 'subj' },
  { re: /설립(하|하여)/, label: '설립', kind: 'contract', from: 'subj', noRel: true },
  // ── 형사 ─────────────────────────────────────────────────
  { re: /기망(하|했|한|하여)|속여|속이|속였/, label: '기망', kind: 'dispute', from: 'subj', person: true },
  { re: /강박|협박(하|했)|위협하여/, label: '강박', kind: 'dispute', from: 'subj', person: true },
  { re: /절취|절도|훔쳤|훔치/, label: '절취', kind: 'dispute', from: 'subj' },
  { re: /강취|강도|강탈|빼앗/, label: '강취', kind: 'dispute', from: 'subj' },
  { re: /횡령/, label: '횡령', kind: 'dispute', from: 'subj' },
  { re: /임무에 ?위배/, label: '횡령', kind: 'dispute', from: 'subj', when: t => /위탁|보관|맡/.test(t) },
  { re: /(소비|유용|전용)하/, label: '횡령', kind: 'dispute', from: 'subj', when: t => /위탁|보관|맡/.test(t) },
  { re: /사용하/, label: '횡령', kind: 'dispute', from: 'subj', when: t => /보관|맡/.test(t) },
  { re: /사용하/, label: '배임', kind: 'dispute', from: 'subj', when: t => /위탁|임무/.test(t) && !/보관|맡/.test(t) },
  { re: /매수(하|했)/, label: '장물취득', kind: 'dispute', from: 'subj', when: t => /절취품|장물|도난|훔친|강취품/.test(t) },
  { re: /배임/, label: '배임', kind: 'dispute', from: 'subj' },
  { re: /승낙 ?없이/, label: '배임', kind: 'dispute', from: 'subj', when: t => /위탁|임무|맡/.test(t) },
  { re: /때려|폭행|상해를 ?입히|폭력/, label: '폭행·상해', kind: 'dispute', from: 'subj', person: true },
  { re: /살해|살인/, label: '살해', kind: 'dispute', from: 'subj', person: true },
  { re: /위조/, label: '문서위조', kind: 'dispute', from: 'subj' },
  { re: /주운|주워|습득한/, label: '점유이탈물횡령', kind: 'dispute', from: 'subj' },
];

// 통지·의사표시·절차 이벤트(관계도에 그리지 않음 — 라벨링 기준 §3.5)
export const EVENT_PATTERNS = [
  [/해제(를)? ?하는 ?의사표시|해제(통지|하|했)/, '해제 통지'],
  [/해지(를)? ?하는 ?의사표시|해지(통지|하|했)/, '해지 통지'],
  [/취소(를)? ?하는 ?의사표시|취소(통지|하|했)/, '취소 통지'],
  [/이행(의)? ?제공/, '이행 제공'],
  [/수령(을)? ?(거절|거부)/, '수령 거절'],
  [/최고(하|했|장)/, '최고'],
  [/판결(을|이)? ?선고/, '판결 선고'],
  [/항소(를)? ?제기|항소(하|했)/, '항소 제기'],
  [/상고(를)? ?제기/, '상고 제기'],
  [/소(를)? ?취하|취하(하|했)/, '소 취하'],
  [/공시송달/, '공시송달 신청'],
  [/조정(신청|절차|조서)/, '조정절차'],
  [/고소(하|했)/, '고소'],
];

// 목적물 명사 (앞 글자(X, A, B…) 접두 허용)
export const THING_NOUNS = '토지|대지|임야|건물|주택|아파트|빌라|상가|점포|오피스텔|부동산|자동차|차량|물건|물품|기계|선박|주식|신주|지갑|그림|보석|반지|시계|가방|노트북|컴퓨터|스마트폰|어음|수표|화물|예금|채권|인장|서명';
export const THING_RE = new RegExp(`([A-Z가-힣]{0,2})(${THING_NOUNS})`, 'g');

// 당사자 후보 사전
export const HANJA = '甲乙丙丁戊己庚辛壬癸';
export const ROLE_WORDS = ['원고', '피고', '피고인', '피해자', '채권자', '채무자', '매도인', '매수인', '임대인', '임차인', '보증인', '제삼자', '제3자', '회사'];
export const ORG_WORDS = ['법원', '검사', '검찰', '국가']; // 당사자 제외(기준 §3.1)

// 빈출 명사 필터용 불용어 (관계·서술 명사는 당사자 후보에서 제외)
export const STOPWORDS = new RegExp('^(?:그|이|저|그것|이것|위|아래|동|각|해당|사건|두 ?사람|이들|모두|자신|본인|타인|상대방|사람|것|수|가지|때|곳|돈|돈의|토지|건물|부동산|주택|아파트|자동차|물건|물품|지갑|시계|그림|컴퓨터|스마트폰|어음|수표|화물|예금|주식|신주|채권|금원|대금|금액|보증금|임대차|매매|대여금|차용금|차용|대여|매도|매수|전매|양도|증여|유증|상속|혼인|이혼|입양|사망|조합|도급|고용|채용|위임|위탁|보관|대리|대리인|대리권|인도|점유|등기|가등기|소유권|지분|소유|명의|명의신탁|전세|전세권|저당|저당권|근저당|근저당권|질권|유치|유치권|담보|보증|약정|계약|계약금|중도금|잔금|이자|원금|손해|배상|청구|소송|판결|승소|패소|항소|상고|취하|공시송달|조정|신청|결정|명령|집행|경매|압류|가압류|가처분|사실|경우|시기|기일|기한|변제|지급|입금|송금|수령|거절|제공|발행|교부|배서|인수|출자|설립|운송|보험|보험금|공사|재산|재산분할|수리|수리비|전화|금품|요구|협박|기망|절도|절취|강도|강취|횡령|배임|폭행|상해|살해|살인|위조|인장|문서|현금|만기|부도|승낙|임무|위배|소비|이행|의사표시|소재|불명|전자제품점|주인|아들|딸|배우자|친구|친권자|법정대리인|대표이사|이사회|발기인|채권자|채무)$');
