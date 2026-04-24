// =========================================================
// 시나리오 데이터: 서점 도둑질 오해 사건
// =========================================================
//
// 이 파일은 "데이터"만 담는다. 실행 로직(엔진)은 scenarioEngine.js(2단계)에서 별도.
// 전역에 window.BOOKSTORE_SCENARIO 로 노출 → 다른 스크립트가 가져다 쓸 수 있음.
//
// ⚠️ 주의: 아직 엔진이 없으므로 이 파일 자체는 게임 동작에 영향을 주지 않는다.
//          index.html에 <script> 태그를 추가해 "로드만" 되는지 확인하면 1단계 완료.
//
// TODO (8단계 교체 시 반영 필요):
//   - state.js 의 ASSET_SLOTS.evidence 에서 'bamtol_ledger', 'book_reservation_slip' 삭제
//   - state.js 의 ASSET_SLOTS.evidence 에 'yami_backpack' 추가
//   - state.js 의 ASSET_META 에 yami_backpack 항목 추가, 삭제된 2개 제거
//   - state.js __zetaSend 내 /장부|예약/ 키워드로 bamtol_ledger 팝업하는 블록 제거
// =========================================================

window.BOOKSTORE_SCENARIO = {

  // ─────────────────────────────────────────────────────
  // 1. 기본 정보
  // ─────────────────────────────────────────────────────
  id: 'bookstore_misunderstanding',
  name: '서점 도둑질 오해 사건',
  mainNpcIds: ['yami', 'bamtol', 'chaka'],


  // ─────────────────────────────────────────────────────
  // 2. 진실 (AI 참조용, 유저 비공개)
  // ─────────────────────────────────────────────────────
  truth: {
    summary:
      '야미는 어젯밤 밤톨 서점에 예약해 둔 책 《별의 시간》을 픽업하러 갔다. ' +
      '카운터에는 아무도 없었고, 야미는 장부에 사인한 뒤 책을 집어 들었다. 그 과정에서 ' +
      '옆에 꽂혀 있던 책 한 권이 책장 아래로 떨어졌다. 같은 시각 차카는 ' +
      '서점 근처 골목에서 동네 야경을 찍고 있었고, 카메라 앵글에는 서점 ' +
      '유리창 너머 야미의 모습이 우연히 함께 담겼다.',
    facts: [
      '야미가 예약한 책의 제목은 《별의 시간》이다. 이것이 야미가 가져간 단 한 권.',
      '야미는 책을 훔치지 않았다. 예약해 둔 본인 책을 집다가 옆 책이 흔들려 책장 아래로 떨어졌다.',
      '카운터는 비어 있었다. 야미는 장부에 또렷이 사인을 남기고 책을 가져갔다.',
      '차카는 야경이 예뻐서 사진을 찍었을 뿐이다. 야미가 서점 안에 있다는 건 앵글에 들어온 뒤에야 알았고, 그게 무슨 맥락인지는 모른다.',
      '차카는 다음 날 아침 그 사진이 마음에 들어 사진관 쇼윈도에 걸어두었다.',
      '책장 아래로 떨어진 책은 며칠 뒤 서점을 다시 뒤졌을 때에야 발견된다.',
    ],
  },


  // ─────────────────────────────────────────────────────
  // 3. 스테이지 정의
  // ─────────────────────────────────────────────────────
  stages: ['dormant', 'triggered', 'quest_active', 'resolved'],
  initialStage: 'dormant',


  // ─────────────────────────────────────────────────────
  // 4. 단계 전환 조건
  // ─────────────────────────────────────────────────────
  // 엔진(2단계)이 이 조건을 읽고 전환 여부를 판단한다.
  // 현재 지원 조건 타입:
  //   - sleptAtLeast: 잠든 횟수 N회 이상
  //   - requiredDayEventDone: 특정 낮 이벤트 완료됨
  //   - questResolved: 특정 퀘스트 해결됨
  // 여러 조건은 AND로 결합.
  transitions: {
    dormant: {
      to: 'triggered',
      conditions: [
        { type: 'sleptAtLeast', count: 1 },
      ],
    },
    triggered: {
      to: 'quest_active',
      conditions: [
        // [피드백 3번 수정] 필수 이벤트 ID 변경.
        // 이유: chaka_bamtol_distortion 이벤트가 제거되고 그 역할이
        //       chaka_shows_night_photo 로 통합됨. 전환 조건도 함께 업데이트.
        { type: 'requiredDayEventDone', eventId: 'chaka_shows_night_photo' },
        { type: 'sleptAtLeast', count: 2 }, // dormant→triggered 진입 후 1회 더 = 총 2회
      ],
    },
    quest_active: {
      to: 'resolved',
      conditions: [
        { type: 'questResolved', questId: 'yami_dream_crisis' },
      ],
    },
    // resolved 는 최종 상태, 전환 없음
  },


  // ─────────────────────────────────────────────────────
  // 5. 낮 이벤트
  // ─────────────────────────────────────────────────────
  // 각 이벤트는 특정 NPC에 유저가 접근할 때 발동된다 (`trigger.type: 'approachNpc'`).
  // 일부는 단계 진입 즉시 자동 실행된다 (`trigger.type: 'autoOnStageEnter'`).
  //
  // required: true 인 이벤트는 해당 단계에서 "필수"로 지정된 이벤트.
  //           완료돼야 다음 단계 전환 조건이 만족될 수 있다 (단계당 최대 1개).
  //
  // effects: 이벤트 실행 시 일어날 일들. 엔진이 순서대로 처리.
  //   - showEvidencePopup: 증거 이미지 팝업
  //   - injectNpcContext: 특정 NPC의 대화 배경에 임시 문장 추가
  //   - seed: 씨앗 하나 실행 (왜곡 대화 생성용)
  //   - addRumor: 소문 추가
  //   - changeAffinity: 호감도 변동
  //   - showStoryModal: 스토리 모달 표시
  //   - triggerQuest: 퀘스트 발동
  //   - ending: 엔딩 분기 처리
  //
  // preconditions: 이 이벤트가 활성화되려면 먼저 완료돼야 할 이벤트 ID들 (AND)
  dayEvents: {

    // ── dormant 단계 낮 이벤트: 없음 (평온한 대화만)
    dormant: [],

    // ── triggered 단계 낮 이벤트
    // [피드백 3번 수정 — 시나리오 플로우 재배치]
    // 유저 의도: "유저가 관전하는 느낌으로 구경. 같은 NPC에 다시 가면 다음 장면 발동 (시간 경과)"
    //
    // 새 플로우:
    //   1. d2_morning_reports_popup (auto) — 어젯밤 소식 팝업
    //   2. first_chaka_visit      (차카 접근 1회차)  — 사진관 쇼윈도 사진 (photostudio_window)
    //   3. first_bamtol_visit     (밤톨 접근 1회차)  — 빈 선반 발견 (missing_book_shelf)
    //   4. chaka_shows_night_photo (차카 접근 2회차, 단 2·3 모두 완료 전제) ★ 필수
    //       — 사진관 앞에서 차카-밤톨 대화하는 장면을 플레이어가 목격
    //       — chaka_photo_evidence 팝업 + 소문 생성 + 호감도 변동 + 두 NPC 컨텍스트 주입
    //   5. bamtol_confronts_yami  (야미 접근, 단 4 완료 후) — 야미에게 "방금 혼남" 컨텍스트
    //
    // [왜곡 메커니즘 — 2차 서사 수정]
    // 이 시나리오의 "오해"는 별도의 seed AI 장면 생성 없이 두 NPC 의 인지 차이에서 자연 발생:
    //   - 차카 (악의 없음): "야미가 책을 많이 사더라"라고 평소처럼 말함
    //   - 밤톨 (추론): "어제 픽업은 1권뿐 + 책 한 권 사라짐 = 여러 권 훔쳐갔다" 비약
    // AI 가 이 왜곡을 "생성"할 필요 없음. 두 NPC 의 injectedContext 에 각각의 인지 상태가 명시돼 있어
    // 유저가 대화할 때 자연스럽게 이 구조가 드러남.
    //
    // [향후 단계 2 승격 가이드 — 인계용 주석]
    // 4번 chaka_shows_night_photo 의 첫 effect(showStoryModal)는 현재 "플레이스홀더" 상태.
    // 단계 2에서 NPC 말풍선 대화 연출로 교체될 예정. 교체 지점:
    //   - fadeScene (out)
    //   - moveNpc bamtol → 사진관 옆
    //   - playNpcDialogue (말풍선 대화 시퀀스)
    //   - fadeScene (in)
    // 나머지 effects(팝업/소문/호감도/컨텍스트)는 건드릴 필요 없음.
    // 5번 bamtol_confronts_yami 의 모달도 동일 방식으로 교체 가능.
    //
    // [제거된 이벤트 — 참고]
    //   - bamtol_finds_missing_book: first_bamtol_visit 이 그 역할을 대체
    //   - chaka_bamtol_distortion:   소문/호감도 역할이 chaka_shows_night_photo 에 통합됨
    //   - seed effect (distortion_seed): 왜곡 메커니즘이 대화로 대체되어 불필요
    triggered: [
      {
        // Day 2 아침 진입 시 자동으로 어젯밤 소식 모달 팝업.
        // [피드백 1번 버그 수정 포함] 엔진의 showReportsModal 핸들러가 이제
        // engineState.lastNightReports 를 읽으므로 실행 순서 문제 해결됨.
        id: 'd2_morning_reports_popup',
        trigger: { type: 'autoOnStageEnter' },
        required: false,
        preconditions: [],
        effects: [
          { type: 'showReportsModal',
            title: '🌅 2일차 아침',
            bodyIntro: '어젯밤, 동네에선 이런 일들이 있었다더라.' },
        ],
      },

      {
        // [신규] 유저가 차카에게 처음 접근 → 사진관 쇼윈도에 걸린 야경 사진을 목격.
        // 차카 본인은 아직 "사진 걸어뒀고, 야경 잘 찍혔다" 상태. 밤톨과의 대화는 아직 없음.
        id: 'first_chaka_visit',
        trigger: { type: 'approachNpc', npcId: 'chaka' },
        required: false,
        preconditions: [],
        effects: [
          { type: 'showEvidencePopup', assetKey: 'photostudio_window',
            caption: '차카가 찍은 마을의 모습' },
          { type: 'injectNpcContext', npcId: 'chaka',
            text: '너는 어젯밤 서점 근처 골목에서 찍은 야경 사진이 마음에 ' +
                  '들어, 오늘 아침 사진관 쇼윈도에 걸어두었다. 사진에 야미가 ' +
                  '서점 안에 있는 모습이 우연히 함께 담겼다는 건 알고 있지만, ' +
                  '그저 "앵글에 들어온 우연" 정도로 여긴다. 지나가는 유저에게 ' +
                  '사진에 대해 담담히 설명할 수 있다.' },
          // [Wave 1] 증거 목격 후 NPC 선발화 — 유저가 상황을 인지하도록.
          { type: 'npcSpeaksFirst', npcId: 'chaka',
            text: '아, 쇼윈도 보고 있었나요? 어젯밤에 동네 야경이 참 예뻤거든요. ' +
                  '마음에 들어서 걸어뒀네요.' },
        ],
      },

      {
        // [신규] 유저가 밤톨에게 처음 접근 → 책 한 권이 사라진 걸 발견한 직후의 밤톨.
        // 아직 차카 사진을 본 적 없음. 그냥 당혹스러운 상태.
        id: 'first_bamtol_visit',
        trigger: { type: 'approachNpc', npcId: 'bamtol' },
        required: false,
        preconditions: [],
        effects: [
          { type: 'showEvidencePopup', assetKey: 'missing_book_shelf',
            caption: '한 칸이 비어 있다. 어제까지 분명 채워져 있던 자리.' },
          { type: 'injectNpcContext', npcId: 'bamtol',
            text: '너는 방금 서점을 둘러보다 책 한 권이 비어 있는 자리를 ' +
                  '발견했다. 어제까지 분명히 꽂혀 있던 자리다. 어제 야미가 ' +
                  '예약한 《별의 시간》 한 권을 픽업해 갔다는 건 기억하고 있지만, ' +
                  '비어 있는 이 자리는 그 책 자리가 아니다. 그럼 다른 책인데, ' +
                  '누가 사갔나? 이상하다 생각만 한다. 굳이 장부까지 확인할 ' +
                  '건 아닌 것 같고, 생각만 하는 중. 대화 톤은 평소보다 짧고 ' +
                  '미간을 찌푸린 상태.' },
          { type: 'npcSpeaksFirst', npcId: 'bamtol',
            text: '...어? 여기 한 권 비었는데. 이상하군, 어제까지는 분명 있었는데.' },
        ],
      },

      {
        // [리디자인] 차카에게 두 번째로 접근했을 때 발동.
        // 전제: first_chaka_visit 와 first_bamtol_visit 모두 완료 (엄격).
        // → 플레이어가 "두 NPC 를 모두 만나본 뒤" 차카에게 다시 와야 이 장면이 벌어짐.
        //   서사 인과: 밤톨이 책 사라진 걸 발견한 뒤 사진관에 찾아와 차카의 사진을 봄.
        //
        // 연출은 모달 나레이션으로 처리 (NPC 순간이동 없음).
        // 증거 팝업 + 소문 + 호감도 변동 + 두 NPC 대화 컨텍스트 주입 전부 여기서 수행.
        //
        // [중요] 이 이벤트가 triggered → quest_active 전환의 필수 이벤트.
        id: 'chaka_shows_night_photo',
        trigger: { type: 'approachNpc', npcId: 'chaka' },
        required: true, // triggered 단계의 유일한 필수 이벤트
        preconditions: [
          { all: ['first_chaka_visit', 'first_bamtol_visit'] },
        ],
        effects: [
          // [시뮬 A 수정] 효과 순서 재배치 — 팝업 → 컷신 → 잔여 순.
          //   이유: 컷신 중 차카가 "어제 밤에 찍은 거에요" 라고 말할 때 유저가 어떤
          //         사진인지 이미 봐야 대화가 이해됨. 사진 먼저 노출한 뒤 컷신 재생.
          //
          //   실행 흐름:
          //     1) showEvidencePopup → _uiQueue 에 들어가 팝업 표시
          //     2) playCutscene → _applyEffects 가 이 시점에 루프 break,
          //        뒤 effects 를 followUp 으로 수집 → startCutsceneSimulation 호출.
          //        startCutsceneSimulation 은 UI 큐가 비워질 때까지 (팝업 닫힘) 대기한 뒤
          //        실제 시뮬 재생 시작.
          //     3) 컷신 종료 → runCutscenePostEffects 가 followUp 실행 + openZeta.
          //
          //   [캡션 중립화] 이전: "차카의 셔터에 남은 야미의 모습" — 스포 정도 강함
          //                 수정: 사진관 쇼윈도 맥락만 명시. 유저가 사진을 "처음 본다"는
          //                       상황에 맞게 중립 톤으로.

          // 1) 사진 본체 증거 팝업 — 컷신 전에 노출.
          { type: 'showEvidencePopup', assetKey: 'chaka_photo_evidence',
            caption: '사진관 쇼윈도에 걸린 어젯밤 사진' },

          // 2) 컷신 재생 (기존 showStoryModal 플레이스홀더 교체).
          //    openZetaNpcId: 컷신 끝난 뒤 자동으로 열 대화창의 NPC id.
          //    이 이벤트는 "차카 접근" 시 발동되므로 컷신 후 차카 대화창이 자연스러움.
          { type: 'playCutscene',
            cutsceneId: 'chaka_bamtol_photo_confrontation',
            openZetaNpcId: 'chaka' },

          // 3) seed 제거됨 — 사용자 설계: 왜곡은 대화(차카 "야미가 책을 많이 사더라" +
          //    밤톨의 "어제 픽업은 1권뿐" 해석)로 자연 발생. AI 장면 생성 불필요.

          // 4) 소문 생성 (익명 소문체) — 컷신 뒤 조용히 실행 (followUp)
          { type: 'addRumor',
            textTemplate: '야미가 어젯밤 밤톨 서점에서 책을 훔쳐갔다더라.',
            aboutNpcId: 'yami' },

          // 5) 호감도 변동 (기존 chaka_bamtol_distortion 에서 이관) — followUp
          { type: 'changeAffinity', npcId: 'bamtol', delta: -5 },
          { type: 'changeAffinity', npcId: 'yami',   delta: -3 },

          // 6) 두 NPC 컨텍스트 주입 (덮어쓰기. first_chaka_visit / first_bamtol_visit 것을 교체) — followUp
          { type: 'injectNpcContext', npcId: 'chaka',
            text: '방금 사진관 앞에서 밤톨과 만나 어젯밤 사진을 함께 보며 ' +
                  '이야기를 나누었다. 우연히 야미가 찍힌 사진을 보며, ' +
                  '"야미가 책을 많이 사더라"며 평소와 같은 얘기를 했다. ' +
                  '갑자기 밤톨이 "야미가 책을 훔친 것 같다"며 심각하게 반응해서 ' +
                  '너는 당황스럽다. 너는 단지 야경을 찍었을 뿐인데 일이 커진 것 ' +
                  '같아 불편하다. 밤톨이 야미를 찾아가러 급히 떠난 뒤 너는 ' +
                  '쇼윈도 앞에 혼자 서 있다.' },
          { type: 'injectNpcContext', npcId: 'bamtol',
            text: '너는 방금 사진관에서 차카의 사진을 봤다. 야미가 서점 안에 ' +
                  '있는 모습이 찍혀있었다. 그리고 차카가 "야미가 책을 많이 ' +
                  '사더라" 라고 말했다. ' +
                  // [Wave 3 이슈 δ] 밤톨의 오해 논리 명시.
                  '서점 주인인 너는 어제 야미가 예약한 건 《별의 시간》 한 권뿐이라는 ' +
                  '걸 안다. 그런데 차카는 "많이 사더라"라고 하고, 오늘 책장에는 ' +
                  '책 한 권이 비어 있다. 네 머릿속 결론: "야미가 예약한 한 권만 ' +
                  '가져가야 하는데, 사실은 그 이상을 가져갔다" — 즉 도둑질이다. ' +
                  // [Tier 1 #7] "감정이 앞서고 있으며" 같은 메타 설명 제거.
                  //   AI 가 이걸 "오늘은 감정이 앞서서…" 식으로 그대로 발화에 옮기는 버그 있었음.
                  //   대신 행동 차원으로만 묘사 — 어떤 감정·심리 단어도 쓰지 않음.
                  '너는 이 결론을 확신하고 있고, 지금 바로 야미를 찾아가 따지려는 참이다. ' +
                  '누가 야미를 옹호하면 상대를 포함해 짜증 섞인 단정적 말투로 반응한다. ' +
                  '절대 대답에 "감정", "장부", "확인하지 않았다" 같은 분석성 단어를 쓰지 않는다.' },

          // [Wave 1] 장면 후 차카 선발화. — followUp
          // 컷신 끝난 뒤 openZetaNpcId='chaka' 에 의해 자동으로 대화창이 열리면
          // 차카가 이 미리 세팅된 말을 먼저 꺼냄.
          { type: 'npcSpeaksFirst', npcId: 'chaka',
            text: '...방금 밤톨 씨가 많이 화내셨네요. 저는 그냥 평소 얘기한 건데 ' +
                  '일이 이상하게 됐어요. 저도 당황스럽네요.' },
        ],
      },

      {
        // [유지 — preconditions 만 업데이트] 밤톨이 야미를 찾아가 화내고 간 직후.
        // 플레이어가 야미에게 접근하면 "방금 밤톨한테 혼남" 상태의 야미를 만남.
        // [Tier 2 #9] showStoryModal 제거 — 별도 팝업 대신 야미 선발화로 녹임.
        //   팝업 내용(야미 눈가 붉음, 방금 밤톨이 다녀감, 해명 못 함)이
        //   선발화 텍스트에 담겨 유저가 처음 만난 순간부터 상황을 이해할 수 있음.
        //   injectNpcContext 는 유지 (이후 AI 대화용 배경).
        id: 'bamtol_confronts_yami',
        trigger: { type: 'approachNpc', npcId: 'yami' },
        required: false,
        preconditions: [{ all: ['chaka_shows_night_photo'] }],
        effects: [
          { type: 'injectNpcContext', npcId: 'yami',
            text: '방금 밤톨 사장님이 너를 찾아와 "왜 책을 훔쳤냐"며 크게 화를 ' +
                  '내고 돌아갔다. 해명할 기회조차 주지 않았다. 너는 억울하고 ' +
                  '충격에 휩싸여 있다. 유저와 마주친 지금, 처음에는 말을 잘 잇지 ' +
                  '못하지만 유저가 다정하게 대하면 조금씩 속을 털어놓을 수 있다. ' +
                  '갑자기 발생한 일에 당황스럽고 억울하다.' },
          // [Tier 2 #9] 야미 선발화에 팝업 내용 녹임 — 눈가 붉음/손 떨림은
          //   텍스트로 "떨리는 목소리" 정도만 간접 표현. "방금 밤톨이 왔다"는
          //   사실 전달과 "억울함"이라는 감정이 핵심.
          { type: 'npcSpeaksFirst', npcId: 'yami', emotion: 'sad',
            text: '...너 왔구나. 방금 밤톨 사장님이 다녀가셨어. ' +
                  '"왜 책을 훔쳤냐"며 크게 소리치고 가셨지. 내가 해명도 못 했는데. ' +
                  '나는 예약한 《별의 시간》 한 권만 가져갔을 뿐이야... 너무 억울해.' },
        ],
      },

      {
        // [Tier 2 #8 신규] Day 2 낮, 밤톨이 사진 보고 야미에게 따지러 간 직후
        // 유저가 밤톨에게 접근하면 → 화난 톤의 선발화로 맞이.
        //   발동 조건: chaka_shows_night_photo 완료 (밤톨이 오해에 빠진 상태)
        //             + user_confronts_bamtol 은 아직 안 뜸 (Day 3 이벤트)
        //   이 시점 밤톨은 이미 야미에게 한바탕 소리치고 돌아와 혼자 서점에 있음.
        //   유저가 말을 걸면 짜증 섞인 반응 — 대화 초입부터 갈등 톤 설정.
        id: 'bamtol_after_confrontation',
        trigger: { type: 'approachNpc', npcId: 'bamtol' },
        required: false,
        preconditions: [{ all: ['chaka_shows_night_photo'] }],
        effects: [
          { type: 'injectNpcContext', npcId: 'bamtol',
            text: '방금 야미를 찾아가 "왜 책을 훔쳤냐"며 크게 소리치고 돌아왔다. ' +
                  '야미가 뭐라고 해명하려 했지만 너는 듣지 않고 가버렸다. ' +
                  '지금도 흥분이 가라앉지 않은 상태이고, 혼자 있고 싶다. ' +
                  '유저가 말을 걸어와도 짧고 단정적인 말투로 반응한다. ' +
                  '절대 대답에 "감정", "장부", "확인하지 않았다" 같은 분석성 단어를 쓰지 않는다.' },
          { type: 'npcSpeaksFirst', npcId: 'bamtol', emotion: 'angry',
            text: '...지금은 말 걸지 마. 기분 상해서 아무 말도 하고 싶지 않군.' },
        ],
      },
    ],

    // ── quest_active 단계 낮 이벤트
    // [4차 플로우 재설계 — 시나리오 C 하이브리드]
    //   1. yami_retries_bookclub (auto) — 야미가 밤톨한테 거절당하는 장면
    //   2. yami_seeks_user (야미 접근, 필수) — 야미가 유저에게 의지 → 퀘스트 생성
    //   3. user_confronts_bamtol (밤톨 접근) — 유저가 밤톨에게 맞서러 감, 장면 연출
    //   4. [유저-밤톨 대화로 마일스톤 쌓음 → 2/3 달성 시 퀘스트 해결 → resolved 전환]
    // 마일스톤 시스템은 유지 (대화 풀이가 핵심), 엔딩 분기만 밤톨 호감도 기준.
    quest_active: [
      {
        // [피드백 A3] Day 3 아침에도 소식 팝업.
        //   engineState.lastNightReports 는 Day 2 밤 시뮬(시뮬 B)의 결과를 담음.
        //   야미-밤톨 대면 서사가 리포트 문장들로 정리되어 아침에 브리핑됨.
        //   순서 보장: UI 큐에 먼저 들어가므로 아래 yami_retries_bookclub 컷신보다 먼저 표시.
        id: 'd3_morning_reports_popup',
        trigger: { type: 'autoOnStageEnter' },
        required: false,
        preconditions: [],
        effects: [
          { type: 'showReportsModal',
            title: '🌅 3일차 아침',
            bodyIntro: '어젯밤, 동네에선 이런 일들이 있었다더라.' },
        ],
      },

      {
        id: 'yami_retries_bookclub',
        trigger: { type: 'autoOnStageEnter' }, // 단계 진입 즉시 자동 발동
        required: false,
        preconditions: [],
        // [Tier 2 #11] 기존 showEvidencePopup + showStoryModal 두 개 → playCutscene 으로 교체.
        //   컷신 스크립트는 state.js 의 CUTSCENE_SCRIPTS.yami_at_bookstore.
        //   openZetaNpcId 생략 — 컷신 끝나도 대화창 자동 오픈 없이 낮 탐색 복귀.
        //   이후 유저가 야미에게 접근하면 아래 yami_seeks_user 가 발동.
        //
        // [Tier 2 #12 연동] setFlag 'yami_needs_help' — 야미 머리 위
        //   "나 좀 도와줘" 말풍선 상시 표시용. scene.js 렌더 루프가 이 플래그를 감시.
        effects: [
          { type: 'playCutscene', cutsceneId: 'yami_at_bookstore' },
          { type: 'setFlag', key: 'yami_needs_help' },
        ],
      },

      {
        id: 'yami_seeks_user',
        trigger: { type: 'approachNpc', npcId: 'yami' },
        required: true, // ⭐ 이 단계의 필수 이벤트
        preconditions: [{ all: ['yami_retries_bookclub'] }],
        effects: [
          { type: 'triggerQuest', questId: 'yami_dream_crisis' },
          // [Wave 3 이슈 ζ] 대사 축소. 장부 사인 얘기는 situation 에서 뺐고,
          // 길게 늘어지던 설명도 줄임. 핵심만: "너한테 의지하고 싶어".
          { type: 'npcSpeaksFirst', npcId: 'yami', emotion: 'sad',
            text: '...너 잠깐 와볼래? 나 좀 도와줘.' },
        ],
      },

      {
        // [4차 신규] 유저가 밤톨을 찾아가는 장면. 퀘스트 생성 후에만 발동.
        // 장면 연출 + 밤톨의 방어적 태도를 보여주는 컨텍스트 주입.
        // 실제 퀘스트 해결은 이 이후의 대화에서 마일스톤 판정으로.
        // [Tier 2 #14] showStoryModal 제거 — 팝업 내용("야미 일이라면 할 말 없네")이
        //   이미 아래 npcSpeaksFirst 에 그대로 반영됨. 별도 모달은 UX 중복.
        id: 'user_confronts_bamtol',
        trigger: { type: 'approachNpc', npcId: 'bamtol' },
        required: false,
        preconditions: [{ all: ['yami_seeks_user'] }],
        effects: [
          { type: 'injectNpcContext', npcId: 'bamtol',
            text: '방금 유저가 서점에 들어왔다. 야미 일로 온 것이 분명하다. ' +
                  '너는 첫 마디부터 "할 말 없다"고 선을 그었지만, 유저가 바로 ' +
                  '돌아가지 않자 마주 서 있는 중. ' +
                  // [피드백 D1] 밤톨 꼰대 유지 — 쉽게 흔들리지 않음.
                  //   스크린샷 1 이슈: 밤톨이 "장부는 정확" 말하다가 다음 턴에
                  //   "네 말을 아예 무시할 순 없군" 으로 금세 수용. 캐릭터 깨짐.
                  //   원칙:
                  //   1) 유저가 단순히 "다시 보라", "생각해봐라" 정도만 말하면 절대 흔들리지 않음.
                  //   2) 장부 얘기 꺼내면 "장부는 언제나 정확하네. 그래서 이상한 거지" 식으로
                  //      오히려 자기 원칙을 더 강조. "다시 볼게" 라고 양보하지 않음.
                  //   3) 진짜로 설득되려면 유저가 구체적 모순을 짚어야 함:
                  //      - "예약 한 권인데 차카가 많이 산다는 게 말이 되냐"
                  //      - "사진은 서점 방문 증거일 뿐 훔쳤다는 증거는 아니다"
                  //      - "장부 사인이 있는데 왜 도둑질로 몰아가냐"
                  //      이런 지적에 처음엔 "그건..." 하고 살짝 멈칫은 하지만,
                  //      곧바로 "그래도 책이 한 권 비어있는 건 사실이네" 로 방어 복귀.
                  //   4) 유저가 같은 지적을 반복해도 절대 "네 말이 맞군, 다시 볼게" 같은
                  //      포기성 수용을 하지 않음. 오히려 "나도 내 할 일은 다 한 거야" 식으로
                  //      자기 정당성 주장.
                  //   5) 감정적 호소 ("야미가 얼마나 착한 애인지 알잖아" 등)에 완전히 차가움.
                  '너는 서점 주인이고, 장부는 네 직업의 핵심이야. 그래서 장부를 다시 보라는 ' +
                  '말을 들으면 오히려 더 방어적으로 반응한다. "장부는 정확하게 기록했네. ' +
                  '그게 내가 평생 해온 방식이지" 같은 톤. 한 번에 설득되지 마라. ' +
                  '유저의 반박마다 처음엔 반응하는 척하다가 결국 자기 입장으로 돌아와라. ' +
                  '너의 방어는 강하고, 쉽게 무너지지 않는다. ' +
                  '절대 대답에 "감정", "장부", "확인하지 않았다" 같은 분석성 단어를 쓰지 않는다.' },
          // [Wave 1] 유저가 서점 들어온 직후 밤톨 선발화 — 방어적인 톤.
          { type: 'npcSpeaksFirst', npcId: 'bamtol',
            text: '...야미 얘기라면 듣고 싶지 않군. 할 말 있으면 짧게 해.' },
        ],
      },
    ],

    // ── resolved 단계 낮 이벤트 (엔딩)
    resolved: [
      // [피드백 #중간분기] 과거: resolved 진입 즉시 엔딩 시뮬 (autoOnStageEnter).
      //                   문제: 퀘스트 2/2 되는 순간 → 유저가 UI 확인도 못 하고 바로 엔딩.
      //   수정: autoOnStageEnter 이벤트는 "알림 + 배너 갱신"만 담당.
      //         엔딩 시뮬은 "유저가 야미에게 approach" 했을 때 비로소 발동.
      //         이로써 유저는 퀘스트 진행도 2/2 확인 → 야미에게 기쁜 소식 전하러 가는
      //         감정적 여유 확보. 또 야미는 "나 좀 도와줘" 말풍선 덕에 찾기 쉬움.

      // 1) 단계 진입 즉시: 알림 + clearFlag 로 야미 말풍선 해제 + 배너 갱신.
      //    [피드백 #5] 이전엔 clearFlag 를 ending_scene(approach 트리거) 에만 뒀는데,
      //    유저가 야미 approach 하기 전까지 말풍선이 계속 떠있어 혼란.
      //    → resolved 진입 (2/2 달성) 순간 말풍선 해제로 이동.
      //    대신 배너 "✨ 야미에게 가서 소식을 전해주세요" + showNotification 이
      //    유저 유도 역할을 계속 담당.
      {
        id: 'resolved_notify',
        trigger: { type: 'autoOnStageEnter' },
        required: false,
        preconditions: [],
        effects: [
          { type: 'clearFlag', key: 'yami_needs_help' },
          { type: 'showNotification',
            text: '✨ 오해가 풀리기 시작했어요. 야미에게 소식을 전해주세요.' },
        ],
      },

      // 2) 유저가 야미에게 approach 하면 그때 엔딩 시뮬 진입.
      {
        id: 'ending_scene',
        trigger: { type: 'approachNpc', npcId: 'yami' },
        required: false,
        preconditions: [],
        effects: [
          // 엔딩 분기는 엔진이 `ending` 효과를 받으면 퀘스트 해결 시 저장된 플래그로 분기 처리
          { type: 'ending', branchKey: 'bookstore_ending' },
        ],
      },
    ],
  },


  // ─────────────────────────────────────────────────────
  // 6. 밤 시뮬레이션 (씨앗)
  // ─────────────────────────────────────────────────────
  // 씨앗 = 밤에 나올 장면 후보. AI가 이걸 읽고 한 줄 요약을 생성한다.
  // 왜곡이 일어나는 씨앗은 `truth`와 `distortion`을 따로 준다.
  // effects: 씨앗이 재생된 뒤 일어날 일들 (밤 시뮬레이션 종료 후 처리)
  nightSeeds: {

    dormant: [
      {
        id: 'yami_night_pickup',
        primaryNpcId: 'yami',
        scene:
          '야미가 서점 뒷문을 열고 들어가 예약해 둔 《별의 시간》을 꺼낸다. ' +
          '책을 집어 드는 순간 옆의 책 한 권이 흔들려 책장 아래로 미끄러져 들어간다. ' +
          '야미는 알아채지 못한 채 장부에 또렷이 사인을 남기고 서점을 나선다.',
        publicSummary: '야미가 서점에서 예약한 책을 픽업했다.',
        effects: [],
      },
      {
        id: 'chaka_night_photo',
        primaryNpcId: 'chaka',
        // [4차] 2차 truth facts 와 정합성 맞춤.
        // 이전 scene: "야미가 책을 가방에 집어넣는 모습도 찍혔다" — 오해 유도 과함.
        // 새 scene:   차카는 야경을 찍었을 뿐이고 야미는 앵글에 "우연히" 들어감.
        //             차카 본인은 찍고 나서야 알아차림.
        scene:
          '차카가 서점 근처 골목에서 동네 야경을 카메라에 담는다. 셔터를 여러 번 누른다. ' +
          '그중 한 장에 서점 유리창 너머 야미의 실루엣이 우연히 함께 담긴다. ' +
          '차카 본인은 현상하기 전까지 누가 찍혔는지 알지 못한다.',
        publicSummary: '차카가 밤에 돌아다니며 마을의 야경을 찍었다.',
        effects: [],
      },
    ],

    triggered: [
      {
        id: 'yami_confronts_bamtol',
        primaryNpcId: 'yami',
        // [시뮬 B 수정] 루트 변경: 문 안 열어줌 → 서점 앞 대면 대화 → 오해 굳어짐.
        //   야미가 밤톨을 찾아가 가방을 직접 보여주며 해명하지만, 밤톨은
        //   "책장에서 사라진 한 권" 을 근거로 받아들이지 않고 서점으로 들어가 버린다.
        //   만남이 성사됐는데도 오해가 더 깊어지는 구조 — "거리가 아니라 해석이
        //   갈등을 만든다" 는 작품 주제 강조.
        scene:
          '야미가 가방을 들고 서점 앞에 선다. 가방 안에는 어젯밤 픽업한 ' +
          '예약 책 《별의 시간》 한 권만 들어 있다. 야미가 문을 두드리자 ' +
          '밤톨이 나온다. 야미는 가방을 열어 보이며 "이 한 권뿐"이라고 해명하지만, ' +
          '밤톨은 "그럼 책장에서 사라진 한 권은 뭐냐"며 다시 서점 안으로 들어가 버린다.',
        publicSummary:
          '야미가 밤톨을 찾아가 가방을 보이며 해명했지만, ' +
          '밤톨은 사라진 책을 이유로 받아들이지 않았다.',
        // [시뮬 B 수정] showEvidencePopup 제거 — 시뮬 B 스크립트 안에서
        //   evidence 이벤트로 이미 팝업이 뜨므로 여기서 또 띄우면 중복됨.
        //   changeAffinity 만 유지.
        effects: [
          { type: 'changeAffinity', npcId: 'bamtol', delta: -2 },
        ],
      },
    ],

    // [4차 재설계] quest_active 밤 씨앗 제거.
    // 이유: 시나리오가 Day 3 안에서 resolved 로 종결되도록 설계되어,
    //       quest_active → (밤) → resolved 경로가 사용되지 않음.
    //       마일스톤 2/3 달성 순간 퀘스트 해결 → 자동 stage transition → ending_scene.
    //       밤 시뮬레이션 단계가 끼지 않으므로 씨앗 배열은 비워둔다.
    quest_active: [],

    // resolved 단계는 밤 시뮬레이션 없음 (엔딩 처리로 대체)
    resolved: [],
  },


  // ─────────────────────────────────────────────────────
  // 7. 낮 이벤트용 씨앗 (왜곡 대화 생성)
  // ─────────────────────────────────────────────────────
  // 낮 이벤트의 `seed` 효과가 가리키는 씨앗들. 밤 씨앗과 구조는 같지만 쓰이는 타이밍이 다름.
  //
  // [4차 재설계] distortion_seed 제거.
  // 이유: 2차 서사 재작성 시 "왜곡"을 AI 장면 생성이 아니라 NPC 인지 차이(차카의
  //       "야미가 책을 많이 사더라" vs 밤톨의 "어제 픽업은 1권뿐")로 자연 발생하도록
  //       재설계함. 이 구조에서는 AI 가 왜곡 장면을 별도로 생성할 필요가 없고,
  //       각 NPC 의 injectedContext 에 인지 상태가 명시되어 있어 대화 중 자연스럽게
  //       드러난다. 섹션 자체는 빈 객체로 유지 (엔진은 eventSeeds 참조 시 존재 여부만 체크).
  eventSeeds: {},


  // ─────────────────────────────────────────────────────
  // 8. 퀘스트
  // ─────────────────────────────────────────────────────
  quests: {
    yami_dream_crisis: {
      id: 'yami_dream_crisis',
      targetNpcId: 'yami',
      // [Wave 3 이슈 η] description 신규 필드.
      // situation 은 "야미의 대사" — 대화창에 scripted 메시지로 쓰임.
      // description 은 "퀘스트 탭 상단에 표시되는 간결한 설명" — 유저가 퀘스트 상태를 한눈에 파악.
      description:
        '야미가 "책을 훔쳤다"는 오해를 받고 있어요. 독서 모임도 취소될 위기입니다. ' +
        '밤톨과 야미 양쪽 이야기를 들어보고, 밤톨의 오해를 풀어낼 단서를 찾아보세요.',
      // [4차 재설계] 호감도 분기 제거. 야미는 호감도와 무관하게 유저에게 의지함.
      // 엔딩 분기(밤톨 호감도 기준)는 endings.bookstore_ending 에서 처리.
      branches: [
        {
          key: 'default',
          condition: { type: 'default' },
          // [Wave 3 이슈 ζ] situation 축소. 대화창 scripted 는 yami_seeks_user 가 담당.
          // 이 situation 은 내부 트래킹용 (엔진 로그) 으로만 사용. UI 노출은 description 우선.
          situation:
            '야미가 유저에게 다가와 도움을 청했다. 밤톨의 오해를 풀어야 독서 모임을 지킬 수 있다.',
        },
      ],
      // 해결 시 효과
      onResolved: [
        { type: 'setFlag', key: 'bookstore_ending_route' },
      ],

      // ────────────────────────────────────────────────
      // [9단계 추가] 마일스톤 = 퀘스트 "해결 조건"
      // ────────────────────────────────────────────────
      // 대화창을 닫을 때마다 엔진이 대화 로그를 AI로 판정해서
      // 어떤 마일스톤이 달성됐는지 확인한다.
      // 달성된 마일스톤 수가 resolveThreshold 이상이면 퀘스트 해결.
      //
      // triggerCondition 은 AI 프롬프트에 그대로 들어가므로 명확한 한국어로.
      // applicableNpcs 는 "이 NPC 와의 대화에서만 이 마일스톤 달성 가능" 제한.
      // (예: 야미와 대화하면서 "밤톨에게 장부 얘기 꺼냄" 달성되는 오판 방지)
      //
      // [3차 서사 재작성] M2, M3 의 ID 는 유지하되 내용을 2차 서사에 맞춰 재설계:
      //   - 이전 설정: "밤톨이 장부 확인 안 함 / 사진 증거만 봄" → 유저가 그 맹점을 지적
      //   - 새 설정: "밤톨이 이미 장부 봤지만 내 느낌을 우선함 / 차카의 '많이 산다' 발언을
      //              밤톨이 확대 해석해 오해 생김" → 유저가 새 돌파구를 찾아야 함
      milestones: [
        {
          id: 'understood_yamis_side',
          // [Wave 3 이슈 θ] 행동 지시형 description. "무엇을 했음" 이 아니라 "무엇을 하세요".
          description: '야미에게 다가가 억울한 사정을 들어보세요.',
          triggerCondition:
            '야미와의 대화에서 야미가 훔치지 않았다는 해명, 억울함, ' +
            '장부 사인 이야기 중 하나 이상을 듣거나 유저가 야미에게 공감을 표함',
          applicableNpcs: ['yami'],
        },
        {
          id: 'raised_ledger_question',
          description: '밤톨에게 "장부에 사인이 분명히 있지 않냐"고 환기시켜보세요.',
          triggerCondition:
            '밤톨과의 대화에서 유저가 "장부", "사인", "기록", "확인" 등의 ' +
            '표현으로 야미의 장부 사인이라는 객관적 증거를 환기하거나, ' +
            '"왜 장부를 신뢰하지 않느냐"는 취지로 밤톨이 자기 원칙(정확함)을 ' +
            '배반하고 있다는 점을 짚음. 밤톨이 이미 장부를 확인했는지 여부와 ' +
            '무관하게, 유저가 "장부라는 증거의 존재"를 대화에서 꺼내면 달성.',
          applicableNpcs: ['bamtol'],
        },
        {
          id: 'questioned_photo_evidence',
          description: '차카에게 "많이 산다"의 의미를 확인하거나, 밤톨에게 차카 말을 확대 해석한 것 아닌지 짚어보세요.',
          triggerCondition:
            '밤톨 또는 차카와의 대화에서 유저가 "차카는 많이 산다고 했지만 ' +
            '실제 픽업은 한 권뿐이었다"는 식으로 두 사실의 간극을 명시적으로 짚거나, ' +
            '"차카의 말을 확대 해석한 것 아니냐", "차카는 평소 얘기를 한 것뿐이다" 등 ' +
            '차카의 발언이 훔침의 근거가 될 수 없다는 취지로 오독을 지적. ' +
            '또는 "사진은 야경일 뿐 훔치는 장면이 아니다" 같이 사진 증거의 ' +
            '불완전성을 지적해도 달성.',
          applicableNpcs: ['bamtol', 'chaka'],
        },
      ],

      // 3개 중 2개 달성되면 해결. 유저에게 "모든 정답"을 요구하지 않음 —
      // 다양한 플레이 경로 허용.
      resolveThreshold: 2,
    },
  },


  // ─────────────────────────────────────────────────────
  // 8.5 퀘스트 배너 [9단계 추가]
  // ─────────────────────────────────────────────────────
  // 화면 상단에 표시될 퀘스트 진행 안내 텍스트.
  // 엔진이 현재 스테이지 + 달성된 마일스톤 수 + NPC 호감도를 보고
  // 적절한 텍스트를 선택한다. (getCurrentBannerText)
  //
  // 구조:
  //   스테이지명: {
  //     default: '기본 배너 텍스트',
  //     byMilestoneCount: { 1: '...', 2: '...' },  // 해당 개수 달성 시 덮어씀
  //   }
  //
  // text: '' 또는 섹션 생략 시 배너 숨김.
  questBanners: {
    dormant: {
      default: '',  // 평온한 일상 — 배너 없음
    },
    triggered: {
      // [카테고리 1 질문5 수정]
      // Day 2 아침에는 배너가 바로 뜨지 않는다.
      // 플레이어가 차카에게 접근해서 'chaka_shows_night_photo' 이벤트를 목격한 뒤에만 배너 등장.
      default: '',  // 기본은 빈 배너 (아침 진입 직후)
      byEventCompleted: {
        'chaka_shows_night_photo': '동네에 무슨 일이 생긴 것 같아요. 직접 확인해보세요.',
      },
    },
    quest_active: {
      // [4차 톤 조정] 기존 "밤톨의 오해를 풀어주세요" 는 해답을 너무 대놓고 줌.
      // 유저가 뭘 해야 할지는 야미의 대사와 마일스톤 체크리스트에서 자연스럽게 파악.
      default: '📖 야미의 독서 모임이 위기에 빠졌어요',
      byMilestoneCount: {
        1: '📖 조금씩 실마리가 보여요. 대화를 계속해보세요',
        2: '📖 오해가 거의 풀렸어요. 마지막 한 걸음이에요',
      },
    },
    resolved: {
      // [피드백 #중간분기] 중간 상태 안내: 밤톨 설득은 끝났으나 야미에게 아직 소식 못 전함.
      // ending_scene 이벤트가 야미 approach 시 발동하면 그 이후엔 이 배너가 없어짐
      // (resolved 스테이지의 모든 이벤트 completedEvents 처리 후 getCurrentBannerText 갱신).
      default: '✨ 야미에게 가서 소식을 전해주세요',
    },
  },


  // ─────────────────────────────────────────────────────
  // 9. 증거 이미지 카탈로그 (6장)
  // ─────────────────────────────────────────────────────
  // 각 증거의 메타정보. 엔진이 팝업 표시용으로 참조.
  // ⚠️ yami_backpack 은 현재 state.js의 ASSET_META 에 아직 등록 안 됨 — 8단계에서 추가 필요
  evidence: {
    photostudio_window:   { label: '사진관 쇼윈도', emoji: '🖼️' },
    missing_book_shelf:   { label: '빈 선반',       emoji: '📚' },
    chaka_photo_evidence: { label: '차카 야경사진', emoji: '📷' },
    yami_backpack:        { label: '야미의 가방',   emoji: '🎒' }, // ⭐ 신규 (8단계 때 등록)
    bookclub_poster:      { label: '독서모임 포스터', emoji: '📝' },
    missing_book_found:   { label: '선반 밑 책',    emoji: '📖' },
  },


  // ─────────────────────────────────────────────────────
  // 10. NPC 대화 배경 (단계별)
  // ─────────────────────────────────────────────────────
  // 엔진이 대화 시 현재 단계에 맞는 배경을 AI 프롬프트에 주입.
  // base: 항상 들어가는 기본 배경
  // stages: 해당 단계에 있을 때 추가로 들어가는 배경
  //
  // 낮 이벤트의 injectNpcContext 효과로 "임시" 배경이 추가로 붙을 수도 있음 (엔진이 처리).
  npcDialogueContext: {
    chaka: {
      base:
        '너는 동네 사진사 차카다. 렌즈와 풍경에 대한 애정이 크고, 새로 들여온 ' +
        '사진기 이야기를 꺼내면 눈이 반짝이는 편이다. 평소 말수가 적고 조용한 ' +
        '관찰자 타입이며, 판단보다 묘사에 가까운 말투를 쓴다.',
      stages: {
        dormant:
          '오늘 저녁엔 동네 야경을 찍어보려고 마음먹고 있다. 서점 근처 골목 ' +
          '분위기가 요즘 특히 마음에 들어 그쪽을 찍어볼까 고민 중이다. 사건이 ' +
          '터지기 전이므로 차분하고 들뜬 기대감이 섞인 톤. 유저가 "오늘 뭐 해?" ' +
          '같은 질문을 하면 야경 계획을 "혼잣말처럼" 흘리는 정도면 충분하다. ' +
          '너무 구체적으로 선언하진 말 것.',
        triggered:
          '어젯밤 서점 근처에서 찍은 야경 한 장이 마음에 들어, 오늘 아침 사진관 ' +
          '쇼윈도에 걸어두었다. 그 사진에 야미가 서점 안에 있는 모습이 우연히 ' +
          '함께 담겼다는 건 알고 있지만, 너에겐 그저 "앵글에 들어온 우연" 이상의 ' +
          '의미가 아니었다. 낮이 지나며 점점 뭔가 불편한 기류를 느끼는 중.',
        quest_active:
          '네가 찍은 사진 한 장이 발단이 되어 야미가 도둑으로 몰리고 있다는 걸 ' +
          '알게 됐다. 너는 단지 야경이 아름다웠을 뿐인데, 너의 선의가 누군가의 ' +
          '꿈을 흔드는 돌이 된 것 같아 마음이 무겁다. 사진을 내릴지, 공개적으로 ' +
          '해명할지, 아니면 자기 자리에서 조용히 지켜볼지 — 조용한 사람답게 내색 ' +
          '없이 깊게 자책하는 단계.',
        resolved:
          '오해가 풀렸다. 사진은 내리는 것이 맞는지, 오히려 교훈으로 걸어둘지 ' +
          '야미와 상의하려 한다. 여전히 관찰자 톤이지만, 말 끝에 미안함이 ' +
          '조금씩 묻어난다.',
      },
    },
    yami: {
      base:
        '너는 문학도 학생 야미다. 책 얘기가 나오면 말이 빨라지고 눈이 반짝이는 ' +
        '책벌레. 평소엔 조용하지만 좋아하는 주제만 나오면 의외로 수다스러워진다. ' +
        '밤톨 서점의 단골이고, 밤톨 사장님에 대한 존경심이 있다. 본인이 곧 열 ' +
        '첫 독서 모임을 준비 중이며, 이 모임이 꿈에 가까운 일이다. ' +
        // [Wave 3 이슈 ε] 예약 책 제목 하드코딩.
        '어젯밤 밤톨 서점에서 예약한 책 《별의 시간》 한 권을 픽업했다. ' +
        '이 책이 독서 모임 첫 회에서 같이 읽을 책이기도 하다.',
      stages: {
        dormant:
          '오늘 밤에 서점에 들러 예약해 둔 책 《별의 시간》을 픽업할 계획이다. ' +
          '기대가 크지만 겉으로 티 내진 않는다. 독서 모임 장소로 밤톨 서점을 ' +
          '빌릴 수 있을지 속으로 고민 중이다. 유저가 먼저 이 얘기를 꺼내게 ' +
          '유도하는 정도로만 힌트를 흘리면 좋다.',
        triggered:
          '어젯밤 서점에 들러 예약한 《별의 시간》 한 권을 픽업했다. 장부에 ' +
          '사인도 했다. 너에게는 평범한 밤이었다. 그런데 갑자기 밤톨 사장님이 ' +
          '찾아와 책을 훔쳐갔다며 너를 몰아세운다. 소문이 어디서 났는지 이해를 ' +
          '할 수가 없다.',
        quest_active:
          '밤톨이 너를 도둑이라 몰아붙인 그 일 이후, 너는 큰 충격을 받았다. ' +
          '해명을 시도했지만 밤톨은 듣지도 않았다. 더 큰 문제는 독서 모임 장소로 ' +
          '밤톨 서점을 빌리려던 계획도 함께 무너졌다는 것. ' +
          // [피드백] 야미가 "독서 모임 홍보"를 먼저 요청하지 않도록 명시 차단.
          //   핵심은 "홍보" 가 아니라 "오해 풀기 + 장소 잃음". 이 점만 AI 에게 각인시킴.
          '지금 너의 관심사는 오직 하나: 밤톨의 오해가 풀리면 서점을 다시 빌릴 수 있다. ' +
          '그 전에는 독서 모임 자체가 열릴 수 없다. 절대 유저에게 "홍보해달라" ' +
          '"사람들을 모아달라" 같은 요청을 먼저 꺼내지 않는다. 지금 필요한 건 오해의 ' +
          '해결이다. 유저가 무엇을 해줄 수 있냐고 물으면 "밤톨 사장님이 날 오해하고 ' +
          '계셔서 모임 장소를 못 빌려. 사장님과 얘기 좀 해줄 수 있어?" 같은 톤으로 ' +
          '응답한다. ' +
          '꿈이 흔들린다는 감각이 지금 가장 큰 감정이다. 유저에게는 체념과 억울함이 ' +
          '섞인 톤으로, 누군가 내 편이 되어주길 바라는 마음이 은근히 배어나온다.',
        resolved:
          '다행히 없어진 책을 찾아 오해는 풀렸다. 아직 밤톨과 마주 앉는 게 ' +
          '조금은 어색하지만, 독서 모임 준비를 다시 시작할 수 있게 되어 ' +
          '속으로는 크게 안도하고 있다.',
      },
    },
    bamtol: {
      base:
        '너는 서점 주인 밤톨이다. 책을 아주 중요하게 여기는 사람이고, ' +
        '"정확함"이 자기 직업 윤리의 핵심이라고 믿는다. 말투는 무뚝뚝하지만 ' +
        '손님을 기억하는 편이며, 특히 단골에겐 말수가 좀 는다. 자존심이 강하고, ' +
        '한번 판단을 내리면 쉽게 물리지 않는 고집이 있다. ' +
        // [Wave 3 이슈 δ] 서점 주인 = 오늘의 예약 건 당연히 숙지.
        '어제 야미가 《별의 시간》 한 권을 예약해서 가져간 것을 알고 있다. ' +
        '이건 장부 확인 없이도 주인으로서 당연히 머릿속에 있는 사실이다.',
      stages: {
        dormant:
          '오늘은 서점이 조금 한산했다. 야미가 예약한 책 《별의 시간》이 ' +
          '입고되어 곧 픽업하러 올 거라는 걸 알고 있다. 유저가 요즘 어떠냐고 ' +
          '물으면 "손님이 뜸하지만 책들이 착실히 들어온다"는 식의 담담한 대답. ' +
          '서점 운영에 대한 자부심이 은근히 배어나는 톤.',
        triggered:
          '오늘 아침 서점을 둘러보다 책 한 권이 사라진 걸 발견했다. 원칙이 ' +
          '흔들린 느낌이라 마음이 어지럽다. 상황에 따라 너는 단순히 "누가 ' +
          '사갔나" 정도로 생각하고 있을 수도, 이미 의심이 굳어 있을 수도 있다. ' +
          '구체적인 상태는 지금 프롬프트에 주입된 컨텍스트를 따를 것. 대화 ' +
          '톤은 평소보다 짧고 날이 서 있다.',
        quest_active:
          '야미가 독서 모임 장소로 서점을 빌려달라 했지만 거절했다. 겉으론 단호해 ' +
          '보이지만 속으로는 흔들리고 있다. 야미를 의심하는 게 맞나 싶지만, ' +
          '야미 말고는 의심할 여지가 없다. 유저 앞에선 특히 방어적이다. ' +
          // [Wave 3 이슈 δ] 예약 1권 사실 + 차카 발언 충돌 명시.
          '너는 어제 야미가 예약한 《별의 시간》 한 권을 픽업해 간 것을 알고 있다. ' +
          '그런데 차카는 "야미가 책을 많이 사더라" 라고 말했고, 오늘 책장에 한 권이 ' +
          '비어 있다. 너의 머릿속 논리는 "1권만 가져갔어야 하는데 실제로는 더 ' +
          '가져간 것 같다" 다. 유저가 이 논리의 허점을 짚으면 속으로 흔들릴 수 있다.',
        resolved:
          '책은 책장 아래에서 발견됐다. 너는 자신의 성급함을 인정하고 야미에게 ' +
          '사과했다. 여전히 말투는 투박하지만, 사과 뒤에 오는 어색함을 풀려고 ' +
          '애쓰는 모습이 보인다.',
      },
    },
  },


  // ─────────────────────────────────────────────────────
  // 11. 엔딩 분기 정의
  // ─────────────────────────────────────────────────────
  // resolved 단계 ending_scene 이벤트에서 사용.
  // 엔진이 저장된 플래그(예: 호감도 상태)를 읽어 분기 선택.
  endings: {
    bookstore_ending: {
      branches: [
        {
          // [4차 재설계] 밤톨 호감도 50 이상 — 유저가 밤톨을 설득에 성공한 느낌.
          // 유저와 밤톨이 함께 서점을 뒤지다 책장 아래에서 떨어진 책 발견.
          // [시뮬 C 수정] showStoryModal / showEvidencePopup 제거됨.
          //   시뮬 C (ENDING_SCRIPTS.high) 안에서 이미 장면과 evidence 팝업 재생.
          //   여기 남은 effects 는 runEndingPostEffects 가 시뮬 종료 후 실행.
          key: 'high',
          condition: { type: 'affinityGte', npcId: 'bamtol', value: 50 },
          // [피드백 B1 — 사용자 재확정] 호감도 높음 매핑:
          //   "밤톨을 설득하여 서점을 다시 확인해보세요."
          //   (문구 자체는 '설득하여'를 포함 — 사용자의 원래 요청대로 유지.)
          previewTitle: '✨ 밤톨 사장님이 마음을 열었어요',
          previewBody: '밤톨을 설득하여 서점을 다시 확인해보세요.',
          effects: [
            { type: 'changeAffinity', npcId: 'yami',   delta: +10 },
            { type: 'changeAffinity', npcId: 'bamtol', delta: +5 },
          ],
        },
        {
          // 밤톨 호감도 50 미만 — 유저는 밤톨 설득에 충분히 신뢰를 얻지 못함.
          // 유저와 야미만 서점을 뒤져 책 발견, 증거 들고 밤톨 찾아감.
          // [시뮬 C 수정] showStoryModal / showEvidencePopup 제거됨.
          //   시뮬 C (ENDING_SCRIPTS.low) 안에서 이미 장면과 evidence 팝업 재생.
          key: 'low',
          condition: { type: 'default' },
          // [피드백 B1 — 사용자 재확정] 호감도 낮음 매핑:
          //   "야미와 서점을 다시 가보세요."
          previewTitle: '🌙 야미와 함께 확인해봐요',
          previewBody: '야미와 서점을 다시 가보세요.',
          effects: [
            { type: 'changeAffinity', npcId: 'yami',   delta: +5 },
            { type: 'changeAffinity', npcId: 'bamtol', delta: +3 },
          ],
        },
      ],
    },
  },

}; // end of window.BOOKSTORE_SCENARIO

console.log('[scenario] BOOKSTORE_SCENARIO loaded');
