# 보드 명령 (AI 출력 형식)

> 스펙: [../SPEC.md](../SPEC.md)

AI는 **한 줄에 JSON 객체 하나**(NDJSON)를 출력한다. 앱은 줄이 완성될 때마다 파싱·검증 후 즉시 OpQueue로 넘기고, 잘못된 줄은 버린다.

| op | 필드 | 의미 |
|---|---|---|
| `plan` | `lines` | 응답 첫 줄. 이번 답의 예상 분량(줄 수, 도식 한 행은 약 3줄) |
| `write` | `id`, `text`, `size`(`title`\|`body`\|`note`), `color`? | 텍스트 한 줄 (흐름 배치) |
| `box` | `id`, `text`, `shape`(`rect`\|`ellipse`), `place`? | 라벨이 든 도형 |
| `arrow` | `from`, `to`, `label`? | 두 요소를 잇는 화살표 |
| `mark` | `target`, `style`(`underline`\|`circle`\|`check`), `color`? | 기존 요소 강조 |
| `newpage` | — | 새 페이지 |

- `place`: `{ "rel": "right_of"|"below", "of": "<id>" }`, 생략 시 흐름 배치.
- `color`: `black`(기본) | `blue` | `red`.
- `id`는 세션 내 고유. 없는 id를 참조한 op는 무시.
- `newpage`는 AI가 의도적으로 페이지를 넘길 때만 쓴다. 공간 부족 판단은 앱이 `plan`으로 한다([layout.md](layout.md)).

## 예시
```
{"op":"plan","lines":5}
{"op":"write","id":"t1","text":"TCP 3-way handshake","size":"title"}
{"op":"box","id":"c","text":"Client","shape":"rect"}
{"op":"box","id":"s","text":"Server","shape":"rect","place":{"rel":"right_of","of":"c"}}
{"op":"arrow","from":"c","to":"s","label":"SYN"}
{"op":"mark","target":"t1","style":"underline","color":"red"}
```
