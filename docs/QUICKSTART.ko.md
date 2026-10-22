# Rialo 개발자 도구 빠른 시작

[English](QUICKSTART.en.md) · 확인일: 2026-10-20

이 저장소는 커뮤니티가 만든 재현·진단 도구입니다. 코드 공개와 테스트
통과는 공식 기여 인정이나 포인트 지급을 뜻하지 않습니다.

## 1. 지갑 없이 재현하기

Node.js **22**와 Git이 있는 환경에서 새 폴더로 복제합니다.
기존 봇 폴더의 지갑 설정이나 거래 원장을 복사하지 않습니다.

```sh
git clone https://github.com/gnoesy/rialo-contribution-runner.git
cd rialo-contribution-runner
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run --silent reproduce:receipt
npm run --silent reproduce:outcomes
npm run --silent verify:ermac
node src/diagnose-ermac.mjs --snapshot tests/fixtures/ermac-ready-synthetic.json
node src/agp-schedule.mjs --before tests/fixtures/agp-before.json --after tests/fixtures/agp-after.json
```

의존성 설치에는 인터넷이 필요합니다. 이후 명령은 기록·합성 데이터를
사용합니다. 영수증 재현에는 로컬 루프백 통신을 사용합니다. 현재 테스트는
57개이며, 다섯 CLI 예제도 종료 코드 0으로 끝납니다. 향후 테스트 수는
늘어날 수 있습니다.

| 결과 | 의미 |
| --- | --- |
| 영수증 재현 `passed: true` | 고정 SDK의 파서 문제와 호환 처리 재현 성공 |
| 결과 분류 `passed: true` | 실패·미확인 사례를 포함한 테스트 기대값 일치 |
| ERMAC 바이트 `passed: true` | 공개 앱에서 수동으로 확인한 형식과 고정 데이터 일치 |
| 합성 ERMAC 진단 `ready: true` | 합성 입력만 통과. 실제 프로그램 배포 증거 아님 |
| AGP 예제 `state: changed` | 가상 일정의 추가·삭제·변경 검출. 실제 참가 공지 아님 |

## 2. 공개 상태만 조회하기

아래 명령은 공개 네트워크에 연결하므로 오프라인 예제와 분리해 실행합니다.

```sh
node src/runner.mjs --public
node src/diagnose-ermac.mjs --rpc https://devnet.rialo.io:4101
node src/agp-schedule.mjs --before runtime/agp-baseline.json --live
```

첫 명령은 `runtime/latest.json`과 최초 정상 일정 기준값을 저장합니다.
`--public`은 로컬 지갑 설정을 무시합니다. 성공한 일정 조회가 없으면
`agp-baseline.json`도 없으므로 마지막 명령을 실행하지 말고 조회 결과를
먼저 확인합니다. 진단 종료 코드 1은 선행 조건 미충족/미확인일 수 있으며
거래 실행 실패와 같지 않습니다.

2026-10-20 확인에서는 ERMAC 프로그램과 레지스트리가 없었고 AGP 일정은
비어 있었습니다. 지금의 상태는 새 조회로 확인해야 합니다.

기존 거래 조회는 `inspect:receipt -- --rpc URL --signature SIGNATURE`를
사용합니다. 허용 주소는 `https://devnet.rialo.io:4101`,
`https://devnet.rialo.io` 두 개입니다. 영수증 없음이나 RPC 오류를 근거로
기존 거래를 재제출하지 않습니다.

## 3. 기여물을 전달할 경로

[공식 개발자 포털](https://www.rialo.io/for-devs)은
[Discord](https://discord.gg/RialoProtocol),
[문서](https://docs.rialo.io), [Playground](https://playground.rialo.io)를 연결합니다.
**공식 Discord 진입 링크는 확인됐지만 특정 제출 채널·양식·보상 조건은
확인되지 않았습니다.** Discord 게시를 이 도구가 대신 수행하지 않습니다.

1. 공개 커밋 링크, 재현 명령, Node/SDK 버전, 기대 결과와 실제 결과를 준비합니다.
2. 공식 포털의 Discord 링크에서 현재 공지와 제출 안내를 직접 확인합니다.
3. 지정된 접수 경로가 확인된 뒤 해당 안내에 맞춰 전달합니다. 채널 이름을
   추측하거나 접수 완료로 표시하지 않습니다.

SDK `0.18.1`의 npm 메타데이터는
[`SubzeroLabs/rialo/issues`](https://github.com/SubzeroLabs/rialo/issues)를
버그 경로로 지정하지만, 이번 공개 조회는 **404**였습니다. 저장소가
삭제됐는지 비공개인지 단정할 수 없으며 공개 접수 가능으로 안내하지 않습니다.
`docs.rialo.io`는 접근 로그인으로 이동했고 Playground는 공개 텍스트만으로
접수 절차를 확인할 수 없었습니다.
[Rust CDK 문서](https://docs.rs/rialo-cdk/latest/rialo_cdk/)는 기술 참고용이며
기여 접수 창구를 뜻하지 않습니다.

[확인 기록](../reports/2026-10-20-c09-quickstart.json)에 URL과 접근 상태를 남겼습니다.
외부 이슈·댓글·메시지는 전송하지 않았습니다.

## 지원 범위와 현재 제한

- 지원: 오프라인 재현, 읽기 전용 조회, ERMAC 조건 진단, 일정 변경 감지.
- 이 시작 가이드에서 하지 않는 작업: 지갑 로드, 가입, 서명, 송금, 베팅,
  클레임, 계정 연결, 접근 제한 우회.
- 합성 테스트, 테스트 코인, 제작 진행률은 공식 포인트와 다릅니다.
- [GitHub CI(C08) 실행 성공](https://github.com/gnoesy/rialo-contribution-runner/actions/runs/39717574082): 테스트 57개와 오프라인 CLI 검사 5개가 통과했습니다. 테스트 중 외부 네트워크는 차단되며 지갑과 비밀을 사용하지 않습니다.
