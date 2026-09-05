# Lawchart (로차트)

법률 사실관계 지문을 붙여넣으면 **당사자·목적물·권리관계도**와 **시점별 권리 상태 타임라인**을 그려주는 공개 웹 도구.

- 🔗 서비스: GitHub Pages (app/)
- 📊 정확도 공개: [accuracy](./app/accuracy.html) — 골드셋 100건, 관계 F1 0.969(홀드아웃 1차 무보정 0.647→보강 후 0.956)
- 🔒 전 과정 브라우저 내 처리 — 계정 없음, 서버 없음, 지문 전송 없음

## 기능

- 지문 → 관계도 (규칙 기반 파서, 클린룸 자체 구현 — 민법·상법·형사·민사소송법)
- 캡처 이미지 OCR 입력 (Tesseract.js, 브라우저 내)
- 관계도 편집기: 드래그·이름 수정·줌·팬, 관계 추가/수정/쟁점 메모 ⚑
- 시점 슬라이더: 그 날짜에 유효한 소유·점유·담보 상태만 표시
- 저장: 브라우저 자동저장, 사건 파일(JSON) 내보내기/불러오기, PNG/SVG
- **AI 보조(옵션, 자기 키 사용)**: "AI로 더 정확하게" 켜고 자신의 OpenAI 호환 API 키를 입력하면 LLM이 지문을 재분석합니다. 키와 지문은 입력한 API 제공자로만 직접 전송되고(별도 서버 없음), 실패 시 규칙 파서로 자동 폴백합니다. 기본은 꺼져 있고, 끄면 뭐든 전송되지 않습니다.

## 로컬에서 실행

```bash
node phase3/dev-server.mjs   # → http://localhost:8123
```

(index.html을 파일로 직접 열면 ES 모듈 제약으로 동작하지 않습니다.)

## 측정 재현

```bash
node phase0/metrics/evaluate.js --parser lawchart --set all
node phase0/metrics/publish.js   # app/accuracy.html 재생성
```

- 골드셋: 개발 60건 + 홀드아웃 40건(합성 30 + 판결문체 10) — `phase0/goldset*/`, 라벨링 기준 `phase0/labeling-guidelines.md`
- 측정 원칙: 홀드아웃 1차(파서 무보정) 수치가 일반화 근거

## 구조

- `app/` — 제품 (index.html, main.js, src/{dict,parser,layout,render}.js)
- `phase0/` — 골드셋·측정 파이프라인·게이트 보고
- `phase1~3/` — 화면 설계도·게이트 보고·배포 지침·E2E
- `PRD_Lawchart_v0.3.md` — 제품 요구사항(결정 기록 D1~D5 포함)

관계도 도구의 원형은 [plot](https://plot.app.yebni.cc/)입니다. Lawchart의 코드는 전부 독자적으로 작성되었습니다(클린룸).

라이선스: 미정(코드 열람·서비스 이용은 자유, 재사용은 문의 바랍니다).
