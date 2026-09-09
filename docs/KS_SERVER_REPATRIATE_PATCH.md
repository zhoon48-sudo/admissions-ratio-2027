# 경성대 경쟁률 서버 재외국민 지원인원 반환 사양

## 목적

Cloudflare Worker는 진학사 직접접속 시 간헐적으로 HTTP 403을 받습니다. 반면 경성대 서버 `cmp_manage_api?action=test_url`은 동일 진학사 페이지를 HTTP 200으로 정상 수집합니다.

현재 경성대 서버는 대학 전체 합계만 반환하므로 부산외국어대학교·신라대학교의 `재외국민` 지원인원을 별도 식별할 수 없습니다. 서버가 이미 파싱한 전형별 행에서 재외국민 모집/지원인원만 추가 반환하면 Cloudflare는 진학사에 직접 접속할 필요가 없어집니다.

## 현재 확인된 응답

### 부산외국어대학교
- URL: `https://addon.jinhakapply.com/RatioV1/RatioH/Ratio10750521.html`
- 현재 `test_url` 응답 필드: `ok, parserType, title, yearNo, quota, apply, types, depts`
- 전체 모집인원: 1,574명
- 재외국민 모집인원: 20명
- 모니터링 기준 전체 모집인원(재외국민 제외): 1,554명

### 신라대학교
- URL: `https://addon.jinhakapply.com/RatioV1/RatioH/Ratio11020621.html`
- 현재 `test_url` 응답 필드: `ok, parserType, title, yearNo, quota, apply, types, depts`
- 전체 모집인원: 1,477명
- 재외국민 모집인원: 5명
- 모니터링 기준 전체 모집인원(재외국민 제외): 1,472명

## 서버 수정 요구사항

### 1. HTML 파싱 단계

전형별 행의 표시명에 `재외국민`이 포함된 행을 찾습니다.

```text
if (전형명 contains "재외국민") {
    repatriateQuota = 해당 행 모집인원;
    repatriateApply = 해당 행 지원인원;
}
```

모집단위 세부행이 여러 개 존재하는 구조라면 대학 전체 전형 요약행 또는 동일 전형의 합계를 사용합니다.

### 2. `test_url` 응답 추가

기존 응답은 그대로 유지하고 다음 두 필드를 추가합니다.

```json
{
  "repatriateQuota": 20,
  "repatriateApply": 3
}
```

지원자가 없는 경우에도 `0`을 명시적으로 반환합니다. 값을 확인하지 못했을 때만 `null` 또는 필드 미포함으로 처리합니다.

### 3. 정기수집 저장값 및 `cmp_live` 응답 추가

`cmp_crawl_run`이 각 대학 결과를 저장할 때 동일 값을 저장하고, `cmp_live`의 대학별 row에도 다음 필드를 포함합니다.

```json
{
  "univName": "부산외국어대",
  "quota": 1574,
  "apply": 1717,
  "inQuota": 1427,
  "inApply": 0,
  "repatriateQuota": 20,
  "repatriateApply": 3
}
```

정원내 값 예시는 실제 서버 수집값을 그대로 사용하며 위 숫자는 필드 위치 설명용입니다.

## Cloudflare 호환 필드

현재 Worker는 다음 지원인원 필드 중 하나가 숫자로 제공되면 자동으로 사용합니다.

- `repatriateApply` **권장**
- `repatriate_apply`
- `excludedRepatriateApply`
- `excluded_repatriate_apply`

권장 표준은 다음과 같습니다.

```text
repatriateQuota
repatriateApply
```

## 검증 조건

Cloudflare Worker는 다음 모집인원과 일치할 때만 재외국민 지원인원을 차감해야 합니다.

| 대학 | 재외국민 모집인원 | 재외국민 제외 후 전체 모집인원 |
|---|---:|---:|
| 부산외국어대학교 | 20 | 1,554 |
| 신라대학교 | 5 | 1,472 |

모집인원이 예상값과 다르면 자동 차감하지 않고 `검증필요`로 처리합니다.

## 최종 권장 구조

```text
진학사 공개 경쟁률 페이지
        ↓
경성대 경쟁률 수집 서버
  - 전체합계
  - 정원내합계
  - 재외국민 모집/지원인원
        ↓
Cloudflare Worker
  - 재외국민 동적 제외
  - D1 저장
  - 보고자료/그래프 생성
```

이 구조가 적용되면 Cloudflare의 진학사 직접접속 및 외부 중계 fallback은 제거할 수 있습니다.
