# 배포 안내

같은 소스로 **Google Apps Script**와 **Vercel** 두 곳에 배포할 수 있습니다.
아래 A는 Vercel, B는 Apps Script 안내입니다.

---

# A. Vercel 배포

## A-1. 배포

1. 저장소를 GitHub에 올립니다.
2. [vercel.com](https://vercel.com) → **Add New → Project** → 저장소 선택
3. 설정은 건드리지 않습니다.
   - Framework Preset: **Other**
   - Build Command / Output Directory: **비워 둠**
   - Install Command: 기본값
   `vercel.json`에 라우팅(`/(.*)` → `api/index`), 함수 설정, 정적 출력 폴더(`public`)가
   들어 있습니다. `outputDirectory` 를 `public` 으로 지정하지 않으면 저장소 전체가 정적
   파일로 서빙되면서 루트 경로가 `api/index.js` 소스에 걸려 코드가 그대로 보입니다.
4. **Deploy** → 나온 URL을 공유합니다.

이후 GitHub에 푸시할 때마다 자동으로 다시 배포됩니다.

## A-2. API 키

교사가 웹앱의 **설정**에서 각자 키를 입력합니다. 키는 **그 브라우저에만** 저장되고
(`localStorage`), 요청할 때마다 서버로 전달되어 Gemini로 중계될 뿐 서버에 남지 않습니다.
브라우저를 바꾸거나 사이트 데이터를 지우면 다시 입력해야 합니다.

학교 공용 키 하나로 운영하려면 Vercel 프로젝트 → Settings → Environment Variables 에
`GEMINI_API_KEY`(필요하면 `GEMINI_MODEL`)를 추가합니다. 사용자가 개인 키를 넣으면
그 키가 우선합니다. 다만 URL을 아는 누구나 쓰게 되어 비용이 배포자에게 청구되니
연수처럼 참여자가 정해진 경우에만 쓰시기 바랍니다.

## A-3. 알아 둘 점

- **접근 제한이 없습니다.** 무료 플랜에서는 URL을 아는 누구나 들어옵니다.
  참여자를 제한해야 하면 Apps Script 배포를 쓰거나 Vercel의 Password Protection(유료)을 씁니다.
- **드라이브 저장 버튼이 숨겨집니다.** Apps Script 전용 기능입니다.
  대신 브라우저 직접 내려받기가 제약 없이 동작하므로 불편하지 않습니다.
- 작성 중인 내용과 설정은 브라우저에 저장됩니다. 중요한 설계안은 **JSON 내보내기**로 보관하세요.

## A-4. 로컬에서 미리 보기

```bash
node tools/dev-server.js    # http://localhost:8080
```

Vercel 배포와 같은 코드 경로를 쓰므로, 여기서 정상이면 Vercel에서도 같게 동작합니다.

---

# B. Google Apps Script 배포

## 1. 프로젝트 만들기

### 편집기에 직접 붙여넣는 경우

1. [script.google.com](https://script.google.com) → **새 프로젝트**
2. 프로젝트 이름을 알아보기 쉽게 바꿉니다. (예: `깊이있는수업평가설계`)
3. `src/` 안의 파일을 같은 이름으로 만들어 내용을 붙여넣습니다.

   | 저장소 파일 | 편집기에서 만들 때 |
   |---|---|
   | `Code.gs`, `Stages.gs`, `UnitsCommonMath1.gs`, `UnitsCommonMath2.gs`, `UnitsExtendedMath.gs`, `UnitsOfficialMath.gs`, `AchievementLevels.gs`, `Api.gs`, `DocBuilder.gs`, `Hwpx.gs`, `HwpxTemplate.gs` | **＋ → 스크립트**, 이름에서 `.gs`는 자동으로 붙습니다 |
   | `Index.html`, `Style.html`, `Script.html` | **＋ → HTML**, 이름은 확장자 없이 `Index`, `Style`, `Script` |

   처음 만들어져 있는 `Code.gs`는 내용을 지우고 이 저장소의 `Code.gs` 내용을 넣으면 됩니다.

4. `appsscript.json`은 **프로젝트 설정 → "appsscript.json" 매니페스트 파일을 편집기에 표시**를
   켜면 편집할 수 있습니다. 켜지 않고 넘어가도 동작합니다.

### clasp 를 쓰는 경우

```bash
npm install -g @google/clasp
clasp login
clasp create --type webapp --title "깊이 있는 수업·평가 설계 도우미"
# 만들어진 .clasp.json 의 scriptId 를 확인하고, rootDir 을 "src" 로 둡니다
clasp push
clasp deploy
```

`.clasp.json.example`을 `.clasp.json`으로 복사해 `scriptId`만 채워도 됩니다.
`.clasp.json`은 `.gitignore`에 들어 있어 저장소에 올라가지 않습니다.

---

## 2. 웹 앱으로 배포

**배포 → 새 배포 → 유형 선택: 웹 앱**

| 항목 | 권장 값 | 이유 |
|---|---|---|
| 실행 사용자 | **웹 앱에 액세스하는 사용자** | 교사마다 자기 Gemini 키와 자기 드라이브를 쓰게 됩니다 |
| 액세스 권한 | 조직 내 모든 사용자 | 연수 참여자에게 링크만 주면 됩니다 |

배포 후 나오는 웹 앱 URL을 공유하면 됩니다.

> Google Workspace 계정이 아닌 개인 계정이라면 `appsscript.json`의
> `webapp.access`가 `DOMAIN`으로 되어 있을 때 배포가 되지 않습니다.
> 편집기 배포 화면에서 액세스 권한을 직접 고르거나, 매니페스트의 값을 바꿔 주세요.

---

## 3. 권한

처음 실행할 때 권한 승인 화면이 나옵니다.

| 권한 | 쓰이는 곳 | 없어도 되나 |
|---|---|---|
| 외부 서비스 연결 (`script.external_request`) | Gemini API 호출 | 붙여넣기 모드만 쓴다면 필요 없음 |
| Google Drive | `[드라이브에 저장]` 대체 내려받기 | `Api.gs`의 `api_saveHwpxToDrive` 를 지우면 요청되지 않음 |

브라우저에서 바로 내려받기가 되는 환경이라면 드라이브 권한은 쓰이지 않습니다.
학교 크롬 정책으로 저장이 막힐 때를 대비한 대체 경로입니다.

---

## 4. Gemini API 키

- 웹앱의 **설정**에서 키를 넣으면 **사용자 속성(UserProperties)** 에 저장됩니다.
  실행 사용자를 "웹 앱에 액세스하는 사용자"로 배포했다면 교사마다 자기 키를 씁니다.
- 학교에서 공용 키 하나를 쓰려면 Apps Script **프로젝트 설정 → 스크립트 속성**에
  `GEMINI_API_KEY`(필요하면 `GEMINI_MODEL`)를 추가합니다. 사용자 키가 없을 때 이 값이 쓰입니다.
- 모델명 기본값은 `Code.gs`의 `DEFAULT_MODEL`입니다. 사용하는 모델명이 다르면 설정에서 바꾸세요.

키가 없어도 **붙여넣기 모드**로 모든 기능을 쓸 수 있습니다.

---

## 5. 점검

- 편집기에서 `test_makeHwpx` 함수를 실행하면 한글 문서 생성이 정상인지 실행 로그로 확인할 수 있습니다.
- 저장소에서는 `node tools/verify.js` 로 전체를 점검합니다.

---

## 6. 자주 묻는 것

**내려받기 버튼을 눌렀는데 파일이 저장되지 않습니다.**
브라우저나 조직 정책이 스크립트가 시작한 저장을 막는 경우입니다.
하단의 **[드라이브에 저장]** 을 누르면 내 드라이브 `수업설계_한글문서` 폴더에 저장한 뒤 링크를 줍니다.

**작성 중이던 내용이 사라졌습니다.**
브라우저 임시저장(localStorage)에 자동으로 보관되지만, 시크릿 창이나 사이트 데이터 삭제 시에는
남지 않습니다. 중요한 설계안은 **JSON 내보내기**로 파일로 보관하세요.

**AI가 준 결과를 가져오지 못합니다.**
모델이 설명 문장을 함께 낸 경우입니다. `{`로 시작해 `}`로 끝나는 부분(소재 제안은 `[` ~ `]`)만
붙여 넣어 보세요.


## 2.7.0 업데이트

저장소 루트에 이 배포본의 파일을 같은 경로로 업로드하여 교체합니다. ZIP 자체나 상위 폴더를 올리지 않습니다. 기존 파일을 먼저 모두 삭제할 필요는 없습니다. `src/OperationPlan.gs`, `src/OperationScript.html`, `src/AchievementLevels.gs`를 포함한 전체 소스를 반영하세요. Apps Script에서는 `src`의 .gs 12개와 .html 4개가 모두 필요합니다. 새 버전으로 배포한 뒤 화면 버전이 2.8.0인지 확인합니다.
